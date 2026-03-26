import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { getMonthWeeks, type MonthEntry } from './utils';

type DaysProps = {
  data: MonthEntry;
  rangeStart: Date;
  rangeEnd: Date;
  dayAvailability: Record<string, number>;
  selectedDate: Date | null;
  cellSize: number;
  primaryColor: string;
  onDayPress: (date: Date) => void;
  /** `availability` = green/red dot (booking). `count` = numeric badge (admin). */
  displayMode?: 'availability' | 'count';
};

function sameDate(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Days({
  data,
  rangeStart,
  rangeEnd,
  dayAvailability,
  selectedDate,
  cellSize,
  primaryColor,
  onDayPress,
  displayMode = 'availability',
}: DaysProps) {
  const weeks = getMonthWeeks(data);
  const rangeStartDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const rangeEndDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());

  return (
    <View style={{ width: '100%', paddingHorizontal: 16 }}>
      {weeks.map((week, weekIndex) => (
        <View
          key={weekIndex}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          {week.map((date, dayIndex) => {
            if (!date) {
              return (
                <View
                  key={`e-${weekIndex}-${dayIndex}`}
                  style={{ width: cellSize, height: cellSize }}
                />
              );
            }
            const inRange = date >= rangeStartDay && date <= rangeEndDay;
            const dsIso = toIso(date);
            const availCount = dayAvailability[dsIso] ?? 0;
            const hasAvail = availCount > 0;
            const isSel = selectedDate ? sameDate(date, selectedDate) : false;

            return (
              <TouchableOpacity
                key={dsIso}
                disabled={!inRange}
                activeOpacity={0.75}
                onPress={() => onDayPress(date)}
                style={{
                  width: cellSize,
                  minHeight: cellSize,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSel ? primaryColor : inRange ? '#F3F4F6' : 'transparent',
                  borderWidth: isSel ? 1.5 : 1.5,
                  borderColor: isSel ? primaryColor : 'transparent',
                  opacity: !inRange ? 0.35 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '700',
                    color: isSel ? '#FFFFFF' : !inRange ? '#C7C7CC' : '#374151',
                  }}
                >
                  {date.getDate()}
                </Text>
                {inRange &&
                  (displayMode === 'count' ? (
                    <View
                      style={{
                        marginTop: 3,
                        minWidth: 20,
                        height: 20,
                        paddingHorizontal: 5,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: hasAvail ? primaryColor : '#E5E7EB',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: hasAvail ? '#FFFFFF' : '#9CA3AF',
                        }}
                      >
                        {availCount > 99 ? '99+' : String(availCount)}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        marginTop: 3,
                        backgroundColor: hasAvail ? '#34C759' : '#FF3B30',
                      }}
                    />
                  ))}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
