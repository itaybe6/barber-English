import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Text, StyleSheet, I18nManager, type View as RNView } from 'react-native';
import Animated from 'react-native-reanimated';

import BookingAnimatedCalendar from '@/components/book-appointment/games-calendar/BookingAnimatedCalendar';
import { bookingStepRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

type DayObj = { fullDate: Date };

type Props = {
  visible: boolean;
  styles: any;
  days: DayObj[];
  bookingOpenDays: number;
  selectedDate: Date | null;
  selectedDayIndex: number | null;
  dayAvailability: Record<string, number>;
  language: string;
  /** Business primary (theme) for selection + month indicator */
  primaryColor: string;
  t: (key: string, fallback: string) => string;
  onSelectDayIndex: (index: number | null) => void;
  onClearTime: () => void;
};

export interface DaySelectionHandle {
  measureSelectedDayCellInWindow: (
    callback: (rect: { x: number; y: number; width: number; height: number } | null) => void
  ) => void;
}

const DaySelection = forwardRef<DaySelectionHandle, Props>(function DaySelection(
  {
    visible,
    styles,
    days,
    bookingOpenDays,
    selectedDate,
    dayAvailability,
    language,
    primaryColor,
    t,
    onSelectDayIndex,
    onClearTime,
  },
  ref
) {
  const selectedDayCellRef = useRef<RNView>(null);

  useImperativeHandle(
    ref,
    () => ({
      measureSelectedDayCellInWindow(callback) {
        requestAnimationFrame(() => {
          const node = selectedDayCellRef.current;
          if (!node) {
            callback(null);
            return;
          }
          node.measureInWindow((x, y, w, h) => {
            if (typeof w !== 'number' || typeof h !== 'number' || w < 8 || h < 8) {
              callback(null);
              return;
            }
            callback({ x, y, width: w, height: h });
          });
        });
      },
    }),
    []
  );

  if (!visible) return null;

  return (
    <View
      style={{
        width: '100%',
        justifyContent: 'flex-start',
        paddingTop: 32,
        paddingBottom: 12,
      }}
    >
      {/* Header — matches BarberSelection / ServiceSelection style */}
      <View style={localStyles.header}>
        <Text style={localStyles.title}>
          {t('booking.selectDayTitle', 'בחירת תאריך')}
        </Text>
        <Text style={localStyles.subtitle}>
          {t('booking.selectDaySubtitle', 'בחר את היום המועדף עליך')}
        </Text>
      </View>

      <Animated.View entering={bookingStepRowEntering(0)}>
        <View style={[styles.calendarSectionCard, { marginTop: 16 }]}>
          <View
            style={[
              styles.calendarFixedBox,
              !I18nManager.isRTL && { direction: 'ltr' },
            ]}
          >
            <BookingAnimatedCalendar
              bookingOpenDays={bookingOpenDays}
              dayAvailability={dayAvailability}
              selectedDate={selectedDate}
              days={days}
              language={language}
              primaryColor={primaryColor}
              onSelectDayIndex={onSelectDayIndex}
              onClearTime={onClearTime}
              selectedDayCellRef={selectedDayCellRef}
            />
          </View>
        </View>
      </Animated.View>

      {/* Legend — white pill so labels stay readable on the pink backdrop */}
      <Animated.View style={localStyles.legendOuter} entering={bookingStepRowEntering(1)}>
        <View style={localStyles.legendPill}>
          <LegendItem dot="#22c55e" label={t('booking.legend.available', 'יש תורים')} />
          <LegendItem dot="#ef4444" label={t('booking.legend.full', 'מלא')} />
          <LegendItem dot="#C7C7CC" label={t('booking.legend.closed', 'סגור')} />
        </View>
      </Animated.View>
    </View>
  );
});

export default DaySelection;

function LegendItem({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={localStyles.legendItem}>
      <View style={[localStyles.legendDot, { backgroundColor: dot }]} />
      <Text style={localStyles.legendLabel}>{label}</Text>
    </View>
  );
}

const DOT_SIZE = 8;

const localStyles = StyleSheet.create({
  header: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },
  legendOuter: {
    marginTop: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  legendPill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: -0.1,
  },
});
