import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/src/theme/ThemeProvider';

/** רוחב תא + מרווחים — לסנכרון גלילה למרכז */
const DAY_CELL_WIDTH = 52;
const DAY_CELL_GAP = 6;
const ITEM_STRIDE = DAY_CELL_WIDTH + DAY_CELL_GAP * 2;

interface DaySelectorProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  daysToShow?: number;
  mode?: 'week' | 'month';
  markedDates?: Set<string> | string[];
  startFromToday?: boolean;
  /** רקע מיכל השורה — ברירת מחדל שקוף כדי להתמזג עם רקע המסך (למשל יומן אדמין) */
  containerBackgroundColor?: string;
}

export default function DaySelector({
  selectedDate,
  onSelectDate,
  daysToShow = 7,
  mode = 'week',
  markedDates,
  startFromToday = false,
  containerBackgroundColor = 'transparent',
}: DaySelectorProps) {
  const colors = useColors();
  const { i18n } = useTranslation();
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

  return (
    <View style={[styles.container, { backgroundColor: containerBackgroundColor, direction: 'ltr' }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        /** כפיית LTR — באפליקציה בעברית (RTL) ScrollView אופקי הופך סדר: א׳ חייב להישאר משמאל */
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
        {dates.map((date, index) => {
          const selected = isSelected(date);
          const today = isToday(date);
          const isMarked = !!markedSet && markedSet.has(toLocalISODate(date));

          const pillBase = [
            styles.dayPill,
            { width: DAY_CELL_WIDTH, marginHorizontal: DAY_CELL_GAP },
          ];

          if (selected) {
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityState={{ selected: true }}
                onPress={() => onSelectDate(date)}
                style={({ pressed }) => [
                  ...pillBase,
                  styles.dayPillSelected,
                  {
                    backgroundColor: colors.primary,
                    shadowColor: colors.primary,
                  },
                  pressed && styles.dayPillPressed,
                ]}
              >
                <Text style={[styles.dayName, styles.dayNameOnPrimary]}>{getDayName(date)}</Text>
                <Text style={[styles.dayNumber, styles.dayNumberOnPrimary]}>{date.getDate()}</Text>
                {isMarked ? <View style={styles.markDotSelected} /> : <View style={styles.markDotPlaceholder} />}
              </Pressable>
            );
          }

          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityState={{ selected: false }}
              onPress={() => onSelectDate(date)}
              android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
              style={({ pressed }) => [
                ...pillBase,
                styles.dayPillIdle,
                today && { borderColor: colors.primary, borderWidth: 2, backgroundColor: `${colors.primary}10` },
                pressed && styles.dayPillPressedIdle,
              ]}
            >
              <Text
                style={[
                  styles.dayName,
                  { color: colors.textSecondary },
                ]}
              >
                {getDayName(date)}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  { color: colors.text },
                  today && { color: colors.primary },
                ]}
              >
                {date.getDate()}
              </Text>
              {isMarked ? (
                <View style={[styles.markDotIdle, { backgroundColor: colors.primary }]} />
              ) : (
                <View style={styles.markDotPlaceholder} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 6,
    paddingBottom: 14,
  },
  scrollLtr: {
    direction: 'ltr',
  },
  daysContainer: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  dayPill: {
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 72,
  },
  dayPillIdle: {
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(60, 64, 67, 0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  dayPillSelected: {
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
    }),
  },
  dayPillPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
  dayPillPressedIdle: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  dayName: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  dayNameOnPrimary: {
    color: 'rgba(255,255,255,0.92)',
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  dayNumberOnPrimary: {
    color: '#FFFFFF',
  },
  markDotIdle: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 6,
    opacity: 0.85,
  },
  markDotSelected: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  markDotPlaceholder: {
    height: 5,
    marginTop: 6,
  },
});
