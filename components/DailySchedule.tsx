import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  I18nManager,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AvailableTimeSlot, supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import i18n from '@/src/config/i18n';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
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

/** Parse formatted time into { hm, suffix }.
 *  Hebrew 24hr: "16:00" → { hm: "16:00", suffix: "" }
 *  English 12hr: "4:00 PM" → { hm: "4:00", suffix: "PM" }
 */
function parseFormattedTime(formatted: string): { hm: string; suffix: string } {
  const trimmed = formatted.trim();
  const m = trimmed.match(/^(\d{1,2}:\d{2})\s*(.*)$/);
  return { hm: m?.[1] ?? trimmed, suffix: m?.[2] ?? '' };
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

  const isRTL = I18nManager.isRTL;
  const dateLocale = i18n.language === 'he' ? 'he-IL' : 'en-US';

  // Fetch client image
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

  // Decorative circle animations for today banner
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

  // Time formatted with the correct locale (24hr for Hebrew, 12hr otherwise)
  const formattedTime = formatTime12Hour(nextAppointment?.slot_time ?? '');
  const { hm: timeHM, suffix: timeSuffix } = parseFormattedTime(formattedTime);

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
          <View style={[styles.todayLeft, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[styles.todayWeekday, { textAlign: isRTL ? 'right' : 'left' }]}>
              {new Date().toLocaleDateString(dateLocale, { weekday: 'long' })}
            </Text>
            <Text style={[styles.todayDate, { textAlign: isRTL ? 'right' : 'left' }]}>
              {new Date().toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
            </Text>
          </View>

          <View style={[styles.todayRight, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
            {loadingTodayCount ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={[styles.todayCount, { textAlign: isRTL ? 'left' : 'right' }]}>
                  {todayAppointmentsCount}
                </Text>
                <Text style={[styles.todayCountLabel, { textAlign: isRTL ? 'left' : 'right' }]}>
                  {t('appointments.title', 'Appointments')}
                </Text>
              </>
            )}
          </View>

          <Animated.View style={[styles.todayDecorCircle, circle1Style]} />
          <Animated.View style={[styles.todayDecorCircle2, circle2Style]} />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── NEXT APPOINTMENT ── */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onRefresh}
        style={[
          styles.nextCard,
          nextAppointment && { borderColor: `${colors.primary}30` },
        ]}
      >
        {/* Header */}
        <View style={[styles.nextHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.nextHeaderIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="time-outline" size={15} color={colors.primary} />
          </View>
          <Text style={[styles.nextHeaderTitle, { color: '#64748B' }]}>
            {t('appointments.next', 'Next appointment')}
          </Text>
          <Ionicons
            name={isRTL ? 'chevron-forward' : 'chevron-back'}
            size={15}
            color="#CBD5E1"
            style={{ marginRight: isRTL ? undefined : 'auto', marginLeft: isRTL ? 'auto' : undefined }}
          />
        </View>

        {/* Divider */}
        <View style={styles.headerDivider} />

        {/* Body */}
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>{t('common.loading', 'Loading...')}</Text>
          </View>
        ) : nextAppointment ? (
          /* ── Appointment body ── */
          <View style={[styles.apptBody, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>

            {/* Client info (first in DOM → right in RTL) */}
            <View style={[styles.clientSection, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {/* Avatar */}
              <View style={[styles.avatarRing, { borderColor: `${colors.primary}35` }]}>
                <View style={styles.avatarInner}>
                  {clientImageUrl ? (
                    <Image source={{ uri: clientImageUrl }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: `${colors.primary}15` }]}>
                      <Ionicons name="person" size={24} color={`${colors.primary}80`} />
                    </View>
                  )}
                </View>
                {/* Online dot */}
                <View style={[styles.avatarDot, { backgroundColor: '#22C55E' }]} />
              </View>

              {/* Name + Service + Duration */}
              <View style={[styles.clientInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                <Text
                  style={[styles.clientName, { textAlign: isRTL ? 'right' : 'left' }]}
                  numberOfLines={1}
                >
                  {nextAppointment.client_name || t('booking.unknown', 'Unknown')}
                </Text>

                <View style={styles.pillsRow}>
                  {nextAppointment.service_name && (
                    <View style={[styles.servicePill, { backgroundColor: `${colors.primary}14` }]}>
                      <Text style={[styles.serviceText, { color: colors.primary }]}>
                        {nextAppointment.service_name}
                      </Text>
                    </View>
                  )}
                  {nextAppointment.duration_minutes > 0 && (
                    <View style={styles.durationPill}>
                      <Ionicons name="timer-outline" size={11} color="#94A3B8" />
                      <Text style={styles.durationText}>
                        {nextAppointment.duration_minutes} {t('min', 'min')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Time block (second in DOM → left in RTL) */}
            <LinearGradient
              colors={[colors.primary, `${colors.primary}BB`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.timeBlock}
            >
              <Text style={styles.timeHM}>{timeHM}</Text>
              {timeSuffix ? (
                <Text style={styles.timeSuffix}>{timeSuffix}</Text>
              ) : null}
            </LinearGradient>
          </View>
        ) : (
          /* ── Empty state ── */
          <View style={styles.emptyRow}>
            <Ionicons name="calendar-outline" size={20} color="#CBD5E1" />
            <Text style={styles.emptyText}>
              {t('appointments.empty.today', 'No upcoming appointments today')}
            </Text>
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
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.07,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 3 },
    }),
  },
  nextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 11,
  },
  nextHeaderIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextHeaderTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    flex: 1,
    textAlign: 'right',
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 0,
  },

  /* ── Appointment Body ── */
  apptBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 14,
  },
  clientSection: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  clientInfo: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  pillsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  servicePill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  serviceText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },

  /* ── Time Block ── */
  timeBlock: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 82,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 4 },
    }),
  },
  timeHM: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  timeSuffix: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.82)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  /* ── States ── */
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  emptyRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'right',
  },
});
