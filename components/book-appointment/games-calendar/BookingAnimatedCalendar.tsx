import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, LayoutChangeEvent, Dimensions, StyleSheet } from 'react-native';
import { CalendarAnimatedProvider, useBookingCalendarContext } from './animated-context';
import { ScrollContainer } from './scroll-container';
import { ThreeMonthHeader } from './three-month-header';
import { Days } from './days';
import { DAYS_HEADER_HEIGHT, MONTHS_HEIGHT } from './constants';
import {
  buildForwardMonthsFromNow,
  buildMonthRange,
  CALENDAR_FORWARD_MONTH_STEPS,
  getShortWeekdayNames,
  type MonthEntry,
} from './utils';

type DayRow = { fullDate: Date };

export type BookingAnimatedCalendarProps = {
  dayAvailability: Record<string, number>;
  selectedDate: Date | null;
  language: string;
  primaryColor: string;
  variant?: 'booking' | 'admin';
  bookingOpenDays?: number;
  days?: DayRow[];
  onSelectDayIndex?: (index: number | null) => void;
  onClearTime?: () => void;
  onAdminDayPress?: (date: Date) => void;
  /** `${year}-${monthIndex}` with monthIndex 0–11 — sync pager when parent month changes */
  adminAnchorMonthKey?: string;
  onAdminVisibleMonthChange?: (monthFirstDay: Date) => void;
  adminMonthsBack?: number;
  adminMonthsForward?: number;
};

