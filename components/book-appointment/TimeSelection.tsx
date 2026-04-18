import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const stepSlideUp = FadeIn.duration(290)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ opacity: 0, transform: [{ translateY: 42 }] });

import { BOOKING_TIME_PERIOD_EMOJI } from '@/constants/bookingTimePeriodEmoji';
import { getBookingStepBarTopFromBottomNoTabBar } from '@/components/book-appointment/BookingStepTabs';
import { bookingTimeRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

export interface TimeSelectionProps {
  visible: boolean;
  styles: any;
  topOffset: number;
  listBottomPadding?: number;
  availableTimeSlots: string[];
  selectedTime: string | null;
  primaryColor: string;
  t: any;
  onSelectTime: (time: string) => void;
  onWaitlist?: () => void;
}

type TimePeriod = 'morning' | 'afternoon' | 'evening';

interface PeriodConfig {
  key: TimePeriod;
  labelKey: string;
  labelFallback: string;
  emoji: string;
  fromHour: number;
  toHour: number;
}

const PERIODS: PeriodConfig[] = [
  {
    key: 'morning',
    labelKey: 'booking.timePeriod.morning',
    labelFallback: 'בוקר',
    emoji: BOOKING_TIME_PERIOD_EMOJI.morning,
    fromHour: 0,
    toHour: 11,
  },
  {
    key: 'afternoon',
    labelKey: 'booking.timePeriod.afternoon',
    labelFallback: 'צהריים',
    emoji: BOOKING_TIME_PERIOD_EMOJI.afternoon,
    fromHour: 12,
    toHour: 16,
  },
  {
    key: 'evening',
    labelKey: 'booking.timePeriod.evening',
    labelFallback: 'ערב',
    emoji: BOOKING_TIME_PERIOD_EMOJI.evening,
    fromHour: 17,
    toHour: 23,
  },
];

function getPeriod(timeStr: string): TimePeriod {
  const hour = parseInt(timeStr.split(':')[0], 10);
  if (hour <= 11) return 'morning';
  if (hour <= 16) return 'afternoon';
  return 'evening';
}

interface SlotGridProps {
  slots: string[];
  selectedTime: string | null;
  primaryColor: string;
  onSelectTime: (time: string) => void;
}

function SlotGrid({ slots, selectedTime, primaryColor, onSelectTime }: SlotGridProps) {
  const rows: string[][] = [];
  for (let i = 0; i < slots.length; i += 3) {
    rows.push(slots.slice(i, i + 3));
  }

  return (
    <View style={gridStyles.container}>
      {rows.map((row, rowIdx) => (
        <View key={`row-${rowIdx}`} style={gridStyles.row}>
          {row.map((slot) => {
            const selected = selectedTime === slot;
            return (
              <View key={slot} style={gridStyles.cellWrap}>
                <Pressable
                  onPress={() => onSelectTime(slot)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={slot}
                  style={({ pressed }) => [
                    gridStyles.cell,
                    selected && { backgroundColor: primaryColor },
                    pressed && gridStyles.cellPressed,
                  ]}
                >
                  <Text
                    style={[
                      gridStyles.cellTime,
                      selected && gridStyles.cellTimeSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {slot}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {row.length < 3 &&
            Array.from({ length: 3 - row.length }).map((_, i) => (
              <View key={`empty-${i}`} style={gridStyles.cellWrap} />
            ))}
        </View>
      ))}
    </View>
  );
}

const LIST_H_PAD = 18;

export default function TimeSelection({
  visible,
  topOffset,
  listBottomPadding = 0,
  availableTimeSlots,
  selectedTime,
  primaryColor,
  t,
  onSelectTime,
  onWaitlist,
}: TimeSelectionProps) {
  const insets = useSafeAreaInsets();
  const barBottom = getBookingStepBarTopFromBottomNoTabBar(insets.bottom);

  const grouped = useMemo(() => {
    const map: Record<TimePeriod, string[]> = { morning: [], afternoon: [], evening: [] };
    (availableTimeSlots || []).forEach((slot) => {
      map[getPeriod(slot)].push(slot);
    });
    return map;
  }, [availableTimeSlots]);

  const hasSlots = (availableTimeSlots || []).length > 0;
  const activePeriods = PERIODS.filter((p) => grouped[p.key].length > 0);

  if (!visible) return null;

  let runningDelay = 1;

  return (
    <Animated.View
      entering={stepSlideUp}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, { bottom: barBottom, zIndex: 2 }]}
    >
      <View style={[localStyles.fillColumn, { paddingTop: Math.max(0, topOffset + 8) }]}>
        {hasSlots ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              localStyles.scrollContent,
              { paddingBottom: Math.max(listBottomPadding, 16) },
            ]}
          >
            {/* Title + subtitle – same pattern as other steps */}
            <Animated.View entering={bookingTimeRowEntering(0)} style={localStyles.header}>
              <Text style={localStyles.title} maxFontSizeMultiplier={1.35}>
                {t('booking.selectTimeTitle', 'Choose a time')}
              </Text>
              <Text style={localStyles.subtitle} maxFontSizeMultiplier={1.3}>
                {t('booking.selectTimeSubtitle', 'Pick an available slot below')}
              </Text>
            </Animated.View>

            {/* Sections – floating on the purple background */}
            {activePeriods.map((period) => {
              const slots = grouped[period.key];
              const sectionDelay = runningDelay;
              runningDelay += Math.ceil(slots.length / 3) * 3 + 2;

              return (
                <Animated.View
                  key={period.key}
                  entering={bookingTimeRowEntering(sectionDelay)}
                  style={localStyles.section}
                >
                  {/* Compact period label */}
                  <View style={localStyles.sectionLabelRow}>
                    <Text style={localStyles.sectionEmoji}>{period.emoji}</Text>
                    <Text style={localStyles.sectionLabel}>
                      {t(period.labelKey, period.labelFallback)}
                    </Text>
                    <View style={localStyles.sectionLine} />
                  </View>

                  {/* Slot grid */}
                  <SlotGrid
                    slots={slots}
                    selectedTime={selectedTime}
                    primaryColor={primaryColor}
                    onSelectTime={onSelectTime}
                  />
                </Animated.View>
              );
            })}

            {/* Waitlist nudge – shown when slots exist but none suit the user */}
            {onWaitlist && (
              <Animated.View entering={bookingTimeRowEntering(runningDelay)} style={localStyles.waitlistRow}>
                <View style={localStyles.waitlistDivider} />
                <Text style={localStyles.waitlistHint}>
                  {t('booking.noSuitableTime', 'לא מצאת שעה מתאימה?')}
                </Text>
                <Pressable
                  onPress={onWaitlist}
                  accessibilityRole="button"
                  style={({ pressed }) => [localStyles.waitlistBtn, pressed && localStyles.waitlistBtnPressed]}
                >
                  <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.9)" style={{ marginLeft: I18nManager.isRTL ? 0 : 4, marginRight: I18nManager.isRTL ? 4 : 0 }} />
                  <Text style={localStyles.waitlistBtnText}>
                    {t('booking.joinWaitlist', 'הצטרף/י לרשימת המתנה')}
                  </Text>
                </Pressable>
              </Animated.View>
            )}
          </ScrollView>
        ) : (
          <View style={localStyles.emptyBody}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color="rgba(255,255,255,0.3)"
              style={{ marginBottom: 14 }}
            />
            <Text style={localStyles.emptyTitle}>
              {t('booking.noSlots', 'אין שעות פנויות לתאריך שנבחר')}
            </Text>
            <Text style={localStyles.emptySub}>
              {t('booking.chooseAnotherDay', 'בחר/י יום אחר או חזור/י אחורה')}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const localStyles = StyleSheet.create({
  fillColumn: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: LIST_H_PAD,
    gap: 20,
  },

  /* ── Header ── */
  header: {
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Period section ── */
  section: {
    gap: 10,
  },
  sectionLabelRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionEmoji: {
    fontSize: 15,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.3,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  /* ── Waitlist nudge (bottom of slot list) ── */
  waitlistRow: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
  },
  waitlistDivider: {
    width: 40,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 2,
  },
  waitlistHint: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  waitlistBtn: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  waitlistBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  waitlistBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.2,
  },

  /* ── Empty state ── */
  emptyBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 20,
  },
});

const gridStyles = StyleSheet.create({
  container: {
    gap: 9,
  },
  row: {
    flexDirection: 'row',
    gap: 9,
  },
  cellWrap: {
    flex: 1,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 4,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.93)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.13,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  cellPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.94 }],
  },
  cellTime: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  cellTimeSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
