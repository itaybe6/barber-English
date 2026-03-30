import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Dimensions,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Animated as RNAnimated,
  TouchableOpacity,
  View,
  Modal,
  Linking,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  DeviceEventEmitter,
} from 'react-native';
import Colors from '@/constants/colors';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import DaySelector from '@/components/DaySelector';
import { AvailableTimeSlot, supabase, getBusinessId, type CalendarReminder, type BusinessConstraint } from '@/lib/supabase';
import {
  businessConstraintsApi,
  mergeConstraintsForDisplay,
  isBusinessDayFullyBlockedByConstraints,
  constraintTimeToMinutes as constraintTimeToMinutesFromApi,
} from '@/lib/api/businessConstraints';
import {
  listCalendarRemindersForDate,
  listCalendarRemindersForRange,
  listCalendarReminderDatesInMonth,
} from '@/lib/api/calendarReminders';
import { businessHoursApi } from '@/lib/api/businessHours';
import { checkWaitlistAndNotify, notifyServiceWaitlistClients } from '@/lib/api/waitlistNotifications';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { Entypo, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AppointmentActionsAnchorSheet,
  getDefaultAppointmentAnchorRect,
  type AnchorRect,
} from '@/components/admin-calendar/AppointmentActionsAnchorSheet';
import { AppointmentsCalendarLoader } from '@/components/admin-calendar/AppointmentsCalendarLoader';
import AdminVerticalMonthCalendar from '@/components/book-appointment/games-calendar/AdminVerticalMonthCalendar';
import { CalendarReminderFabPanel } from '@/components/CalendarReminderFabPanel';
import { useAdminCalendarView } from '@/contexts/AdminCalendarViewContext';
import {
  useAdminCalendarPlusAnchorWindow,
  useAdminCalendarReminderFabRegistration,
} from '@/contexts/AdminCalendarReminderFabContext';
import { Ban, Calendar, ChevronLeft, ChevronRight, CheckCircle, StickyNote } from 'lucide-react-native';
import { ADMIN_CALENDAR_APPOINTMENTS_CHANGED } from '@/constants/adminCalendarEvents';
import BusinessConstraintsModal from '@/components/BusinessConstraintsModal';
import ConstraintEditModal from '@/components/ConstraintEditModal';
import CalendarReminderEditorModal from '@/components/CalendarReminderEditorModal';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { FlashList, FlashListProps } from '@shopify/flash-list';
import Animated, {
  setNativeProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

// Press feedback: scale-on-press animated touchable
const AnimatedTouchable = RNAnimated.createAnimatedComponent(TouchableOpacity);
type PressableScaleProps = {
  onPress: () => void;
  style?: any;
  disabled?: boolean;
  hitSlop?: any;
  pressRetentionOffset?: any;
  accessibilityLabel?: string;
  children?: React.ReactNode;
};
const PressableScale = ({ onPress, style, children, disabled, hitSlop, pressRetentionOffset, accessibilityLabel }: PressableScaleProps) => {
  const scale = React.useRef(new RNAnimated.Value(1)).current;

  const handlePressIn = React.useCallback(() => {
    RNAnimated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      stiffness: 300,
      damping: 22,
      mass: 0.6,
    }).start();
  }, [scale]);

  const handlePressOut = React.useCallback(() => {
    RNAnimated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: 300,
      damping: 22,
      mass: 0.6,
    }).start();
  }, [scale]);

  return (
    <AnimatedTouchable
      activeOpacity={0.8}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      delayPressIn={0}
      delayPressOut={0}
      pressRetentionOffset={pressRetentionOffset || { top: 24, bottom: 24, left: 24, right: 24 }}
      hitSlop={hitSlop || { top: 24, bottom: 24, left: 24, right: 24 }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedTouchable>
  );
};

type DayBlock = {
  date: Date;
  formatted: string; // YYYY-MM-DD
};

const GC_BLUE = '#1A73E8';
const GC_SURFACE = '#FFFFFF';
const GC_PAGE_BG = '#F8F9FA';
/** רקע כותרת ניווט + אזור ה־safe area העליון — כמו מסילת החודש/שבוע */
const GC_HEADER_CHROME = '#F0F3F7';

function _hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = String(hex || '')
    .replace('#', '')
    .trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

/** ערבוב צבע מותג על לבן — רקעים עדינים (כותרת שבוע, כרטיס תור) */
function _primaryOnWhite(primary: string, strength: number): string {
  const rgb = _hexToRgb(primary);
  if (!rgb) return '#F0F4FF';
  const t = Math.min(1, Math.max(0, strength));
  const r = Math.round(255 * (1 - t) + rgb.r * t);
  const g = Math.round(255 * (1 - t) + rgb.g * t);
  const b = Math.round(255 * (1 - t) + rgb.b * t);
  return `rgb(${r},${g},${b})`;
}

function _primaryRgbA(primary: string, alpha: number): string {
  const rgb = _hexToRgb(primary);
  if (!rgb) return `rgba(26,115,232,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

const { width: _screenWidth } = Dimensions.get('window');
/** Horizontal margin on `timelineContainer` (each side) — must match `styles.timelineContainer`. */
const DAY_TIMELINE_MARGIN_H = 12;
/** Left column width for day-view time labels (must match `styles.timeLabel` / overlay padding). */
const LABELS_WIDTH = 64;
const _daysInWeekToDisplay = 7;
// +1 is for the hours column
const _baseDaySize = _screenWidth / (_daysInWeekToDisplay + 1);
// When showing all 7 days, the grid gets too cramped on phones.
// Keep all days, but allow horizontal scroll with a readable minimum width.
const _daySize = Math.max(_baseDaySize, 64);
const _hourSize = Math.max(_daySize * 1.35, 78);
const _extraPaddingBottom = _hourSize;
const _startOfDay = dayjs().startOf('day').set('hour', 0).set('minute', 0);
const _hourBlocks = [...Array(25).keys()].map((hour) => _startOfDay.add(hour, 'hour'));

Animated.addWhitelistedNativeProps?.({
  contentOffset: true,
});

const REMINDER_PALETTE: Record<string, { bar: string; bg: string }> = {
  blue: { bar: '#1A73E8', bg: '#E8F0FE' },
  coral: { bar: '#E67C73', bg: '#FCE8E6' },
  yellow: { bar: '#F9AB00', bg: '#FEF7E0' },
  green: { bar: '#0F9D58', bg: '#E6F4EA' },
  purple: { bar: '#A142F4', bg: '#F3E8FD' },
  gray: { bar: '#5F6368', bg: '#F1F3F4' },
};

function reminderPalette(key: string | null | undefined) {
  return REMINDER_PALETTE[key || 'blue'] || REMINDER_PALETTE.blue;
}

function _calendarRangeEndMinutes(startMinutes: number, durationMinutes: number): number {
  return startMinutes + Math.max(1, durationMinutes || 30);
}

/** True when two [start, start+duration) minute ranges intersect. */
function _calendarRangesOverlapMinutes(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number
): boolean {
  const aEnd = _calendarRangeEndMinutes(aStart, aDuration);
  const bEnd = _calendarRangeEndMinutes(bStart, bDuration);
  return aStart < bEnd && bStart < aEnd;
}

/** Admin calendar: blocked-time styling (amber) */
const CONSTRAINT_BAR = '#C2410C';
const CONSTRAINT_BG = '#FFFBEB';

/** YYYY-MM-DD lexicographic order matches chronological */
function mergeCalendarRefreshRange(
  week: { start: string; end: string },
  payload?: { dateMin: string; dateMax: string }
): { start: string; end: string } {
  if (!payload?.dateMin || !payload?.dateMax) return week;
  return {
    start: week.start <= payload.dateMin ? week.start : payload.dateMin,
    end: week.end >= payload.dateMax ? week.end : payload.dateMax,
  };
}

function _isFullDayConstraint(c: BusinessConstraint, mf: (t?: string | null) => number): boolean {
  const s = mf(c.start_time);
  const e = mf(c.end_time);
  return s <= 0 && e >= 23 * 60 + 45;
}

function layoutConstraintOnWeekColumn(
  c: BusinessConstraint,
  hourRowHeight: number,
  mf: (t?: string | null) => number
): { top: number; height: number } {
  if (_isFullDayConstraint(c, mf)) {
    return { top: 2, height: 24 * hourRowHeight - 4 };
  }
  const startM = mf(c.start_time);
  let endM = mf(c.end_time);
  if (endM <= startM) endM = startM + 30;
  const top = (startM / 60) * hourRowHeight + 2;
  const rawH = ((endM - startM) / 60) * hourRowHeight;
  const height = Math.max(34, rawH - 4);
  const maxTop = 24 * hourRowHeight - 6;
  const clampedTop = Math.min(Math.max(0, top), maxTop);
  const clampedH = Math.min(height, 24 * hourRowHeight - clampedTop - 2);
  return { top: clampedTop, height: Math.max(32, clampedH) };
}

function layoutConstraintOnDayGrid(
  c: BusinessConstraint,
  dayStart: string,
  halfHourLabelsLength: number,
  blockHeight: number,
  mf: (t?: string | null) => number
): { top: number; height: number } | null {
  const dayStartM = mf(dayStart);
  const gridEndM = dayStartM + halfHourLabelsLength * 30;
  let startM = mf(c.start_time);
  let endM = mf(c.end_time);
  if (_isFullDayConstraint(c, mf)) {
    startM = dayStartM;
    endM = gridEndM;
  } else if (endM <= startM) {
    endM = startM + 30;
  }
  const visStart = Math.max(startM, dayStartM);
  const visEnd = Math.min(endM, gridEndM);
  if (visEnd <= visStart) return null;
  const offsetMin = visStart - dayStartM;
  const durMin = visEnd - visStart;
  const top = (offsetMin / 30) * blockHeight + blockHeight / 2;
  const height = (durMin / 30) * blockHeight;
  return { top, height: Math.max(height, 40) };
}

const AnimatedFlashList = Animated.createAnimatedComponent<FlashListProps<DayBlock>>(FlashList);

function _formatLocalYyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function _getStartOfWeek(date: Date) {
  // Israel typically starts week on Sunday (0)
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 (Sun) -> 6 (Sat)
  d.setDate(d.getDate() - day);
  return d;
}

function _buildDays(start: Date, count: number): DayBlock[] {
  const out: DayBlock[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    d.setHours(0, 0, 0, 0);
    out.push({ date: d, formatted: _formatLocalYyyyMmDd(d) });
  }
  return out;
}

function _safeIntl(locale: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return null;
  }
}

/** ימי השבוע בעברית — א׳=ראשון … ש׳=שבת (מתאים ל־Date.getDay()) */
const HEBREW_DOW_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

/** יום חודש לועזי + שם יום — תואם לעמודות הגריד (לא לוח עברי) */
function _gregorianDayHeaderParts(date: Date) {
  const fmt =
    _safeIntl('he-IL-u-ca-gregory', { weekday: 'short' }) ||
    _safeIntl('he-IL', { weekday: 'short' });
  let weekday = '';
  if (fmt?.formatToParts) {
    weekday = fmt.formatToParts(date).find((p) => p.type === 'weekday')?.value ?? '';
  } else {
    weekday = fmt?.format(date) ?? '';
  }
  const dayNum = String(date.getDate());
  return { dayNum, weekday };
}

/** תצוגת תאריך תור (YYYY-MM-DD) — כמו במודל החודש */
function _formatSlotDateLine(slotDate: string) {
  const parts = String(slotDate || '')
    .split('-')
    .map((x) => parseInt(x, 10));
  const yy = parts[0];
  const mm = parts[1];
  const dd = parts[2];
  if (!yy || !mm || !dd) return slotDate || '—';
  const d = new Date(yy, mm - 1, dd);
  const p = _gregorianDayHeaderParts(d);
  return p.weekday ? `${p.weekday} · ${p.dayNum}` : slotDate;
}

function _adminAppointmentStatusLabel(status: string, tHe: (key: string, fallback: string) => string) {
  switch (status) {
    case 'confirmed':
      return tHe('admin.appointments.statusConfirmed', 'מאושר');
    case 'pending':
      return tHe('admin.appointments.statusPending', 'ממתין');
    case 'cancelled':
      return tHe('admin.appointments.statusCancelled', 'בוטל');
    case 'completed':
      return tHe('admin.appointments.statusCompleted', 'הושלם');
    case 'no_show':
      return tHe('admin.appointments.statusNoShow', 'לא הגיע/ה');
    default:
      return status || '—';
  }
}

function _clientInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase() || '?';
}

/** תג סטטוס על רקע בהיר מעל גרדיאנט */
function _appointmentStatusPillColors(status: string): { bg: string; text: string } {
  switch (status) {
    case 'confirmed':
      return { bg: 'rgba(255,255,255,0.94)', text: '#166534' };
    case 'pending':
      return { bg: 'rgba(255,255,255,0.94)', text: '#B45309' };
    case 'cancelled':
      return { bg: 'rgba(255,255,255,0.88)', text: '#64748B' };
    case 'completed':
      return { bg: 'rgba(255,255,255,0.94)', text: '#1D4ED8' };
    case 'no_show':
      return { bg: 'rgba(255,255,255,0.94)', text: '#B91C1C' };
    default:
      return { bg: 'rgba(255,255,255,0.9)', text: '#334155' };
  }
}

function _formatGregorianMonthYear(date: Date) {
  // Keep Hebrew UI, but force Gregorian calendar ("לועזי")
  const fmt =
    _safeIntl('he-IL-u-ca-gregory', { month: 'long', year: 'numeric' }) ||
    _safeIntl('he-IL', { month: 'long', year: 'numeric' });
  return fmt?.format(date) ?? '';
}

/** כותרת לשורת הניווט בתצוגה שבועית — טווח תאריכים באותו חודש או מעבר חודשים */
function _formatGregorianWeekRange(anchorDate: Date) {
  const start = _getStartOfWeek(anchorDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(0, 0, 0, 0);

  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();

  if (sameMonth) {
    const monthYearFmt =
      _safeIntl('he-IL-u-ca-gregory', { month: 'long', year: 'numeric' }) ||
      _safeIntl('he-IL', { month: 'long', year: 'numeric' });
    const rest = monthYearFmt?.format(start) ?? '';
    return `${start.getDate()}–${end.getDate()} ${rest}`;
  }

  const fmt =
    _safeIntl('he-IL-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' }) ||
    _safeIntl('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt?.format(start) ?? ''} – ${fmt?.format(end) ?? ''}`;
}

