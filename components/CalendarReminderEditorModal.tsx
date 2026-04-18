import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useAdminCalendarSheetTimingConfig } from '@/components/admin-calendar/useAdminCalendarSheetTiming';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useAuthStore } from '@/stores/authStore';
import type { CalendarReminder } from '@/lib/supabase';
import {
  CALENDAR_REMINDER_COLOR_KEYS,
  createCalendarReminder,
  deleteCalendarReminder,
  updateCalendarReminder,
  type CalendarReminderColorKey,
} from '@/lib/api/calendarReminders';

LocaleConfig.locales['en'] = {
  monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: 'Today',
  direction: 'ltr',
};
LocaleConfig.locales['he'] = {
  monthNames: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
  monthNamesShort: ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'],
  dayNames: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  dayNamesShort: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'],
  today: 'היום',
  direction: 'rtl',
};
LocaleConfig.defaultLocale = 'en';

// ─── design tokens ────────────────────────────────────────────────────────────

const UI = {
  bg: '#F2F4F8',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#636366',
  textTertiary: '#8E8E93',
  border: 'rgba(60, 60, 67, 0.12)',
  borderSoft: 'rgba(60, 60, 67, 0.08)',
  fieldBg: 'rgba(60, 60, 67, 0.045)',
  danger: '#FF3B30',
};

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