function CalendarShell({
  variant,
  calendarData,
  rangeStart,
  rangeEnd,
  dayAvailability,
  selectedDate,
  days,
  language,
  primaryColor,
  onSelectDayIndex,
  onClearTime,
  onAdminDayPress,
  adminAnchorMonthKey,
  onAdminVisibleMonthChange,
  initialLogicalIndex,
  displayMode,
}: {
  variant: 'booking' | 'admin';
  calendarData: MonthEntry[];
  rangeStart: Date;
  rangeEnd: Date;
  dayAvailability: Record<string, number>;
  selectedDate: Date | null;
  days: DayRow[];
  language: string;
  primaryColor: string;
  onSelectDayIndex?: (index: number | null) => void;
  onClearTime?: () => void;
  onAdminDayPress?: (date: Date) => void;
  adminAnchorMonthKey?: string;
  onAdminVisibleMonthChange?: (monthFirstDay: Date) => void;
  initialLogicalIndex: number;
  displayMode: 'availability' | 'count';
}) {
  const { pageWidth, scrollViewRef } = useBookingCalendarContext();
  const [layoutW, setLayoutW] = useState(() => Dimensions.get('window').width - 64);
  const [activeMonthIndex, setActiveMonthIndex] = useState(initialLogicalIndex);
  const activeMonthIndexRef = useRef(activeMonthIndex);
  activeMonthIndexRef.current = activeMonthIndex;

  const monthCount = calendarData.length;

  useEffect(() => {
    setActiveMonthIndex((i) => Math.max(0, Math.min(monthCount - 1, i)));
  }, [monthCount]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setLayoutW(e.nativeEvent.layout.width);
  }, []);

  useLayoutEffect(() => {
    pageWidth.value = Math.max(1, layoutW);
  }, [layoutW, pageWidth]);

  useLayoutEffect(() => {
    if (layoutW <= 0 || monthCount < 1) return;
    const w = Math.max(1, pageWidth.value);
    const logical = activeMonthIndexRef.current;
    const physical = monthCount - 1 - logical;
    scrollViewRef.current?.scrollTo({ x: physical * w, animated: false });
  }, [layoutW, monthCount, pageWidth, scrollViewRef]);

  const cellSize = Math.max(34, Math.floor((Math.max(1, layoutW) - 32) / 7));
  const weekdayNames = useMemo(() => getShortWeekdayNames(language), [language]);

  const handleDayPress = useCallback(
    (date: Date) => {
      if (variant === 'admin') {
        onAdminDayPress?.(date);
        return;
      }
      const idx = days.findIndex((d) => d.fullDate.toDateString() === date.toDateString());
      onSelectDayIndex?.(idx >= 0 ? idx : null);
      onClearTime?.();
    },
    [variant, days, onSelectDayIndex, onClearTime, onAdminDayPress]
  );

  const goToMonthIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(monthCount - 1, index));
      if (clamped === activeMonthIndexRef.current) return;
      setActiveMonthIndex(clamped);
      const w = pageWidth.value;
      const physical = monthCount - 1 - clamped;
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: physical * Math.max(1, w), animated: true });
      }, 0);
    },
    [monthCount, pageWidth, scrollViewRef]
  );

  useEffect(() => {
    if (variant !== 'admin' || !adminAnchorMonthKey) return;
    const parts = adminAnchorMonthKey.split('-');
    const y = parseInt(parts[0] ?? '', 10);
    const m = parseInt(parts[1] ?? '', 10);
    if (Number.isNaN(y) || Number.isNaN(m)) return;
    const idx = calendarData.findIndex(
      (e) => e.date.getFullYear() === y && e.date.getMonth() === m
    );
    if (idx < 0) return;
    if (idx === activeMonthIndexRef.current) return;
    goToMonthIndex(idx);
  }, [adminAnchorMonthKey, variant, calendarData, goToMonthIndex]);

  const onActiveIndexChange = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(monthCount - 1, i));
      setActiveMonthIndex(clamped);
      if (variant === 'admin' && onAdminVisibleMonthChange && calendarData[clamped]) {
        onAdminVisibleMonthChange(calendarData[clamped]!.date);
      }
    },
    [monthCount, variant, onAdminVisibleMonthChange, calendarData]
  );

  return (
    <View style={{ position: 'relative', overflow: 'hidden' }} onLayout={onLayout}>
      <ThreeMonthHeader
        data={calendarData}
        activeIndex={activeMonthIndex}
        primaryColor={primaryColor}
        onGoToIndex={goToMonthIndex}
      />
      <ScrollContainer
        monthCount={monthCount}
        invertedPaging
        onActiveIndexChange={onActiveIndexChange}
      >
        {[...calendarData]
          .map((month, index) => (
            <View key={`${month.label}-${index}`} style={{ width: layoutW, direction: 'ltr' }}>
              <Days
                data={month}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                dayAvailability={dayAvailability}
                selectedDate={selectedDate}
                cellSize={cellSize}
                primaryColor={primaryColor}
                onDayPress={handleDayPress}
                displayMode={displayMode}
              />
            </View>
          ))
          .reverse()}
      </ScrollContainer>
      {/* Weekday names row — fixed overlay above the scrollable month pages */}
      <View
        style={{
          position: 'absolute',
          top: MONTHS_HEIGHT,
          left: 0,
          right: 0,
          height: DAYS_HEADER_HEIGHT,
          flexDirection: 'row',
          direction: 'ltr',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          zIndex: 1,
          backgroundColor: '#FFFFFF',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: 'rgba(0,0,0,0.07)',
        }}
        pointerEvents="none"
      >
        {weekdayNames.map((day, i) => (
          <Text
            key={`${day}-${i}`}
            style={{
              width: cellSize,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: '600',
              color: '#8E8E93',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              includeFontPadding: false,
            }}
          >
            {day}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function BookingAnimatedCalendar({
  variant = 'booking',
  bookingOpenDays = 7,
  dayAvailability,
  selectedDate,
  days = [],
  language,
  primaryColor,
  onSelectDayIndex,
  onClearTime,
  onAdminDayPress,
  adminAnchorMonthKey,
  onAdminVisibleMonthChange,
  adminMonthsBack = 12,
  adminMonthsForward = 12,
}: BookingAnimatedCalendarProps) {
  const calendarData = useMemo(() => {
    if (variant === 'admin') {
      return buildMonthRange(adminMonthsBack, adminMonthsForward, language);
    }
    return buildForwardMonthsFromNow(CALENDAR_FORWARD_MONTH_STEPS, language);
  }, [variant, language, adminMonthsBack, adminMonthsForward]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (variant === 'admin' && calendarData.length > 0) {
      const first = calendarData[0]!.date;
      const lastMonth = calendarData[calendarData.length - 1]!.date;
      const rangeS = new Date(first.getFullYear(), first.getMonth(), 1);
      const rangeE = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
      return { rangeStart: rangeS, rangeEnd: rangeE };
    }
    const startD = new Date();
    const endD = new Date();
    endD.setDate(startD.getDate() + Math.max(0, bookingOpenDays - 1));
    const rangeS = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
    return { rangeStart: rangeS, rangeEnd: endD };
  }, [variant, calendarData, bookingOpenDays]);

  const initialLogicalIndex = useMemo(() => {
    if (variant !== 'admin') return 0;
    let y: number | undefined;
    let m: number | undefined;
    if (adminAnchorMonthKey) {
      const parts = adminAnchorMonthKey.split('-');
      const py = parseInt(parts[0] ?? '', 10);
      const pm = parseInt(parts[1] ?? '', 10);
      if (!Number.isNaN(py) && !Number.isNaN(pm)) {
        y = py;
        m = pm;
      }
    }
    if (y === undefined || m === undefined) {
      const t = selectedDate ?? new Date();
      y = t.getFullYear();
      m = t.getMonth();
    }
    const idx = calendarData.findIndex(
      (e) => e.date.getFullYear() === y && e.date.getMonth() === m
    );
    return idx >= 0 ? idx : Math.max(0, Math.floor(calendarData.length / 2));
  }, [variant, calendarData, adminAnchorMonthKey, selectedDate]);

  const displayMode: 'availability' | 'count' = variant === 'admin' ? 'count' : 'availability';

  if (calendarData.length === 0) {
    return null;
  }

  return (
    <CalendarAnimatedProvider>
      <CalendarShell
        variant={variant}
        calendarData={calendarData}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        dayAvailability={dayAvailability}
        selectedDate={selectedDate}
        days={days}
        language={language}
        primaryColor={primaryColor}
        onSelectDayIndex={onSelectDayIndex}
        onClearTime={onClearTime}
        onAdminDayPress={onAdminDayPress}
        adminAnchorMonthKey={adminAnchorMonthKey}
        onAdminVisibleMonthChange={onAdminVisibleMonthChange}
        initialLogicalIndex={initialLogicalIndex}
        displayMode={displayMode}
      />
    </CalendarAnimatedProvider>
  );
}
