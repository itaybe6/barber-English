import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  I18nManager,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { formatDateToYMDLocal } from '@/lib/utils/localDate';
import { fetchFutureAvailableSlotCountsByDate } from '@/lib/api/clientWeekAvailability';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { businessHoursApi } from '@/lib/api/businessHours';
import { usersApi } from '@/lib/api/users';
import { toBcp47Locale } from '@/lib/i18nLocale';
import { parseHexRgb } from '@/lib/colorContrast';
import type { User } from '@/lib/supabase';

const CARD_RADIUS = 20;

function primaryRgba(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return `rgba(0, 122, 255, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export interface ClientWeekAvailabilityStripProps {
  primaryColor: string;
  isBlocked?: boolean;
  awaitingApproval?: boolean;
  reloadToken?: number;
}

interface WeekDayModel {
  dateKey: string;
  date: Date;
  weekdayShort: string;
  dayNum: string;
  isToday: boolean;
  isPastCalendarDay: boolean;
  isBeyondBookingHorizon: boolean;
  isClosed: boolean;
  count: number;
}

const STRIP_DAYS = 6;

function buildWeekDays(
  counts: Record<string, number>,
  today: Date,
  bookingHorizonDays: number,
  locale: string,
  activeDayMap: Record<number, boolean>,
): WeekDayModel[] {
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = formatDateToYMDLocal(todayNorm);
  const lastBookable = new Date(todayNorm);
  lastBookable.setDate(lastBookable.getDate() + Math.max(0, bookingHorizonDays));
  const lastBookableKey = formatDateToYMDLocal(lastBookable);

  const out: WeekDayModel[] = [];
  for (let i = 0; i < STRIP_DAYS; i++) {
    const date = new Date(todayNorm);
    date.setDate(todayNorm.getDate() + i);
    const dateKey = formatDateToYMDLocal(date);
    const isToday = dateKey === todayKey;
    const isBeyondBookingHorizon = dateKey > lastBookableKey;
    const weekdayShort = date.toLocaleDateString(locale, { weekday: 'short' });
    const dayNum = String(date.getDate());
    const dayOfWeek = date.getDay();
    // A day is closed if the business_hours row for that day_of_week is is_active=false.
    // If activeDayMap has no entry for this day (no hours row at all), treat it as closed.
    const isClosed = Object.keys(activeDayMap).length > 0
      ? activeDayMap[dayOfWeek] === false
      : false;
    out.push({
      dateKey,
      date,
      weekdayShort,
      dayNum,
      isToday,
      isPastCalendarDay: false,
      isBeyondBookingHorizon,
      isClosed,
      count: isClosed ? 0 : (counts[dateKey] ?? 0),
    });
  }
  return out;
}

const BARBER_AVATAR = 54;

/**
 * Returns the id of the rightmost barber chip.
 * In RTL with `row-reverse` the scroll renders index 0 on the visual RIGHT (first for RTL readers).
 * In LTR with `row` the last element is the rightmost.
 */
function defaultStripBarberId(admins: User[], rtl: boolean): string | null {
  if (admins.length === 0) return null;
  return rtl ? admins[0].id : admins[admins.length - 1].id;
}

export function ClientWeekAvailabilityStrip({
  primaryColor,
  isBlocked = false,
  awaitingApproval = false,
  reloadToken = 0,
}: ClientWeekAvailabilityStripProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = toBcp47Locale(i18n?.language);
  const rtl = I18nManager.isRTL;

  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [horizonDays, setHorizonDays] = useState(14);
  const [barbers, setBarbers] = useState<User[]>([]);
  /** Selected staff for counts; auto-set to rightmost default when list loads. */
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  /** Map of day_of_week → is_active for the selected barber (or global hours). */
  const [activeDayMap, setActiveDayMap] = useState<Record<number, boolean>>({});

  // Stale-request guard: only the latest request's results are applied
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    try {
      const [admins, horizon] = await Promise.all([
        usersApi.getAdminUsers(),
        businessProfileApi.getMaxBookingOpenDaysAcrossBusiness(),
      ]);

      if (requestId !== loadRequestIdRef.current) return;

      setBarbers(admins);
      setHorizonDays(Math.max(0, horizon));

      const resolvedBarberId =
        selectedBarberId !== null && admins.some((a) => a.id === selectedBarberId)
          ? selectedBarberId
          : defaultStripBarberId(admins, rtl);

      const today = new Date();
      const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const keys: string[] = [];
      for (let i = 0; i < STRIP_DAYS; i++) {
        const d = new Date(todayNorm);
        d.setDate(todayNorm.getDate() + i);
        keys.push(formatDateToYMDLocal(d));
      }

      // Fetch counts + all business hours in parallel
      const [next, allHours] = await Promise.all([
        fetchFutureAvailableSlotCountsByDate(keys, resolvedBarberId),
        businessHoursApi.getAllBusinessHours(),
      ]);

      if (requestId !== loadRequestIdRef.current) return;

      // Build active-day map: global hours first, then override with barber-specific rows
      const globalHours = allHours.filter((h) => !h.user_id);
      const barberHours = resolvedBarberId
        ? allHours.filter((h) => h.user_id === resolvedBarberId)
        : [];
      const newActiveDayMap: Record<number, boolean> = {};
      for (const h of globalHours) {
        newActiveDayMap[h.day_of_week] = h.is_active;
      }
      for (const h of barberHours) {
        newActiveDayMap[h.day_of_week] = h.is_active;
      }
      setActiveDayMap(newActiveDayMap);

      setCounts(next);
      if (resolvedBarberId && selectedBarberId !== resolvedBarberId) {
        setSelectedBarberId(resolvedBarberId);
      }
    } catch {
      if (requestId !== loadRequestIdRef.current) return;
      setCounts({});
    } finally {
      if (requestId !== loadRequestIdRef.current) return;
      setLoading(false);
    }
  }, [selectedBarberId, rtl]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      void loadRef.current();
    }, []),
  );

  useEffect(() => {
    void load();
  }, [selectedBarberId, load]);

  useEffect(() => {
    if (reloadToken <= 0) return;
    void load();
  }, [reloadToken, load]);

  const weekDays = useMemo(() => {
    const today = new Date();
    return buildWeekDays(counts, today, horizonDays, locale, activeDayMap);
  }, [counts, horizonDays, locale, activeDayMap]);

  const titleColor = '#1C1C1E';
  const secondaryLabel = 'rgba(60, 60, 67, 0.64)';
  const tertiaryLabel = 'rgba(60, 60, 67, 0.45)';

  const showBarberRow = barbers.length > 0;

  return (
    <View
      style={[styles.touchWrap, (isBlocked || awaitingApproval) && { opacity: 0.5 }]}
      accessibilityElementsHidden={isBlocked || awaitingApproval}
    >
      <Text style={[styles.title, { color: titleColor }]}>
        {t('home.weekAvailability.title', 'תורים פנויים בימים הקרובים')}
      </Text>
      {/** White card — title sits above (outside), like waitlist section title vs card */}
      <View style={styles.sectionCard}>
        <View style={styles.cardInner}>
          {showBarberRow ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.barberScroll}
              contentContainerStyle={[
                styles.barberScrollContent,
                { flexDirection: rtl ? 'row-reverse' : 'row' },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {barbers.map((b) => {
                const selected = selectedBarberId === b.id;
                const uri = String(b.image_url ?? '').trim();
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => setSelectedBarberId(b.id)}
                    activeOpacity={0.75}
                    style={styles.barberChipWrap}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={b.name || t('home.weekAvailability.barber', 'Barber')}
                  >
                    <View
                      style={[
                        styles.avatarRing,
                        {
                          borderColor: selected ? primaryColor : 'rgba(60,60,67,0.12)',
                          borderWidth: selected ? 2.5 : 1,
                        },
                      ]}
                    >
                      {uri.length > 0 ? (
                        <Image source={{ uri }} style={styles.avatarImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Ionicons name="person" size={26} color={tertiaryLabel} />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.barberLabel, { color: secondaryLabel }]} numberOfLines={1}>
                      {b.name?.split(/\s+/)[0] || '—'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={styles.sectionDivider} />

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={primaryColor} />
            </View>
          ) : (
            <View style={[styles.daysRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              {weekDays.map((d) => {
                  const dimmed = d.isPastCalendarDay || d.isBeyondBookingHorizon || d.isClosed;
                  const has = !dimmed && d.count > 0;
                  /** Same chrome as "today" — primary wash + border when this calendar day has open slots */
                  const primaryHighlight = !dimmed && (d.isToday || has);

                  const bgColor = dimmed
                    ? 'rgba(0,0,0,0.03)'
                    : primaryHighlight
                    ? primaryRgba(primaryColor, 0.09)
                    : 'rgba(0,0,0,0.04)';

                  const borderColor = dimmed
                    ? 'rgba(60,60,67,0.07)'
                    : primaryHighlight
                    ? primaryColor
                    : 'rgba(60,60,67,0.14)';

                  const borderWidth = primaryHighlight ? 1.5 : 1;

                  const countColor = dimmed
                    ? 'rgba(60,60,67,0.22)'
                    : 'rgba(60,60,67,0.28)';

                  const weekdayColor = dimmed
                    ? 'rgba(60,60,67,0.25)'
                    : primaryHighlight
                    ? primaryColor
                    : tertiaryLabel;

                  return (
                    <TouchableOpacity
                      key={d.dateKey}
                      activeOpacity={dimmed ? 1 : 0.68}
                      disabled={dimmed || isBlocked || awaitingApproval}
                      onPress={() => {
                        if (!dimmed && !isBlocked && !awaitingApproval) {
                          router.push('/(client-tabs)/book-appointment');
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${d.isToday ? t('home.weekAvailability.today', 'Today') : d.weekdayShort}, ${d.dayNum}`}
                      style={[
                        styles.dayBtn,
                        {
                          backgroundColor: bgColor,
                          borderColor,
                          borderWidth,
                        },
                        dimmed && styles.dayBtnDimmed,
                      ]}
                    >
                      <Text
                        style={[styles.dayBtnWeekday, { color: weekdayColor }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {d.isToday
                          ? t('home.weekAvailability.today', 'Today')
                          : d.weekdayShort}
                      </Text>
                      <Text style={[styles.dayBtnCount, { color: countColor }]}>
                        {dimmed ? '—' : String(d.count)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Room so iOS/Android shadow is not clipped by siblings / parent */
  touchWrap: {
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  /** Same family as `WaitlistHomeFabPanel` `cardTrigger` — no `overflow: hidden` here or iOS clips the shadow */
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    marginHorizontal: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#1e253b',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 6 },
    }),
  },
  cardInner: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  barberScroll: {
    marginBottom: 8,
    maxHeight: BARBER_AVATAR + 26,
  },
  barberScrollContent: {
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 2,
    paddingRight: 4,
  },
  barberChipWrap: {
    alignItems: 'center',
    width: 70,
  },
  avatarRing: {
    width: BARBER_AVATAR,
    height: BARBER_AVATAR,
    borderRadius: BARBER_AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: BARBER_AVATAR - 4,
    height: BARBER_AVATAR - 4,
    borderRadius: (BARBER_AVATAR - 4) / 2,
  },
  avatarFallback: {
    width: BARBER_AVATAR - 4,
    height: BARBER_AVATAR - 4,
    borderRadius: (BARBER_AVATAR - 4) / 2,
    backgroundColor: 'rgba(142,142,147,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barberLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 64,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 8,
  },
  loadingRow: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysRow: {
    gap: 5,
    marginTop: 2,
  },
  dayBtn: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 3,
    gap: 4,
    ...Platform.select({ ios: { borderCurve: 'continuous' as any } }),
  },
  dayBtnDimmed: {
    opacity: 0.35,
  },
  dayBtnWeekday: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
  },
  dayBtnCount: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
});
