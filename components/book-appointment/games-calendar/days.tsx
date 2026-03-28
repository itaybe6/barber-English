import React, { useMemo } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { getMonthWeeks, formatHebrewDay, type MonthEntry } from './utils';

type DaysProps = {
  data: MonthEntry;
  rangeStart: Date;
  rangeEnd: Date;
  dayAvailability: Record<string, number>;
  constraintDates?: Set<string>;
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

  const circleColor = isToday
    ? IOS_TODAY_RED
    : isSel
    ? primaryColor
    : showAvailGreen
    ? AVAIL_DAY_FILL
    : 'transparent';

  const textColor =
    isToday || isSel ? '#FFFFFF' : showAvailGreen ? AVAIL_DAY_TEXT : inRange ? '#1C1C1E' : '#C7C7CC';

  const isPast = !isToday && date < TODAY;
  const textOpacity = isPast && inRange && !isSel && !isToday && !showAvailGreen ? 0.4 : 1;

  const onCircle = isToday || isSel;

  const hebrewDay = showHebrewDates ? formatHebrewDay(date) : '';

  const fmtBadge = formatAppointmentBadge ?? ((c: number) => `${c} תורים`);
  const badgeLabel = displayMode === 'count' && hasAvail ? fmtBadge(availCount) : null;
  const constraintLabel =
    displayMode === 'count' && hasConstraint && constraintPillLabel ? constraintPillLabel : null;

  return (
    <Pressable
      disabled={!inRange}
      onPress={() => onDayPress(date)}
      style={({ pressed }) => ({
        width: cellSize,
        alignItems: 'center',
        paddingVertical: 3,
        opacity: pressed && inRange ? 0.6 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={
        [badgeLabel, constraintLabel].filter(Boolean).length
          ? `${date.getDate()}, ${[badgeLabel, constraintLabel].filter(Boolean).join(', ')}`
          : `${date.getDate()}`
      }
      accessibilityState={{ selected: isSel, disabled: !inRange }}
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
            ...(showBookingGreen
              ? {
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: 'rgba(52,199,89,0.4)',
                }
              : {}),
            ...(isToday && !isSel
              ? Platform.select({
                  ios: {
                    shadowColor: IOS_TODAY_RED,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.35,
                    shadowRadius: 4,
                  },
                  android: { elevation: 3 },
                })
              : {}),
          }}
        >
          <Text
            style={{
              fontSize: circleSize >= 34 ? 16 : 14,
              fontWeight: isToday || isSel ? '700' : showAvailGreen ? '600' : '400',
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
            color: onCircle ? 'rgba(255,255,255,0.0)' : inRange ? '#8E8E93' : '#D1D1D6',
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

      <View
        style={{
          minHeight:
            displayMode === 'count' && (badgeLabel || constraintLabel)
              ? (badgeLabel && constraintLabel ? 48 : 26)
              : showHebrewDates
                ? 10
                : 8,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: showHebrewDates ? 2 : 2,
          paddingHorizontal: 1,
          gap: constraintLabel && badgeLabel ? 3 : 0,
        }}
      >
        {inRange && hasAvail && displayMode === 'count' && badgeLabel ? (
          <AdminAppointmentPill
            label={badgeLabel}
            primaryColor={primaryColor}
            onPrimaryCircle={onCircle}
            maxWidth={cellSize + 4}
          />
        ) : null}
        {inRange && constraintLabel ? (
          <AdminConstraintPill
            label={constraintLabel}
            onPrimaryCircle={onCircle}
            maxWidth={cellSize + 4}
          />
        ) : null}
        {inRange && hasAvail && displayMode === 'availability' && onCircle ? (
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: 'rgba(255,255,255,0.9)',
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
              const availCount = dayAvailability[dsIso] ?? 0;
              const hasAvail = availCount > 0;
              const hasConstraint = !!(constraintDates && constraintDates.has(dsIso));
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
