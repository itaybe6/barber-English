import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { useTranslation } from 'react-i18next';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
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

const UI = {
  bg: '#F2F4F8',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#636366',
  textTertiary: '#8E8E93',
  border: 'rgba(60, 60, 67, 0.12)',
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

/** 15 דק׳ — מספיק לרוב הלוחות; ערכים שאינם על הרשת נשמרים ברשימה */
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
    return tHe(
      'admin.calendarReminder.errTableMissing',
      'טבלת התזכורות לא קיימת או לא מסונכרנת בשרת. יש להריץ מיגרציות Supabase (כולל יצירת calendar_reminders והרשאות).'
    );
  }
  if (s.includes('permission denied') || s.includes('42501')) {
    return tHe(
      'admin.calendarReminder.errPermission',
      'אין הרשאה לכתוב לטבלת התזכורות. בדקו הרשאות anon/authenticated על calendar_reminders ב-Supabase.'
    );
  }
  if (s.includes('foreign key') || s.includes('23503') || s.includes('violates foreign key')) {
    return tHe(
      'admin.calendarReminder.errFkUser',
      'המזהה של המשתמש לא תואם לרשומה בטבלת users — נסו להתנתק ולהתחבר מחדש.'
    );
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

function CardSectionHeader({
  icon,
  label,
  layoutRtl,
  primary,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  layoutRtl: boolean;
  primary: string;
}) {
  if (layoutRtl) {
    return (
      <View style={{ direction: 'ltr', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, width: '100%' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: UI.text, textAlign: 'right' }} numberOfLines={3}>
            {label}
          </Text>
        </View>
        <Ionicons name={icon} size={20} color={primary} />
      </View>
    );
  }
  return (
    <View style={styles.cardHeader}>
      <Ionicons name={icon} size={20} color={primary} />
      <Text style={[styles.cardTitle, styles.cardTitleFlex]}>{label}</Text>
    </View>
  );
}

function buildCalendarTheme(primary: string, layoutRtl: boolean) {
  const weekDir = layoutRtl ? ('row-reverse' as const) : ('row' as const);
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
      ...(layoutRtl
        ? {
            header: {
              flexDirection: 'row-reverse',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingLeft: 10,
              paddingRight: 10,
              marginTop: 6,
            },
            monthText: {
              textAlign: 'right',
              writingDirection: 'rtl',
            },
          }
        : {}),
      week: { flexDirection: weekDir, justifyContent: 'space-around', paddingVertical: 4 },
      dayHeader: { textAlign: 'center', color: UI.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    },
    'stylesheet.day.basic': {
      base: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    },
    'stylesheet.calendar.main': {
      week: { marginTop: 6, marginBottom: 6, flexDirection: weekDir, justifyContent: 'space-around' },
    },
  } as const;
}

