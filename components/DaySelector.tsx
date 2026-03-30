import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Dimensions,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/src/theme/ThemeProvider';

/** רוחב תא במצב גלילה (חודש / יותר מ־7 ימים) */
const DAY_CELL_WIDTH = 54;
const DAY_CELL_GAP = 5;
const ITEM_STRIDE = DAY_CELL_WIDTH + DAY_CELL_GAP * 2;

/** יום שחסום לחלוטין באילוצים (מול שעות עבודה) */
const FULL_BLOCK_BG = '#FEF2F2';
const FULL_BLOCK_BORDER = '#FCA5A5';
const FULL_BLOCK_TEXT = '#B91C1C';
const FULL_BLOCK_SELECTED_BG = '#EF4444';
const FULL_BLOCK_SELECTED_SHADOW = '#DC2626';

interface DaySelectorProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  daysToShow?: number;
  mode?: 'week' | 'month';
  markedDates?: Set<string> | string[];
  startFromToday?: boolean;
  /** רקע מיכל השורה — ברירת מחדל שקוף כדי להתמזג עם רקע המסך (למשל יומן אדמין) */
  containerBackgroundColor?: string;
  /** תאריכים (YYYY-MM-DD) שבהם אילוץ מכסה את כל שעות העבודה — הדגשה באדום */
  fullyBlockedDateKeys?: Set<string> | string[];
}

