import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, Easing, FadeIn } from 'react-native-reanimated';

const stepSlideUp = FadeIn.duration(400).easing(Easing.out(Easing.cubic)).withInitialValues({ opacity: 0, transform: [{ translateY: 60 }] });

import { getBookingStepBarTopFromBottom } from '@/components/book-appointment/BookingStepTabs';
import { bookingStepRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

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
}

type TimePeriod = 'morning' | 'afternoon' | 'evening';

interface PeriodConfig {
  key: TimePeriod;
  labelKey: string;
  labelFallback: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  headerGradient: string;
  fromHour: number;
  toHour: number;
}

const PERIODS: PeriodConfig[] = [
  {
    key: 'morning',
    labelKey: 'booking.timePeriod.morning',
    labelFallback: 'בוקר',
    icon: 'sunny',
    iconColor: '#F59E0B',
    headerGradient: 'rgba(251,191,36,0.18)',
    fromHour: 0,
    toHour: 11,
  },
  {
    key: 'afternoon',
    labelKey: 'booking.timePeriod.afternoon',
    labelFallback: 'צהריים',
    icon: 'partly-sunny',
    iconColor: '#F97316',
    headerGradient: 'rgba(249,115,22,0.16)',
    fromHour: 12,
    toHour: 16,
  },
  {
    key: 'evening',
    labelKey: 'booking.timePeriod.evening',
    labelFallback: 'ערב',
    icon: 'moon',
    iconColor: '#818CF8',
    headerGradient: 'rgba(129,140,248,0.18)',
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

function getPeriodIcon(period: TimePeriod): React.ComponentProps<typeof Ionicons>['name'] {
  return PERIODS.find((p) => p.key === period)!.icon;
}

function getPeriodIconColor(period: TimePeriod): string {
  return PERIODS.find((p) => p.key === period)!.iconColor;
}

interface SlotGridProps {
  slots: string[];
  period: TimePeriod;
  selectedTime: string | null;
  primaryColor: string;
  onSelectTime: (time: string) => void;
  baseDelay: number;
}

function SlotGrid({ slots, period, selectedTime, primaryColor, onSelectTime, baseDelay }: SlotGridProps) {
  const icon = getPeriodIcon(period);
  const iconColor = getPeriodIconColor(period);

  const rows: string[][] = [];
  for (let i = 0; i < slots.length; i += 3) {
    rows.push(slots.slice(i, i + 3));
  }

  return (
    <View style={gridStyles.gridContainer}>
      {rows.map((row, rowIdx) => (
        <View key={`row-${rowIdx}`} style={gridStyles.row}>
          {row.map((slot, colIdx) => {
            const selected = selectedTime === slot;
            const delay = baseDelay + rowIdx * 3 + colIdx;
            return (
              <Animated.View
                key={slot}
                entering={bookingStepRowEntering(delay)}
                style={gridStyles.cellWrap}
              >
                <Pressable
                  onPress={() => onSelectTime(slot)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={slot}
                  style={({ pressed }) => [
                    gridStyles.cell,
                    selected && { backgroundColor: primaryColor, borderColor: primaryColor },
                    pressed && { opacity: 0.82, transform: [{ scale: 0.95 }] },
                  ]}
                >
                  <Ionicons
                    name={icon}
                    size={14}
                    color={selected ? '#FFFFFF' : iconColor}
                    style={gridStyles.cellIcon}
                  />
                  <Text style={[gridStyles.cellTime, selected && { color: '#FFFFFF' }]}>
                    {slot}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
          {/* Fill empty cells in last row */}
          {row.length < 3 &&
            Array.from({ length: 3 - row.length }).map((_, i) => (
              <View key={`empty-${i}`} style={gridStyles.cellWrap} />
            ))}
        </View>
      ))}
    </View>
  );
}

export default function TimeSelection({
  visible,
  topOffset,
  listBottomPadding = 0,
  availableTimeSlots,
  selectedTime,
  primaryColor,
  t,
  onSelectTime,
}: TimeSelectionProps) {
  const insets = useSafeAreaInsets();
  const barBottom = getBookingStepBarTopFromBottom(insets.bottom);

  const grouped = useMemo(() => {
    const map: Record<TimePeriod, string[]> = { morning: [], afternoon: [], evening: [] };
    (availableTimeSlots || []).forEach((slot) => {
      map[getPeriod(slot)].push(slot);
    });
    return map;
  }, [availableTimeSlots]);

  const hasSlots = (availableTimeSlots || []).length > 0;

  if (!visible) return null;

  let runningDelay = 0;

  return (
    <Animated.View
      entering={stepSlideUp}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, { bottom: barBottom, zIndex: 2 }]}
    >
      <View style={[localStyles.fillColumn, { paddingTop: Math.max(0, topOffset + 12) }]}>
        {hasSlots ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              localStyles.scrollContent,
              { paddingBottom: Math.max(listBottomPadding, 32) },
            ]}
          >
            {PERIODS.map((period) => {
              const slots = grouped[period.key];
              if (slots.length === 0) return null;
              const sectionDelay = runningDelay;
              runningDelay += Math.ceil(slots.length / 3) * 3 + 2;
              return (
                <Animated.View
                  key={period.key}
                  entering={FadeInDown.delay(sectionDelay * 40).springify().damping(18)}
                  style={localStyles.section}
                >
                  {/* Section header */}
                  <View
                    style={[
                      localStyles.sectionHeader,
                      { backgroundColor: period.headerGradient },
                    ]}
                  >
                    <View style={localStyles.sectionHeaderInner}>
                      <Ionicons
                        name={period.icon}
                        size={22}
                        color={period.iconColor}
                      />
                      <Text style={localStyles.sectionTitle}>
                        {t(period.labelKey, period.labelFallback)}
                      </Text>
                    </View>
                  </View>

                  <SlotGrid
                    slots={slots}
                    period={period.key}
                    selectedTime={selectedTime}
                    primaryColor={primaryColor}
                    onSelectTime={onSelectTime}
                    baseDelay={sectionDelay}
                  />
                </Animated.View>
              );
            })}
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
    paddingHorizontal: 16,
    gap: 20,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sectionHeaderInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
    textAlign: 'center',
    color: '#FFFFFF',
  },
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
  gridContainer: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  cellWrap: {
    flex: 1,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  cellIcon: {
    marginBottom: 2,
  },
  cellTime: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});
