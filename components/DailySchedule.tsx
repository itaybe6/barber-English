import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  I18nManager,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AvailableTimeSlot, supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import i18n from '@/src/config/i18n';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';

function darkenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = 1 - ratio;
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n * f))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

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
  const { onPrimary, onPrimaryMuted, primaryOnSurface } = usePrimaryContrast();
  const [clientImageUrl, setClientImageUrl] = useState<string | undefined>(undefined);
  const styles = createStyles(colors);
  const { t } = useTranslation();
  const [todayBannerLayout, setTodayBannerLayout] = useState<{ w: number; h: number } | null>(null);

  const isRTL = I18nManager.isRTL;
  const dateLocale = i18n.language === 'he' ? 'he-IL' : 'en-US';

  const onTodayBannerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setTodayBannerLayout((prev) =>
        prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }
      );
    }
  }, []);

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

  // Time formatted with the correct locale (24hr for Hebrew, 12hr otherwise)
  const formattedTime = formatTime12Hour(nextAppointment?.slot_time ?? '');
  const { hm: timeHM, suffix: timeSuffix } = parseFormattedTime(formattedTime);

  return (
    <View style={styles.wrapper}>

      {/* ── TODAY BANNER ── */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/appointments')}>
        <View style={styles.todayBannerOuter} onLayout={onTodayBannerLayout}>
          <LinearGradient
            colors={[colors.primary, `${colors.primary}CC`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {Platform.OS !== 'web' && todayBannerLayout ? (
            <BrandLavaLampBackground
              primaryColor={colors.primary}
              baseColor={darkenHex(colors.primary, 0.22)}
              layoutWidth={todayBannerLayout.w}
              layoutHeight={todayBannerLayout.h}
              count={4}
              duration={10500}
              blurIntensity={28}
            />
          ) : null}
          <View style={[styles.todayBannerContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.todayLeft, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text
                style={[
                  styles.todayWeekday,
                  { textAlign: isRTL ? 'right' : 'left', color: onPrimaryMuted },
                ]}
              >
                {new Date().toLocaleDateString(dateLocale, { weekday: 'long' })}
              </Text>
              <Text
                style={[
                  styles.todayDate,
                  { textAlign: isRTL ? 'right' : 'left', color: onPrimary },
                ]}
              >
                {new Date().toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
              </Text>
            </View>

            <View style={[styles.todayRight, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
              {loadingTodayCount ? (
                <ActivityIndicator size="small" color={onPrimary} />
              ) : (
                <>
                  <Text
                    style={[
                      styles.todayCount,
                      { textAlign: isRTL ? 'left' : 'right', color: onPrimary },
                    ]}
                  >
                    {todayAppointmentsCount}
                  </Text>
                  <Text
                    style={[
                      styles.todayCountLabel,
                      { textAlign: isRTL ? 'left' : 'right', color: onPrimaryMuted },
                    ]}
                  >
                    {t('appointments.title', 'Appointments')}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* ── NEXT APPOINTMENT ── */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onRefresh}
        style={styles.nextCard}
      >
        {/* Header — direction:'ltr' כופה שמאל→ימין תמיד: רענון משמאל, כותרת+שעון מימין (לא תלוי ב־I18nManager) */}
        <View style={styles.nextHeader}>
          <Ionicons name="refresh-outline" size={15} color="#CBD5E1" />
          <View style={styles.nextHeaderTitleGroup}>
            <Text
              style={[styles.nextHeaderTitle, { textAlign: isRTL ? 'right' : 'left' }]}
              numberOfLines={1}
            >
              {t('appointments.next', 'Next appointment')}
            </Text>
            <View style={[styles.nextHeaderIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Ionicons name="time-outline" size={15} color={primaryOnSurface} />
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.headerDivider} />

        {/* Body */}
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={primaryOnSurface} />
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
              </View>

              {/* Name + Service */}
              <View style={[styles.clientInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                <Text
                  style={[styles.clientName, { textAlign: isRTL ? 'right' : 'left' }]}
                  numberOfLines={1}
                >
                  {nextAppointment.client_name || t('booking.unknown', 'Unknown')}
                </Text>

                <View
                  style={[
                    styles.pillsStack,
                    { alignItems: isRTL ? 'flex-end' : 'flex-start' },
                  ]}
                >
                  {nextAppointment.service_name ? (
                    <View style={[styles.servicePill, { backgroundColor: `${colors.primary}14` }]}>
                      <Text style={[styles.serviceText, { color: primaryOnSurface }]}>
                        {nextAppointment.service_name}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Vertical divider */}
            <View style={[styles.timeDivider, { backgroundColor: `${colors.primary}25` }]} />

            {/* Time — plain text, no background */}
            <View style={styles.timeBlock}>
              <Text style={[styles.timeHM, { color: primaryOnSurface }]}>{timeHM}</Text>
              {timeSuffix ? (
                <Text style={[styles.timeSuffix, { color: `${primaryOnSurface}B3` }]}>{timeSuffix}</Text>
              ) : null}
            </View>
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

  /* ── Today Banner (גרדיאנט + LavaLamp כמו login) ── */
  todayBannerOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  todayBannerContent: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    zIndex: 2,
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
    zIndex: 3,
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
  /* ── Next Appointment Card — רקע surface + צל (בלי overflow:hidden כדי שלא ייחתך הצל ב‑iOS) ── */
  nextCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#1e293b',
        shadowOpacity: 0.09,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
      },
      android: { elevation: 5 },
    }),
  },
  nextHeader: {
    flexDirection: 'row',
    /** כופה פריסה לוגית LTR לשורה הזו בלבד — בלי היפוך גלובלי של RTL */
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 11,
  },
  nextHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
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
    color: '#64748B',
    flexShrink: 1,
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
  pillsStack: {
    width: '100%',
    flexDirection: 'column',
    gap: 6,
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

  /* ── Time Block ── */
  timeDivider: {
    width: 1.5,
    height: 44,
    borderRadius: 2,
    marginHorizontal: 4,
  },
  timeBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingStart: 4,
  },
  timeHM: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  timeSuffix: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
