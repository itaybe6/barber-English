import React, { forwardRef, useImperativeHandle, useRef, type MutableRefObject } from 'react';
import { View, Text, StyleSheet, I18nManager, type View as RNView } from 'react-native';
import Animated from 'react-native-reanimated';

import BookingAnimatedCalendar from '@/components/book-appointment/games-calendar/BookingAnimatedCalendar';
import { bookingStepRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

const LIST_H_PAD = 16;

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
  /** Nudge block up so legend clears the docked summary strip (px). */
  contentLiftPx?: number;
  /** Extra padding below the legend pill so a docked bottom sheet does not overlap it. */
  legendBottomPad?: number;
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
    contentLiftPx = 0,
    legendBottomPad = 0,
  },
  ref
) {
  const selectedDayCellRef = useRef<RNView>(null);
  const pendingTapRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      measureSelectedDayCellInWindow(callback) {
        const cached = pendingTapRectRef.current;
        pendingTapRectRef.current = null;
        if (cached && cached.width >= 8 && cached.height >= 8) {
          callback(cached);
          return;
        }
        callback(null);
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
        paddingTop: contentLiftPx > 0 ? 6 : 8,
        paddingBottom: 12 + legendBottomPad,
        ...(contentLiftPx > 0 ? { transform: [{ translateY: -contentLiftPx }] } : null),
      }}
    >
      <Animated.View entering={bookingStepRowEntering(0)}>
        <View style={localStyles.shell}>
          <View style={localStyles.header}>
            <Text style={localStyles.title} maxFontSizeMultiplier={1.35}>
              {t('booking.selectDateTitle', 'Choose a date')}
            </Text>
            <Text style={localStyles.subtitle} maxFontSizeMultiplier={1.3}>
              {t('booking.selectDateSubtitle', 'Colors show availability — tap a day to continue')}
            </Text>
          </View>
          <View style={[styles.calendarSectionCard, { marginTop: 12, marginHorizontal: 0 }]}>
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
              pendingTapRectRef={pendingTapRectRef}
            />
          </View>
        </View>
        </View>
      </Animated.View>

      {/* Legend — white pill so labels stay readable on the pink backdrop */}
      <Animated.View
        style={[
          localStyles.legendOuter,
          contentLiftPx > 0 ? localStyles.legendOuterBelowCalendar : null,
        ]}
        entering={bookingStepRowEntering(1)}
      >
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
  shell: {
    gap: 14,
    paddingHorizontal: LIST_H_PAD,
  },
  header: {
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 2,
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
  legendOuter: {
    marginTop: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  /** Extra air between the white calendar card and the legend pill (date step). */
  legendOuterBelowCalendar: {
    marginTop: 24,
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
