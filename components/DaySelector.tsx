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
import { normalizeAppLanguage, toBcp47Locale } from '@/lib/i18nLocale';

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
  /** דורס את paddingTop של המיכל (ברירת מחדל 8) — לצמצום ריווח מתחת לכותרת */
  contentPaddingTop?: number;
  /** דורס את paddingBottom של המיכל (ברירת מחדל 4) */
  contentPaddingBottom?: number;
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
  contentPaddingTop,
  contentPaddingBottom,
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
    if (normalizeAppLanguage(i18n?.language) === 'he') {
      const daysHe = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
      return daysHe[date.getDay()];
    }
    try {
      return date.toLocaleDateString(toBcp47Locale(i18n?.language), { weekday: 'short' });
    } catch {
      const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return daysEn[date.getDay()];
    }
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

    const cellBase = [
      styles.dayCell,
      ...(fitWeekToScreen ? [styles.dayCellWeekFit] : []),
      pillLayoutStyle,
    ];

    const circleBg = selected
      ? fullBlock ? FULL_BLOCK_SELECTED_BG : colors.primary
      : today
        ? '#1C1C1E'
        : fullBlock
          ? FULL_BLOCK_BG
          : 'transparent';

    const numColor = selected || today
      ? '#FFFFFF'
      : fullBlock
        ? FULL_BLOCK_TEXT
        : colors.text;

    const nameColor = selected
      ? colors.primary
      : today
        ? '#1C1C1E'
        : fullBlock
          ? FULL_BLOCK_TEXT
          : colors.textSecondary;

    const showCircle = selected || today || fullBlock;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ selected }}
        onPress={() => onSelectDate(date)}
        android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: true, radius: 26 }}
        style={({ pressed }) => [
          ...cellBase,
          pressed && styles.dayCellPressed,
        ]}
      >
        <Text
          style={[
            styles.dayName,
            fitWeekToScreen ? styles.dayNameWeekStrip : undefined,
            { color: nameColor },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {getDayName(date)}
        </Text>
        <View
          style={[
            styles.numCircle,
            fitWeekToScreen ? styles.numCircleWeekFit : undefined,
            showCircle && { backgroundColor: circleBg },
            fullBlock && !selected && { borderWidth: 1.5, borderColor: FULL_BLOCK_BORDER },
          ]}
        >
          <Text
            style={[
              styles.dayNumber,
              fitWeekToScreen ? styles.dayNumberWeekStrip : undefined,
              { color: numColor },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {date.getDate()}
          </Text>
        </View>
        {isMarked ? (
          <View style={[styles.markDot, { backgroundColor: selected || today ? (selected ? '#fff' : '#fff') : colors.primary }]} />
        ) : (
          <View style={styles.markDotPlaceholder} />
        )}
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: containerBackgroundColor, direction: 'ltr' },
        contentPaddingTop !== undefined && { paddingTop: contentPaddingTop },
        contentPaddingBottom !== undefined && { paddingBottom: contentPaddingBottom },
      ]}
    >
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
    paddingTop: 6,
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
    paddingVertical: 2,
  },
  daysContainer: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  /** תא יום — ללא רקע, ללא צל. רק טקסט + עיגול סמן */
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 66,
  },
  dayCellWeekFit: {
    paddingTop: 4,
    paddingBottom: 4,
    minHeight: 0,
    minWidth: 0,
  },
  dayCellPressed: {
    opacity: 0.7,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dayNameWeekStrip: {
    fontSize: 10,
    marginBottom: 3,
    letterSpacing: 0.2,
    maxWidth: '100%',
  },
  /** עיגול סמן סביב המספר — רק לתאריך היום / הנבחר */
  numCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  numCircleWeekFit: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: -0.3,
  },
  dayNumberWeekStrip: {
    fontSize: 18,
    letterSpacing: -0.3,
    maxWidth: '100%',
  },
  markDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    opacity: 0.85,
  },
  markDotPlaceholder: {
    height: 4,
    marginTop: 4,
  },
});
