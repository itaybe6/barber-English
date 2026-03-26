import React, { useMemo } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
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
  /** `availability` = dot (booking). `count` = numeric badge (admin). */
  displayMode?: 'availability' | 'count';
};

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

/** iOS red for "today" indicator — same as Apple Calendar */
const IOS_TODAY_RED = '#FF3B30';

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Individual Day Cell ──────────────────────────────────────────────────────

type DayCellProps = {
  date: Date;
  inRange: boolean;
  isSel: boolean;
  isToday: boolean;
  availCount: number;
  hasAvail: boolean;
  cellSize: number;
  primaryColor: string;
  displayMode: 'availability' | 'count';
  onDayPress: (date: Date) => void;
};

const DayCell = React.memo(function DayCell({
  date,
  inRange,
  isSel,
  isToday,
  availCount,
  hasAvail,
  cellSize,
  primaryColor,
  displayMode,
  onDayPress,
}: DayCellProps) {
  // Circle size is slightly smaller than the cell so there's breathing room
  const circleSize = Math.min(cellSize - 2, 40);

  // Color logic — mirrors iOS Calendar exactly
  const circleColor = isToday
    ? IOS_TODAY_RED
    : isSel
    ? primaryColor
    : 'transparent';

  const textColor = isToday || isSel ? '#FFFFFF' : inRange ? '#1C1C1E' : '#C7C7CC';

  const isPast = !isToday && date < TODAY;
  const textOpacity = isPast && inRange && !isSel && !isToday ? 0.42 : 1;

  // Dots / badge (only if in range and has events)
  const showIndicator = inRange && hasAvail;

  return (
    <Pressable
      disabled={!inRange}
      onPress={() => onDayPress(date)}
      style={({ pressed }) => ({
        width: cellSize,
        alignItems: 'center',
        paddingVertical: 3,
        opacity: pressed && inRange ? 0.65 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={`${date.getDate()}`}
      accessibilityState={{ selected: isSel, disabled: !inRange }}
    >
      {/* Day circle */}
      <View
        style={{
          width: circleSize,
          height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor: circleColor,
          alignItems: 'center',
          justifyContent: 'center',
          ...(isToday && !isSel
            ? Platform.select({
                ios: {
                  shadowColor: IOS_TODAY_RED,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 5,
                },
                android: { elevation: 3 },
              })
            : {}),
        }}
      >
        <Text
          style={{
            fontSize: circleSize >= 38 ? 17 : 15,
            fontWeight: isToday || isSel ? '700' : '400',
            color: textColor,
            opacity: textOpacity,
            includeFontPadding: false,
            lineHeight: circleSize,
          }}
        >
          {date.getDate()}
        </Text>
      </View>

      {/* Indicator row */}
      <View style={{ height: 8, justifyContent: 'center', alignItems: 'center', marginTop: 2 }}>
        {showIndicator && (
          displayMode === 'count' ? (
            /* Count pill — admin mode */
            <View
              style={{
                minWidth: 18,
                height: 14,
                borderRadius: 7,
                paddingHorizontal: 4,
                backgroundColor: isSel || isToday
                  ? 'rgba(255,255,255,0.28)'
                  : `${primaryColor}1A`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '800',
                  letterSpacing: 0.1,
                  color: isSel || isToday ? '#FFFFFF' : primaryColor,
                  includeFontPadding: false,
                }}
              >
                {availCount > 99 ? '99+' : String(availCount)}
              </Text>
            </View>
          ) : (
            /* Single dot — booking availability mode */
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: isSel || isToday ? '#FFFFFF' : (hasAvail ? '#34C759' : '#FF3B30'),
              }}
            />
          )
        )}
      </View>
    </Pressable>
  );
});

// ─── Full Month Grid ──────────────────────────────────────────────────────────

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

  const rangeStartDay = useMemo(
    () => new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()),
    [rangeStart]
  );
  const rangeEndDay = useMemo(
    () => new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()),
    [rangeEnd]
  );

  return (
    <View style={{ width: '100%', paddingHorizontal: 16, paddingBottom: 10 }}>
      {weeks.map((week, weekIndex) => (
        <View
          key={weekIndex}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          {week.map((date, dayIndex) => {
            if (!date) {
              return (
                <View
                  key={`e-${weekIndex}-${dayIndex}`}
                  style={{ width: cellSize, height: cellSize + 13 }}
                />
              );
            }

            const inRange = date >= rangeStartDay && date <= rangeEndDay;
            const dsIso = toIso(date);
            const availCount = dayAvailability[dsIso] ?? 0;
            const hasAvail = availCount > 0;
            const isSel = selectedDate ? sameDate(date, selectedDate) : false;
            const isToday = sameDate(date, TODAY);

            return (
              <DayCell
                key={dsIso}
                date={date}
                inRange={inRange}
                isSel={isSel}
                isToday={isToday}
                availCount={availCount}
                hasAvail={hasAvail}
                cellSize={cellSize}
                primaryColor={primaryColor}
                displayMode={displayMode}
                onDayPress={onDayPress}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
