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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { formatDateToYMDLocal } from '@/lib/utils/localDate';
import { fetchFutureAvailableSlotCountsByDate } from '@/lib/api/clientWeekAvailability';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { usersApi } from '@/lib/api/users';
import { toBcp47Locale } from '@/lib/i18nLocale';
import { parseHexRgb } from '@/lib/colorContrast';
import type { User } from '@/lib/supabase';

const DAY_COLUMN_W = 52;
const CARD_RADIUS = 20;
/** Apple system green — availability */
const AVAILABILITY_GREEN = '#34C759';
const AVAILABILITY_GREEN_SOFT = 'rgba(52, 199, 89, 0.16)';

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
  count: number;
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  return x;
}

function buildWeekDays(
  counts: Record<string, number>,
  today: Date,
  bookingHorizonDays: number,
  locale: string,
): WeekDayModel[] {
  const start = startOfWeekSunday(today);
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = formatDateToYMDLocal(todayNorm);
  const lastBookable = new Date(todayNorm);
  lastBookable.setDate(lastBookable.getDate() + Math.max(0, bookingHorizonDays));
  const lastBookableKey = formatDateToYMDLocal(lastBookable);

  const out: WeekDayModel[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateKey = formatDateToYMDLocal(date);
    const isPastCalendarDay = dateKey < todayKey;
    const isToday = dateKey === todayKey;
    const isBeyondBookingHorizon = dateKey > lastBookableKey;
    const weekdayShort = date.toLocaleDateString(locale, { weekday: 'short' });
    const dayNum = String(date.getDate());
    out.push({
      dateKey,
      date,
      weekdayShort,
      dayNum,
      isToday,
      isPastCalendarDay,
      isBeyondBookingHorizon,
      count: counts[dateKey] ?? 0,
    });
  }
  return out;
}

