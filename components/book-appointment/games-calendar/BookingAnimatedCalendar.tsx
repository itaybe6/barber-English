import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, LayoutChangeEvent, Dimensions } from 'react-native';
import { CalendarAnimatedProvider, useBookingCalendarContext } from './animated-context';
import { ScrollContainer } from './scroll-container';
import { ThreeMonthHeader } from './three-month-header';
import { Days } from './days';
import { DAYS_HEADER_HEIGHT, MONTHS_HEIGHT } from './constants';
import {
  buildForwardMonthsFromNow,
  CALENDAR_FORWARD_MONTH_STEPS,
  getShortWeekdayNames,
  type MonthEntry,
} from './utils';

type DayRow = { fullDate: Date };

type Props = {
  bookingOpenDays: number;
  dayAvailability: Record<string, number>;
  selectedDate: Date | null;
  days: DayRow[];
  language: string;
  primaryColor: string;
  onSelectDayIndex: (index: number | null) => void;
  onClearTime: () => void;
};

function CalendarShell({
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
}: {
  calendarData: MonthEntry[];
  rangeStart: Date;
  rangeEnd: Date;
  dayAvailability: Record<string, number>;
  selectedDate: Date | null;
  days: DayRow[];
  language: string;
  primaryColor: string;
  onSelectDayIndex: (index: number | null) => void;
  onClearTime: () => void;
}) {
  const { pageWidth, scrollViewRef } = useBookingCalendarContext();
  const [layoutW, setLayoutW] = useState(() => Dimensions.get('window').width - 64);
  const [activeMonthIndex, setActiveMonthIndex] = useState(0);
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

  /** Keep scroll aligned when layout / month count changes (inverted pages: logical 0 = max offset). */
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
      const idx = days.findIndex((d) => d.fullDate.toDateString() === date.toDateString());
      onSelectDayIndex(idx >= 0 ? idx : null);
      onClearTime();
    },
    [days, onSelectDayIndex, onClearTime]
  );

  const goToMonthIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(monthCount - 1, index));
      setActiveMonthIndex(clamped);
      const w = pageWidth.value;
      const physical = monthCount - 1 - clamped;
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: physical * Math.max(1, w), animated: true });
      }, 0);
    },
    [monthCount, pageWidth, scrollViewRef]
  );

  const onActiveIndexChange = useCallback((i: number) => {
    setActiveMonthIndex(Math.max(0, Math.min(monthCount - 1, i)));
  }, [monthCount]);

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
              />
            </View>
          ))
          .reverse()}
      </ScrollContainer>
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
        }}
        pointerEvents="none"
      >
        {weekdayNames.map((day) => (
          <Text
            key={day}
            style={{
              width: cellSize,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: '700',
              color: '#6B7280',
              textTransform: 'uppercase',
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
  bookingOpenDays,
  dayAvailability,
  selectedDate,
  days,
  language,
  primaryColor,
  onSelectDayIndex,
  onClearTime,
}: Props) {
  const { rangeStart, rangeEnd } = useMemo(() => {
    const startD = new Date();
    const endD = new Date();
    endD.setDate(startD.getDate() + Math.max(0, bookingOpenDays - 1));
    const rangeS = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
    return { rangeStart: rangeS, rangeEnd: endD };
  }, [bookingOpenDays]);

  const calendarData = useMemo(
    () => buildForwardMonthsFromNow(CALENDAR_FORWARD_MONTH_STEPS, language),
    [language]
  );

  if (calendarData.length === 0) {
    return null;
  }

  return (
    <CalendarAnimatedProvider>
      <CalendarShell
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
      />
    </CalendarAnimatedProvider>
  );
}