function _formatHebrewTimeLabel(date: Date) {
  const fmt =
    _safeIntl('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) ||
    _safeIntl('he-IL', { hour: '2-digit', minute: '2-digit' });
  return fmt?.format(date) ?? '';
}

const HeaderDay = memo(
  ({
    day,
    columnWidth,
    headerHeight,
    isSelected,
    isToday,
    hasBookings,
    primaryColor,
    onPress,
  }: {
    day: DayBlock;
    columnWidth: number;
    headerHeight: number;
    isSelected: boolean;
    isToday?: boolean;
    /** יש לפחות תור משובץ ביום הזה (טעון מתוך טווח השבוע) */
    hasBookings?: boolean;
    /** צבע מותג — הדגשת יום נבחר / היום */
    primaryColor: string;
    onPress?: () => void;
  }) => {
    const { dayNum, weekday } = _gregorianDayHeaderParts(day.date);
    const dow = day.date.getDay();
    const hebDow = HEBREW_DOW_LETTERS[dow] ?? '';
    /** נבחר אבל לא "היום" — הדגשה עדינה; המילוי המלא רק לתאריך של היום האמיתי */
    const mildSelected = !!isSelected && !isToday;
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.75 : 1}
        style={[
          {
            alignItems: 'center',
            justifyContent: 'center',
            width: columnWidth,
            height: headerHeight,
            paddingBottom: 4,
            paddingTop: 4,
            backgroundColor: isSelected ? _primaryOnWhite(primaryColor, 0.1) : 'transparent',
          },
          weekStyles.borderRight,
          weekStyles.borderBottom,
        ]}
      >
        <Text
          style={[
            weekStyles.headerHebrewDow,
            { writingDirection: 'rtl', color: isSelected ? primaryColor : '#5F6368' },
          ]}
        >
          {hebDow}
        </Text>
        <View
          style={[
            weekStyles.headerDayCircle,
            isToday && { backgroundColor: primaryColor, borderWidth: 0 },
            mildSelected && { backgroundColor: _primaryOnWhite(primaryColor, 0.14), borderWidth: 0 },
          ]}
        >
          <Text
            style={[
              weekStyles.headerDayNum,
              { writingDirection: 'rtl' },
              isToday && weekStyles.headerDayNumToday,
              mildSelected && { color: primaryColor },
            ]}
          >
            {dayNum}
          </Text>
        </View>
        {hasBookings ? (
          <View
            style={[
              weekStyles.headerBookingDot,
              { backgroundColor: primaryColor },
              isSelected && weekStyles.headerBookingDotSelected,
            ]}
          />
        ) : null}
        {weekday ? (
          <Text style={[weekStyles.headerWeekday, { writingDirection: 'rtl', color: isSelected ? primaryColor : '#5F6368' }]}>
            {weekday}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }
);

const WeekAppointmentCard = memo(
  ({
    apt,
    top,
    cardHeight,
    clientName,
    serviceName,
    hasPhone,
    primaryColor,
    onOpenAppointment,
    weekLane,
    weekLaneMetrics,
  }: {
    apt: AvailableTimeSlot;
    top: number;
    cardHeight: number;
    clientName: string;
    serviceName: string;
    hasPhone: boolean;
    primaryColor: string;
    onOpenAppointment: (apt: AvailableTimeSlot, anchor?: AnchorRect) => void;
    /** When a calendar reminder overlaps this slot, draw the card in the trailing half-column. */
    weekLane?: 'full' | 'trailing';
    weekLaneMetrics?: { edge: number; midGap: number; halfW: number };
  }) => {
    const cardRef = useRef<View>(null);

    const handlePress = useCallback(() => {
      const v = cardRef.current;
      if (v && typeof (v as View).measureInWindow === 'function') {
        try {
          (v as View).measureInWindow((x, y, width, height) => {
            if (width > 0 && height > 0) {
              onOpenAppointment(apt, { x, y, width, height });
            } else {
              onOpenAppointment(apt);
            }
          });
          return;
        } catch {
          // fall through
        }
      }
      onOpenAppointment(apt);
    }, [apt, onOpenAppointment]);

    const useTrailing = weekLane === 'trailing' && weekLaneMetrics;
    return (
      <Pressable
        key={`wk-${apt.id}-${apt.slot_date}-${apt.slot_time}`}
        onPress={handlePress}
        style={({ pressed }) => [
          weekStyles.weekAptCard,
          {
            top,
            height: cardHeight,
            ...(useTrailing
              ? {
                  left: weekLaneMetrics!.edge + weekLaneMetrics!.halfW + weekLaneMetrics!.midGap,
                  width: weekLaneMetrics!.halfW,
                }
              : { left: 3, right: 3 }),
            zIndex: 3,
            elevation: 4,
            opacity: pressed ? 0.92 : 1,
            backgroundColor: _primaryOnWhite(primaryColor, 0.085),
            borderColor: _primaryRgbA(primaryColor, 0.2),
            ...Platform.select({
              ios: {
                shadowColor: primaryColor,
              },
            }),
          },
        ]}
      >
        <View ref={cardRef} collapsable={false} style={StyleSheet.absoluteFillObject}>
          <View style={[weekStyles.weekAptAccent, { backgroundColor: primaryColor }]} />
          <View style={weekStyles.weekAptInner}>
            <View style={weekStyles.weekAptHeaderRow}>
              <Text numberOfLines={1} style={weekStyles.weekAptClient}>
                {clientName}
              </Text>
              {hasPhone && <Ionicons name="call-outline" size={9} color={primaryColor} />}
            </View>
            {cardHeight >= 38 && (
              <Text numberOfLines={1} style={weekStyles.weekAptService}>
                {serviceName}
              </Text>
            )}
            {cardHeight >= 56 && !!apt.slot_time && (
              <View style={weekStyles.weekAptMetaRow}>
                <Ionicons name="time-outline" size={9} color="#6B7280" />
                <Text numberOfLines={1} style={weekStyles.weekAptTime}>
                  {_formatHebrewTimeLabel(new Date(`${apt.slot_date}T${apt.slot_time}`))}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  }
);

const WeekDayColumn = memo(
  ({
    day,
    index,
    appts,
    constraints,
    reminders,
    columnWidth,
    hourRowHeight,
    primaryColor,
    onOpenAppointment,
    onPressReminder,
    onPressConstraint,
    minutesFromMidnight,
  }: {
    day: DayBlock;
    index: number;
    appts: AvailableTimeSlot[];
    constraints: BusinessConstraint[];
    reminders: CalendarReminder[];
    columnWidth: number;
    hourRowHeight: number;
    primaryColor: string;
    onOpenAppointment: (apt: AvailableTimeSlot, anchor?: AnchorRect) => void;
    onPressReminder: (r: CalendarReminder) => void;
    onPressConstraint: (c: BusinessConstraint) => void;
    minutesFromMidnight: (time?: string | null) => number;
  }) => {
    const { t } = useTranslation();
    const WK_EDGE = 4;
    const WK_MID = 2;
    const weekInner = columnWidth - WK_EDGE * 2;
    const weekHalfW = Math.max(34, (weekInner - WK_MID) / 2);
    const weekLaneMetrics = useMemo(
      () => ({ edge: WK_EDGE, midGap: WK_MID, halfW: weekHalfW }),
      [weekHalfW]
    );

    const reminderIdsOverlappingAppt = useMemo(() => {
      const ids = new Set<string>();
      for (const r of reminders) {
        const rs = minutesFromMidnight(r.start_time);
        const rd = r.duration_minutes || 30;
        const overlaps = appts.some((apt) =>
          _calendarRangesOverlapMinutes(rs, rd, minutesFromMidnight(apt.slot_time), apt.duration_minutes || 30)
        );
        if (overlaps) ids.add(r.id);
      }
      return ids;
    }, [reminders, appts, minutesFromMidnight]);

    const aptIdsOverlappingReminder = useMemo(() => {
      const ids = new Set<string>();
      for (const apt of appts) {
        const aStart = minutesFromMidnight(apt.slot_time);
        const aDur = apt.duration_minutes || 30;
        const overlaps = reminders.some((r) =>
          _calendarRangesOverlapMinutes(
            minutesFromMidnight(r.start_time),
            r.duration_minutes || 30,
            aStart,
            aDur
          )
        );
        if (overlaps) ids.add(String(apt.id));
      }
      return ids;
    }, [reminders, appts, minutesFromMidnight]);

    return (
      <View
        style={[
          {
            width: columnWidth,
            backgroundColor: index % 2 === 1 ? '#F3F4F6' : GC_SURFACE,
          },
          weekStyles.borderRight,
        ]}
      >
        <View style={{ height: hourRowHeight * 24, position: 'relative' }}>
          {_hourBlocks.map((hourBlock, i) => {
            const hourDate = hourBlock.toDate();
            return (
              <View
                key={`day-${day.formatted}-hour-${i}`}
                style={[
                  {
                    height: hourRowHeight,
                    justifyContent: 'flex-start',
                    alignItems: 'flex-end',
                    padding: 2,
                  },
                  weekStyles.borderBottom,
                ]}
              >
                <Text style={{ fontSize: 10, opacity: 0.08, writingDirection: 'rtl' }}>
                  {_formatHebrewTimeLabel(hourDate)}
                </Text>
              </View>
            );
          })}

          {constraints.map((c) => {
            const { top, height } = layoutConstraintOnWeekColumn(c, hourRowHeight, minutesFromMidnight);
            const startLbl = formatTime12Hour(String(c.start_time || '').slice(0, 5));
            const endLbl = formatTime12Hour(String(c.end_time || '').slice(0, 5));
            return (
              <PressableScale
                key={`wk-con-${c.id}`}
                onPress={() => onPressConstraint(c)}
                style={[
                  weekStyles.weekConstraintCard,
                  {
                    top,
                    height,
                    left: 4,
                    right: 4,
                    zIndex: 1,
                    elevation: 1,
                    backgroundColor: CONSTRAINT_BG,
                    borderLeftColor: CONSTRAINT_BAR,
                  },
                ]}
              >
                <View style={weekStyles.weekConstraintRow}>
                  <Ban size={11} color={CONSTRAINT_BAR} />
                  <Text numberOfLines={2} style={weekStyles.weekConstraintTitle}>
                    {c.reason?.trim() ||
                      String(t('admin.calendar.constraintBlockTitle', 'זמן חסום'))}
                  </Text>
                </View>
                <Text numberOfLines={1} style={weekStyles.weekConstraintTime}>
                  {`${startLbl} – ${endLbl}`}
                </Text>
              </PressableScale>
            );
          })}

          {reminders.map((r) => {
            const startM = minutesFromMidnight(r.start_time);
            const durationMinutes = r.duration_minutes || 30;
            const top = (startM / 60) * hourRowHeight;
            const height = (durationMinutes / 60) * hourRowHeight;
            const pal = reminderPalette(r.color_key);
            const splitWithAppt = reminderIdsOverlappingAppt.has(r.id);
            return (
              <PressableScale
                key={`wk-rm-${r.id}`}
                onPress={() => onPressReminder(r)}
                style={[
                  weekStyles.weekReminderCard,
                  {
                    top: Math.max(0, top + 2),
                    height: Math.max(36, height - 4),
                    ...(splitWithAppt
                      ? { left: WK_EDGE, width: weekHalfW }
                      : { left: 4, right: 4 }),
                    zIndex: splitWithAppt ? 4 : 2,
                    elevation: splitWithAppt ? 3 : 2,
                    backgroundColor: pal.bg,
                    borderLeftColor: pal.bar,
                  },
                ]}
              >
                <View style={weekStyles.weekReminderRow}>
                  <StickyNote size={11} color={pal.bar} />
                  <Text numberOfLines={2} style={[weekStyles.weekReminderTitle, { color: '#1C1C1E' }]}>
                    {r.title}
                  </Text>
                </View>
              </PressableScale>
            );
          })}

          {appts.map((apt) => {
            const aptMinutes = minutesFromMidnight(apt.slot_time);
            const durationMinutes = apt.duration_minutes || 30;
            const top = Math.max(0, (aptMinutes / 60) * hourRowHeight + 2);
            const height = (durationMinutes / 60) * hourRowHeight;
            const clientName = apt.client_name || 'לקוח';
            const serviceName = apt.service_name || 'שירות';
            const hasPhone = !!apt.client_phone;
            const cardHeight = Math.max(40, height - 4);
            const splitWithReminder = aptIdsOverlappingReminder.has(String(apt.id));
            return (
              <WeekAppointmentCard
                key={`wk-${apt.id}-${apt.slot_date}-${apt.slot_time}`}
                apt={apt}
                top={top}
                cardHeight={cardHeight}
                clientName={clientName}
                serviceName={serviceName}
                hasPhone={hasPhone}
                primaryColor={primaryColor}
                onOpenAppointment={onOpenAppointment}
                weekLane={splitWithReminder ? 'trailing' : 'full'}
                weekLaneMetrics={splitWithReminder ? weekLaneMetrics : undefined}
              />
            );
          })}
        </View>
      </View>
    );
  }
);

export default function AdminAppointmentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    focusDate?: string | string[];
    focusAppointmentId?: string | string[];
  }>();
  const { t, i18n } = useTranslation();
  /** Hebrew UI for admin cancel/delete flows (per product requirement) */
  const tHe = useCallback(
    (key: string, fallback: string) => String(i18n.t(key, { lng: 'he', defaultValue: fallback })),
    [i18n]
  );
  const isRtl = I18nManager.isRTL;
  /** Week grid uses `direction: 'ltr'` — column order ignores app RTL unless we reverse here. Also `app/index.tsx` may force LTR, so use language too for Hebrew salons. */
  const weekGridReverseDays =
    I18nManager.isRTL || (typeof i18n.language === 'string' && i18n.language.startsWith('he'));
  const user = useAuthStore((state) => state.user);
  const { colors: businessColors } = useBusinessColors();
  const { calendarView, setCalendarView } = useAdminCalendarView();
  const insets = useSafeAreaInsets();
  const setReminderFabRegistration = useAdminCalendarReminderFabRegistration();
  const plusAnchorWindow = useAdminCalendarPlusAnchorWindow();
  const reminderOverlayRef = useRef<View>(null);
  const [reminderOverlayWin, setReminderOverlayWin] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const measureReminderOverlay = useCallback(() => {
    reminderOverlayRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setReminderOverlayWin({ x, y, width, height });
      }
    });
  }, []);

  useEffect(() => {
    if (!plusAnchorWindow) return;
    const id = requestAnimationFrame(() => measureReminderOverlay());
    return () => cancelAnimationFrame(id);
  }, [plusAnchorWindow, measureReminderOverlay]);

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const pendingFocusAppointmentIdRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const rawD = params.focusDate;
      const s =
        typeof rawD === 'string'
          ? rawD.trim()
          : Array.isArray(rawD) && rawD[0]
            ? String(rawD[0]).trim()
            : '';
      const rawA = params.focusAppointmentId;
      const aid =
        typeof rawA === 'string'
          ? rawA.trim()
          : Array.isArray(rawA) && rawA[0]
            ? String(rawA[0]).trim()
            : '';
      if (!s && !aid) return;

      const applyYmd = (ymd: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
        const y = parseInt(ymd.slice(0, 4), 10);
        const mo = parseInt(ymd.slice(5, 7), 10);
        const d = parseInt(ymd.slice(8, 10), 10);
        const next = new Date(y, mo - 1, d);
        next.setHours(0, 0, 0, 0);
        if (next.getFullYear() !== y || next.getMonth() !== mo - 1 || next.getDate() !== d) return;
        setCalendarView('day');
        setSelectedDate(next);
      };

      if (s) applyYmd(s);
      else if (aid) setCalendarView('day');

      if (aid) pendingFocusAppointmentIdRef.current = aid;

      if (!s && aid) {
        void (async () => {
          try {
            const bid = getBusinessId();
            const { data } = await supabase
              .from('appointments')
              .select('slot_date')
              .eq('id', aid)
              .eq('business_id', bid)
              .maybeSingle();
            const sd = data?.slot_date;
            const ymd = typeof sd === 'string' && sd.length >= 10 ? sd.slice(0, 10) : '';
            if (ymd) applyYmd(ymd);
          } catch {
            /* keep day view + current date */
          }
        })();
      }

      router.setParams({ focusDate: undefined, focusAppointmentId: undefined });
    }, [params.focusDate, params.focusAppointmentId, router, setCalendarView])
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [appointments, setAppointments] = useState<AvailableTimeSlot[]>([]);
  const [dayStart, setDayStart] = useState<string>('07:00');
  const [dayEnd, setDayEnd] = useState<string>('21:00');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AvailableTimeSlot | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());
  /** Booked appointments per day (barber scope) — month grid badge */
  const [appointmentCountsByDate, setAppointmentCountsByDate] = useState<Record<string, number>>({});
  const [monthDayModalDate, setMonthDayModalDate] = useState<string | null>(null);
  const [modalDayAppointments, setModalDayAppointments] = useState<AvailableTimeSlot[]>([]);
  const [modalDayConstraints, setModalDayConstraints] = useState<BusinessConstraint[]>([]);
  const [modalDayLoading, setModalDayLoading] = useState(false);
  const [actionsModal, setActionsModal] = useState<{
    open: boolean;
    appointment: AvailableTimeSlot | null;
    anchor: AnchorRect | null;
  }>({ open: false, appointment: null, anchor: null });

  const dayAptRefMap = useRef<Map<string, View>>(new Map());

  const registerDayAptRef = useCallback((id: string, node: View | null) => {
    if (node) dayAptRefMap.current.set(id, node);
    else dayAptRefMap.current.delete(id);
  }, []);
  const [rangeAppointments, setRangeAppointments] = useState<Map<string, AvailableTimeSlot[]>>(new Map());
  const [rangeConstraints, setRangeConstraints] = useState<Map<string, BusinessConstraint[]>>(new Map());
  /** שעות פתיחה לפי יום בשבוע (0–6) — לזיהוי יום שחסום לחלוטין באילוצים */
  const [weeklyHoursByDow, setWeeklyHoursByDow] = useState<
    Map<number, { startMin: number; endMin: number; active: boolean }>
  >(new Map());
  const [calendarReminders, setCalendarReminders] = useState<CalendarReminder[]>([]);
  const [rangeReminders, setRangeReminders] = useState<Map<string, CalendarReminder[]>>(new Map());
  const [dayConstraints, setDayConstraints] = useState<BusinessConstraint[]>([]);
  const [monthConstraintDates, setMonthConstraintDates] = useState<Set<string>>(new Set());

  const [showCalendarFabSheet, setShowCalendarFabSheet] = useState(false);
  const [showReminderEditor, setShowReminderEditor] = useState(false);
  const [showConstraintsModal, setShowConstraintsModal] = useState(false);
  const [constraintToEdit, setConstraintToEdit] = useState<BusinessConstraint | null>(null);

  const reminderFabPanelStyle = useMemo(() => {
    /** When open, center on screen (wrapper uses flex center); keep FAB anchor only while collapsed */
    if (showCalendarFabSheet) {
      return { position: 'relative' as const };
    }

    if (!reminderOverlayWin) {
      return {
        left: 16,
        right: undefined,
        bottom: insets.bottom + 12,
      };
    }

    if (plusAnchorWindow) {
      const bottomAlign =
        reminderOverlayWin.y +
        reminderOverlayWin.height -
        plusAnchorWindow.y -
        plusAnchorWindow.height;
      return {
        left: Math.max(0, plusAnchorWindow.x - reminderOverlayWin.x),
        right: undefined,
        bottom: Math.max(0, bottomAlign),
      };
    }

    return {
      left: 16,
      right: undefined,
      bottom: insets.bottom + 12,
    };
  }, [showCalendarFabSheet, plusAnchorWindow, reminderOverlayWin, insets.bottom]);

  const reminderExternalAnchorSize = useMemo(
    () =>
      plusAnchorWindow
        ? { width: plusAnchorWindow.width, height: plusAnchorWindow.height }
        : null,
    [plusAnchorWindow]
  );

  const [reminderEditorEditing, setReminderEditorEditing] = useState<CalendarReminder | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);

  const selectedDateStr = useMemo(() => {
    // Build YYYY-MM-DD in local time to avoid UTC shift
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  const loadAppointmentsForDate = useCallback(
    async (dateString: string, isRefresh: boolean = false, quiet: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else if (!quiet) {
        setIsLoading(true);
      }

      // Fix any existing appointments with null service_name first
      await businessHoursApi.fixNullServiceNames();

      // Ensure slots exist for the day (idempotent and will not override booked ones)
      await businessHoursApi.generateTimeSlotsForDate(dateString);

      let query = supabase
        .from('appointments')
        .select('*')
        .eq('slot_date', dateString)
        .eq('is_available', false); // booked only

      // סינון לפי המשתמש הנוכחי - רק תורים שהוא יצר
      if (user?.id) {
        query = query.eq('barber_id', user.id);
      }

      const { data, error } = await query.order('slot_time', { ascending: true });

      if (error) {
        console.error('Error loading appointments for date:', error);
        setAppointments([]);
      } else {
        setAppointments((data as unknown as AvailableTimeSlot[]) || []);
      }

      if (user?.id) {
        const rem = await listCalendarRemindersForDate(dateString, user.id);
        setCalendarReminders(rem);
        try {
          const cons = await businessConstraintsApi.getPersonalConstraintsForBarberInRange(dateString, dateString, user.id);
          setDayConstraints(cons);
        } catch {
          setDayConstraints([]);
        }
      } else {
        setCalendarReminders([]);
        setDayConstraints([]);
      }
    } catch (e) {
      console.error('Error in loadAppointmentsForDate:', e);
      setAppointments([]);
      setCalendarReminders([]);
      setDayConstraints([]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else if (!quiet) {
        setIsLoading(false);
      }
    }
  },
  [user?.id]
);

  const loadAppointmentsForRange = useCallback(
    async (startDateStr: string, endDateStr: string) => {
      try {
        if (!user?.id) {
          setRangeAppointments(new Map());
          setRangeReminders(new Map());
          setRangeConstraints(new Map());
          return;
        }
        const { data, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('is_available', false)
          .eq('barber_id', user.id)
          .gte('slot_date', startDateStr)
          .lte('slot_date', endDateStr)
          .order('slot_date', { ascending: true })
          .order('slot_time', { ascending: true });

        if (error) {
          console.error('Error loading range appointments:', error);
          setRangeAppointments(new Map());
          setRangeReminders(new Map());
          setRangeConstraints(new Map());
        } else {
          const map = new Map<string, AvailableTimeSlot[]>();
          ((data as unknown as AvailableTimeSlot[]) || []).forEach((apt) => {
            const key = (apt as any).slot_date as string;
            if (!key) return;
            const arr = map.get(key) ?? [];
            arr.push(apt);
            map.set(key, arr);
          });
          setRangeAppointments(map);
        }

        const remList = await listCalendarRemindersForRange(startDateStr, endDateStr, user.id);
        const rmap = new Map<string, CalendarReminder[]>();
        remList.forEach((r) => {
          const key = r.event_date;
          if (!key) return;
          const arr = rmap.get(key) ?? [];
          arr.push(r);
          rmap.set(key, arr);
        });
        setRangeReminders(rmap);

        try {
          const cons = await businessConstraintsApi.getPersonalConstraintsForBarberInRange(startDateStr, endDateStr, user.id);
          const cmap = new Map<string, BusinessConstraint[]>();
          cons.forEach((c) => {
            const arr = cmap.get(c.date) ?? [];
            arr.push(c);
            cmap.set(c.date, arr);
          });
          setRangeConstraints(cmap);
        } catch {
          setRangeConstraints(new Map());
        }
      } catch (e) {
        console.error('Error in loadAppointmentsForRange:', e);
        setRangeAppointments(new Map());
        setRangeReminders(new Map());
        setRangeConstraints(new Map());
      }
    },
    [user?.id]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setWeeklyHoursByDow(new Map());
        return;
      }
      try {
        const businessId = getBusinessId();
        const [{ data: userBh }, { data: globalBh }] = await Promise.all([
          supabase
            .from('business_hours')
            .select('day_of_week,start_time,end_time,is_active')
            .eq('business_id', businessId)
            .eq('user_id', user.id),
          supabase
            .from('business_hours')
            .select('day_of_week,start_time,end_time,is_active')
            .eq('business_id', businessId)
            .is('user_id', null),
        ]);
        if (cancelled) return;
        const u = (userBh || []) as {
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_active: boolean;
        }[];
        const g = (globalBh || []) as typeof u;
        const map = new Map<number, { startMin: number; endMin: number; active: boolean }>();
        for (let dow = 0; dow <= 6; dow++) {
          const uRow = u.find((r) => r.day_of_week === dow && r.is_active);
          const gRow = g.find((r) => r.day_of_week === dow && r.is_active);
          const row = uRow || gRow;
          if (!row) {
            map.set(dow, { startMin: 0, endMin: 0, active: false });
            continue;
          }
          map.set(dow, {
            startMin: constraintTimeToMinutesFromApi(row.start_time),
            endMin: constraintTimeToMinutesFromApi(row.end_time),
            active: true,
          });
        }
        setWeeklyHoursByDow(map);
      } catch {
        if (!cancelled) setWeeklyHoursByDow(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    // Load business hours for selected day to drive the grid
    const loadBH = async () => {
      try {
        const dow = selectedDate.getDay();
        const businessId = getBusinessId();

        // Prefer user-specific hours for this day, then fallback to business default (user_id null)
        let start: string | null = null;
        let end: string | null = null;

        if (user?.id) {
          const { data: bhUser, error: eUser } = await supabase
            .from('business_hours')
            .select('start_time,end_time,is_active')
            .eq('business_id', businessId)
            .eq('day_of_week', dow)
            .eq('user_id', user.id)
            .maybeSingle();
          if (!eUser && bhUser && bhUser.is_active) {
            start = (bhUser.start_time as any) ?? null;
            end = (bhUser.end_time as any) ?? null;
          }
        }

        if (!start || !end) {
          const { data: bhGlobal } = await supabase
            .from('business_hours')
            .select('start_time,end_time,is_active')
            .eq('business_id', businessId)
            .eq('day_of_week', dow)
            .is('user_id', null)
            .maybeSingle();
          if (bhGlobal && bhGlobal.is_active) {
            start = (start ?? (bhGlobal.start_time as any)) ?? null;
            end = (end ?? (bhGlobal.end_time as any)) ?? null;
          }
        }

        setDayStart((start as string) || '07:00');
        setDayEnd((end as string) || '21:00');
      } catch (e) {
        setDayStart('07:00');
        setDayEnd('21:00');
      }
    };
    loadBH();
    void loadAppointmentsForDate(selectedDateStr, false, calendarView === 'month');
  }, [selectedDate, selectedDateStr, loadAppointmentsForDate, calendarView]);

  const reloadMonthMarks = useCallback(async () => {
    try {
      if (!user?.id) {
        setMarkedDates(new Set());
        setAppointmentCountsByDate({});
        setMonthConstraintDates(new Set());
        return;
      }

      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      const firstOfMonth = new Date(year, month, 1);
      firstOfMonth.setHours(0, 0, 0, 0);
      const firstOfNextMonth = new Date(year, month + 1, 1);
      firstOfNextMonth.setHours(0, 0, 0, 0);

      const fmt = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${da}`;
      };

      const { data, error } = await supabase
        .from('appointments')
        .select('slot_date')
        .eq('is_available', false)
        .eq('barber_id', user.id)
        .gte('slot_date', fmt(firstOfMonth))
        .lt('slot_date', fmt(firstOfNextMonth));

      if (error) {
        console.error('Error loading month marks:', error);
        setMarkedDates(new Set());
        setAppointmentCountsByDate({});
        return;
      }

      const counts: Record<string, number> = {};
      (data as any[] | null)?.forEach((r: any) => {
        const k = r.slot_date as string;
        if (!k) return;
        counts[k] = (counts[k] ?? 0) + 1;
      });
      setAppointmentCountsByDate(counts);

      const unique = new Set<string>(Object.keys(counts));
      const reminderDates = await listCalendarReminderDatesInMonth(year, month, user.id);
      reminderDates.forEach((d) => unique.add(d));

      const monthEnd = new Date(year, month + 1, 0);
      monthEnd.setHours(0, 0, 0, 0);
      try {
        const constraintRows = await businessConstraintsApi.getPersonalConstraintsForBarberInRange(
          fmt(firstOfMonth),
          fmt(monthEnd),
          user.id
        );
        constraintRows.forEach((r) => unique.add(r.date));
      } catch {
        /* ignore */
      }

      setMarkedDates(unique);
    } catch (e) {
      console.error('Error in reloadMonthMarks:', e);
      setMarkedDates(new Set());
      setAppointmentCountsByDate({});
    }
  }, [selectedDate, user?.id]);

  const reloadWideConstraintDates = useCallback(async () => {
    if (!user?.id) {
      setMonthConstraintDates(new Set());
      return;
    }
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 13, 0);
      end.setHours(0, 0, 0, 0);
      const rows = await businessConstraintsApi.getPersonalConstraintsForBarberInRange(
        _formatLocalYyyyMmDd(start),
        _formatLocalYyyyMmDd(end),
        user.id
      );
      setMonthConstraintDates(new Set(rows.map((r) => r.date)));
    } catch {
      setMonthConstraintDates(new Set());
    }
  }, [user?.id]);

  useEffect(() => {
    if (calendarView !== 'month') return;
    void reloadWideConstraintDates();
  }, [calendarView, reloadWideConstraintDates]);

  useEffect(() => {
    void reloadMonthMarks();
  }, [reloadMonthMarks]);

  useEffect(() => {
    if (!monthDayModalDate || !user?.id) {
      setModalDayAppointments([]);
      setModalDayConstraints([]);
      setModalDayLoading(false);
      return;
    }
    let alive = true;
    setModalDayLoading(true);
    (async () => {
      const [{ data, error }, cons] = await Promise.all([
        supabase
          .from('appointments')
          .select('*')
          .eq('slot_date', monthDayModalDate)
          .eq('is_available', false)
          .eq('barber_id', user.id)
          .order('slot_time', { ascending: true }),
        businessConstraintsApi.getPersonalConstraintsForBarberInRange(monthDayModalDate, monthDayModalDate, user.id),
      ]);
      if (!alive) return;
      if (error) {
        console.error('Error loading modal day appointments:', error);
        setModalDayAppointments([]);
      } else {
        setModalDayAppointments((data as unknown as AvailableTimeSlot[]) || []);
      }
      setModalDayConstraints(cons);
      setModalDayLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [monthDayModalDate, user?.id]);

  // Scroll to morning by default for convenience
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedDateStr, dayStart]);

  const onRefresh = useCallback(() => {
    void loadAppointmentsForDate(selectedDateStr, true, calendarView === 'month');
    if (calendarView === 'month') {
      void reloadMonthMarks();
      void reloadWideConstraintDates();
    }
  }, [loadAppointmentsForDate, selectedDateStr, calendarView, reloadMonthMarks, reloadWideConstraintDates]);

  // Helpers for the time grid
  const minutesFromMidnight = (time?: string | null): number => {
    if (!time) return 0;
    const parts = String(time).split(':');
    const hh = parseInt(parts[0] || '0', 10);
    const mm = parseInt(parts[1] || '0', 10);
    return hh * 60 + mm;
  };

  const formatTime = (time?: string | null): string => {
    if (!time) return '';
    return formatTime12Hour(time);
  };

  const addMinutes = (hhmm: string, minutes: number): string => {
    const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
    const total = h * 60 + m + minutes;
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const compareTimes = (a: string, b: string) => a.localeCompare(b);

  const halfHourLabels = useMemo(() => {
    const labels: string[] = [];
    let t = dayStart;
    while (compareTimes(t, dayEnd) < 0) {
      labels.push(formatTime(t));
      t = addMinutes(t, 30);
    }
    return labels;
  }, [dayStart, dayEnd]);

  const displayDayConstraints = useMemo(
    () => mergeConstraintsForDisplay(dayConstraints),
    [dayConstraints]
  );

  const dayViewLaneMetrics = useMemo(() => {
    const mid = 2;
    const stripW = _screenWidth - DAY_TIMELINE_MARGIN_H * 2 - LABELS_WIDTH - 16;
    const halfW = Math.max(52, (stripW - mid) / 2);
    return { mid, halfW, leftBase: LABELS_WIDTH + 8 };
  }, []);

  const dayReminderOverlapsAppointment = useMemo(() => {
    const ids = new Set<string>();
    for (const r of calendarReminders) {
      const rs = minutesFromMidnight(r.start_time);
      const rd = r.duration_minutes || 30;
      const hit = appointments.some((apt) =>
        _calendarRangesOverlapMinutes(rs, rd, minutesFromMidnight(apt.slot_time), apt.duration_minutes || 30)
      );
      if (hit) ids.add(r.id);
    }
    return ids;
  }, [calendarReminders, appointments, minutesFromMidnight]);

  const dayAppointmentOverlapsReminder = useMemo(() => {
    const ids = new Set<string>();
    for (const apt of appointments) {
      const aStart = minutesFromMidnight(apt.slot_time);
      const aDur = apt.duration_minutes || 30;
      const hit = calendarReminders.some((r) =>
        _calendarRangesOverlapMinutes(
          minutesFromMidnight(r.start_time),
          r.duration_minutes || 30,
          aStart,
          aDur
        )
      );
      if (hit) ids.add(String(apt.id));
    }
    return ids;
  }, [calendarReminders, appointments, minutesFromMidnight]);

  const displayModalConstraints = useMemo(
    () => mergeConstraintsForDisplay(modalDayConstraints),
    [modalDayConstraints]
  );

  const gridDays = useMemo((): DayBlock[] => {
    if (calendarView === 'week') {
      const start = _getStartOfWeek(selectedDate);
      const days = _buildDays(start, 7);
      // Hebrew / RTL week in LTR grid: שבת משמאל, א׳ מימין ליד עמודת השעות (זרימת שבוע מימין לשמאל).
      return weekGridReverseDays ? [...days].reverse() : days;
    }
    return [];
  }, [selectedDateStr, calendarView, weekGridReverseDays]);

  /** טווח תאריכים כרונולוגי לשאילתות — `gridDays` יכול להיות הפוך לתצוגה (ש׳…א׳) */
  const weekRangeChronoBounds = useMemo(() => {
    if (gridDays.length === 0) return null;
    const sorted = [...gridDays].sort((a, b) => a.formatted.localeCompare(b.formatted));
    return { start: sorted[0]!.formatted, end: sorted[sorted.length - 1]!.formatted };
  }, [gridDays]);

  /** Week that contains selectedDate — used to refresh week-range data even when calendar is on month/day */
  const selectedWeekChronoRange = useMemo(() => {
    const wkStart = _getStartOfWeek(selectedDate);
    const days = _buildDays(wkStart, 7);
    const sorted = [...days].sort((a, b) => a.formatted.localeCompare(b.formatted));
    return { start: sorted[0]!.formatted, end: sorted[sorted.length - 1]!.formatted };
  }, [selectedDateStr, selectedDate]);

  const gridDims = useMemo(() => {
    const sw = Dimensions.get('window').width;
    const cols = 7;
    const timeCol = 48;
    const inner = sw - timeCol;
    // For week view, enforce a minimum width per day so cards are readable; enables horizontal scroll
    const minDaySize = 82;
    const daySize = Math.max(inner / cols, minDaySize);
    const hourSize = 72;
    return { cols, daySize, hourSize, timeCol, padBottom: hourSize * 2 };
  }, []);

  useEffect(() => {
    if (calendarView !== 'week') return;
    if (!weekRangeChronoBounds) return;
    void loadAppointmentsForRange(weekRangeChronoBounds.start, weekRangeChronoBounds.end);
  }, [calendarView, weekRangeChronoBounds, loadAppointmentsForRange]);

  const nowLineOffsetY = useMemo(() => {
    if (calendarView !== 'day') return null;
    if (selectedDateStr !== _formatLocalYyyyMmDd(new Date())) return null;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const d0 = minutesFromMidnight(dayStart);
    const offset = mins - d0;
    if (offset < 0 || halfHourLabels.length === 0) return null;
    const maxM = halfHourLabels.length * 30;
    if (offset > maxM) return null;
    return (offset / 30) * HALF_HOUR_BLOCK_HEIGHT + HALF_HOUR_BLOCK_HEIGHT / 2;
  }, [calendarView, selectedDateStr, dayStart, halfHourLabels.length]);

  const hoursScrollViewRef = useAnimatedRef<any>();
  const flashListRef = useRef<any>(null);
  const scrollX = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const onScrollX = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  /** ממקם את עמודת היום הנבחר באזור הגלילה (במקום קצה RTL/LTR קבוע). */
  const scrollWeekGridToSelectedColumn = useCallback(() => {
    if (calendarView !== 'week' || gridDays.length === 0) return;
    const idx = gridDays.findIndex((d) => d.formatted === selectedDateStr);
    if (idx < 0) return;
    const sw = Dimensions.get('window').width;
    const visibleWidth = sw - gridDims.timeCol;
    const colW = gridDims.daySize;
    const totalWidth = gridDays.length * colW;
    const maxOffset = Math.max(0, totalWidth - visibleWidth);
    const targetCenter = idx * colW + colW / 2;
    let offset = targetCenter - visibleWidth / 2;
    offset = Math.max(0, Math.min(maxOffset, offset));
    scrollX.value = offset;
    requestAnimationFrame(() => {
      flashListRef.current?.scrollToOffset({ offset, animated: false });
    });
  }, [calendarView, gridDays, selectedDateStr, gridDims.daySize, gridDims.timeCol]);

  useEffect(() => {
    const timer = setTimeout(() => scrollWeekGridToSelectedColumn(), 0);
    return () => clearTimeout(timer);
  }, [scrollWeekGridToSelectedColumn]);
  const headerStylez = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: -scrollX.value }],
    };
  });
  const onScrollY = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    setNativeProps(hoursScrollViewRef, {
      contentOffset: { x: 0, y: scrollY.value },
    });
  });

  // Actions
  const startPhoneCall = useCallback(async (rawPhone?: string | null) => {
    if (!rawPhone) {
      Alert.alert(t('appointments.noPhone.title','No phone number'), t('appointments.noPhone.message','No valid phone number was found for this client.'));
      return;
    }
    // Sanitize phone: keep + and digits
    const phone = rawPhone.trim().replace(/[^+\d]/g, '');
    if (!phone) {
      Alert.alert(t('appointments.noPhone.title','No phone number'), t('appointments.noPhone.message','No valid phone number was found for this client.'));
      return;
    }

    const iosUrl = `tel:${phone}`; // iOS handles confirmation UI
    const androidUrl = `tel:${phone}`;
    const url = Platform.OS === 'android' ? androidUrl : iosUrl;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(t('error.generic','Error'), t('common.phoneOpenFailed','Unable to open the dialer on this device'));
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.error('Failed to initiate phone call:', e);
      Alert.alert(t('error.generic','Error'), t('common.phoneOpenFailed','Unable to open the dialer on this device'));
    }
  }, []);

  const askCancelAppointment = useCallback((apt: AvailableTimeSlot) => {
    // Ensure immediate responsiveness between consecutive presses
    setSelectedAppointment(apt);
    setShowCancelModal(true);
  }, []);

  const openActionsMenu = useCallback((apt: AvailableTimeSlot, anchor?: AnchorRect) => {
    setActionsModal({
      open: true,
      appointment: apt,
      anchor: anchor ?? getDefaultAppointmentAnchorRect(),
    });
  }, []);

  const openActionsMenuFromRefMap = useCallback(
    (apt: AvailableTimeSlot, map: React.MutableRefObject<Map<string, View>>) => {
      const v = map.current.get(apt.id);
      if (v && typeof (v as View).measureInWindow === 'function') {
        try {
          (v as View).measureInWindow((x, y, width, height) => {
            if (width > 0 && height > 0) {
              openActionsMenu(apt, { x, y, width, height });
            } else {
              openActionsMenu(apt);
            }
          });
        } catch {
          openActionsMenu(apt);
        }
      } else {
        openActionsMenu(apt);
      }
    },
    [openActionsMenu]
  );

  useEffect(() => {
    const id = pendingFocusAppointmentIdRef.current;
    if (!id || calendarView !== 'day') return;
    if (isLoading) return;
    const apt = appointments.find((a) => a.id === id);
    if (apt) {
      pendingFocusAppointmentIdRef.current = null;
      requestAnimationFrame(() => openActionsMenu(apt));
      return;
    }
    pendingFocusAppointmentIdRef.current = null;
  }, [appointments, isLoading, calendarView, openActionsMenu]);

  const requestCloseActionsModal = useCallback(() => {
    setActionsModal((prev) => (prev.appointment && prev.open ? { ...prev, open: false } : prev));
  }, []);

  const onActionsModalDismissed = useCallback(() => {
    setActionsModal({ open: false, appointment: null, anchor: null });
  }, []);

  /** Week view reads from rangeAppointments — keep it in sync after cancel/delete */
  const removeBookedFromRangeMap = useCallback((id: string, slotDate: string) => {
    setRangeAppointments((prev) => {
      const next = new Map(prev);
      const arr = next.get(slotDate);
      if (!arr) return prev;
      const filtered = arr.filter((a) => a.id !== id);
      if (filtered.length === 0) next.delete(slotDate);
      else next.set(slotDate, filtered);
      return next;
    });
  }, []);

  const confirmCancelAppointment = useCallback(async () => {
    if (!selectedAppointment) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          is_available: true,
          client_name: null,
          client_phone: null,
          service_name: 'Available Slot', // Set to default value instead of null
        })
        .eq('id', selectedAppointment.id)
        .eq('is_available', false);

      if (error) {
        console.error('Error canceling appointment:', error);
      } else {
        try {
          await checkWaitlistAndNotify(selectedAppointment);
          await notifyServiceWaitlistClients(selectedAppointment);
        } catch (e) {}
        const dateKey = String((selectedAppointment as any).slot_date ?? '');
        setAppointments((prev) => prev.filter((a) => a.id !== selectedAppointment.id));
        if (dateKey) removeBookedFromRangeMap(selectedAppointment.id, dateKey);
        setShowCancelModal(false);
        setSelectedAppointment(null);
        void reloadMonthMarks();
        if (monthDayModalDate && dateKey === monthDayModalDate) {
          setModalDayAppointments((prev) => prev.filter((a) => a.id !== selectedAppointment.id));
        }
      }
    } catch (e) {
      console.error('Error in confirmCancelAppointment:', e);
    } finally {
      setIsCancelling(false);
    }
  }, [selectedAppointment, removeBookedFromRangeMap, reloadMonthMarks, monthDayModalDate]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<AvailableTimeSlot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const askDeleteAppointment = useCallback((apt: AvailableTimeSlot) => {
    setAppointmentToDelete(apt);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAppointment = useCallback(async () => {
    if (!appointmentToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentToDelete.id)
        .eq('business_id', appointmentToDelete.business_id);

      if (error) {
        console.error('Error deleting appointment:', error);
      } else {
        const dateKey = String((appointmentToDelete as any).slot_date ?? '');
        setAppointments((prev) => prev.filter((a) => a.id !== appointmentToDelete.id));
        if (dateKey) removeBookedFromRangeMap(appointmentToDelete.id, dateKey);
        setShowDeleteModal(false);
        setAppointmentToDelete(null);
        requestCloseActionsModal();
        void reloadMonthMarks();
        if (monthDayModalDate && dateKey === monthDayModalDate) {
          setModalDayAppointments((prev) => prev.filter((a) => a.id !== appointmentToDelete.id));
        }
      }
    } catch (e) {
      console.error('Error in confirmDeleteAppointment:', e);
    } finally {
      setIsDeleting(false);
    }
  }, [appointmentToDelete, removeBookedFromRangeMap, requestCloseActionsModal, reloadMonthMarks, monthDayModalDate]);

  const closeReminderModal = useCallback(() => {
    setShowCalendarFabSheet(false);
  }, []);

  const closeReminderEditor = useCallback(() => {
    setShowReminderEditor(false);
    setReminderEditorEditing(null);
  }, []);

  const onCalendarFabPickReminder = useCallback(() => {
    setReminderEditorEditing(null);
    setShowCalendarFabSheet(false);
    setShowReminderEditor(true);
  }, []);

  const onCalendarFabPickAppointment = useCallback(() => {
    setShowCalendarFabSheet(false);
    router.push({
      pathname: '/(tabs)/add-appointment',
      params: { date: selectedDateStr },
    } as unknown as Parameters<typeof router.push>[0]);
  }, [router, selectedDateStr]);

  const onCalendarFabPickConstraints = useCallback(() => {
    setShowCalendarFabSheet(false);
    setShowConstraintsModal(true);
  }, []);

  const handleAddAppointmentModalSuccess = useCallback(() => {
    void loadAppointmentsForDate(selectedDateStr, true, calendarView === 'month');
    if (calendarView === 'month') {
      void reloadMonthMarks();
    }
    if (user?.id) {
      void loadAppointmentsForRange(selectedWeekChronoRange.start, selectedWeekChronoRange.end);
    }
  }, [
    loadAppointmentsForDate,
    selectedDateStr,
    calendarView,
    reloadMonthMarks,
    loadAppointmentsForRange,
    selectedWeekChronoRange,
    user?.id,
  ]);

  const onCalendarConstraintsChanged = useCallback(
    (payload?: { dateMin: string; dateMax: string }) => {
      void loadAppointmentsForDate(selectedDateStr, false, calendarView === 'month');
      if (calendarView === 'month') {
        void reloadMonthMarks();
        void reloadWideConstraintDates();
      }
      if (!user?.id) return;
      const merged = mergeCalendarRefreshRange(selectedWeekChronoRange, payload);
      void loadAppointmentsForRange(merged.start, merged.end);
    },
    [
      loadAppointmentsForDate,
      selectedDateStr,
      calendarView,
      reloadMonthMarks,
      reloadWideConstraintDates,
      loadAppointmentsForRange,
      user?.id,
      selectedWeekChronoRange,
    ]
  );

  const openConstraintEditor = useCallback((c: BusinessConstraint) => {
    setConstraintToEdit(c);
  }, []);

  useEffect(() => {
    if (
      (!showCalendarFabSheet && !showConstraintsModal && !showReminderEditor && !constraintToEdit) ||
      Platform.OS !== 'android'
    )
      return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (constraintToEdit) {
        setConstraintToEdit(null);
        return true;
      }
      if (showReminderEditor) {
        closeReminderEditor();
        return true;
      }
      closeReminderModal();
      setShowConstraintsModal(false);
      return true;
    });
    return () => sub.remove();
  }, [
    showCalendarFabSheet,
    showConstraintsModal,
    showReminderEditor,
    constraintToEdit,
    closeReminderModal,
    closeReminderEditor,
  ]);

  const reminderFabTabPress = useCallback(() => {
    if (constraintToEdit) {
      setConstraintToEdit(null);
      return;
    }
    if (showConstraintsModal) {
      setShowConstraintsModal(false);
      return;
    }
    if (showReminderEditor) {
      closeReminderEditor();
      return;
    }
    if (showCalendarFabSheet) {
      closeReminderModal();
    } else {
      setShowCalendarFabSheet(true);
    }
  }, [
    showCalendarFabSheet,
    showConstraintsModal,
    showReminderEditor,
    constraintToEdit,
    closeReminderModal,
    closeReminderEditor,
  ]);

  useEffect(() => {
    setReminderFabRegistration({
      isOpen:
        showCalendarFabSheet ||
        showConstraintsModal ||
        showReminderEditor ||
        !!constraintToEdit,
      onPress: reminderFabTabPress,
    });
    return () => setReminderFabRegistration(null);
  }, [
    showCalendarFabSheet,
    showConstraintsModal,
    showReminderEditor,
    constraintToEdit,
    reminderFabTabPress,
    setReminderFabRegistration,
  ]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(ADMIN_CALENDAR_APPOINTMENTS_CHANGED, () => {
      handleAddAppointmentModalSuccess();
    });
    return () => sub.remove();
  }, [handleAddAppointmentModalSuccess]);

  const openEditReminderModal = useCallback((r: CalendarReminder) => {
    setReminderEditorEditing(r);
    setShowCalendarFabSheet(false);
    setShowReminderEditor(true);
  }, []);

  const refreshCalendarRemindersOnly = useCallback(async () => {
    if (!user?.id) return;
    const rem = await listCalendarRemindersForDate(selectedDateStr, user.id);
    setCalendarReminders(rem);
    if (calendarView === 'month') {
      void reloadMonthMarks();
    }
    void loadAppointmentsForRange(selectedWeekChronoRange.start, selectedWeekChronoRange.end);
  }, [
    user?.id,
    selectedDateStr,
    calendarView,
    selectedWeekChronoRange,
    reloadMonthMarks,
    loadAppointmentsForRange,
  ]);

  const calendarPrimary = businessColors.primary || GC_BLUE;
  const calendarSecondary = businessColors.secondary || calendarPrimary;
  const calendarRipple = `${calendarPrimary}2A`;

  const adminMonthAnchorKey = useMemo(
    () => `${selectedDate.getFullYear()}-${selectedDate.getMonth()}`,
    [selectedDate]
  );

  const onAdminCalendarMonthVisible = useCallback((monthFirstDay: Date) => {
    setSelectedDate((prev) => {
      const y = monthFirstDay.getFullYear();
      const m = monthFirstDay.getMonth();
      const lastD = new Date(y, m + 1, 0).getDate();
      const day = Math.min(prev.getDate(), lastD);
      const d = new Date(y, m, day);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }, []);

  const onAdminCalendarDayPress = useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setMonthDayModalDate(_formatLocalYyyyMmDd(d));
  }, []);

  const onAdminCalendarJumpToDate = useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  }, []);

  return (
    <View style={[styles.gcRoot, calendarView === 'month' && styles.gcRootMonth]}>
      {calendarView === 'day' ? (
        <View style={{ paddingTop: insets.top }}>
          <DaySelector
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            mode="week"
            markedDates={markedDates}
          />
        </View>
      ) : (
        <View
          style={[
            styles.gcTopChrome,
            { paddingTop: insets.top },
            calendarView === 'month' && styles.gcTopChromeMonth,
          ]}
        >
          <View style={[styles.gcHeader, calendarView === 'month' && styles.gcHeaderMonth]}>
            {calendarView === 'week' ? (
              <View
                style={[
                  styles.gcNavTrack,
                  { flexDirection: isRtl ? 'row-reverse' : 'row' },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={String(t('admin.appointments.navPrev'))}
                  onPress={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 7);
                    d.setHours(0, 0, 0, 0);
                    /** לא להשאיר את אותו יום בשבוע מסומן — ראשון השבוע (כמו ב־grid) */
                    setSelectedDate(_getStartOfWeek(d));
                  }}
                  android_ripple={{ color: calendarRipple, borderless: false }}
                  style={({ pressed }) => [
                    styles.gcNavCircleBtn,
                    Platform.OS === 'ios' && pressed && styles.gcNavCircleBtnPressedIos,
                  ]}
                >
                  <ChevronRight size={22} color={calendarPrimary} strokeWidth={2.5} />
                </Pressable>
                <View style={styles.gcMonthTitleWrap} pointerEvents="none">
                  <Text style={styles.gcMonthTitle} numberOfLines={1}>
                    {_formatGregorianWeekRange(selectedDate)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={String(t('admin.appointments.navNext'))}
                  onPress={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 7);
                    d.setHours(0, 0, 0, 0);
                    setSelectedDate(_getStartOfWeek(d));
                  }}
                  android_ripple={{ color: calendarRipple, borderless: false }}
                  style={({ pressed }) => [
                    styles.gcNavCircleBtn,
                    Platform.OS === 'ios' && pressed && styles.gcNavCircleBtnPressedIos,
                  ]}
                >
                  <ChevronLeft size={22} color={calendarPrimary} strokeWidth={2.5} />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {isLoading && calendarView !== 'month' ? (
        <View style={styles.loaderContainer}>
          <AppointmentsCalendarLoader
            accentColor={calendarPrimary}
            message={String(
              i18n.t('admin.appointments.loadingForDate', {
                lng: 'he',
                defaultValue: 'טוען תורים עבור {{date}}...',
                date: selectedDateStr,
              })
            )}
          />
        </View>
      ) : (
        <>
          {calendarView === 'week' ? (
            <View style={weekStyles.container}>
              <View style={weekStyles.row}>
                <Animated.ScrollView
                  ref={hoursScrollViewRef}
                  style={[weekStyles.hoursCol, { width: gridDims.timeCol, marginTop: gridDims.hourSize }]}
                  contentContainerStyle={{ paddingBottom: gridDims.padBottom }}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                >
                  {_hourBlocks.map((hourBlock, idx) => {
                    const hourDate = hourBlock.toDate();
                    const h = hourDate.getHours();
                    return (
                      <View key={`wk-hour-${idx}`} style={[weekStyles.hourRow, { height: gridDims.hourSize }]}>
                        <Text style={[weekStyles.hourText, h === 0 && { opacity: 0 }]}>
                          {_formatHebrewTimeLabel(hourDate)}
                        </Text>
                      </View>
                    );
                  })}
                </Animated.ScrollView>

                <View style={[weekStyles.gridOuter, { direction: 'ltr' } as any]}>
                  <Animated.View style={[weekStyles.headerRow, headerStylez]}>
                    {gridDays.map((d) => (
                      <HeaderDay
                        day={d}
                        key={`hdr-${d.formatted}`}
                        columnWidth={gridDims.daySize}
                        headerHeight={gridDims.hourSize}
                        isSelected={d.formatted === selectedDateStr}
                        isToday={d.formatted === _formatLocalYyyyMmDd(new Date())}
                        hasBookings={
                          (rangeAppointments.get(d.formatted)?.length ?? 0) > 0 ||
                          (rangeConstraints.get(d.formatted)?.length ?? 0) > 0
                        }
                        primaryColor={calendarPrimary}
                        onPress={() => setSelectedDate(d.date)}
                      />
                    ))}
                  </Animated.View>

                  <Animated.ScrollView
                    bounces={false}
                    onScroll={onScrollY}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: gridDims.padBottom }}
                  >
                    <AnimatedFlashList
                      ref={flashListRef}
                      data={gridDays}
                      horizontal
                      keyExtractor={(item) => item.formatted}
                      estimatedItemSize={gridDims.daySize}
                      snapToInterval={gridDims.daySize}
                      decelerationRate="fast"
                      bounces={false}
                      contentContainerStyle={{ paddingBottom: gridDims.padBottom }}
                      showsHorizontalScrollIndicator={false}
                      renderItem={({ item, index }) => (
                        <WeekDayColumn
                          day={item}
                          index={index}
                          columnWidth={gridDims.daySize}
                          hourRowHeight={gridDims.hourSize}
                          primaryColor={calendarPrimary}
                          appts={rangeAppointments.get(item.formatted) ?? []}
                          constraints={mergeConstraintsForDisplay(rangeConstraints.get(item.formatted) ?? [])}
                          reminders={rangeReminders.get(item.formatted) ?? []}
                          onOpenAppointment={openActionsMenu}
                          onPressReminder={openEditReminderModal}
                          onPressConstraint={openConstraintEditor}
                          minutesFromMidnight={minutesFromMidnight}
                        />
                      )}
                      onScroll={onScrollX}
                      scrollEventThrottle={16}
                    />
                  </Animated.ScrollView>
                </View>
              </View>
            </View>
          ) : calendarView === 'day' ? (
            <ScrollView
              ref={scrollRef}
              style={[styles.scroll, styles.gcDayScroll]}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="always"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[calendarPrimary]}
                  tintColor={calendarPrimary}
                  title={t('refreshing','Refreshing...')}
                  titleColor={Colors.subtext}
                />
              }
            >
              <View style={styles.timelineContainer}>
                {/* Grid rows for each 30 minutes */}
                {halfHourLabels.map((label, idx) => (
                  <View key={idx} style={[styles.gridRow, { height: HALF_HOUR_BLOCK_HEIGHT }]}>
                    <Text style={styles.timeLabel} numberOfLines={1} adjustsFontSizeToFit={true}>
                      {label}
                    </Text>
                    <View style={styles.gridLine} />
                  </View>
                ))}

                <View pointerEvents="box-none" style={[styles.overlayContainer, { height: halfHourLabels.length * HALF_HOUR_BLOCK_HEIGHT }]}>
                  {displayDayConstraints.map((c) => {
                    const layout = layoutConstraintOnDayGrid(
                      c,
                      dayStart,
                      halfHourLabels.length,
                      HALF_HOUR_BLOCK_HEIGHT,
                      minutesFromMidnight
                    );
                    if (!layout) return null;
                    const { top, height } = layout;
                    const startT = formatTime(String(c.start_time || '').slice(0, 5));
                    const endT = formatTime(String(c.end_time || '').slice(0, 5));
                    return (
                      <PressableScale
                        key={`dc-${c.id}`}
                        onPress={() => openConstraintEditor(c)}
                        accessibilityLabel={String(t('admin.calendar.constraintBlockTitle', 'זמן חסום'))}
                        style={[
                          styles.constraintCard,
                          {
                            top,
                            height: Math.max(height, 44),
                            left: LABELS_WIDTH + 8,
                            right: 8,
                            zIndex: 1,
                            elevation: 1,
                          },
                        ]}
                      >
                        <View style={styles.constraintInner}>
                          <View style={styles.constraintTitleRow}>
                            <Ban size={15} color={CONSTRAINT_BAR} />
                            <Text numberOfLines={2} style={styles.constraintTitleText}>
                              {c.reason?.trim() ||
                                String(t('admin.calendar.constraintBlockTitle', 'זמן חסום'))}
                            </Text>
                          </View>
                          <View style={styles.constraintTimePill}>
                            <Text numberOfLines={1} style={styles.constraintTimeText}>
                              {`${startT} – ${endT}`}
                            </Text>
                            <Ionicons name="ban-outline" size={14} color={CONSTRAINT_BAR} />
                          </View>
                        </View>
                      </PressableScale>
                    );
                  })}
                  {calendarReminders.map((r) => {
                    const aptMinutes = minutesFromMidnight(r.start_time);
                    const dayStartMinutes = minutesFromMidnight(dayStart);
                    const offsetMinutes = aptMinutes - dayStartMinutes;
                    const top = (offsetMinutes / 30) * HALF_HOUR_BLOCK_HEIGHT + HALF_HOUR_BLOCK_HEIGHT / 2;
                    const durationMinutes = r.duration_minutes || 30;
                    const height = (durationMinutes / 30) * HALF_HOUR_BLOCK_HEIGHT;
                    const pal = reminderPalette(r.color_key);
                    const startTime = formatTime(r.start_time);
                    const endTime = formatTime(addMinutes(r.start_time, durationMinutes));
                    const splitDay = dayReminderOverlapsAppointment.has(r.id);
                    return (
                      <PressableScale
                        key={`rm-${r.id}`}
                        onPress={() => openEditReminderModal(r)}
                        accessibilityLabel={tHe('admin.calendarReminder.openEdit', 'עריכת תזכורת')}
                        style={[
                          styles.reminderCard,
                          {
                            top,
                            height: Math.max(height, 44),
                            ...(splitDay
                              ? {
                                  left: dayViewLaneMetrics.leftBase,
                                  width: dayViewLaneMetrics.halfW,
                                }
                              : { left: LABELS_WIDTH + 8, right: 8 }),
                            zIndex: splitDay ? 4 : 2,
                            elevation: splitDay ? 3 : 2,
                            backgroundColor: pal.bg,
                            borderLeftColor: pal.bar,
                          },
                        ]}
                      >
                        <View style={styles.reminderInner}>
                          <View style={styles.reminderTitleRow}>
                            <StickyNote size={16} color={pal.bar} />
                            <Text numberOfLines={2} style={[styles.reminderTitleText, { color: '#1C1C1E' }]}>
                              {r.title}
                            </Text>
                          </View>
                          <View style={styles.reminderTimePill}>
                            <Text numberOfLines={1} style={styles.reminderTimeText}>
                              {`${startTime} – ${endTime}`}
                            </Text>
                            <Ionicons name="notifications-outline" size={14} color={pal.bar} />
                          </View>
                        </View>
                      </PressableScale>
                    );
                  })}
                  {appointments.map((apt) => {
                    // Calculate exact position using minutes from midnight
                    const aptMinutes = minutesFromMidnight(apt.slot_time);
                    const dayStartMinutes = minutesFromMidnight(dayStart);

                    // Calculate the exact offset in minutes from day start
                    const offsetMinutes = aptMinutes - dayStartMinutes;

                    // Convert to precise grid position (30-min per row)
                    // Grid line is centered in each row, so add half-row to align to the line
                    const top = (offsetMinutes / 30) * HALF_HOUR_BLOCK_HEIGHT + HALF_HOUR_BLOCK_HEIGHT / 2;

                    // Calculate height based on duration
                    const durationMinutes = apt.duration_minutes || 30;
                    const height = (durationMinutes / 30) * HALF_HOUR_BLOCK_HEIGHT;

                    const startTime = formatTime(apt.slot_time);
                    const endTime = formatTime(addMinutes(apt.slot_time, durationMinutes));
                    const splitDayApt = dayAppointmentOverlapsReminder.has(String(apt.id));

                    return (
                      <Pressable
                        key={`${apt.id}-${apt.slot_time}`}
                        onPress={() => openActionsMenuFromRefMap(apt, dayAptRefMap)}
                        accessibilityLabel={tHe('admin.appointments.openActions', 'פתח/י אפשרויות לתור')}
                        style={({ pressed }) => [
                          styles.appointmentCard,
                          {
                            top,
                            height,
                            ...(splitDayApt
                              ? {
                                  left:
                                    dayViewLaneMetrics.leftBase +
                                    dayViewLaneMetrics.halfW +
                                    dayViewLaneMetrics.mid,
                                  width: dayViewLaneMetrics.halfW,
                                }
                              : { left: LABELS_WIDTH + 8, right: 8 }),
                            zIndex: 3,
                            elevation: 5,
                            opacity: pressed ? 0.94 : 1,
                          },
                        ]}
                      >
                        <View
                          ref={(n) => registerDayAptRef(apt.id, n)}
                          collapsable={false}
                          style={StyleSheet.absoluteFillObject}
                        >
                          {/* Strong blur background */}
                          <BlurView intensity={95} tint="light" style={styles.appointmentBlur} />
                          <View style={styles.appointmentBlurTint} />
                          {/* Accent bar removed per request */}

                          {/* Content */}
                          <View style={styles.appointmentInner}>
                            <View style={styles.infoContainer}>
                              <BlurView intensity={28} tint="light" style={styles.pillBlur} />
                              <View style={styles.pillTint} />

                              {/* Title row with icons */}
                              <View style={styles.titleRow}>
                                <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.titleText, styles.titleTextFlex]}>
                                  {apt.client_name || 'לקוח'}
                                </Text>
                                <View style={styles.titleIconsRow}>
                                  {!!apt.client_phone && (
                                    <TouchableOpacity
                                      onPress={() => openActionsMenuFromRefMap(apt, dayAptRefMap)}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                      style={styles.phoneIconBtn}
                                    >
                                      <Ionicons name="call" size={14} color={calendarPrimary} />
                                    </TouchableOpacity>
                                  )}
                                  <CheckCircle size={16} color="#34C759" />
                                </View>
                              </View>

                              {/* Service name */}
                              <Text numberOfLines={1} style={styles.serviceNameText}>
                                {apt.service_name || 'שירות'}
                              </Text>

                              {/* Time range row */}
                              <View style={styles.durationRow}>
                                <Text numberOfLines={1} style={styles.durationText}>
                                  {`${startTime} - ${endTime}`}
                                </Text>
                                <Ionicons name="time-outline" size={14} color="#8E8E93" />
                              </View>
                            </View>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                  {nowLineOffsetY != null ? (
                    <View pointerEvents="none" style={[styles.nowLineContainer, { top: nowLineOffsetY }]}>
                      <View style={styles.nowLineSpacer} />
                      <View style={styles.nowLineDot} />
                      <View style={styles.nowLineTrack} />
                    </View>
                  ) : null}
                </View>
              </View>

              {appointments.length === 0 && calendarReminders.length === 0 && dayConstraints.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>{tHe('admin.appointments.emptyTitle', 'אין תורים ליום זה')}</Text>
                  <Text style={styles.emptySubtitle}>{tHe('admin.appointments.emptySubtitle', 'בחר/י יום אחר מהסרגל העליון')}</Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.gcMonthFullBleed}>
              <AdminVerticalMonthCalendar
                dayAvailability={appointmentCountsByDate}
                constraintDates={monthConstraintDates}
                selectedDate={selectedDate}
                language={typeof i18n.language === 'string' && i18n.language.startsWith('he') ? 'he' : 'en'}
                primaryColor={calendarPrimary}
                anchorMonthKey={adminMonthAnchorKey}
                onVisibleMonthChange={onAdminCalendarMonthVisible}
                onDayPress={onAdminCalendarDayPress}
                onJumpToDate={onAdminCalendarJumpToDate}
                refreshing={refreshing}
                onRefresh={onRefresh}
                todayLabel={tHe('admin.calendar.today', 'היום')}
                monthHint={tHe('admin.calendar.monthTapDayHint', 'הקישו על יום כדי לראות את כל התורים')}
              />
            </View>
          )}
        </>
      )}

      <Modal
        visible={monthDayModalDate !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setMonthDayModalDate(null)}
      >
        <View style={styles.monthModalRoot}>
          <Pressable
            style={styles.monthModalBackdrop}
            onPress={() => setMonthDayModalDate(null)}
            accessibilityRole="button"
            accessibilityLabel={tHe('close', 'סגור')}
          />
          <View style={[styles.monthModalSheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* iOS-style drag handle pill */}
            <View style={styles.monthModalDragHandle} />
            <View style={[styles.monthModalHeader, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
              <Text style={styles.monthModalTitle} numberOfLines={2}>
                {monthDayModalDate
                  ? (() => {
                      const parts = monthDayModalDate.split('-').map((x) => parseInt(x, 10));
                      const yy = parts[0];
                      const mm = parts[1];
                      const dd = parts[2];
                      if (!yy || !mm || !dd) return monthDayModalDate;
                      const d = new Date(yy, mm - 1, dd);
                      const p = _gregorianDayHeaderParts(d);
                      return p.weekday ? `${p.weekday} · ${p.dayNum}` : monthDayModalDate;
                    })()
                  : ''}
              </Text>
              <Pressable
                hitSlop={12}
                onPress={() => setMonthDayModalDate(null)}
                accessibilityLabel={tHe('close', 'סגור')}
              >
                <Entypo name="cross" size={22} color="#5F6368" />
              </Pressable>
            </View>
            {modalDayLoading ? (
              <View style={styles.monthModalLoading}>
                <ActivityIndicator color={calendarPrimary} />
              </View>
            ) : modalDayAppointments.length === 0 && modalDayConstraints.length === 0 ? (
              <View style={styles.monthModalEmpty}>
                <Ionicons name="calendar-outline" size={44} color="#DADCE0" />
                <Text style={styles.monthModalEmptyTitle}>
                  {tHe('admin.calendar.monthModalEmpty', 'אין תורים ביום זה')}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.monthModalList}
                contentContainerStyle={styles.monthModalListContent}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={false}
              >
                {displayModalConstraints.length > 0 ? (
                  <View style={styles.monthModalSectionBlock}>
                    <Text style={styles.monthModalSectionTitle}>
                      {tHe('admin.calendar.constraintsSection', 'אילוצים')}
                    </Text>
                    {displayModalConstraints.map((c) => (
                      <View key={`md-con-${c.id}`} style={styles.monthModalConstraintCard}>
                        <View style={styles.monthModalConstraintBar} />
                        <View style={styles.agendaCardBody}>
                          <Text style={styles.agendaTime}>
                            {formatTime(String(c.start_time).slice(0, 5))} –{' '}
                            {formatTime(String(c.end_time).slice(0, 5))}
                          </Text>
                          <Text style={styles.agendaTitle} numberOfLines={3}>
                            {c.reason?.trim() || tHe('admin.calendar.constraintBlockTitle', 'זמן חסום')}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
                {modalDayAppointments.map((appt) => {
                  const dur = appt.duration_minutes || 30;
                  return (
                    <Pressable
                      key={`md-appt-${appt.id}`}
                      style={({ pressed }) => [styles.agendaCard, pressed && { opacity: 0.92 }]}
                      onPress={() => openActionsMenu(appt)}
                    >
                      <View
                        ref={(n) => registerDayAptRef(appt.id, n)}
                        collapsable={false}
                        style={{
                          width: '100%',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          minHeight: 44,
                        }}
                      >
                        <View style={[styles.agendaBar, { backgroundColor: calendarPrimary }]} />
                        <View style={styles.agendaCardBody}>
                          <Text style={styles.agendaTime}>
                            {formatTime(appt.slot_time)} – {formatTime(addMinutes(appt.slot_time, dur))}
                          </Text>
                          <Text style={styles.agendaTitle} numberOfLines={2}>
                            {[appt.client_name || tHe('admin.calendar.client', 'לקוח'), appt.service_name].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <Ionicons name="chevron-back" size={20} color="#DADCE0" />
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {actionsModal.appointment && actionsModal.anchor ? (
        <AppointmentActionsAnchorSheet
          open={actionsModal.open}
          anchor={actionsModal.anchor}
          onRequestClose={requestCloseActionsModal}
          onDismissed={onActionsModalDismissed}
        >
          <ScrollView
            style={styles.actionsSheetScroll}
            contentContainerStyle={styles.actionsSheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {actionsModal.appointment ? (
              (() => {
                const apt = actionsModal.appointment!;
                const dash = tHe('admin.appointments.detailDash', '—');
                const dur =
                  typeof apt.duration_minutes === 'number' && apt.duration_minutes > 0
                    ? apt.duration_minutes
                    : 60;
                const start = apt.slot_time || '00:00';
                const timeRange = `${formatTime(start)} – ${formatTime(addMinutes(start, dur))}`;
                const clientLine = (apt.client_name || '').trim() || dash;
                const serviceLine = (apt.service_name || '').trim() || dash;
                const phoneLine = (apt.client_phone || '').trim();
                const dateLine = _formatSlotDateLine(apt.slot_date);
                const initials = _clientInitials(clientLine === dash ? '' : clientLine);
                const statusPill = _appointmentStatusPillColors(apt.status);
                const chipRowDir = isRtl ? 'row-reverse' : 'row';
                const heroChip = (icon: React.ComponentProps<typeof Ionicons>['name'], text: string, chipKey: string) => (
                  <View
                    key={chipKey}
                    style={[styles.actionsHeroChip, { flexDirection: chipRowDir }]}
                  >
                    <Ionicons name={icon} size={13} color="rgba(255,255,255,0.95)" />
                    <Text style={styles.actionsHeroChipText} numberOfLines={1}>
                      {text}
                    </Text>
                  </View>
                );
                return (
                  <>
                    <View style={styles.actionsSheetHandleWrap}>
                      <View style={styles.actionsSheetHandle} />
                    </View>
                    <View style={styles.actionsHeroOuter}>
                      <LinearGradient
                        colors={[calendarPrimary, calendarSecondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.actionsHeroGradient}
                      >
                        <Pressable
                          onPress={requestCloseActionsModal}
                          hitSlop={18}
                          style={[
                            styles.actionsHeroCloseBtn,
                            isRtl ? { left: 10 } : { right: 10 },
                          ]}
                          accessibilityLabel={tHe('close', 'סגור')}
                        >
                          <View style={styles.actionsHeroCloseInner}>
                            <Entypo name="cross" size={16} color="rgba(255,255,255,0.95)" />
                          </View>
                        </Pressable>
                        <View style={styles.actionsHeroContent}>
                          <View style={[styles.actionsHeroTopRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
                            <LinearGradient
                              colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.12)']}
                              style={styles.actionsHeroAvatarRing}
                            >
                              <Text style={styles.actionsHeroAvatarText}>{initials}</Text>
                            </LinearGradient>
                            <View style={styles.actionsHeroTitles}>
                              <Text
                                style={[styles.actionsHeroClientName, isRtl ? { textAlign: 'right' } : { textAlign: 'left' }]}
                                numberOfLines={2}
                              >
                                {clientLine}
                              </Text>
                              <Text
                                style={[styles.actionsHeroService, isRtl ? { textAlign: 'right' } : { textAlign: 'left' }]}
                                numberOfLines={2}
                              >
                                {serviceLine}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.actionsHeroChips}>
                            {heroChip('calendar-outline', dateLine, 'date')}
                            {heroChip('time-outline', timeRange, 'time')}
                            {heroChip(
                              'hourglass-outline',
                              `${dur} ${tHe('admin.appointments.detailMinutesShort', 'דק׳')}`,
                              'dur'
                            )}
                          </View>
                          <View
                            style={[
                              styles.actionsHeroStatusPill,
                              { backgroundColor: statusPill.bg },
                              isRtl ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
                            ]}
                          >
                            <Text style={[styles.actionsHeroStatusText, { color: statusPill.text }]}>
                              {_adminAppointmentStatusLabel(apt.status, tHe)}
                            </Text>
                          </View>
                        </View>
                      </LinearGradient>
                    </View>

                    {phoneLine ? (
                      <View style={styles.actionsPhoneCard}>
                        <View style={[styles.actionsPhoneIconWrap, { backgroundColor: _primaryOnWhite(calendarPrimary, 0.14) }]}>
                          <Ionicons name="call-outline" size={20} color={calendarPrimary} />
                        </View>
                        <View style={styles.actionsPhoneTextCol}>
                          <Text style={[styles.actionsPhoneLabel, isRtl ? { textAlign: 'right' } : { textAlign: 'left' }]}>
                            {tHe('admin.appointments.phoneCardLabel', 'טלפון לחיוג')}
                          </Text>
                          <Text
                            style={[styles.actionsPhoneValue, isRtl ? { textAlign: 'right' } : { textAlign: 'left' }]}
                            selectable
                          >
                            {phoneLine}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    <Text
                      style={[styles.actionsSectionLabel, isRtl ? { textAlign: 'right' } : { textAlign: 'left' }]}
                    >
                      {tHe('admin.appointments.actionsSection', 'פעולות')}
                    </Text>

                    {phoneLine ? (
                      <PressableScale
                        style={styles.actionsPrimaryBtnWrap}
                        accessibilityLabel={tHe('admin.appointments.callClient', 'חייג ללקוח')}
                        onPress={async () => {
                          const phone = actionsModal.appointment?.client_phone;
                          requestCloseActionsModal();
                          if (phone) await startPhoneCall(phone);
                        }}
                      >
                        <LinearGradient
                          colors={[calendarPrimary, calendarSecondary]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.actionsPrimaryBtnGradient}
                        >
                          <Ionicons name="call" size={18} color="#FFFFFF" />
                          <Text style={styles.actionsPrimaryBtnText}>{tHe('admin.appointments.callClient', 'חייג ללקוח')}</Text>
                        </LinearGradient>
                      </PressableScale>
                    ) : null}

                    <PressableScale
                      style={styles.actionsSecondaryCard}
                      accessibilityLabel={tHe('admin.appointments.cancelAndFree', 'ביטול ושחרור משבצת')}
                      onPress={() => {
                        const a = actionsModal.appointment;
                        if (a) askCancelAppointment(a);
                        requestCloseActionsModal();
                      }}
                    >
                      <View style={styles.actionsSecondaryIconWarn}>
                        <Ionicons name="close-circle-outline" size={18} color="#EA580C" />
                      </View>
                      <Text style={styles.actionsSecondaryTitleWarn}>{tHe('admin.appointments.cancelAndFree', 'ביטול ושחרור משבצת')}</Text>
                    </PressableScale>

                    <PressableScale
                      style={styles.actionsSecondaryCard}
                      accessibilityLabel={tHe('admin.appointments.deleteAppointment', 'מחיקת תור')}
                      onPress={() => {
                        const a = actionsModal.appointment;
                        if (a) askDeleteAppointment(a);
                        requestCloseActionsModal();
                      }}
                    >
                      <View style={styles.actionsSecondaryIconDanger}>
                        <Ionicons name="trash-outline" size={18} color={Colors.error} />
                      </View>
                      <Text style={styles.actionsSecondaryTitleDanger}>{tHe('admin.appointments.deleteAppointment', 'מחיקת תור')}</Text>
                    </PressableScale>

                    <PressableScale
                      style={styles.actionsDismissBtn}
                      accessibilityLabel={tHe('close', 'סגור')}
                      onPress={requestCloseActionsModal}
                    >
                      <Text style={[styles.actionsDismissBtnText, { color: calendarPrimary }]}>{tHe('close', 'סגור')}</Text>
                    </PressableScale>
                  </>
                );
              })()
            ) : null}
          </ScrollView>
        </AppointmentActionsAnchorSheet>
      ) : null}

      {/* iOS-style confirmation modal */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCancelModal(false);
          setSelectedAppointment(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.iosAlertContainer}>
            <Text style={styles.iosAlertTitle}>{tHe('appointments.cancel.title', 'ביטול תור')}</Text>
            <Text style={styles.iosAlertMessage}>
              {tHe('admin.appointments.cancelMessage', 'פעולה זו תפנה את הזמן, תסמן את התור כבוטל ותשחרר את המשבצת להזמנה מחדש.')}
            </Text>
            <View style={styles.iosAlertButtonsRow}>
              <TouchableOpacity
                style={styles.iosAlertButton}
                activeOpacity={0.8}
                onPress={() => {
                  setShowCancelModal(false);
                  setSelectedAppointment(null);
                }}
                disabled={isCancelling}
              >
                <Text style={[styles.iosAlertButtonDefaultText, { color: calendarPrimary }]}>{tHe('cancel', 'ביטול')}</Text>
              </TouchableOpacity>
              <View style={styles.iosAlertButtonDivider} />
              <TouchableOpacity
                style={styles.iosAlertButton}
                activeOpacity={0.8}
                onPress={confirmCancelAppointment}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Text style={styles.iosAlertButtonDestructiveText}>{tHe('confirm', 'אישור')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteModal(false);
          setAppointmentToDelete(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.iosAlertContainer}>
            <Text style={styles.iosAlertTitle}>{tHe('admin.appointments.deleteTitle', 'מחיקת תור')}</Text>
            <Text style={styles.iosAlertMessage}>
              {tHe('admin.appointments.deleteMessage', 'פעולה זו תמחק את התור לצמיתות. לא ניתן לבטל פעולה זו.')}
            </Text>
            <View style={styles.iosAlertButtonsRow}>
              <TouchableOpacity
                style={styles.iosAlertButton}
                activeOpacity={0.8}
                onPress={() => {
                  setShowDeleteModal(false);
                  setAppointmentToDelete(null);
                }}
                disabled={isDeleting}
              >
                <Text style={[styles.iosAlertButtonDefaultText, { color: calendarPrimary }]}>{tHe('cancel', 'ביטול')}</Text>
              </TouchableOpacity>
              <View style={styles.iosAlertButtonDivider} />
              <TouchableOpacity
                style={styles.iosAlertButton}
                activeOpacity={0.8}
                onPress={confirmDeleteAppointment}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Text style={styles.iosAlertButtonDestructiveText}>{tHe('delete', 'מחק')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showCalendarFabSheet ? (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.reminderFabBackdrop]}
          onPress={closeReminderModal}
          accessibilityLabel={tHe('admin.calendarReminder.closeBackdrop', 'סגירה')}
        />
      ) : null}

      {!!user?.id && !isLoading && (
        <View
          ref={reminderOverlayRef}
          onLayout={measureReminderOverlay}
          pointerEvents="box-none"
          style={[
            StyleSheet.absoluteFill,
            { direction: 'ltr' } as const,
            showCalendarFabSheet && styles.reminderFabPanelCenteredWrap,
          ]}
        >
        <CalendarReminderFabPanel
          isOpen={showCalendarFabSheet}
          onFabPress={reminderFabTabPress}
          title={tHe('admin.calendarAdd.choiceTitle', 'מה תרצה להוסיף?')}
          subtitle={tHe(
            'admin.calendarAdd.choiceSubtitle',
            'בחרו תור ללקוח, תזכורת פנימית, או אילוץ שחוסם משבצות'
          )}
          backgroundColor={calendarPrimary}
          isRtl={isRtl}
          fabAccessibilityLabel={tHe('admin.calendarAdd.fabAccessibility', 'הוספה ליומן')}
          externalTriggerOnly
          externalAnchorSize={reminderExternalAnchorSize}
          panelStyle={reminderFabPanelStyle}
        >
          <View style={styles.calendarFabChoiceWrap}>
            <Pressable
              style={({ pressed }) => [
                styles.calendarFabChoiceCard,
                pressed && styles.calendarFabChoiceCardPressed,
              ]}
              onPress={onCalendarFabPickAppointment}
              accessibilityRole="button"
              accessibilityLabel={tHe('admin.calendarAdd.optionAppointment', 'תור')}
            >
              <View style={[styles.calendarFabChoiceIconWrap, { backgroundColor: `${calendarPrimary}18` }]}>
                <Calendar size={26} color={calendarPrimary} />
              </View>
              <View style={styles.calendarFabChoiceTextCol}>
                <Text style={styles.calendarFabChoiceTitle}>
                  {tHe('admin.calendarAdd.optionAppointment', 'תור')}
                </Text>
                <Text style={styles.calendarFabChoiceHint}>
                  {tHe('admin.calendarAdd.optionAppointmentHint', 'קביעת תור ללקוח לפי שירות ושעה')}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.calendarFabChoiceCard,
                pressed && styles.calendarFabChoiceCardPressed,
              ]}
              onPress={onCalendarFabPickReminder}
              accessibilityRole="button"
              accessibilityLabel={tHe('admin.calendarAdd.optionReminder', 'תזכורת ביומן')}
            >
              <View style={[styles.calendarFabChoiceIconWrap, { backgroundColor: '#E8EAED' }]}>
                <StickyNote size={26} color="#5F6368" />
              </View>
              <View style={styles.calendarFabChoiceTextCol}>
                <Text style={styles.calendarFabChoiceTitle}>
                  {tHe('admin.calendarAdd.optionReminder', 'תזכורת ביומן')}
                </Text>
                <Text style={styles.calendarFabChoiceHint}>
                  {tHe('admin.calendarAdd.optionReminderHint', 'תזכורת לעצמך — לא חוסמת משבצות')}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.calendarFabChoiceCard,
                pressed && styles.calendarFabChoiceCardPressed,
              ]}
              onPress={onCalendarFabPickConstraints}
              accessibilityRole="button"
              accessibilityLabel={tHe('admin.calendarAdd.optionConstraints', 'אילוצים')}
            >
              <View style={[styles.calendarFabChoiceIconWrap, { backgroundColor: `${calendarPrimary}12` }]}>
                <Ban size={26} color={calendarPrimary} />
              </View>
              <View style={styles.calendarFabChoiceTextCol}>
                <Text style={styles.calendarFabChoiceTitle}>
                  {tHe('admin.calendarAdd.optionConstraints', 'אילוצים')}
                </Text>
                <Text style={styles.calendarFabChoiceHint}>
                  {tHe(
                    'admin.calendarAdd.optionConstraintsHint',
                    'חסימת זמן בלוח — לקוחות לא יוכלו לקבוע תור בחלון זה'
                  )}
                </Text>
              </View>
            </Pressable>
          </View>
        </CalendarReminderFabPanel>
        </View>
      )}

      <CalendarReminderEditorModal
        visible={showReminderEditor}
        onClose={closeReminderEditor}
        onSaved={refreshCalendarRemindersOnly}
        editingReminder={reminderEditorEditing}
        defaultDate={selectedDate}
      />

      <BusinessConstraintsModal
        visible={showConstraintsModal}
        onClose={() => setShowConstraintsModal(false)}
        onConstraintsChanged={onCalendarConstraintsChanged}
      />

      <ConstraintEditModal
        visible={constraintToEdit !== null}
        constraint={constraintToEdit}
        onClose={() => setConstraintToEdit(null)}
        onSaved={onCalendarConstraintsChanged}
      />
    </View>
  );
}

// Layout constants for the time grid
const HOUR_BLOCK_HEIGHT = 180; // Further increase spacing per hour for larger proportions
const HALF_HOUR_BLOCK_HEIGHT = HOUR_BLOCK_HEIGHT / 2; // 30-min rows

// Labels are built dynamically from business hours per selected day

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    marginRight: 8,
  },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  monthText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 14,
  },
  monthNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  pickDayBtn: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  pickDayText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 14,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  gcRoot: {
    flex: 1,
    backgroundColor: GC_PAGE_BG,
  },
  gcRootMonth: {
    backgroundColor: '#FFFFFF',
  },
  gcTopChrome: {
    backgroundColor: GC_HEADER_CHROME,
  },
  gcHeader: {
    backgroundColor: GC_HEADER_CHROME,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EAED',
    ...Platform.select({
      ios: {
        shadowColor: '#1a1a2e',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  /** מסילה אחת: כפתורים מורמים + כותרת במרכז */
  gcNavTrack: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: GC_HEADER_CHROME,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 64, 67, 0.1)',
  },
  gcNavCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GC_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E3E6EC',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#1a1a2e',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 5,
      },
      android: { elevation: 2 },
    }),
  },
  gcNavCircleBtnPressedIos: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  gcMonthTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  gcMonthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#202124',
    textAlign: 'center',
    writingDirection: 'rtl',
    letterSpacing: -0.3,
  },
  gcDayScroll: {
    backgroundColor: GC_PAGE_BG,
  },
  gcAgendaScroll: {
    flex: 1,
    backgroundColor: GC_PAGE_BG,
  },
  gcAgendaScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
  },
  gcTopChromeMonth: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.12)',
  },
  gcHeaderMonth: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    paddingTop: 4,
    paddingBottom: 4,
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  gcMonthFullBleed: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  monthModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  monthModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
  monthModalDragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D1D6',
    marginBottom: 12,
    marginTop: 4,
  },
  monthModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '80%',
    paddingHorizontal: 16,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.10,
        shadowRadius: 16,
      },
      android: { elevation: 20 },
    }),
  },
  monthModalHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  monthModalTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '700',
    color: '#1C1C1E',
    writingDirection: 'rtl',
    letterSpacing: -0.3,
  },
  monthModalLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthModalEmpty: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  monthModalEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  monthModalList: {
    maxHeight: 420,
  },
  monthModalListContent: {
    paddingBottom: 8,
  },
  monthModalSectionBlock: {
    marginBottom: 14,
  },
  monthModalSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9A3412',
    writingDirection: 'rtl',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  monthModalConstraintCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(194,65,12,0.18)',
    minHeight: 56,
  },
  monthModalConstraintBar: {
    width: 4,
    backgroundColor: '#C2410C',
  },
  agendaSectionHeader: {
    marginBottom: 14,
  },
  agendaSectionKicker: {
    fontSize: 13,
    fontWeight: '700',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  agendaSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#202124',
    writingDirection: 'rtl',
  },
  agendaEmpty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  agendaEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  agendaEmptySub: {
    fontSize: 14,
    color: '#80868B',
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingHorizontal: 24,
  },
  agendaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GC_SURFACE,
    borderRadius: 12,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8EAED',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  agendaBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    minHeight: 44,
  },
  agendaCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  agendaTime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  agendaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
    writingDirection: 'rtl',
  },
  agendaNotes: {
    fontSize: 13,
    color: '#80868B',
    writingDirection: 'rtl',
  },
  nowLineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 14,
    marginTop: -7,
    zIndex: 30,
    elevation: 8,
  },
  nowLineSpacer: {
    width: LABELS_WIDTH,
  },
  nowLineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EA4335',
  },
  nowLineTrack: {
    flex: 1,
    height: 2,
    backgroundColor: '#EA4335',
  },
  viewModeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: Colors.white,
  },
  viewModeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  viewModeBtnActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  viewModeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  viewModeTextActive: {
    color: '#FFFFFF',
  },
  timelineContainer: {
    marginTop: 8,
    marginHorizontal: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeLabel: {
    width: LABELS_WIDTH,
    textAlign: 'left',
    paddingLeft: 8,
    color: Colors.subtext,
    fontSize: 14,
    fontWeight: '700',
    minWidth: LABELS_WIDTH,
  },
  gridLine: {
    height: 1,
    backgroundColor: '#E5E5EA',
    flex: 1,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingLeft: LABELS_WIDTH + 12,
    paddingRight: 12,
  },
  appointmentCard: {
    position: 'absolute',
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3A3A3C',
    borderRadius: 14,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'flex-start',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 52,
    overflow: 'hidden',
  },
  appointmentBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    overflow: 'hidden',
  },
  appointmentBlurTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: 'rgba(242,242,247,0.9)',
  },
  appointmentFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  pillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  appointmentAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  appointmentInner: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    paddingRight: 16,
  },
  appointmentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 6,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  timePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  serviceTitle: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  clientRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appointmentClientText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  clientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  clientPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  servicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  pillBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  servicePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  // New compact info container: title and duration on blur background
  infoContainer: {
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 2,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  titleTextFlex: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  phoneIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 0,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  appointmentActions: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 20,
    elevation: 20,
  },
  phoneButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GC_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cancelButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appointmentTime: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '800',
    marginBottom: 2,
    textAlign: 'left',
  },
  appointmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  appointmentTimeInline: {
    marginBottom: 0,
    marginRight: 8,
  },
  appointmentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'left',
  },
  appointmentTitleInline: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'left',
    flexShrink: 1,
  },
  appointmentClient: {
    fontSize: 12,
    color: '#666',
    textAlign: 'left',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.subtext,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 24,
  },
  actionsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.25)'
  },
  actionsSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: Colors.white,
    paddingTop: 12,
    paddingBottom: 26,
    paddingHorizontal: 16,
  },
  actionsSheetScroll: {
    flex: 1,
  },
  actionsSheetScrollContent: {
    paddingBottom: 12,
    flexGrow: 1,
  },
  actionsSheetHandleWrap: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
  },
  actionsSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.45)',
  },
  actionsHeroOuter: {
    marginHorizontal: 10,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  actionsHeroGradient: {
    borderRadius: 16,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  actionsHeroCloseBtn: {
    position: 'absolute',
    top: 6,
    zIndex: 2,
  },
  actionsHeroCloseInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  actionsHeroContent: {
    paddingTop: 0,
  },
  actionsHeroTopRow: {
    alignItems: 'center',
    gap: 10,
  },
  actionsHeroAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  actionsHeroAvatarText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  actionsHeroTitles: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  actionsHeroClientName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    lineHeight: 23,
  },
  actionsHeroService: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
  },
  actionsHeroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    alignItems: 'center',
  },
  actionsHeroChip: {
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    maxWidth: '100%',
  },
  actionsHeroChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.98)',
    flexShrink: 1,
  },
  actionsHeroStatusPill: {
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 16,
  },
  actionsHeroStatusText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  actionsPhoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginHorizontal: 14,
    padding: 11,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  actionsPhoneIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsPhoneTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  actionsPhoneLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.subtext,
    letterSpacing: 0.2,
  },
  actionsPhoneValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  actionsSectionLabel: {
    marginTop: 12,
    marginBottom: 6,
    marginHorizontal: 16,
    fontSize: 12,
    fontWeight: '800',
    color: Colors.subtext,
    letterSpacing: 0.8,
  },
  actionsPrimaryBtnWrap: {
    marginHorizontal: 14,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  actionsPrimaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionsPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.15,
  },
  actionsSecondaryCard: {
    marginHorizontal: 14,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
  },
  actionsSecondaryIconWarn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsSecondaryIconDanger: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsSecondaryTitleWarn: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#C2410C',
  },
  actionsSecondaryTitleDanger: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.error,
  },
  actionsDismissBtn: {
    marginTop: 8,
    marginHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  actionsDismissBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  moreButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosAlertContainer: {
    width: 300,
    borderRadius: 14,
    backgroundColor: Colors.white,
    overflow: 'hidden',
    paddingTop: 16,
  },
  iosAlertTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  iosAlertMessage: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'center',
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  iosAlertButtonsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
  },
  iosAlertButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  iosAlertButtonDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#D1D1D6',
  },
  iosAlertButtonDefaultText: {
    fontSize: 17,
    fontWeight: '600',
  },
  iosAlertButtonDestructiveText: {
    fontSize: 17,
    color: '#FF3B30',
    fontWeight: '700',
  },
  reminderFabBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 55,
  },
  reminderFabPanelCenteredWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  calendarFabChoiceWrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 18,
    gap: 12,
  },
  calendarFabChoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8EAED',
    backgroundColor: '#FAFAFA',
  },
  calendarFabChoiceCardPressed: {
    opacity: 0.88,
  },
  calendarFabChoiceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarFabChoiceTextCol: {
    flex: 1,
    gap: 4,
  },
  calendarFabChoiceTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  calendarFabChoiceHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
    textAlign: 'right',
    lineHeight: 16,
    writingDirection: 'rtl',
  },
  constraintCard: {
    position: 'absolute',
    borderRadius: 12,
    borderLeftWidth: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(194,65,12,0.14)',
    backgroundColor: CONSTRAINT_BG,
    borderLeftColor: CONSTRAINT_BAR,
  },
  constraintInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  constraintTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  constraintTitleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    writingDirection: 'rtl',
    color: '#7C2D12',
  },
  constraintTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.88)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  constraintTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C2D12',
    writingDirection: 'rtl',
  },
  reminderCard: {
    position: 'absolute',
    borderRadius: 12,
    borderLeftWidth: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  reminderInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  reminderTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reminderTitleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  reminderTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  reminderTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3C3C43',
    writingDirection: 'rtl',
  },
});

const weekStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GC_PAGE_BG,
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  hoursCol: {
    flexGrow: 0,
    backgroundColor: GC_SURFACE,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E8EAED',
  },
  hourRow: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingRight: 6,
    paddingTop: 4,
  },
  hourText: {
    fontWeight: '700',
    opacity: 0.5,
    fontSize: 11,
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  gridOuter: {
    flex: 1,
    overflow: 'hidden',
    borderLeftColor: '#E8EAED',
    borderLeftWidth: StyleSheet.hairlineWidth,
    backgroundColor: GC_SURFACE,
  },
  headerHebrewDow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5F6368',
    marginBottom: 2,
    textAlign: 'center',
  },
  headerWeekday: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5F6368',
    marginTop: 2,
    textAlign: 'center',
  },
  headerDayCircle: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerBookingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },
  headerBookingDotSelected: {
    backgroundColor: '#FFFFFF',
  },
  headerDayNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
  },
  headerDayNumToday: {
    color: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: GC_SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
  },
  borderBottom: {
    borderBottomColor: '#E8EAED',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  borderRight: {
    borderRightColor: '#E8EAED',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  weekAptCard: {
    position: 'absolute',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  weekAptAccent: {
    width: 3,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    flexShrink: 0,
  },
  weekAptInner: {
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 4,
    gap: 1,
    minWidth: 0,
  },
  weekAptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    minWidth: 0,
  },
  weekAptClient: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1a1a2e',
    writingDirection: 'rtl',
    flex: 1,
    minWidth: 0,
  },
  weekAptService: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3C4043',
    writingDirection: 'rtl',
    opacity: 0.85,
  },
  weekAptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  weekAptTime: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  weekReminderCard: {
    position: 'absolute',
    borderRadius: 8,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  weekReminderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    flex: 1,
  },
  weekReminderTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
  },
  weekConstraintCard: {
    position: 'absolute',
    borderRadius: 8,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(194,65,12,0.12)',
  },
  weekConstraintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    flex: 1,
  },
  weekConstraintTitle: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    color: '#7C2D12',
    writingDirection: 'rtl',
  },
  weekConstraintTime: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    color: '#9A3412',
    writingDirection: 'rtl',
  },
});


