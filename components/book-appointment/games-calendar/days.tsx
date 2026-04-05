import React, { useMemo } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { getMonthWeeks, formatHebrewDay, type MonthEntry } from './utils';

type DaysProps = {
  data: MonthEntry;
  rangeStart: Date;
  rangeEnd: Date;
  dayAvailability: Record<string, number>;
  constraintDates?: Set<string>;
  holidayLabels?: Record<string, string>;
  /** Short label for the constraint chip, e.g. "אילוץ" / "Block" */
  constraintPillLabel?: string;
  selectedDate: Date | null;
  cellSize: number;
  primaryColor: string;
  onDayPress: (date: Date) => void;
  /** `availability` = green tint (booking). `count` = admin pills with counts. */
  displayMode?: 'availability' | 'count';
  /** Show Hebrew calendar date below the Gregorian number — admin iPhone style */
  showHebrewDates?: boolean;
  /** Thin horizontal line under each week row (iOS month list) */
  showWeekSeparators?: boolean;
  /** Admin only: label for days with bookings, e.g. "3 תורים" */
  formatAppointmentBadge?: (count: number) => string;
};

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const IOS_TODAY_RED = '#FF3B30';
const AVAIL_DAY_FILL = '#D8F3E1';
const AVAIL_DAY_TEXT = '#0D4F2C';
const CONSTRAINT_PILL_BG = '#FEF3C7';
const STATUS_DOT_GREEN = '#22c55e';
const STATUS_DOT_RED = '#ef4444';
const STATUS_DOT_GRAY = '#C7C7CC';
const STATUS_DOT_SIZE = 5;
const CONSTRAINT_PILL_FG = '#B45309';
const CONSTRAINT_PILL_BORDER = 'rgba(180,83,9,0.35)';

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

/** #RRGGBB → #RRGGBBAA (alpha 00–FF) */
function hexWithAlpha(hex: string, aa: string): string {
  const raw = String(hex || '').replace('#', '').trim();
  if (raw.length !== 6) return `${hex}30`;
  return `#${raw}${aa}`;
}

