import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Days } from './days';
import {
  buildIsraeliHolidayLabelMap,
  buildMonthRange,
  getShortWeekdayNames,
  getSingleLetterHebrewWeekdays,
  type MonthEntry,
} from './utils';

export type AdminVerticalMonthCalendarProps = {
  dayAvailability: Record<string, number>;
  /** Days (YYYY-MM-DD) with at least one barber-relevant constraint */
  constraintDates?: Set<string>;
  selectedDate: Date | null;
  language: string;
  primaryColor: string;
  adminMonthsBack?: number;
  adminMonthsForward?: number;
  /** Used only for initial scroll position when the list mounts (not on every update). */
  anchorMonthKey?: string;
  onVisibleMonthChange?: (monthFirstDay: Date) => void;
  onDayPress: (date: Date) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  todayLabel?: string;
  monthHint?: string;
  /** Scroll to today and set selection (does not open day modal). */
  onJumpToDate?: (date: Date) => void;
  /** Override pill text under day cells when `displayMode` is count (e.g. waitlist vs appointments). */
  formatCountBadge?: (count: number) => string;
  /** Floating "Today" chip (default true). Set false e.g. on admin waitlist month view. */
  showTodayPill?: boolean;
  /** Show Israeli holiday / observance labels under the Hebrew date. */
  showHolidayLabels?: boolean;
};

function formatMonthLong(date: Date, language: string): string {
  const he = language.startsWith('he');
  try {
    return new Intl.DateTimeFormat(he ? 'he-IL-u-ca-gregory' : 'en-US', {
      month: 'long',
    }).format(date);
  } catch {
    return date.toLocaleString(he ? 'he-IL' : 'en-US', { month: 'long' });
  }
}

function parseAnchorMonthKey(key: string | undefined): { y: number; m: number } | null {
  if (!key) return null;
  const parts = key.split('-');
  const y = parseInt(parts[0] ?? '', 10);
  const m = parseInt(parts[1] ?? '', 10);
  if (Number.isNaN(y) || Number.isNaN(m)) return null;
  return { y, m };
}

function monthIndexForDate(data: MonthEntry[], d: Date): number {
  const idx = data.findIndex(
    (e) => e.date.getFullYear() === d.getFullYear() && e.date.getMonth() === d.getMonth()
  );
  return idx >= 0 ? idx : 0;
}

/**
 * Admin month view: vertical scroll through all months (iOS Calendar–style list),
 * full-width white background, large month titles, Hebrew dates + appointment dots.
 */