export default function DaySelector({
  selectedDate,
  onSelectDate,
  daysToShow = 7,
  mode = 'week',
  markedDates,
  startFromToday = false,
  containerBackgroundColor = 'transparent',
  fullyBlockedDateKeys,
}: DaySelectorProps) {
  const colors = useColors();
  const { i18n, t } = useTranslation();
  const [dates, setDates] = useState<Date[]>([]);
  const scrollRef = useRef<ScrollView | null>(null);
  const didInitialAutoScrollRef = useRef(false);

  useEffect(() => {
    generateDates(selectedDate);
  }, [selectedDate, daysToShow, mode]);

  const generateDates = (anchor: Date) => {
    const base = new Date(anchor);
    const newDates: Date[] = [];

    if (mode === 'month') {
      const year = base.getFullYear();
      const month = base.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();

      for (let day = 1; day <= lastDay; day++) {
        newDates.push(new Date(year, month, day));
      }
      setDates(newDates);
      return;
    }

    if (startFromToday) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      for (let i = 0; i < daysToShow; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        newDates.push(d);
      }
      setDates(newDates);
      return;
    }

    const dayOfWeek = base.getDay();
    const startOfWeek = new Date(base);
    startOfWeek.setDate(base.getDate() - dayOfWeek);

    for (let i = 0; i < daysToShow; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      newDates.push(d);
    }

    /** סדר תצוגה: שמאל = ש׳ (סוף השבוע), ימינה עד א׳ — מתאים ל-RTL ולציפיית משתמשים בעברית */
    setDates([...newDates].reverse());
  };

  const toLocalISODate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const markedSet = useMemo(() => {
    if (!markedDates) return null;
    if (Array.isArray(markedDates)) return new Set(markedDates);
    return new Set<string>(Array.from(markedDates as Set<string>));
  }, [markedDates]);

  const fullyBlockedSet = useMemo(() => {
    if (fullyBlockedDateKeys == null) return null;
    if (fullyBlockedDateKeys instanceof Set) return fullyBlockedDateKeys;
    return new Set<string>(fullyBlockedDateKeys);
  }, [fullyBlockedDateKeys]);

  /** שבוע מלא במסך אחד — בלי גלילה אופקית (מונע חיתוך של יום א׳ / ש׳) */
  const fitWeekToScreen = mode === 'week' && dates.length > 0 && dates.length <= 7;

  const { width: windowWidth } = useWindowDimensions();

  /** רוחב קבוע לכל יום מתוך רוחב המסך — לא תלוי ב־flex (מתאים גם ל־RTL) */
  const weekStripLayout = useMemo(() => {
    if (!fitWeekToScreen) return null;
    const n = dates.length;
    const padEachSide = 8;
    const gap = 2;
    const inner = Math.max(0, windowWidth - padEachSide * 2);
    const gapsTotal = gap * Math.max(0, n - 1);
    const raw = Math.floor((inner - gapsTotal) / Math.max(1, n));
    return {
      cellWidth: Math.max(24, raw),
      gap,
      padEachSide,
      rowWidth: windowWidth,
    };
  }, [fitWeekToScreen, dates.length, windowWidth]);

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const getDayName = (date: Date) => {
    const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysHe = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const list = i18n?.language?.startsWith('he') ? daysHe : daysEn;
    return list[date.getDay()];
  };

  const scrollToSelected = (animated: boolean) => {
    if (!scrollRef.current || dates.length === 0) return;
    const selectedIdx = dates.findIndex(
      (d) =>
        d.getDate() === selectedDate.getDate() &&
        d.getMonth() === selectedDate.getMonth() &&
        d.getFullYear() === selectedDate.getFullYear()
    );
    if (selectedIdx < 0) return;

    const screenWidth = Dimensions.get('window').width;
    const totalContentWidth = dates.length * ITEM_STRIDE;
    const centerOffset = (screenWidth - ITEM_STRIDE) / 2;
    const itemPosition = selectedIdx * ITEM_STRIDE;
    const targetX = Math.max(
      0,
      Math.min(totalContentWidth - screenWidth, itemPosition - centerOffset)
    );

    try {
      scrollRef.current.scrollTo({ x: targetX, animated });
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (mode !== 'month') return;
    const t = setTimeout(() => {
      if (!didInitialAutoScrollRef.current) {
        scrollToSelected(false);
        didInitialAutoScrollRef.current = true;
      }
    }, 10);
    return () => clearTimeout(t);
  }, [dates, selectedDate, mode]);

  const pillLayoutStyle = fitWeekToScreen
    ? ({ width: '100%' } as const)
    : ({ width: DAY_CELL_WIDTH, marginHorizontal: DAY_CELL_GAP } as const);

  const renderDayItem = (date: Date) => {
    const selected = isSelected(date);
    const today = isToday(date);
    const ymd = toLocalISODate(date);
    const isMarked = !!markedSet && markedSet.has(ymd);
    const fullBlock = !!fullyBlockedSet?.has(ymd);
    const blockHint = String(
      t('admin.appointments.dayStripFullDayConstraint', 'יום חסום לחלוטין באילוץ')
    );
    const a11yLabel = fullBlock ? `${getDayName(date)} ${date.getDate()}, ${blockHint}` : undefined;

    const pillBase = [
      styles.dayPill,
      ...(fitWeekToScreen ? [styles.dayPillWeekFit] : []),
      pillLayoutStyle,
    ];

    const nameStrip = fitWeekToScreen ? styles.dayNameWeekStrip : undefined;
    const numStrip = fitWeekToScreen ? styles.dayNumberWeekStrip : undefined;

    if (selected) {
      const selBg = fullBlock ? FULL_BLOCK_SELECTED_BG : colors.primary;
      const selShadow = fullBlock ? FULL_BLOCK_SELECTED_SHADOW : colors.primary;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityState={{ selected: true }}
          onPress={() => onSelectDate(date)}
          style={({ pressed }) => [
            ...pillBase,
            styles.dayPillSelected,
            {
              backgroundColor: selBg,
              shadowColor: selShadow,
            },
            pressed && styles.dayPillPressed,
          ]}
        >
          <Text
            style={[styles.dayName, nameStrip, styles.dayNameOnPrimary]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {getDayName(date)}
          </Text>
          <Text
            style={[styles.dayNumber, numStrip, styles.dayNumberOnPrimary]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {date.getDate()}
          </Text>
          {isMarked ? <View style={styles.markDotSelected} /> : <View style={styles.markDotPlaceholder} />}
        </Pressable>
      );
    }

    if (fullBlock) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityState={{ selected: false }}
          onPress={() => onSelectDate(date)}
          android_ripple={{ color: 'rgba(220,38,38,0.10)', borderless: false }}
          style={({ pressed }) => [
            ...pillBase,
            styles.dayPillIdle,
            styles.dayPillFullBlock,
            fitWeekToScreen && styles.dayPillFullBlockWeekStrip,
            today && styles.dayPillFullBlockToday,
            pressed && styles.dayPillPressedIdle,
          ]}
        >
          <Text
            style={[styles.dayName, nameStrip, { color: FULL_BLOCK_TEXT }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {getDayName(date)}
          </Text>
          <Text
            style={[styles.dayNumber, numStrip, { color: FULL_BLOCK_TEXT }, today && styles.dayNumberFullBlockToday]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {date.getDate()}
          </Text>
          {isMarked ? (
            <View style={[styles.markDotIdle, { backgroundColor: FULL_BLOCK_TEXT }]} />
          ) : (
            <View style={styles.markDotPlaceholder} />
          )}
        </Pressable>
      );
    }

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: false }}
        onPress={() => onSelectDate(date)}
        android_ripple={{ color: 'rgba(0,0,0,0.05)', borderless: false }}
        style={({ pressed }) => [
          ...pillBase,
          styles.dayPillIdle,
          today && styles.dayPillToday,
          today && { borderColor: colors.primary },
          pressed && styles.dayPillPressedIdle,
        ]}
      >
        <Text
          style={[styles.dayName, nameStrip, { color: today ? colors.primary : colors.textSecondary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {getDayName(date)}
        </Text>
        <Text
          style={[styles.dayNumber, numStrip, { color: today ? colors.primary : colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {date.getDate()}
        </Text>
        {today && !isMarked && <View style={[styles.todayDot, { backgroundColor: colors.primary }]} />}
        {isMarked ? (
          <View style={[styles.markDotIdle, { backgroundColor: today ? colors.primary : colors.primary }]} />
        ) : (
          !today && <View style={styles.markDotPlaceholder} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: containerBackgroundColor, direction: 'ltr' }]}>
      {fitWeekToScreen && weekStripLayout ? (
        <View
          style={[
            styles.weekFitRow,
            {
              width: weekStripLayout.rowWidth,
              paddingHorizontal: weekStripLayout.padEachSide,
            },
          ]}
        >
          {dates.map((date, i) => (
            <View
              key={i}
              style={{
                width: weekStripLayout.cellWidth,
                marginRight: i < dates.length - 1 ? weekStripLayout.gap : 0,
              }}
            >
              {renderDayItem(date)}
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          /** כפיית LTR — באפליקציה בעברית (RTL) ScrollView אופקי הופך סדר */
          style={styles.scrollLtr}
          contentContainerStyle={styles.daysContainer}
          onLayout={() => {
            if (mode !== 'month') return;
            if (!didInitialAutoScrollRef.current) {
              scrollToSelected(false);
              didInitialAutoScrollRef.current = true;
            }
          }}
          onContentSizeChange={() => {
            if (mode !== 'month') return;
            if (!didInitialAutoScrollRef.current) {
              scrollToSelected(false);
              didInitialAutoScrollRef.current = true;
            }
          }}
        >
          {dates.map((date, i) => (
            <React.Fragment key={i}>{renderDayItem(date)}</React.Fragment>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  scrollLtr: {
    direction: 'ltr',
  },
  weekFitRow: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'stretch',
    alignSelf: 'center',
    paddingVertical: 4,
  },
  dayPillWeekFit: {
    paddingTop: 8,
    paddingBottom: 6,
    minHeight: 0,
    minWidth: 0,
    borderRadius: 14,
  },
  dayNameWeekStrip: {
    fontSize: 10,
    marginBottom: 2,
    letterSpacing: 0.3,
    maxWidth: '100%',
  },
  dayNumberWeekStrip: {
    fontSize: 15,
    letterSpacing: -0.3,
    maxWidth: '100%',
  },
  dayPillFullBlockWeekStrip: {
    borderWidth: 1.5,
  },
  daysContainer: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dayPill: {
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 11,
    paddingBottom: 9,
    minHeight: 76,
  },
  dayPillFullBlock: {
    backgroundColor: FULL_BLOCK_BG,
    borderWidth: 1.5,
    borderColor: FULL_BLOCK_BORDER,
  },
  dayPillFullBlockToday: {
    borderColor: FULL_BLOCK_SELECTED_BG,
    backgroundColor: '#FEE2E2',
  },
  dayNumberFullBlockToday: {
    fontWeight: '900',
  },
  dayPillIdle: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#1A1A2E',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  dayPillToday: {
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.10,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  dayPillSelected: {
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.32,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  dayPillPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  dayPillPressedIdle: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  dayNameOnPrimary: {
    color: 'rgba(255,255,255,0.85)',
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  dayNumberOnPrimary: {
    color: '#FFFFFF',
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 5,
    opacity: 0.9,
  },
  markDotIdle: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 5,
    opacity: 0.75,
  },
  markDotSelected: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 5,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  markDotPlaceholder: {
    height: 4,
    marginTop: 5,
  },
});
