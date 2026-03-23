import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, I18nManager } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AvailableTimeSlot, supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import i18n from '@/src/config/i18n';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

interface DailyScheduleProps {
  nextAppointment: AvailableTimeSlot | null;
  loading: boolean;
  onRefresh: () => void;
  todayAppointmentsCount: number;
  loadingTodayCount: boolean;
  variant?: 'card' | 'frosted';
}

export default function DailySchedule({
  nextAppointment,
  loading,
  onRefresh,
  todayAppointmentsCount,
  loadingTodayCount,
  variant = 'card',
}: DailyScheduleProps) {
  const router = useRouter();
  const colors = useColors();
  const [clientImageUrl, setClientImageUrl] = useState<string | undefined>(undefined);
  const styles = createStyles(colors);
  const { t } = useTranslation();

  const formatTimeToHoursMinutes = (time?: string | null): string => {
    if (!time) return '';
    const parts = time.split(':');
    if (parts.length >= 2) {
      const hour24 = parseInt(parts[0], 10);
      const minutes = parts[1].padStart(2, '0');
      const period = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = ((hour24 % 12) || 12).toString();
      return `${hour12}:${minutes} ${period}`;
    }
    return time;
  };

  useEffect(() => {
    let isMounted = true;
    setClientImageUrl(undefined);
    const fetchImage = async () => {
      try {
        if (!nextAppointment?.client_phone) return;
        const { data, error } = await supabase
          .from('users')
          .select('image_url')
          .eq('phone', nextAppointment.client_phone)
          .maybeSingle?.() ?? { data: null, error: null };
        let finalData = data;
        if (!finalData && !error) {
          const { data: singleData } = await supabase
            .from('users')
            .select('image_url')
            .eq('phone', nextAppointment.client_phone)
            .single();
          finalData = singleData as any;
        }
        if (isMounted && finalData?.image_url) {
          setClientImageUrl(finalData.image_url);
        }
      } catch (e) {}
    };
    fetchImage();
    return () => { isMounted = false; };
  }, [nextAppointment?.client_phone]);

  const isRTL = I18nManager.isRTL;
  const dateLocale = i18n.language === 'he' ? 'he-IL' : 'en-US';

  // Decorative circle animations
  const circle1X = useSharedValue(0);
  const circle1Y = useSharedValue(0);
  const circle2X = useSharedValue(0);
  const circle2Y = useSharedValue(0);

  useEffect(() => {
    circle1X.value = withRepeat(withTiming(16, { duration: 3400 }), -1, true);
    circle1Y.value = withRepeat(withTiming(-10, { duration: 4200 }), -1, true);
    circle2X.value = withRepeat(withTiming(-14, { duration: 3800 }), -1, true);
    circle2Y.value = withRepeat(withTiming(12, { duration: 4600 }), -1, true);
    return () => {
      cancelAnimation(circle1X);
      cancelAnimation(circle1Y);
      cancelAnimation(circle2X);
      cancelAnimation(circle2Y);
    };
  }, []);

  const circle1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: circle1X.value }, { translateY: circle1Y.value }],
  }));
  const circle2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: circle2X.value }, { translateY: circle2Y.value }],
  }));

  const timeFormatted = formatTimeToHoursMinutes(nextAppointment?.slot_time);
  const timeParts = timeFormatted.split(' ');

  return (
    <View style={styles.wrapper}>
      {/* ── TODAY BANNER ── */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/appointments')}>
        <LinearGradient
          colors={[colors.primary, `${colors.primary}CC`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.todayBanner, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        >
          {/* Date side — always on the "start" side */}
          <View style={[styles.todayLeft, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[styles.todayWeekday, { textAlign: isRTL ? 'right' : 'left' }]}>
              {new Date().toLocaleDateString(dateLocale, { weekday: 'long' })}
            </Text>
            <Text style={[styles.todayDate, { textAlign: isRTL ? 'right' : 'left' }]}>
              {new Date().toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
            </Text>
          </View>

          {/* Count side — always on the "end" side */}
          <View style={[styles.todayRight, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
            {loadingTodayCount ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={[styles.todayCount, { textAlign: isRTL ? 'left' : 'right' }]}>{todayAppointmentsCount}</Text>
                <Text style={[styles.todayCountLabel, { textAlign: isRTL ? 'left' : 'right' }]}>{t('appointments.title', 'Appointments')}</Text>
              </>
            )}
          </View>

          {/* Animated decorative circles */}
          <Animated.View style={[styles.todayDecorCircle, circle1Style]} />
          <Animated.View style={[styles.todayDecorCircle2, circle2Style]} />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── NEXT APPOINTMENT ── */}
      <TouchableOpacity activeOpacity={0.85} onPress={onRefresh} style={styles.nextCard}>
        {/* Header row */}
        <View style={[styles.nextHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.nextHeaderIcon, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
          </View>
          <Text style={[styles.nextHeaderTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
            {t('appointments.next', 'Next appointment')}
          </Text>
          <Ionicons
            name={isRTL ? 'chevron-forward' : 'chevron-back'}
            size={16}
            color="#CBD5E1"
            style={{ marginRight: isRTL ? undefined : 'auto', marginLeft: isRTL ? 'auto' : undefined }}
          />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>{t('common.loading', 'Loading...')}</Text>
          </View>
        ) : nextAppointment ? (
          <View style={[styles.nextContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {/* Client */}
            <View style={[styles.clientBlock, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.clientAvatar}>
                {clientImageUrl ? (
                  <Image source={{ uri: clientImageUrl }} style={styles.avatarImg} />
                ) : (
                  <Image source={require('@/assets/images/user.png')} style={styles.avatarImg} />
                )}
              </View>
              <View style={[styles.clientInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                <Text style={[styles.clientName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                  {nextAppointment.client_name || t('booking.unknown', 'Unknown')}
                </Text>
                {nextAppointment.service_name && (
                  <View style={[styles.servicePill, { backgroundColor: `${colors.primary}12` }]}>
                    <Text style={[styles.serviceText, { color: colors.primary }]}>
                      {nextAppointment.service_name}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Time */}
            <View style={[styles.timeBadge, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
              <Text style={[styles.timeBadgeHour, { color: colors.primary }]}>{timeParts[0]}</Text>
              {timeParts[1] && (
                <Text style={[styles.timeBadgePeriod, { color: `${colors.primary}99` }]}>{timeParts[1]}</Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>{t('appointments.empty.today', 'No upcoming appointments today')}</Text>
            <Ionicons name="calendar-outline" size={18} color="#CBD5E1" />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  wrapper: {
    gap: 10,
  },

  /* ── Today Banner ── */
  todayBanner: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  todayLeft: {
    flex: 1,
  },
  todayWeekday: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  todayDate: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  todayRight: {
    alignItems: 'center',
    zIndex: 1,
  },
  todayCount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    lineHeight: 38,
  },
  todayCountLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  todayDecorCircle: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: 50,
    top: -20,
  },
  todayDecorCircle2: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.06)',
    right: 10,
    bottom: -15,
  },

  /* ── Next Appointment Card ── */
  nextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  nextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  nextHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  nextHeaderTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  nextContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  clientBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clientAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  clientInfo: {
    flex: 1,
    gap: 4,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  servicePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  serviceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeBadge: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  timeBadgeHour: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  timeBadgePeriod: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },

  /* ── States ── */
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  emptyRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 4,
    width: '100%',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'right',
  },
});