const BARBER_AVATAR = 44;
const ALL_CHIP = 44;

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
  /** null = all barbers aggregated */
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [admins, horizon] = await Promise.all([
        usersApi.getAdminUsers(),
        businessProfileApi.getMaxBookingOpenDaysAcrossBusiness(),
      ]);
      setBarbers(admins);
      setHorizonDays(Math.max(0, horizon));

      let barberForQuery = selectedBarberId;
      if (barberForQuery !== null && !admins.some((a) => a.id === barberForQuery)) {
        barberForQuery = null;
        setSelectedBarberId(null);
      }

      const today = new Date();
      const start = startOfWeekSunday(today);
      const keys: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        keys.push(formatDateToYMDLocal(d));
      }
      const next = await fetchFutureAvailableSlotCountsByDate(keys, barberForQuery);
      setCounts(next);
    } catch {
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, [selectedBarberId]);

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

  const { weekDays, totalSlots, daysWithSlots } = useMemo(() => {
    const today = new Date();
    const days = buildWeekDays(counts, today, horizonDays, locale);
    let total = 0;
    let withSlots = 0;
    for (const d of days) {
      if (d.isPastCalendarDay || d.isBeyondBookingHorizon) continue;
      if (d.count > 0) {
        withSlots += 1;
        total += d.count;
      }
    }
    return { weekDays: days, totalSlots: total, daysWithSlots: withSlots };
  }, [counts, horizonDays, locale]);

  const summaryText = useMemo(() => {
    if (loading) return t('home.weekAvailability.summaryLoading', 'Checking open spots…');
    if (totalSlots === 0) {
      return t('home.weekAvailability.summaryNone', 'No open spots left this week — try again soon.');
    }
    return t('home.weekAvailability.summary', {
      slots: totalSlots,
      days: daysWithSlots,
    });
  }, [loading, totalSlots, daysWithSlots, t]);

  const onOpenBooking = () => {
    if (isBlocked || awaitingApproval) return;
    router.push('/(client-tabs)/book-appointment');
  };

  const borderPrimary = primaryRgba(primaryColor, 0.28);
  const washPrimary = primaryRgba(primaryColor, 0.08);
  const titleColor = '#1C1C1E';
  const secondaryLabel = 'rgba(60, 60, 67, 0.64)';
  const tertiaryLabel = 'rgba(60, 60, 67, 0.45)';

  const showBarberRow = barbers.length > 0;

  return (
    <View
      style={[styles.touchWrap, (isBlocked || awaitingApproval) && { opacity: 0.5 }]}
      accessibilityElementsHidden={isBlocked || awaitingApproval}
    >
      <View style={[styles.cardOuter, { borderColor: borderPrimary }]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.72)' }]} />
        )}
        <LinearGradient
          colors={[washPrimary, 'rgba(255,255,255,0)', washPrimary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.primaryWash}
          pointerEvents="none"
        />

        <View style={styles.cardInner}>
          <Text style={[styles.title, { color: titleColor, textAlign: rtl ? 'right' : 'left' }]}>
            {t('home.weekAvailability.title', 'Available appointments this week')}
          </Text>

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
              <TouchableOpacity
                onPress={() => setSelectedBarberId(null)}
                activeOpacity={0.75}
                style={styles.barberChipWrap}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedBarberId === null }}
                accessibilityLabel={t('home.weekAvailability.allBarbers', 'All barbers')}
              >
                <View
                  style={[
                    styles.allChip,
                    {
                      borderColor: selectedBarberId === null ? primaryColor : 'rgba(60,60,67,0.18)',
                      borderWidth: selectedBarberId === null ? 2.5 : 1,
                      backgroundColor: selectedBarberId === null ? primaryRgba(primaryColor, 0.12) : 'rgba(255,255,255,0.5)',
                    },
                  ]}
                >
                  <Ionicons
                    name="people"
                    size={20}
                    color={selectedBarberId === null ? primaryColor : tertiaryLabel}
                  />
                </View>
                <Text style={[styles.barberLabel, { color: secondaryLabel }]} numberOfLines={1}>
                  {t('home.weekAvailability.allBarbers', 'All')}
                </Text>
              </TouchableOpacity>

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
                          <Ionicons name="person" size={22} color={tertiaryLabel} />
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

          <Text style={[styles.summary, { color: secondaryLabel, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
            {summaryText}
          </Text>

          <View style={[styles.hairline, { backgroundColor: primaryRgba(primaryColor, 0.15) }]} />

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={primaryColor} />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.scrollContent,
                { flexDirection: rtl ? 'row-reverse' : 'row' },
              ]}
            >
              {weekDays.map((d) => {
                const dimmed = d.isPastCalendarDay || d.isBeyondBookingHorizon;
                const has = !dimmed && d.count > 0;

                return (
                  <View key={d.dateKey} style={styles.dayColumn}>
                    <Text style={[styles.weekdayLabel, { color: tertiaryLabel }, dimmed && styles.dayMuted]} numberOfLines={1}>
                      {d.weekdayShort}
                    </Text>
                    {d.isToday ? (
                      <Text style={[styles.todayTag, { color: primaryColor }]} numberOfLines={1}>
                        {t('home.weekAvailability.today', 'Today')}
                      </Text>
                    ) : (
                      <Text style={[styles.dayNum, { color: tertiaryLabel }, dimmed && styles.dayMuted]}>{d.dayNum}</Text>
                    )}

                    <View
                      style={[
                        styles.slotDot,
                        has && { backgroundColor: AVAILABILITY_GREEN_SOFT, borderColor: AVAILABILITY_GREEN },
                        !has && !dimmed && { borderColor: 'rgba(60,60,67,0.12)', backgroundColor: 'rgba(255,255,255,0.45)' },
                        dimmed && { borderColor: 'rgba(60,60,67,0.08)', backgroundColor: 'rgba(0,0,0,0.03)' },
                      ]}
                    >
                      {has ? (
                        <View style={styles.greenInner} />
                      ) : null}
                    </View>

                    <Text
                      style={[
                        styles.count,
                        dimmed && styles.countMuted,
                        has && { color: AVAILABILITY_GREEN },
                        !has && !dimmed && { color: tertiaryLabel },
                      ]}
                    >
                      {dimmed ? '—' : d.count}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity
            onPress={onOpenBooking}
            disabled={isBlocked || awaitingApproval}
            activeOpacity={0.7}
            style={styles.footerBtn}
            accessibilityRole="button"
            accessibilityLabel={t('home.weekAvailability.a11y', 'Weekly availability, book an appointment')}
          >
            <Text style={[styles.footerHintText, { color: primaryColor }]}>
              {t('home.weekAvailability.tapToBook', 'Tap to book')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchWrap: {
    marginTop: 14,
  },
  cardOuter: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
    }),
  },
  primaryWash: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  cardInner: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  barberScroll: {
    marginBottom: 10,
    maxHeight: BARBER_AVATAR + 22,
  },
  barberScrollContent: {
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 2,
    paddingRight: 4,
  },
  barberChipWrap: {
    alignItems: 'center',
    width: 64,
  },
  allChip: {
    width: ALL_CHIP,
    height: ALL_CHIP,
    borderRadius: ALL_CHIP / 2,
    alignItems: 'center',
    justifyContent: 'center',
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
  summary: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 10,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  loadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 2,
  },
  dayColumn: {
    width: DAY_COLUMN_W,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekdayLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  dayNum: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 8,
  },
  todayTag: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  dayMuted: {
    opacity: 0.45,
  },
  /** Minimal Apple-style availability marker */
  slotDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  greenInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AVAILABILITY_GREEN,
  },
  count: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  countMuted: {
    color: 'rgba(60, 60, 67, 0.28)',
  },
  footerBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 6,
  },
  footerHintText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