export default function AdminVerticalMonthCalendar({
  dayAvailability,
  constraintDates,
  selectedDate,
  language,
  primaryColor,
  adminMonthsBack = 12,
  adminMonthsForward = 12,
  anchorMonthKey,
  onVisibleMonthChange,
  onDayPress,
  refreshing = false,
  onRefresh,
  todayLabel = 'היום',
  monthHint,
  onJumpToDate,
  formatCountBadge: formatCountBadgeProp,
  showTodayPill = true,
  showHolidayLabels = false,
}: AdminVerticalMonthCalendarProps) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const formatAppointmentBadge = useCallback(
    (c: number) =>
      formatCountBadgeProp
        ? formatCountBadgeProp(c)
        : c === 1
          ? String(t('admin.calendar.appointmentPillSingle'))
          : String(t('admin.calendar.appointmentPill', { count: c })),
    [t, formatCountBadgeProp]
  );
  const scrollRef = useRef<ScrollView>(null);
  const monthYRef = useRef<Record<number, number>>({});
  const scrollReportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReportedMonthIdx = useRef<number>(-1);
  const pendingScrollIdx = useRef<number | null>(null);
  const initialAnchorKeyRef = useRef(anchorMonthKey);
  const selectedAtMountRef = useRef(selectedDate);
  const didScheduleInitialScroll = useRef(false);

  // ── Sticky header ─────────────────────────────────────────────────────────
  const [displayedMonth, setDisplayedMonth] = useState<Date>(() => {
    const parsed = parseAnchorMonthKey(anchorMonthKey);
    if (parsed) return new Date(parsed.y, parsed.m - 1, 1);
    if (selectedDate) return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    return new Date();
  });
  const headerSlide = useRef(new Animated.Value(0)).current;
  // Guard: skip animation when the displayed month hasn't actually changed
  const lastHeaderMonthRef = useRef<{ y: number; m: number }>({
    y: displayedMonth.getFullYear(),
    m: displayedMonth.getMonth(),
  });
  // Flag: a slide animation should play after the next React render commit
  const animPendingRef = useRef(false);

  /**
   * Trigger a month change.
   * We only update React state here — the slide animation starts in
   * useLayoutEffect, AFTER React has painted the new text. This prevents the
   * old text from jumping before the new text appears.
   */
  const animateToMonth = useCallback(
    (newDate: Date) => {
      headerSlide.stopAnimation();
      animPendingRef.current = true;
      setDisplayedMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
    },
    [headerSlide],
  );

  // Runs synchronously after React commits the new month name to the screen.
  // At this point the new text is already rendered — we can safely start the slide-in
  // with no risk of moving the old text or showing an intermediate jump.
  useLayoutEffect(() => {
    if (!animPendingRef.current) return;
    animPendingRef.current = false;
    headerSlide.setValue(9);
    Animated.timing(headerSlide, { toValue: 0, duration: 210, useNativeDriver: true }).start();
  }, [displayedMonth, headerSlide]);

  const calendarData = useMemo(
    () => buildMonthRange(adminMonthsBack, adminMonthsForward, language.startsWith('he') ? 'he' : 'en'),
    [adminMonthsBack, adminMonthsForward, language]
  );

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (calendarData.length === 0) {
      const t = new Date();
      return { rangeStart: t, rangeEnd: t };
    }
    const first = calendarData[0]!.date;
    const lastMonth = calendarData[calendarData.length - 1]!.date;
    const rangeS = new Date(first.getFullYear(), first.getMonth(), 1);
    const rangeE = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
    return { rangeStart: rangeS, rangeEnd: rangeE };
  }, [calendarData]);

  const cellSize = Math.max(36, Math.floor((Math.max(1, windowWidth) - 32) / 7));

  const weekdayNames = useMemo(
    () => (language.startsWith('he') ? getSingleLetterHebrewWeekdays() : getShortWeekdayNames(language)),
    [language]
  );
  const holidayLabels = useMemo(
    () => (showHolidayLabels ? buildIsraeliHolidayLabelMap(rangeStart, rangeEnd, language) : {}),
    [rangeStart, rangeEnd, language, showHolidayLabels]
  );

  const scrollToMonthIndex = useCallback((idx: number, animated: boolean) => {
    const y = monthYRef.current[idx];
    if (y == null || !scrollRef.current) return false;
    scrollRef.current.scrollTo({ y: Math.max(0, y - 4), animated });
    return true;
  }, []);

  /** One-time initial scroll target (mount / switch into month view only). */
  useLayoutEffect(() => {
    if (didScheduleInitialScroll.current) return;
    didScheduleInitialScroll.current = true;
    const parsed = parseAnchorMonthKey(initialAnchorKeyRef.current);
    const idx = parsed
      ? calendarData.findIndex((e) => e.date.getFullYear() === parsed.y && e.date.getMonth() === parsed.m)
      : monthIndexForDate(calendarData, selectedAtMountRef.current ?? new Date());
    pendingScrollIdx.current = idx >= 0 ? idx : 0;
  }, [calendarData]);

  const tryPendingScroll = useCallback(() => {
    const idx = pendingScrollIdx.current;
    if (idx == null) return;
    if (scrollToMonthIndex(idx, false)) {
      pendingScrollIdx.current = null;
      lastReportedMonthIdx.current = idx;
      const m = calendarData[idx];
      if (m) onVisibleMonthChange?.(m.date);
    }
  }, [calendarData, onVisibleMonthChange, scrollToMonthIndex]);

  const onMonthWrapperLayout = useCallback(
    (index: number, e: LayoutChangeEvent) => {
      monthYRef.current[index] = e.nativeEvent.layout.y;
      tryPendingScroll();
    },
    [tryPendingScroll]
  );

  useEffect(() => {
    return () => {
      if (scrollReportTimer.current) clearTimeout(scrollReportTimer.current);
    };
  }, []);

  const updateStickyHeader = useCallback(
    (monthFirstDay: Date) => {
      const newY = monthFirstDay.getFullYear();
      const newM = monthFirstDay.getMonth();
      if (lastHeaderMonthRef.current.y !== newY || lastHeaderMonthRef.current.m !== newM) {
        lastHeaderMonthRef.current = { y: newY, m: newM };
        animateToMonth(monthFirstDay);
      }
    },
    [animateToMonth],
  );

  /** Find which month index is currently at the top of the visible area. */
  const findVisibleMonthIdx = useCallback(
    (scrollY: number): number => {
      let best = 0;
      const anchor = scrollY + 80;
      for (let i = 0; i < calendarData.length; i++) {
        const y = monthYRef.current[i];
        if (y == null) continue;
        if (y <= anchor) best = i;
        else break;
      }
      return best;
    },
    [calendarData],
  );

  /** Debounced: notify parent that visible month changed. */
  const reportVisibleMonthFromOffset = useCallback(
    (scrollY: number) => {
      const bestIdx = findVisibleMonthIdx(scrollY);
      if (bestIdx !== lastReportedMonthIdx.current && calendarData[bestIdx]) {
        lastReportedMonthIdx.current = bestIdx;
        onVisibleMonthChange?.(calendarData[bestIdx]!.date);
      }
    },
    [calendarData, findVisibleMonthIdx, onVisibleMonthChange]
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      // Sticky header: update immediately on every scroll frame (no debounce)
      const idx = findVisibleMonthIdx(y);
      if (calendarData[idx]) updateStickyHeader(calendarData[idx]!.date);
      // Parent notification: debounced so we don't spam callbacks
      if (scrollReportTimer.current) clearTimeout(scrollReportTimer.current);
      scrollReportTimer.current = setTimeout(() => reportVisibleMonthFromOffset(y), 100);
    },
    [calendarData, findVisibleMonthIdx, updateStickyHeader, reportVisibleMonthFromOffset]
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      reportVisibleMonthFromOffset(e.nativeEvent.contentOffset.y);
    },
    [reportVisibleMonthFromOffset]
  );

  const onTodayPress = useCallback(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const idx = monthIndexForDate(calendarData, now);
    scrollToMonthIndex(idx, true);
    lastReportedMonthIdx.current = idx;
    updateStickyHeader(new Date(now.getFullYear(), now.getMonth(), 1));
    onJumpToDate?.(now);
  }, [calendarData, onJumpToDate, scrollToMonthIndex, updateStickyHeader]);

  const tabBarReserve = 56;
  const isHebrewUi = language.startsWith('he');

  // Grey out the Today button when the currently visible month IS today's month
  const isOnCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      displayedMonth.getFullYear() === now.getFullYear() &&
      displayedMonth.getMonth() === now.getMonth()
    );
  }, [displayedMonth]);

  return (
    <View style={styles.root}>
      {/* ── Sticky month header ── */}
      <View
        style={[
          styles.stickyHeader,
          { flexDirection: isHebrewUi ? 'row' : 'row-reverse', alignItems: 'center' },
        ]}
      >
        {/* Month name — left side in Hebrew RTL */}
        <Animated.Text
          style={[
            styles.stickyMonthName,
            isHebrewUi && styles.stickyMonthNameHebrew,
            { transform: [{ translateY: headerSlide }], flex: 1 },
          ]}
        >
          {formatMonthLong(displayedMonth, language)}
        </Animated.Text>

        {/* Today button — right side in Hebrew RTL */}
        {showTodayPill ? (
          <Pressable
            onPress={onTodayPress}
            style={({ pressed }) => [
              styles.todayHeaderBtn,
              isOnCurrentMonth
                ? styles.todayHeaderBtnInactive
                : { backgroundColor: primaryColor, borderWidth: 0 },
              pressed && { opacity: 0.72 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={todayLabel}
          >
            <Text
              style={[
                styles.todayHeaderBtnText,
                { color: isOnCurrentMonth ? '#9CA3AF' : '#FFFFFF' },
              ]}
            >
              {todayLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + tabBarReserve + 20 },
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[primaryColor]}
              tintColor={primaryColor}
            />
          ) : undefined
        }
      >
        {calendarData.map((month, index) => (
          <View
            key={`${month.date.getFullYear()}-${month.date.getMonth()}`}
            onLayout={(e) => onMonthWrapperLayout(index, e)}
          >
            <View style={styles.monthBlock}>
              <Text style={[styles.monthTitle, isHebrewUi && styles.monthTitleHebrew]}>
                {formatMonthLong(month.date, language)}
              </Text>
              <Text style={[styles.yearSub, isHebrewUi && styles.yearSubHebrew]}>
                {String(month.date.getFullYear())}
              </Text>

              <View style={styles.weekdayRow}>
                {weekdayNames.map((d, i) => (
                  <Text key={`${d}-${i}`} style={[styles.weekdayCell, { width: cellSize }]}>
                    {d}
                  </Text>
                ))}
              </View>

              <Days
                data={month}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                dayAvailability={dayAvailability}
                constraintDates={constraintDates}
                holidayLabels={holidayLabels}
                selectedDate={selectedDate}
                cellSize={cellSize}
                primaryColor={primaryColor}
                onDayPress={onDayPress}
                displayMode="count"
                showHebrewDates
                showWeekSeparators
                formatAppointmentBadge={formatAppointmentBadge}
                constraintPillLabel={String(t('admin.calendar.constraintPill'))}
              />
            </View>
          </View>
        ))}

        {monthHint ? (
          <Text style={styles.hint} numberOfLines={2}>
            {monthHint}
          </Text>
        ) : null}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingTop: 4,
  },
  stickyHeader: {
    backgroundColor: '#F8F9FA',
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    gap: 10,
    // overflow:hidden is intentionally omitted — it would clip the iOS shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.09,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
    }),
  },
  stickyMonthName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.8,
    includeFontPadding: false,
    textAlign: 'left',
    ...Platform.select({
      ios: { fontFamily: 'System' },
      android: { fontFamily: 'sans-serif-medium' },
    }),
  },
  stickyMonthNameHebrew: {
    writingDirection: 'rtl',
  },
  todayHeaderBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    flexShrink: 0,
  },
  todayHeaderBtnInactive: {
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  todayHeaderBtnText: {
    fontSize: 15,
    fontWeight: '600',
    includeFontPadding: false,
  },
  monthBlock: {
    paddingTop: 20,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.12)',
  },
  monthTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.8,
    paddingHorizontal: 20,
    includeFontPadding: false,
    alignSelf: 'stretch',
    textAlign: 'left',
    ...Platform.select({
      ios: { fontFamily: 'System' },
      android: { fontFamily: 'sans-serif-medium' },
    }),
  },
  monthTitleHebrew: {
    writingDirection: 'rtl',
  },
  yearSub: {
    fontSize: 15,
    fontWeight: '400',
    color: '#8E8E93',
    paddingHorizontal: 20,
    marginTop: 2,
    marginBottom: 12,
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  yearSubHebrew: {
    writingDirection: 'rtl',
  },
  weekdayRow: {
    flexDirection: 'row',
    direction: 'ltr',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.1)',
  },
  weekdayCell: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    includeFontPadding: false,
  },
  hint: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    writingDirection: 'rtl',
  },
});
