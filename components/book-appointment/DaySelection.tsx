import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

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
  onSelectDayIndex: (index: number | null) => void;
  onClearTime: () => void;
};

export default function DaySelection({
  visible,
  styles,
  days,
  bookingOpenDays,
  selectedDate,
  selectedDayIndex,
  dayAvailability,
  language,
  onSelectDayIndex,
  onClearTime,
}: Props) {
  const content = React.useMemo(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + Math.max(0, bookingOpenDays - 1));

    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthEnd = new Date(end.getFullYear(), end.getMonth(), 1);

    const months: Date[] = [];
    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
      months.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const isSameDate = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    const rangeStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    return { start, end, months, isSameDate, rangeStart };
  }, [bookingOpenDays]);

  if (!visible) return null;

  return (
    <View style={[styles.section, styles.calendarSectionCard]}>
      <View style={styles.calendarFixedBox}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {content.months.map((m) => {
            const year = m.getFullYear();
            const month = m.getMonth();
            const firstDayIdx = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            const cells: (Date | null)[] = Array(firstDayIdx).fill(null);
            for (let d = 1; d <= daysInMonth; d++) {
              cells.push(new Date(year, month, d));
            }

            const weeks: (Date | null)[][] = [];
            for (let i = 0; i < cells.length; i += 7) {
              weeks.push(cells.slice(i, i + 7));
            }

            const monthLabel = new Date(year, month, 1).toLocaleString(language === 'he' ? 'he-IL' : 'en-US', {
              month: 'long',
              year: 'numeric',
            });

            return (
              <View key={`m-${year}-${month}`} style={{ marginBottom: 10 }}>
                <Text style={styles.calendarMonthTitle}>{monthLabel}</Text>
                {weeks.map((week, wi) => (
                  <View key={`w-${year}-${month}-${wi}`} style={styles.calendarGrid}>
                    {week.map((dateObj, di) => {
                      if (!dateObj) {
                        return <View key={`c-${year}-${month}-${wi}-${di}`} style={[styles.calendarCell, { backgroundColor: 'transparent' }]} />;
                      }
                      const inRange = dateObj >= content.rangeStart && dateObj <= content.end;
                      const dsIso = dateObj.toISOString().split('T')[0];
                      const hasAvail = (dayAvailability[dsIso] ?? 0) > 0;
                      const isSel = selectedDate ? content.isSameDate(dateObj, selectedDate) : false;
                      return (
                        <TouchableOpacity
                          key={`c-${year}-${month}-${wi}-${di}`}
                          disabled={!inRange}
                          onPress={() => {
                            const idx = days.findIndex((d) => d.fullDate.toDateString() === dateObj.toDateString());
                            onSelectDayIndex(idx >= 0 ? idx : null);
                            onClearTime();
                          }}
                          style={[
                            styles.calendarCell,
                            !inRange && styles.calendarCellDisabled,
                            isSel && styles.calendarCellSelected,
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '700',
                              color: isSel ? '#FFFFFF' : !inRange ? '#C7C7CC' : '#374151',
                            }}
                          >
                            {dateObj.getDate()}
                          </Text>
                          {inRange && (
                            <View style={[styles.calendarAvailDot, { backgroundColor: hasAvail ? '#34C759' : '#FF3B30' }]} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      </View>
      {/* Legends intentionally removed for a cleaner rectangular calendar view */}
    </View>
  );
}