function TimeSlotPickerSheet({
  visible,
  title,
  options,
  selectedHHMM,
  primary,
  layoutRtl,
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
  layoutRtl: boolean;
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
        accessibilityLabel={layoutRtl ? 'סגור' : 'Close'}
      />
      <View style={[styles.timeSheetCard, { paddingBottom: Math.max(insetBottom, 16) }]}>
        <Text style={[styles.timeSheetTitle, layoutRtl && styles.hebrewTextBlock]} numberOfLines={1}>
          {title}
        </Text>
        <ScrollView
          style={styles.timeSheetList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          bounces={false}
        >
          {options.map((item) => {
            const on = item === selectedHHMM.slice(0, 5);
            return (
              <TouchableOpacity
                key={item}
                style={[styles.timeSheetRow, layoutRtl && styles.timeSheetRowRtl, on && { backgroundColor: `${primary}18` }]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                activeOpacity={0.72}
              >
                <Text
                  style={[
                    styles.timeSheetRowText,
                    { writingDirection: 'ltr' },
                    layoutRtl && { textAlign: 'right' },
                    on && { color: primary, fontWeight: '800' },
                  ]}
                >
                  {formatOptionLabel(item)}
                </Text>
                {on ? <Ionicons name="checkmark-circle" size={22} color={primary} /> : <View style={{ width: 22 }} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export interface CalendarReminderEditorModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  editingReminder: CalendarReminder | null;
  defaultDate: Date;
}

function CalendarReminderEditorModalInner({
  visible,
  onClose,
  onSaved,
  editingReminder,
  defaultDate,
}: CalendarReminderEditorModalProps) {
  const insets = useSafeAreaInsets();
  const gutterHorizontal = useMemo(() => ({ marginHorizontal: 16 }), []);
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
  /** Modal copy is loaded with `lng: 'he'` (tHe) — always RTL layout for labels and fields */
  const layoutRtl = true;

  if (visible) {
    LocaleConfig.defaultLocale = calendarLocale;
  }

  const primary = businessColors.primary || '#1A73E8';
  const calendarTheme = useMemo(() => buildCalendarTheme(primary, layoutRtl), [primary, layoutRtl]);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [eventDateISO, setEventDateISO] = useState(() => toLocalISODate(defaultDate));
  const [startTimeDate, setStartTimeDate] = useState(() => timeOnDate('09:00', defaultDate));
  const [endTimeDate, setEndTimeDate] = useState(() => timeOnDate('09:30', defaultDate));
  const [colorKey, setColorKey] = useState<CalendarReminderColorKey>('blue');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [timePickerWhich, setTimePickerWhich] = useState<'start' | 'end' | null>(null);

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

  const formatTimeLabel = useCallback((d: Date) => {
    try {
      const fmt = new Intl.DateTimeFormat(isHebrew ? 'he-IL' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      return fmt.format(d);
    } catch {
      return dateToHHMM(d);
    }
  }, [isHebrew]);

  const reminderDay = useMemo(() => parseISODateToLocalDay(eventDateISO), [eventDateISO]);

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
  useEffect(() => {
    startTimeRef.current = startTimeDate;
  }, [startTimeDate]);

  const onStartTimeChange = useCallback((d: Date) => {
    setStartTimeDate(d);
    setEndTimeDate((prev) => (prev.getTime() <= d.getTime() ? addMinutesToDate(d, 30) : prev));
  }, []);

  const onEndTimeChange = useCallback((d: Date) => {
    const s = startTimeRef.current;
    if (d.getTime() <= s.getTime()) {
      setEndTimeDate(addMinutesToDate(s, 30));
    } else {
      setEndTimeDate(d);
    }
  }, []);

  const calendarRenderArrow = useCallback(
    (direction: string) => {
      const size = 22;
      if (layoutRtl) {
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
    [primary, layoutRtl]
  );

  const onDayPicked = useCallback((dateString: string) => {
    setEventDateISO(dateString);
    const day = parseISODateToLocalDay(dateString);
    setStartTimeDate((prev) => timeOnDate(dateToHHMM(prev), day));
    setEndTimeDate((prev) => timeOnDate(dateToHHMM(prev), day));
  }, []);

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed || !user?.id) {
      Alert.alert(tHe('admin.calendarReminder.validationTitle', 'נא להזין כותרת'));
      return;
    }
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(String(user.id))) {
      Alert.alert(
        tHe('error.generic', 'שגיאה'),
        tHe(
          'admin.calendarReminder.errNeedBarberUser',
          'תזכורות היומן נשמרות למשתמש מנהל רגיל. התחברו כמנהל העסק (לא Super Admin).'
        )
      );
      return;
    }
    if (endTimeDate.getTime() <= startTimeDate.getTime()) {
      Alert.alert(
        tHe('admin.calendarReminder.validationTimeRange', 'טווח שעות לא תקין'),
        tHe(
          'admin.calendarReminder.validationTimeRangeHint',
          'שעת הסיום חייבת להיות אחרי שעת ההתחלה.'
        )
      );
      return;
    }
    const duration = minutesBetweenStartEnd(startTimeDate, endTimeDate);
    if (duration < 1) {
      Alert.alert(
        tHe('admin.calendarReminder.validationTimeRange', 'טווח שעות לא תקין'),
        tHe('admin.calendarReminder.validationDurationMin', 'בחרו לפחות דקה אחת בין ההתחלה לסיום.')
      );
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
          Alert.alert(
            tHe('error.generic', 'שגיאה'),
            calendarReminderSaveErrorHint(result.message, tHe)
          );
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
          Alert.alert(
            tHe('error.generic', 'שגיאה'),
            calendarReminderSaveErrorHint(result.message, tHe)
          );
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

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.headerSafeWrap}>
        <LinearGradient
          colors={[`${primary}18`, `${primary}06`, 'transparent']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.headerRow, layoutRtl && styles.headerRowRtl, styles.headerRowPad]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.headerIconBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={tHe('close', 'סגור')}
          >
            <View style={[styles.iconCircle, { backgroundColor: UI.surface }]}>
              <Ionicons name="close" size={22} color={UI.text} />
            </View>
          </TouchableOpacity>
          <View style={[styles.headerTitles, layoutRtl && styles.headerTitlesRtl]}>
            <Text style={[styles.headerTitle, layoutRtl && styles.hebrewTextBlock]} numberOfLines={1}>
              {editingReminder
                ? tHe('admin.calendarReminder.editTitle', 'עריכת תזכורת')
                : tHe('admin.calendarReminder.newTitle', 'תזכורת ביומן')}
            </Text>
            <Text style={[styles.headerSubtitle, layoutRtl && styles.hebrewTextBlock]} numberOfLines={2}>
              {tHe(
                'admin.calendarReminder.hint',
                'לא חוסם תורים — מוצג לצד התורים לעזרה לארגון היום'
              )}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>

      <KeyboardAwareScreenScroll
        style={styles.scrollFlex}
        contentContainerStyle={[styles.scrollContent, layoutRtl && styles.scrollContentRtl]}
        keyboardShouldPersistTaps="handled"
      >
          <View style={[styles.card, layoutRtl && styles.cardRtl, gutterHorizontal]}>
            <CardSectionHeader
              icon="create-outline"
              layoutRtl={layoutRtl}
              primary={primary}
              label={tHe('admin.calendarReminder.fieldTitle', 'כותרת')}
            />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={tHe('admin.calendarReminder.titlePlaceholder', 'למשל: טכנאי מגיע')}
              placeholderTextColor={UI.textTertiary}
              style={[styles.titleInput, layoutRtl && styles.hebrewText, layoutRtl && styles.fieldRtl]}
            />
          </View>

          <View style={[styles.card, layoutRtl && styles.cardRtl, gutterHorizontal]}>
            <CardSectionHeader
              icon="calendar-outline"
              layoutRtl={layoutRtl}
              primary={primary}
              label={tHe('admin.hoursAdmin.pickDateShort', 'בחירת תאריך')}
            />
            <View style={[styles.calendarShell, layoutRtl && styles.calendarShellRtl]}>
              <RNCalendar
                key={`reminder-cal-${calendarLocale}`}
                current={eventDateISO}
                onDayPress={(d: { dateString: string }) => onDayPicked(d.dateString)}
                markedDates={{ [eventDateISO]: { selected: true, selectedColor: primary } }}
                enableSwipeMonths
                hideDayNames={false}
                firstDay={0}
                renderArrow={calendarRenderArrow}
                style={layoutRtl ? styles.calendarRtl : undefined}
                theme={calendarTheme as object}
              />
            </View>
          </View>

          <View style={[styles.card, layoutRtl && styles.cardRtl, gutterHorizontal]}>
            <CardSectionHeader
              icon="time-outline"
              layoutRtl={layoutRtl}
              primary={primary}
              label={tHe('admin.calendarReminder.fieldTimeRange', 'טווח שעות')}
            />
            <Text
              style={[
                styles.rangeHint,
                layoutRtl && styles.hebrewTextBlock,
                { color: rangeDurationMinutes > 0 ? UI.textSecondary : UI.danger },
              ]}
            >
              {rangeDurationMinutes > 0
                ? `${formatTimeLabel(startTimeDate)} – ${formatTimeLabel(endTimeDate)} · ${rangeDurationMinutes} ${tHe('admin.calendarReminder.minShort', 'דק׳')}`
                : tHe('admin.calendarReminder.rangeInvalidHint', 'שעת הסיום אחרי שעת ההתחלה')}
            </Text>

            <Text style={[styles.timeSubLabel, layoutRtl && styles.hebrewTextBlock]}>
              {tHe('admin.calendarReminder.rangeStart', 'התחלה')}
            </Text>
            <TouchableOpacity
              style={styles.timeRow}
              onPress={() => setTimePickerWhich('start')}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={tHe('admin.calendarReminder.rangeStart', 'התחלה')}
            >
              <View style={[styles.timeRowInner, layoutRtl && styles.timeRowInnerRtl]}>
                <View style={[styles.timeBadge, { backgroundColor: `${primary}14` }]}>
                  <Ionicons name="play-outline" size={18} color={primary} />
                </View>
                <Text style={[styles.timeRowValue, { writingDirection: 'ltr', textAlign: layoutRtl ? 'right' : 'left' }]}>
                  {formatTimeLabel(startTimeDate)}
                </Text>
                <Ionicons name="chevron-down" size={20} color={UI.textTertiary} />
              </View>
            </TouchableOpacity>

            <Text style={[styles.timeSubLabel, styles.timeSubLabelSpaced, layoutRtl && styles.hebrewTextBlock]}>
              {tHe('admin.calendarReminder.rangeEnd', 'סיום')}
            </Text>
            <TouchableOpacity
              style={styles.timeRow}
              onPress={() => setTimePickerWhich('end')}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={tHe('admin.calendarReminder.rangeEnd', 'סיום')}
            >
              <View style={[styles.timeRowInner, layoutRtl && styles.timeRowInnerRtl]}>
                <View style={[styles.timeBadge, { backgroundColor: `${primary}14` }]}>
                  <Ionicons name="stop-outline" size={18} color={primary} />
                </View>
                <Text style={[styles.timeRowValue, { writingDirection: 'ltr', textAlign: layoutRtl ? 'right' : 'left' }]}>
                  {formatTimeLabel(endTimeDate)}
                </Text>
                <Ionicons name="chevron-down" size={20} color={UI.textTertiary} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, layoutRtl && styles.cardRtl, gutterHorizontal]}>
            <CardSectionHeader
              icon="color-palette-outline"
              layoutRtl={layoutRtl}
              primary={primary}
              label={tHe('admin.calendarReminder.fieldColor', 'צבע')}
            />
            <View style={[styles.colorRow, layoutRtl && styles.colorRowRtl]}>
              {CALENDAR_REMINDER_COLOR_KEYS.map((k) => {
                const pal = reminderPalette(k);
                const on = colorKey === k;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setColorKey(k)}
                    style={[styles.colorDot, { backgroundColor: pal.bar }, on && { borderColor: primary, borderWidth: 3 }]}
                    accessibilityRole="button"
                    accessibilityLabel={k}
                  />
                );
              })}
            </View>
          </View>

          <View style={[styles.card, layoutRtl && styles.cardRtl, gutterHorizontal]}>
            <CardSectionHeader
              icon="chatbubble-ellipses-outline"
              layoutRtl={layoutRtl}
              primary={primary}
              label={tHe('admin.calendarReminder.fieldNotes', 'הערות (אופציונלי)')}
            />
            <View style={[styles.notesShell, { borderColor: notes.trim() ? `${primary}40` : UI.border }]}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={tHe('admin.calendarReminder.notesPlaceholder', 'פרטים נוספים…')}
                placeholderTextColor={UI.textTertiary}
                style={[
                  styles.notesInput,
                  layoutRtl
                    ? { textAlign: 'right', writingDirection: 'rtl' }
                    : { textAlign: 'left', writingDirection: 'ltr' },
                ]}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>
      </KeyboardAwareScreenScroll>

        <View style={[styles.footer, styles.footerPad]}>
          <LinearGradient colors={[UI.bg, UI.bg]} style={StyleSheet.absoluteFill} />
          <TouchableOpacity
            style={[
              styles.saveBtn,
              layoutRtl && styles.saveBtnRtl,
              { backgroundColor: primary, shadowColor: primary },
              saving && styles.saveBtnDisabled,
            ]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.9}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={22}
                  color="#FFFFFF"
                  style={layoutRtl ? { marginStart: 8 } : { marginEnd: 8 }}
                />
                <Text style={styles.saveBtnText}>{tHe('save', 'שמירה')}</Text>
              </>
            )}
          </TouchableOpacity>
          {editingReminder ? (
            <TouchableOpacity
              style={styles.deleteTextBtn}
              onPress={confirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color={UI.danger} />
              ) : (
                <Text style={styles.deleteText}>{tHe('admin.calendarReminder.delete', 'מחיקת תזכורת')}</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

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
          layoutRtl={layoutRtl}
          formatOptionLabel={formatSlotLabel}
          onSelect={(hhmm) => {
            const d = timeOnDate(hhmm, reminderDay);
            if (timePickerWhich === 'start') onStartTimeChange(d);
            else onEndTimeChange(d);
          }}
          onClose={() => setTimePickerWhich(null)}
          insetBottom={insets.bottom}
        />
    </SafeAreaView>
  );
}

export default function CalendarReminderEditorModal(props: CalendarReminderEditorModalProps) {
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
        <CalendarReminderEditorModalInner {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg, direction: 'ltr' },
  headerSafeWrap: { zIndex: 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    gap: 12,
  },
  /** Physical mirror: כפתור סגירה מימין, כותרות במרכז-שמאל */
  headerRowRtl: { flexDirection: 'row-reverse' },
  headerRowPad: { paddingHorizontal: 16 },
  footerPad: { paddingHorizontal: 16, paddingBottom: 12 },
  headerIconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UI.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  scrollFlex: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  scrollContentRtl: { flexGrow: 1, alignItems: 'stretch' },
  headerTitles: { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitlesRtl: { alignSelf: 'stretch', alignItems: 'stretch' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: UI.text, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: UI.textSecondary, marginTop: 4, lineHeight: 18 },
  hebrewText: { textAlign: 'right', writingDirection: 'rtl' },
  hebrewTextBlock: {
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  card: {
    marginTop: 14,
    backgroundColor: UI.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: UI.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 16 },
      android: { elevation: 3 },
    }),
  },
  cardRtl: { alignItems: 'stretch' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    width: '100%',
  },
  cardHeaderRtlExplicit: {
    alignSelf: 'stretch',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: UI.text },
  cardTitleFlex: { flex: 1 },
  cardTitleRtlExplicit: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: UI.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  calendarShell: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.surface,
  },
  calendarShellRtl: { alignSelf: 'stretch' },
  calendarRtl: { width: '100%', alignSelf: 'stretch' },
  timeRow: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: UI.border,
    backgroundColor: 'rgba(60,60,67,0.04)',
    overflow: 'hidden',
  },
  timeRowInner: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  timeRowInnerRtl: { flexDirection: 'row-reverse' },
  timeBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  timeRowValue: { flex: 1, fontSize: 17, fontWeight: '800', color: UI.text },
  rangeHint: { fontSize: 14, fontWeight: '600', marginBottom: 14, lineHeight: 20 },
  timeSubLabel: { fontSize: 13, fontWeight: '700', color: UI.textSecondary, marginBottom: 8 },
  timeSubLabelSpaced: { marginTop: 4 },
  timeSheetHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
  },
  timeSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  timeSheetCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: UI.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '58%',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: UI.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  timeSheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: UI.text,
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  timeSheetRowText: { fontSize: 17, fontWeight: '600', color: UI.text },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-start', width: '100%' },
  /** row-reverse + flex-start = התחלה מימין (בלי לסמוך על direction:rtl באנדרואיד) */
  colorRowRtl: { flexDirection: 'row-reverse', justifyContent: 'flex-start' },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  notesShell: {
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(60,60,67,0.03)',
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  notesInput: { fontSize: 16, fontWeight: '600', color: UI.text, minHeight: 72 },
  titleInput: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: UI.border,
    backgroundColor: 'rgba(60,60,67,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: UI.text,
  },
  fieldRtl: { alignSelf: 'stretch' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UI.border,
    backgroundColor: UI.bg,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 18,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  saveBtnRtl: { flexDirection: 'row-reverse' },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  deleteTextBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  deleteText: { fontSize: 15, fontWeight: '700', color: UI.danger },
});
