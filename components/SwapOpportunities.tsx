import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/src/theme/ThemeProvider';
import { useAuthStore } from '@/stores/authStore';
import { swapRequestsApi } from '@/lib/api/swapRequests';
import { businessProfileApi, isClientSwapEnabled } from '@/lib/api/businessProfile';
import { supabase, getBusinessId } from '@/lib/supabase';
import type { SwapRequest, Appointment } from '@/lib/supabase';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { toBcp47Locale } from '@/lib/i18nLocale';

interface SwapOpportunity {
  swapRequest: SwapRequest;
  myAppointment: Appointment;
}

export default function SwapOpportunities() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const user = useAuthStore((s) => s.user);
  const [opportunities, setOpportunities] = useState<SwapOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState<string | null>(null);

  const appLocale = toBcp47Locale(i18n?.language);

  const loadOpportunities = useCallback(async () => {
    if (!user?.phone) return;
    setIsLoading(true);
    try {
      const profile = await businessProfileApi.getProfile();
      if (!isClientSwapEnabled(profile)) {
        setOpportunities([]);
        return;
      }
      const businessId = getBusinessId();
      const today = new Date();
      const dates: string[] = [];
      for (let i = 0; i <= 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
      }

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('business_id', businessId)
        .in('slot_date', dates)
        .eq('is_available', false)
        .eq('client_phone', user.phone.trim());

      if (error || !data) {
        setOpportunities([]);
        return;
      }

      const userAppointments = (data as Appointment[]).filter((a) => {
        const ts = a.slot_time ? String(a.slot_time) : '00:00';
        const [hh = '0', mm = '0'] = ts.split(':');
        const dt = new Date(`${a.slot_date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`);
        return dt.getTime() >= Date.now();
      });

      const found = await swapRequestsApi.findSwapOpportunities(
        user.phone,
        userAppointments
      );
      setOpportunities(found);
    } catch (err) {
      console.error('Error loading swap opportunities:', err);
      setOpportunities([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.phone]);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  const handleSwap = useCallback(
    async (opp: SwapOpportunity) => {
      Alert.alert(
        t('swap.confirmTitle', 'Confirm Swap'),
        t(
          'swap.confirmMessage',
          'Swap your appointment on {{myDate}} at {{myTime}} with the appointment on {{theirDate}} at {{theirTime}}?',
          {
            myDate: opp.myAppointment.slot_date,
            myTime: opp.myAppointment.slot_time,
            theirDate: opp.swapRequest.original_date,
            theirTime: opp.swapRequest.original_time,
          }
        ),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('swap.execute', 'Swap'),
            style: 'default',
            onPress: async () => {
              setIsSwapping(opp.swapRequest.id);
              try {
                const success = await swapRequestsApi.executeSwap(
                  opp.swapRequest,
                  opp.myAppointment
                );
                if (success) {
                  Alert.alert(
                    t('success.generic'),
                    t('swap.swapSuccess', 'Appointments have been swapped successfully!')
                  );
                  setOpportunities((prev) =>
                    prev.filter((o) => o.swapRequest.id !== opp.swapRequest.id)
                  );
                } else {
                  Alert.alert(t('error.generic'), t('swap.swapFailed', 'Failed to swap appointments'));
                }
              } catch {
                Alert.alert(t('error.generic'), t('swap.swapFailed', 'Failed to swap appointments'));
              } finally {
                setIsSwapping(null);
              }
            },
          },
        ]
      );
    },
    [t]
  );

  if (!user?.phone || (opportunities.length === 0 && !isLoading)) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={[styles.headerIcon, { backgroundColor: colors.primary + '18' }]}>
          <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('swap.opportunitiesTitle', 'Swap Opportunities')}</Text>
          <Text style={styles.headerSubtitle}>
            {t('swap.opportunitiesSubtitle', 'Clients looking to swap times with you')}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : (
        opportunities.map((opp) => {
          const isSwappingThis = isSwapping === opp.swapRequest.id;
          const reqDate = new Date(opp.swapRequest.original_date).toLocaleDateString(
            appLocale,
            { weekday: 'short', day: 'numeric', month: 'short' }
          );
          const myDate = new Date(opp.myAppointment.slot_date).toLocaleDateString(
            appLocale,
            { weekday: 'short', day: 'numeric', month: 'short' }
          );

          return (
            <View key={opp.swapRequest.id} style={styles.card}>
              <LinearGradient
                colors={['#FFFFFF', '#FAFAFA']}
                style={styles.cardGradient}
              >
                {/* Swap visual */}
                <View style={styles.swapVisual}>
                  {/* Their appointment */}
                  <View style={styles.slotBox}>
                    <Text style={styles.slotLabel}>
                      {t('swap.theirSlot', 'Available slot')}
                    </Text>
                    <Text style={styles.slotDate}>{reqDate}</Text>
                    <Text style={[styles.slotTime, { color: colors.primary }]}>
                      {formatTime12Hour(opp.swapRequest.original_time)}
                    </Text>
                    <Text style={styles.slotService}>
                      {opp.swapRequest.original_service_name || ''}
                    </Text>
                  </View>

                  <View style={[styles.swapArrow, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="swap-horizontal" size={22} color={colors.primary} />
                  </View>

                  {/* My appointment */}
                  <View style={styles.slotBox}>
                    <Text style={styles.slotLabel}>
                      {t('swap.yourSlot', 'Your slot')}
                    </Text>
                    <Text style={styles.slotDate}>{myDate}</Text>
                    <Text style={[styles.slotTime, { color: colors.primary }]}>
                      {formatTime12Hour(opp.myAppointment.slot_time)}
                    </Text>
                    <Text style={styles.slotService}>
                      {opp.myAppointment.service_name || ''}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.swapBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleSwap(opp)}
                  disabled={isSwappingThis}
                  activeOpacity={0.8}
                >
                  {isSwappingThis ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="swap-horizontal" size={18} color="#FFF" />
                      <Text style={styles.swapBtnText}>
                        {t('swap.swapNow', 'Swap Now')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </LinearGradient>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  card: {
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardGradient: {
    borderRadius: 20,
    padding: 16,
  },
  swapVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  slotBox: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  slotDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  slotTime: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  slotService: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8E8E93',
  },
  swapArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  swapBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