function buildCalendarTheme(primary: string) {
  return {
    backgroundColor: UI.surface,
    calendarBackground: UI.surface,
    textSectionTitleColor: UI.text,
    textDayHeaderFontWeight: '700',
    textDayFontWeight: '600',
    textMonthFontWeight: '800',
    textDayFontSize: 15,
    textMonthFontSize: 17,
    arrowColor: primary,
    selectedDayBackgroundColor: primary,
    todayTextColor: primary,
    dayTextColor: UI.text,
    textDisabledColor: UI.textTertiary,
    monthTextColor: UI.text,
    'stylesheet.calendar.header': {
      week: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 },
      dayHeader: { textAlign: 'center', color: UI.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    },
    'stylesheet.day.basic': {
      base: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    },
    'stylesheet.calendar.main': {
      week: { marginTop: 6, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-around' },
    },
  } as const;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function dateToHHMM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function timeOnDate(timeStr: string, day: Date): Date {
  const parts = String(timeStr || '09:00').split(':');
  const h = parseInt(parts[0] || '9', 10);
  const m = parseInt(parts[1] || '0', 10);
  const out = new Date(day);
  out.setHours(h, m, 0, 0);
  return out;
}

function addMinutesToDate(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function minutesBetweenStartEnd(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

const TIME_SLOT_STEP_MINUTES = 15;

function buildTimeSlots(stepMinutes: number): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}

function mergeHHMMIntoSortedSlots(slots: string[], hhmm: string): string[] {
  const t = hhmm.slice(0, 5);
  if (slots.includes(t)) return slots;
  return [...slots, t].sort((a, b) => a.localeCompare(b));
}

function calendarReminderSaveErrorHint(raw: string, tHe: (key: string, fb: string) => string): string {
  const s = raw.toLowerCase();
  if (s.includes('does not exist') || s.includes('schema cache') || s.includes('could not find the table')) {
    return tHe('admin.calendarReminder.errTableMissing', 'טבלת התזכורות לא קיימת או לא מסונכרנת בשרת. יש להריץ מיגרציות Supabase (כולל יצירת calendar_reminders והרשאות).');
  }
  if (s.includes('permission denied') || s.includes('42501')) {
    return tHe('admin.calendarReminder.errPermission', 'אין הרשאה לכתוב לטבלת התזכורות. בדקו הרשאות anon/authenticated על calendar_reminders ב-Supabase.');
  }
  if (s.includes('foreign key') || s.includes('23503') || s.includes('violates foreign key')) {
    return tHe('admin.calendarReminder.errFkUser', 'המזהה של המשתמש לא תואם לרשומה בטבלת users — נסו להתנתק ולהתחבר מחדש.');
  }
  return raw;
}

function parseISODateToLocalDay(iso: string): Date {
  if (!iso || iso.length < 10) return new Date();
  const y = parseInt(iso.slice(0, 4), 10);
  const mo = parseInt(iso.slice(5, 7), 10) - 1;
  const da = parseInt(iso.slice(8, 10), 10);
  const d = new Date(y, mo, da);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function CardSectionHeader({
  icon,
  label,
  primary,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  primary: string;
}) {
  return (
    <View style={styles.cardSectionRow}>
      <View style={styles.cardSectionLabelWrap}>
        <Text style={styles.cardSectionLabel} numberOfLines={3}>
          {label}
        </Text>
      </View>
      <View style={[styles.cardIconWrap, { backgroundColor: `${primary}12` }]}>
        <Ionicons name={icon} size={17} color={primary} />
      </View>
    </View>
  );
}

function TimeSlotPickerSheet({
  visible,
  title,
  options,
  selectedHHMM,
  primary,
  formatOptionLabel,
  onSelect,
  onClose,
  insetBottom,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selectedHHMM: string;
  primary: string;
  formatOptionLabel: (hhmm: string) => string;
  onSelect: (hhmm: string) => void;
  onClose: () => void;
  insetBottom: number;
}) {
  if (!visible) return null;
  return (
    <View style={styles.timeSheetHost} pointerEvents="box-none">
      <Pressable
        style={styles.timeSheetBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="סגור"
      />
      <View style={[styles.timeSheetCard, { paddingBottom: Math.max(insetBottom, 16) }]}>
        <View style={styles.timeSheetDragHandle} />
        <Text style={styles.timeSheetTitle} numberOfLines={1}>{title}</Text>
        <ScrollView
          style={styles.timeSheetList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {options.map((item) => {
            const on = item === selectedHHMM.slice(0, 5);
            return (
              <TouchableOpacity
                key={item}
                style={[styles.timeSheetRow, styles.timeSheetRowRtl, on && { backgroundColor: `${primary}12` }]}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.72}
              >
                <Text style={[styles.timeSheetRowText, { writingDirection: 'ltr', textAlign: 'right' }, on && { color: primary, fontWeight: '800' }]}>
                  {formatOptionLabel(item)}
                </Text>
                {on
                  ? <Ionicons name="checkmark-circle" size={22} color={primary} />
                  : <View style={{ width: 22 }} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── props ────────────────────────────────────────────────────────────────────

export interface CalendarReminderEditorModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  editingReminder: CalendarReminder | null;
  defaultDate: Date;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CalendarReminderEditorModal({
  visible,
  onClose,
  onSaved,
  editingReminder,
  defaultDate,
}: CalendarReminderEditorModalProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { colors: businessColors } = useBusinessColors();
  const { user } = useAuthStore();
  const { i18n } = useTranslation();

  const tHe = useCallback(
    (key: string, fallback: string) => String(i18n.t(key, { lng: 'he', defaultValue: fallback })),
    [i18n]
  );

  const rawLang = (i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  const isHebrew = rawLang.startsWith('he') || rawLang.startsWith('iw');
  const calendarLocale = isHebrew ? 'he' : 'en';
  const rtl = true;

  const primary = businessColors.primary || '#1A73E8';
  const calendarTheme = useMemo(() => buildCalendarTheme(primary), [primary]);
  /** Taller sheet so more form (calendar + time) fits without feeling cramped */
  const snapPoints = useMemo(() => ['90%'], []);

  // ── form state ──────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [eventDateISO, setEventDateISO] = useState(() => toLocalISODate(defaultDate));
  const [startTimeDate, setStartTimeDate] = useState(() => timeOnDate('09:00', defaultDate));
  const [endTimeDate, setEndTimeDate] = useState(() => timeOnDate('09:30', defaultDate));
  const [colorKey, setColorKey] = useState<CalendarReminderColorKey>('blue');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [timePickerWhich, setTimePickerWhich] = useState<'start' | 'end' | null>(null);

  const animationConfigs = useAdminCalendarSheetTimingConfig();

  // ── present / dismiss based on visible prop ─────────────────────────────────
  useEffect(() => {
    if (visible) {
      if (calendarLocale) LocaleConfig.defaultLocale = calendarLocale;
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible, calendarLocale]);

  // ── reset form when opening ─────────────────────────────────────────────────
  const resetFromProps = useCallback(() => {
    if (editingReminder) {
      const day = parseISODateToLocalDay(editingReminder.event_date || '');
      setTitle(editingReminder.title || '');
      setNotes(editingReminder.notes || '');
      setEventDateISO(toLocalISODate(day));
      const start = timeOnDate(editingReminder.start_time || '09:00', day);
      const dur = editingReminder.duration_minutes || 30;
      setStartTimeDate(start);
      setEndTimeDate(addMinutesToDate(start, dur));
      setColorKey((editingReminder.color_key as CalendarReminderColorKey) || 'blue');
    } else {
      const d = new Date(defaultDate);
      d.setHours(0, 0, 0, 0);
      setTitle('');
      setNotes('');
      setEventDateISO(toLocalISODate(d));
      const s = timeOnDate('09:00', d);
      setStartTimeDate(s);
      setEndTimeDate(addMinutesToDate(s, 30));
      setColorKey('blue');
    }
  }, [editingReminder, defaultDate]);

  useEffect(() => {
    if (visible) {
      resetFromProps();
      setTimePickerWhich(null);
    }
  }, [visible, resetFromProps]);

  // ── time helpers ────────────────────────────────────────────────────────────
  const formatTimeLabel = useCallback((d: Date) => {
    try {
      return new Intl.DateTimeFormat(isHebrew ? 'he-IL' : 'en-US', {
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(d);
    } catch {
      return dateToHHMM(d);
    }
  }, [isHebrew]);

  const reminderDay = useMemo(() => parseISODateToLocalDay(eventDateISO), [eventDateISO]);

  const reminderMarkedDates = useMemo(
    () => ({ [eventDateISO]: { selected: true, selectedColor: primary } }),
    [eventDateISO, primary],
  );

  const calendarRenderArrow = useCallback(
    (direction: string) => {
      const size = 22;
      if (rtl) {
        return direction === 'left' ? (
          <Ionicons name="chevron-forward" size={size} color={primary} />
        ) : (
          <Ionicons name="chevron-back" size={size} color={primary} />
        );
      }
      return direction === 'left' ? (
        <Ionicons name="chevron-back" size={size} color={primary} />
      ) : (
        <Ionicons name="chevron-forward" size={size} color={primary} />
      );
    },
    [primary, rtl],
  );

  const timeSlotOptions = useMemo(() => {
    const base = buildTimeSlots(TIME_SLOT_STEP_MINUTES);
    const withStart = mergeHHMMIntoSortedSlots(base, dateToHHMM(startTimeDate));
    return mergeHHMMIntoSortedSlots(withStart, dateToHHMM(endTimeDate));
  }, [startTimeDate, endTimeDate]);

  const formatSlotLabel = useCallback(
    (hhmm: string) => formatTimeLabel(timeOnDate(hhmm, reminderDay)),
    [formatTimeLabel, reminderDay]
  );

  const rangeDurationMinutes = useMemo(
    () => minutesBetweenStartEnd(startTimeDate, endTimeDate),
    [startTimeDate, endTimeDate]
  );

  const startTimeRef = useRef(startTimeDate);
  useEffect(() => { startTimeRef.current = startTimeDate; }, [startTimeDate]);

  const onStartTimeChange = useCallback((d: Date) => {
    setStartTimeDate(d);
    setEndTimeDate((prev) => (prev.getTime() <= d.getTime() ? addMinutesToDate(d, 30) : prev));
  }, []);

  const onEndTimeChange = useCallback((d: Date) => {
    const s = startTimeRef.current;
    if (d.getTime() <= s.getTime()) setEndTimeDate(addMinutesToDate(s, 30));
    else setEndTimeDate(d);
  }, []);

  const onDayPicked = useCallback((dateString: string) => {
    setEventDateISO(dateString);
    const day = parseISODateToLocalDay(dateString);
    setStartTimeDate((prev) => timeOnDate(dateToHHMM(prev), day));
    setEndTimeDate((prev) => timeOnDate(dateToHHMM(prev), day));
  }, []);

  // ── save / delete ───────────────────────────────────────────────────────────
  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed || !user?.id) {
      Alert.alert(tHe('admin.calendarReminder.validationTitle', 'נא להזין כותרת'));
      return;
    }
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(String(user.id))) {
      Alert.alert(tHe('error.generic', 'שגיאה'), tHe('admin.calendarReminder.errNeedBarberUser', 'תזכורות היומן נשמרות למשתמש מנהל רגיל. התחברו כמנהל העסק (לא Super Admin).'));
      return;
    }
    if (endTimeDate.getTime() <= startTimeDate.getTime()) {
      Alert.alert(tHe('admin.calendarReminder.validationTimeRange', 'טווח שעות לא תקין'), tHe('admin.calendarReminder.validationTimeRangeHint', 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.'));
      return;
    }
    const duration = minutesBetweenStartEnd(startTimeDate, endTimeDate);
    if (duration < 1) {
      Alert.alert(tHe('admin.calendarReminder.validationTimeRange', 'טווח שעות לא תקין'), tHe('admin.calendarReminder.validationDurationMin', 'בחרו לפחות דקה אחת בין ההתחלה לסיום.'));
      return;
    }
    const timeStr = dateToHHMM(startTimeDate);
    setSaving(true);
    try {
      if (editingReminder) {
        const result = await updateCalendarReminder(editingReminder.id, {
          event_date: eventDateISO,
          start_time: timeStr,
          duration_minutes: duration,
          title: trimmed,
          notes: notes.trim() || null,
          color_key: colorKey,
        });
        if (!result.ok) {
          Alert.alert(tHe('error.generic', 'שגיאה'), calendarReminderSaveErrorHint(result.message, tHe));
        } else {
          await onSaved();
          onClose();
        }
      } else {
        const result = await createCalendarReminder({
          barberId: user.id,
          eventDate: eventDateISO,
          startTime: timeStr,
          durationMinutes: duration,
          title: trimmed,
          notes: notes.trim() || null,
          colorKey,
        });
        if (!result.ok) {
          Alert.alert(tHe('error.generic', 'שגיאה'), calendarReminderSaveErrorHint(result.message, tHe));
        } else {
          await onSaved();
          onClose();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!editingReminder) return;
    Alert.alert(
      tHe('admin.calendarReminder.deleteTitle', 'מחיקת תזכורת'),
      tHe('admin.calendarReminder.deleteMessage', 'האם למחוק את התזכורת מהיומן?'),
      [
        { text: tHe('cancel', 'ביטול'), style: 'cancel' },
        {
          text: tHe('delete', 'מחק'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const ok = await deleteCalendarReminder(editingReminder.id);
              if (!ok) {
                Alert.alert(tHe('error.generic', 'שגיאה'), tHe('admin.calendarReminder.deleteFailed', 'המחיקה נכשלה'));
              } else {
                await onSaved();
                onClose();
              }
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // ── sheet animation & backdrop ──────────────────────────────────────────────
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      index={0}
      enableDynamicSizing={false}
      onDismiss={handleDismiss}
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.dragHandle}
      style={styles.sheetShadow}
      enablePanDownToClose
      topInset={insets.top}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <View style={styles.sheetBody}>
        {/* ── sheet header (no X button) ── */}
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderInner}>
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {editingReminder
                  ? tHe('admin.calendarReminder.editTitle', 'עריכת תזכורת')
                  : tHe('admin.calendarReminder.newTitle', 'תזכורת ביומן')}
              </Text>
              <Text style={styles.sheetSubtitle} numberOfLines={2}>
                {tHe('admin.calendarReminder.hint', 'לא חוסם תורים — מוצג לצד התורים לעזרה לארגון היום')}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
        </View>

        {/* ── scrollable form ── */}
        <BottomSheetScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Title + notes (single card) */}
          <View style={styles.card}>
            <CardSectionHeader
              icon="create-outline"
              primary={primary}
              label={tHe('admin.calendarReminder.fieldTitle', 'כותרת')}
            />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={tHe('admin.calendarReminder.titlePlaceholder', 'למשל: טכנאי מגיע')}
              placeholderTextColor={UI.textTertiary}
              style={[
                styles.textField,
                styles.fieldRtl,
                { borderColor: title.trim() ? `${primary}35` : UI.borderSoft },
              ]}
            />

            <View style={styles.fieldDivider} />

            <View style={styles.subSectionHead}>
              <View style={[styles.subSectionAccent, { backgroundColor: primary }]} />
              <Text style={styles.subSectionTitle}>
                {tHe('admin.calendarReminder.fieldNotes', 'הערות (אופציונלי)')}
              </Text>
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={tHe('admin.calendarReminder.notesPlaceholder', 'פרטים נוספים…')}
              placeholderTextColor={UI.textTertiary}
              style={[
                styles.textField,
                styles.textFieldMultiline,
                styles.fieldRtl,
                { borderColor: notes.trim() ? `${primary}35` : UI.borderSoft },
              ]}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Date card */}
          <View style={styles.card}>
            <CardSectionHeader
              icon="calendar-outline"
              primary={primary}
              label={tHe('admin.hoursAdmin.pickDateShort', 'בחירת תאריך')}
            />
            <View style={styles.calendarShell}>
              <View style={styles.calendarModernBox}>
                <RNCalendar
                  key={`reminder-cal-${calendarLocale}`}
                  current={eventDateISO}
                  onDayPress={(d: { dateString: string }) => onDayPicked(d.dateString)}
                  markedDates={reminderMarkedDates}
                  enableSwipeMonths
                  hideDayNames={false}
                  firstDay={0}
                  renderArrow={calendarRenderArrow}
                  style={{ direction: rtl ? 'rtl' : 'ltr' }}
                  theme={calendarTheme as any}
                />
              </View>
            </View>
          </View>

          {/* Time range card */}
          <View style={styles.card}>
            <CardSectionHeader
              icon="time-outline"
              primary={primary}
              label={tHe('admin.calendarReminder.fieldTimeRange', 'טווח שעות')}
            />
            <View style={[styles.rangeChip, { backgroundColor: rangeDurationMinutes > 0 ? `${primary}12` : '#FFF1F0', borderColor: rangeDurationMinutes > 0 ? `${primary}30` : `${UI.danger}40` }]}>
              <Ionicons
                name={rangeDurationMinutes > 0 ? 'time-outline' : 'warning-outline'}
                size={15}
                color={rangeDurationMinutes > 0 ? primary : UI.danger}
              />
              <Text style={[styles.rangeChipText, { color: rangeDurationMinutes > 0 ? primary : UI.danger }]}>
                {rangeDurationMinutes > 0
                  ? `${formatTimeLabel(startTimeDate)} – ${formatTimeLabel(endTimeDate)} · ${rangeDurationMinutes} ${tHe('admin.calendarReminder.minShort', 'דק׳')}`
                  : tHe('admin.calendarReminder.rangeInvalidHint', 'שעת הסיום אחרי שעת ההתחלה')}
              </Text>
            </View>

            <View style={styles.timeRowsGroup}>
              <TouchableOpacity
                style={styles.timeRow}
                onPress={() => setTimePickerWhich('start')}
                activeOpacity={0.88}
                accessibilityRole="button"
              >
                <View style={styles.timeRowInner}>
                  <View style={[styles.timeBadge, { backgroundColor: `${primary}14` }]}>
                    <Ionicons name="play-outline" size={16} color={primary} />
                  </View>
                  <View style={styles.timeRowTexts}>
                    <Text style={styles.timeRowLabel}>{tHe('admin.calendarReminder.rangeStart', 'התחלה')}</Text>
                    <Text style={[styles.timeRowValue, { color: primary }]}>{formatTimeLabel(startTimeDate)}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={UI.textTertiary} />
                </View>
              </TouchableOpacity>

              <View style={styles.timeRowDivider} />

              <TouchableOpacity
                style={styles.timeRow}
                onPress={() => setTimePickerWhich('end')}
                activeOpacity={0.88}
                accessibilityRole="button"
              >
                <View style={styles.timeRowInner}>
                  <View style={[styles.timeBadge, { backgroundColor: `${primary}14` }]}>
                    <Ionicons name="stop-outline" size={16} color={primary} />
                  </View>
                  <View style={styles.timeRowTexts}>
                    <Text style={styles.timeRowLabel}>{tHe('admin.calendarReminder.rangeEnd', 'סיום')}</Text>
                    <Text style={[styles.timeRowValue, { color: primary }]}>{formatTimeLabel(endTimeDate)}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={UI.textTertiary} />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Color card */}
          <View style={styles.card}>
            <CardSectionHeader
              icon="color-palette-outline"
              primary={primary}
              label={tHe('admin.calendarReminder.fieldColor', 'צבע')}
            />
            <View style={styles.colorRow}>
              {CALENDAR_REMINDER_COLOR_KEYS.map((k) => {
                const pal = reminderPalette(k);
                const on = colorKey === k;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setColorKey(k)}
                    style={[
                      styles.colorDot,
                      { backgroundColor: pal.bar },
                      on && { borderColor: primary, borderWidth: 3, transform: [{ scale: 1.12 }] },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={k}
                  >
                    {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── footer: save + delete ── */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: primary, shadowColor: primary }, saving && styles.saveBtnDisabled]}
              onPress={save}
              disabled={saving}
              activeOpacity={0.9}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" style={styles.saveBtnIcon} />
                  <Text style={styles.saveBtnText}>{tHe('save', 'שמור')}</Text>
                </>
              )}
            </TouchableOpacity>

            {editingReminder ? (
              <TouchableOpacity
                style={styles.deleteTextBtn}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator color={UI.danger} />
                  : <Text style={styles.deleteText}>{tHe('admin.calendarReminder.delete', 'מחיקת תזכורת')}</Text>}
              </TouchableOpacity>
            ) : null}
          </View>
        </BottomSheetScrollView>

        {/* ── time slot picker overlay (inside sheet) ── */}
        <TimeSlotPickerSheet
          visible={timePickerWhich !== null}
          title={
            timePickerWhich === 'end'
              ? tHe('admin.calendarReminder.pickEndTime', 'בחירת שעת סיום')
              : tHe('admin.calendarReminder.pickStartTime', 'בחירת שעת התחלה')
          }
          options={timeSlotOptions}
          selectedHHMM={timePickerWhich === 'end' ? dateToHHMM(endTimeDate) : dateToHHMM(startTimeDate)}
          primary={primary}
          formatOptionLabel={formatSlotLabel}
          onSelect={(hhmm) => {
            const d = timeOnDate(hhmm, reminderDay);
            if (timePickerWhich === 'start') onStartTimeChange(d);
            else onEndTimeChange(d);
          }}
          onClose={() => setTimePickerWhich(null)}
          insetBottom={insets.bottom}
        />
      </View>
    </BottomSheetModal>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── sheet chrome ──────────────────────────────────────────────────────────
  sheetBg: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: UI.surface,
  },
  sheetShadow: {
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 24 },
      android: { elevation: 28 },
    }),
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
    marginTop: 2,
  },
  sheetBody: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // ── header ─────────────────────────────────────────────────────────────────
  sheetHeader: {
    paddingTop: 4,
  },
  sheetHeaderInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetTitleBlock: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: UI.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    alignSelf: 'stretch',
  },
  sheetSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: UI.textSecondary,
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 17,
    alignSelf: 'stretch',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: UI.border,
    marginHorizontal: 0,
  },

  // ── scroll ────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  // ── cards ─────────────────────────────────────────────────────────────────
  card: {
    marginBottom: 14,
    backgroundColor: UI.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: UI.borderSoft,
    alignItems: 'stretch',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 14 },
      android: { elevation: 3 },
    }),
  },
  cardSectionRow: {
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    width: '100%',
  },
  cardSectionLabelWrap: {
    flex: 1,
  },
  cardSectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: UI.text,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textField: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: UI.fieldBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: UI.text,
  },
  textFieldMultiline: {
    minHeight: 96,
    paddingTop: 14,
    fontWeight: '500',
    lineHeight: 22,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: UI.border,
    marginTop: 4,
    marginBottom: 2,
    opacity: 0.85,
  },
  subSectionHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  subSectionAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  subSectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: UI.textSecondary,
    textAlign: 'right',
  },

  // ── calendar ──────────────────────────────────────────────────────────────
  calendarShell: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI.borderSoft,
    backgroundColor: UI.fieldBg,
  },
  calendarModernBox: {
    minHeight: 340,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: UI.surface,
  },

  fieldRtl: { textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch' },

  // ── time range ─────────────────────────────────────────────────────────────
  rangeChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  rangeChipText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    writingDirection: 'ltr',
  },
  timeRowsGroup: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.borderSoft,
    backgroundColor: UI.fieldBg,
    overflow: 'hidden',
  },
  timeRow: {},
  timeRowInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  timeBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeRowTexts: { flex: 1, alignItems: 'flex-end' },
  timeRowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: UI.textTertiary,
    textAlign: 'right',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  timeRowValue: {
    fontSize: 18,
    fontWeight: '800',
    writingDirection: 'ltr',
    textAlign: 'right',
  },
  timeRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: UI.border,
    marginHorizontal: 14,
  },

  // ── color picker ──────────────────────────────────────────────────────────
  colorRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
    width: '100%',
  },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── footer ────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 4,
    marginBottom: 8,
  },
  saveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    borderRadius: 18,
    gap: 6,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.30, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnIcon: { marginStart: 8 },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  deleteTextBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 10,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: UI.danger,
  },

  // ── time slot picker sheet ────────────────────────────────────────────────
  timeSheetHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
  },
  timeSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
  timeSheetCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: UI.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    paddingTop: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.14, shadowRadius: 16 },
      android: { elevation: 20 },
    }),
  },
  timeSheetDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginBottom: 10,
  },
  timeSheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: UI.text,
    paddingHorizontal: 20,
    paddingBottom: 12,
    textAlign: 'right',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.border,
  },
  timeSheetList: { maxHeight: 320 },
  timeSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.border,
  },
  timeSheetRowRtl: { flexDirection: 'row-reverse' },
  timeSheetRowText: { fontSize: 16, fontWeight: '600', color: UI.text },
});