function AdminConstraintPill({
  label,
  onPrimaryCircle,
  maxWidth,
}: {
  label: string;
  onPrimaryCircle: boolean;
  maxWidth: number;
}) {
  const bg = onPrimaryCircle ? 'rgba(255,255,255,0.35)' : CONSTRAINT_PILL_BG;
  const fg = onPrimaryCircle ? '#FFFFFF' : CONSTRAINT_PILL_FG;
  const border = onPrimaryCircle ? 'rgba(255,255,255,0.5)' : CONSTRAINT_PILL_BORDER;

  return (
    <View
      style={{
        maxWidth,
        paddingHorizontal: 5,
        paddingVertical: 3,
        borderRadius: 8,
        backgroundColor: bg,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: border,
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          fontSize: 8,
          fontWeight: '800',
          color: fg,
          textAlign: 'center',
          letterSpacing: -0.2,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function AdminAppointmentPill({
  label,
  primaryColor,
  onPrimaryCircle,
  maxWidth,
}: {
  label: string;
  primaryColor: string;
  onPrimaryCircle: boolean;
  maxWidth: number;
}) {
  const bg = onPrimaryCircle ? 'rgba(255,255,255,0.26)' : hexWithAlpha(primaryColor, '22');
  const fg = onPrimaryCircle ? '#FFFFFF' : primaryColor;
  const border = onPrimaryCircle ? 'rgba(255,255,255,0.45)' : hexWithAlpha(primaryColor, '55');

  return (
    <View
      style={{
        maxWidth,
        paddingHorizontal: 5,
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor: bg,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: border,
        ...Platform.select({
          ios: {
            shadowColor: primaryColor,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: onPrimaryCircle ? 0.15 : 0.12,
            shadowRadius: 3,
          },
          android: { elevation: onPrimaryCircle ? 0 : 1 },
        }),
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        style={{
          fontSize: 9,
          fontWeight: '700',
          color: fg,
          textAlign: 'center',
          letterSpacing: -0.1,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Individual Day Cell ──────────────────────────────────────────────────────

type DayCellProps = {
  date: Date;
  inRange: boolean;
  isSel: boolean;
  isToday: boolean;
  availCount: number;
  hasAvail: boolean;
  hasConstraint: boolean;
  holidayLabel?: string | null;
  cellSize: number;
  primaryColor: string;
  displayMode: 'availability' | 'count';
  showHebrewDates: boolean;
  formatAppointmentBadge?: (count: number) => string;
  constraintPillLabel?: string;
  onDayPress: (date: Date) => void;
};

const DayCell = React.memo(function DayCell({
  date,
  inRange,
  isSel,
  isToday,
  availCount,
  hasAvail,
  hasConstraint,
  holidayLabel,
  cellSize,
  primaryColor,
  displayMode,
  showHebrewDates,
  formatAppointmentBadge,
  constraintPillLabel,
  onDayPress,
}: DayCellProps) {
  const circleSize = Math.min(cellSize - 4, 36);

  const showBookingGreen =
    displayMode === 'availability' && inRange && hasAvail && !isSel && !isToday;
  const showAvailGreen = showBookingGreen;

  const circleColor = isSel ? primaryColor : 'transparent';

  const textColor =
    isSel ? '#FFFFFF' : inRange ? '#1C1C1E' : '#C7C7CC';

  const isPast = !isToday && date < TODAY;
  const textOpacity = isPast && inRange && !isSel && !isToday ? 0.4 : 1;

  // Status dot shown below day number (booking mode only, not on selected)
  // availCount < 0 means closed (no business hours), 0 means fully booked, >0 means available
  const isClosed = availCount < 0;
  const showStatusDot = displayMode === 'availability' && inRange && !isSel;
  const statusDotColor = hasAvail
    ? STATUS_DOT_GREEN
    : isClosed
      ? STATUS_DOT_GRAY
      : STATUS_DOT_RED;

  const onCircle = isToday || isSel;

  const hebrewDay = showHebrewDates ? formatHebrewDay(date) : '';
  const hebrewTextColor = !inRange
    ? '#D1D1D6'
    : isToday
      ? IOS_TODAY_RED
      : isSel
        ? primaryColor
        : '#8E8E93';

  const fmtBadge = formatAppointmentBadge ?? ((c: number) => `${c} תורים`);
  const badgeLabel = displayMode === 'count' && hasAvail ? fmtBadge(availCount) : null;
  const constraintLabel =
    displayMode === 'count' && hasConstraint && constraintPillLabel ? constraintPillLabel : null;
  const hasHolidayLabel = !!holidayLabel;

  // Closed days can't be pressed; fully-booked days CAN be pressed (to trigger waitlist)
  const isDisabled = !inRange || isClosed;

  return (
    <Pressable
      disabled={isDisabled}
      onPress={() => onDayPress(date)}
      style={({ pressed }) => ({
        width: cellSize,
        alignItems: 'center',
        paddingVertical: 3,
        opacity: pressed && !isDisabled ? 0.6 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={
        [holidayLabel, badgeLabel, constraintLabel].filter(Boolean).length
          ? `${date.getDate()}, ${[holidayLabel, badgeLabel, constraintLabel].filter(Boolean).join(', ')}`
          : `${date.getDate()}`
      }
      accessibilityState={{ selected: isSel, disabled: isDisabled }}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor: circleColor,
            alignItems: 'center',
            justifyContent: 'center',
            ...(isToday && !isSel
              ? {
                  borderWidth: 2,
                  borderColor: primaryColor,
                }
              : {}),
          }}
        >
          <Text
            style={{
              fontSize: circleSize >= 34 ? 16 : 14,
              fontWeight: isSel ? '700' : isToday ? '600' : '400',
              color: textColor,
              opacity: textOpacity,
              includeFontPadding: false,
              lineHeight: circleSize,
            }}
          >
            {date.getDate()}
          </Text>
        </View>
      </View>

      {showHebrewDates && (
        <Text
          numberOfLines={1}
          style={{
            fontSize: 9.5,
            fontWeight: '400',
            color: hebrewTextColor,
            includeFontPadding: false,
            marginTop: 1,
            lineHeight: 12,
            textAlign: 'center',
            width: cellSize,
          }}
        >
          {hebrewDay}
        </Text>
      )}

      {inRange && hasHolidayLabel ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={{
            fontSize: 8.5,
            fontWeight: '600',
            color: '#D23F31',
            includeFontPadding: false,
            marginTop: 1,
            lineHeight: 11,
            textAlign: 'center',
            width: cellSize + 6,
          }}
        >
          {holidayLabel}
        </Text>
      ) : null}

      <View
        style={{
          minHeight:
            displayMode === 'count' && (badgeLabel || constraintLabel)
              ? (badgeLabel && constraintLabel ? 48 : 26)
              : hasHolidayLabel
                ? 16
              : STATUS_DOT_SIZE + 4,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: hasHolidayLabel ? 1 : 2,
          paddingHorizontal: 1,
          gap: constraintLabel && badgeLabel ? 3 : 0,
        }}
      >
        {inRange && hasAvail && displayMode === 'count' && badgeLabel ? (
          <AdminAppointmentPill
            label={badgeLabel}
            primaryColor={primaryColor}
            onPrimaryCircle={false}
            maxWidth={cellSize + 4}
          />
        ) : null}
        {inRange && constraintLabel ? (
          <AdminConstraintPill
            label={constraintLabel}
            onPrimaryCircle={false}
            maxWidth={cellSize + 4}
          />
        ) : null}
        {showStatusDot && displayMode === 'availability' ? (
          <View
            style={{
              width: STATUS_DOT_SIZE,
              height: STATUS_DOT_SIZE,
              borderRadius: STATUS_DOT_SIZE / 2,
              backgroundColor: statusDotColor,
            }}
          />
        ) : null}
        {/* White dot under selected day (has filled circle) when available */}
        {isSel && hasAvail && displayMode === 'availability' ? (
          <View
            style={{
              width: STATUS_DOT_SIZE,
              height: STATUS_DOT_SIZE,
              borderRadius: STATUS_DOT_SIZE / 2,
              backgroundColor: 'rgba(255,255,255,0.85)',
            }}
          />
        ) : null}
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
  constraintDates,
  holidayLabels,
  constraintPillLabel,
  selectedDate,
  cellSize,
  primaryColor,
  onDayPress,
  displayMode = 'availability',
  showHebrewDates = false,
  showWeekSeparators = false,
  formatAppointmentBadge,
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

  const countPillExtra = displayMode === 'count' ? 50 : 0;

  return (
    <View style={{ width: '100%', paddingHorizontal: 16, paddingBottom: 10, direction: 'ltr' }}>
      {weeks.map((week, weekIndex) => {
        const displayWeek = [...week].reverse();
        return (
          <View
            key={weekIndex}
            style={{
              flexDirection: 'row',
              direction: 'ltr',
              justifyContent: 'space-between',
              ...(showWeekSeparators && weekIndex < weeks.length - 1
                ? {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: 'rgba(60, 60, 67, 0.18)',
                    paddingBottom: 6,
                    marginBottom: 2,
                  }
                : {}),
            }}
          >
            {displayWeek.map((date, dayIndex) => {
              if (!date) {
                const emptyH = cellSize + (showHebrewDates ? 26 : 13) + countPillExtra;
                return (
                  <View
                    key={`e-${weekIndex}-${dayIndex}`}
                    style={{ width: cellSize, height: emptyH }}
                  />
                );
              }

              const inRange = date >= rangeStartDay && date <= rangeEndDay;
              const dsIso = toIso(date);
              const availCount = dayAvailability[dsIso] ?? -1; // -1 = not loaded yet, treat as closed
              const hasAvail = availCount > 0;
              const hasConstraint = !!(constraintDates && constraintDates.has(dsIso));
              const holidayLabel = holidayLabels?.[dsIso] ?? null;
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
                  hasConstraint={hasConstraint}
                  holidayLabel={holidayLabel}
                  cellSize={cellSize}
                  primaryColor={primaryColor}
                  displayMode={displayMode}
                  showHebrewDates={showHebrewDates}
                  formatAppointmentBadge={formatAppointmentBadge}
                  constraintPillLabel={constraintPillLabel}
                  onDayPress={onDayPress}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
