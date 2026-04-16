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
  Animated,
  Easing,
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
const GAUGE_TRACK_H = 76;

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
    // A day is closed when activeDayMap has data AND the day is not explicitly is_active=true.
    // Using !== true (not === false) so days with no row at all are treated as closed.
    const isClosed = Object.keys(activeDayMap).length > 0
      ? activeDayMap[dayOfWeek] !== true
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

const BARBER_AVATAR = 52;

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

  // One Animated.Value per day slot — animated from 0 → target fill height
  const fillAnimValues = useRef(
    Array.from({ length: STRIP_DAYS }, () => new Animated.Value(0)),
  ).current;

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

      // Build active-day map.
      // When a barber is selected and has their own hours rows, use ONLY those rows —
      // global hours must not bleed in for days the barber doesn't work.
      // When no barber-specific rows exist, fall back to global hours.
      const globalHours = allHours.filter((h) => !h.user_id);
      const barberHours = resolvedBarberId
        ? allHours.filter((h) => h.user_id === resolvedBarberId)
        : [];
      const sourceHours = barberHours.length > 0 ? barberHours : globalHours;
      const newActiveDayMap: Record<number, boolean> = {};
      for (const h of sourceHours) {
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

  const maxDayCount = useMemo(
    () => Math.max(1, ...weekDays.map((d) => d.count)),
    [weekDays],
  );

  // Animate gauge bars whenever data finishes loading or weekDays change
  useEffect(() => {
    if (loading) {
      // Reset to zero while loading so bars re-enter on next data arrival
      fillAnimValues.forEach((v) => v.setValue(0));
      return;
    }
    const max = Math.max(1, ...weekDays.map((d) => d.count));
    const animations = fillAnimValues.map((val, i) => {
      const d = weekDays[i];
      if (!d) return Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: false });
      const dimmed = d.isPastCalendarDay || d.isBeyondBookingHorizon || d.isClosed;
      const isEmpty = dimmed || d.count === 0;
      const ratio = isEmpty ? 0 : Math.sqrt(d.count / max);
      const targetH = Math.max(0, Math.round(ratio * GAUGE_TRACK_H));
      // Stagger: RTL reads right→left so reverse index for natural feel
      const staggerIndex = rtl ? STRIP_DAYS - 1 - i : i;
      return Animated.timing(val, {
        toValue: targetH,
        duration: 650,
        delay: staggerIndex * 60,
        easing: Easing.out(Easing.exp),
        useNativeDriver: false,
      });
    });
    Animated.parallel(animations).start();
  }, [loading, weekDays, rtl]);

  const titleColor = '#1C1C1E';
  const secondaryLabel = 'rgba(60, 60, 67, 0.64)';
  const tertiaryLabel = 'rgba(60, 60, 67, 0.45)';

  const showBarberRow = barbers.length > 1;

  return (
    <View
      style={[styles.touchWrap, (isBlocked || awaitingApproval) && { opacity: 0.5 }]}
      accessibilityElementsHidden={isBlocked || awaitingApproval}
    >
      <View style={styles.sectionCard}>
        <View style={styles.cardInner}>
          <Text style={[styles.title, { color: titleColor }]}>
            {t('home.weekAvailability.title', 'מד זמינות תורים')}
          </Text>
          {showBarberRow ? (
            <Text style={[styles.subtitle, { color: secondaryLabel }]}>
              {t('home.weekAvailability.subtitle', 'בחרו איש צוות לצפייה בזמינות')}
            </Text>
          ) : null}
          {showBarberRow ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.barberScroll}
              contentContainerStyle={[
                styles.barberScrollContent,
                barbers.length <= 4
                  ? { justifyContent: 'center', flexGrow: 1 }
                  : { justifyContent: 'flex-start' },
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
              {weekDays.map((d, index) => {
                const dimmed = d.isPastCalendarDay || d.isBeyondBookingHorizon || d.isClosed;
                // sqrt scale: compresses large differences so days with "many" slots
                // don't dwarf days with a moderate number of slots
                const ratio = dimmed || d.count === 0 ? 0 : Math.sqrt(d.count / maxDayCount);
                // Opacity scales from 0.28 (sparse) to 1.0 (full) so color deepens with count
                const fillAlpha = ratio < 0.001 ? 0 : 0.28 + ratio * 0.72;
                const fillBg = primaryRgba(primaryColor, fillAlpha);

                // A day with 0 slots (closed, past, or fully booked) looks gray — same as dimmed
                const isEmpty = dimmed || d.count === 0;
                const labelColor = isEmpty
                  ? 'rgba(60,60,67,0.25)'
                  : d.isToday
                  ? primaryColor
                  : 'rgba(60,60,67,0.55)';

                return (
                  <TouchableOpacity
                    key={d.dateKey}
                    activeOpacity={isEmpty ? 1 : 0.68}
                    disabled={isEmpty || isBlocked || awaitingApproval}
                    onPress={() => {
                      if (!isEmpty && !isBlocked && !awaitingApproval) {
                        router.push('/(client-tabs)/book-appointment');
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.isToday ? t('home.weekAvailability.today', 'Today') : d.weekdayShort}, ${d.count}`}
                    style={[styles.gaugeCol, isEmpty && { opacity: 0.35 }]}
                  >
                    <View style={styles.gaugeTrack}>
                      <Animated.View
                        style={[styles.gaugeFill, { height: fillAnimValues[index], backgroundColor: fillBg }]}
                      />
                    </View>
                    <Text
                      style={[styles.gaugeLabel, { color: labelColor }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {d.isToday ? t('home.weekAvailability.today', 'היום') : d.weekdayShort}
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
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 3,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  barberScroll: {
    marginBottom: 8,
    maxHeight: BARBER_AVATAR + 28,
    marginHorizontal: -16,
  },
  barberScrollContent: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 16,
  },
  barberChipWrap: {
    alignItems: 'center',
    width: 68,
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
    fontSize: 11,
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
    marginTop: 4,
    alignItems: 'flex-end',
  },
  gaugeCol: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  gaugeTrack: {
    width: '100%',
    height: GAUGE_TRACK_H,
    backgroundColor: 'rgba(0,0,0,0.055)',
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    ...Platform.select({ ios: { borderCurve: 'continuous' as any } }),
  },
  gaugeFill: {
    width: '100%',
    borderRadius: 10,
  },
  gaugeLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
  },
});
