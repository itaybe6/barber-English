import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  const labelEl = (
    <Text style={[styles.cardTitle, layoutRtl ? styles.hebrewText : styles.cardTitleFlex]}>{label}</Text>
  );
  const iconEl = <Ionicons name={icon} size={20} color={primary} />;
  return (
    <View style={[styles.cardHeader, layoutRtl && styles.cardHeaderRtl]}>
      {layoutRtl ? (
        <>
          {labelEl}
          {iconEl}
        </>
      ) : (
        <>
          {iconEl}
          {labelEl}
        </>
      )}
    </View>
  );
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

export interface CalendarReminderEditorModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  editingReminder: CalendarReminder | null;
  defaultDate: Date;
}

export default function CalendarReminderEditorModal({
  visible,
  onClose,
  onSaved,
  editingReminder,
  defaultDate,
}: CalendarReminderEditorModalProps) {
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
  /**
   * פריסה RTL פיזית: ב־app/index מופעל forceRTL(false), ובנייה באנגלית משאירה i18n.language=en
   * בזמן שכל המסך משתמש ב־tHe (עברית) — לכן אי אפשר להסתמך על isHebrew/I18nManager לכותרות.
   */
  const layoutRtl = true;

  if (visible) {
    LocaleConfig.defaultLocale = calendarLocale;
  }

  const primary = businessColors.primary || '#1A73E8';
  const calendarTheme = useMemo(() => buildCalendarTheme(primary), [primary]);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [eventDateISO, setEventDateISO] = useState(() => toLocalISODate(defaultDate));
  const [timeDate, setTimeDate] = useState(() => timeOnDate('09:00', defaultDate));
  const [duration, setDuration] = useState(30);
  const [colorKey, setColorKey] = useState<CalendarReminderColorKey>('blue');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAndroidTime, setShowAndroidTime] = useState(false);

  const resetFromProps = useCallback(() => {
    if (editingReminder) {
      const day = parseISODateToLocalDay(editingReminder.event_date || '');
      setTitle(editingReminder.title || '');
      setNotes(editingReminder.notes || '');
      setEventDateISO(toLocalISODate(day));
      setTimeDate(timeOnDate(editingReminder.start_time || '09:00', day));
      setDuration(editingReminder.duration_minutes || 30);
      setColorKey((editingReminder.color_key as CalendarReminderColorKey) || 'blue');
    } else {
      const d = new Date(defaultDate);
      d.setHours(0, 0, 0, 0);
      setTitle('');
      setNotes('');
      setEventDateISO(toLocalISODate(d));
      setTimeDate(timeOnDate('09:00', d));
      setDuration(30);
      setColorKey('blue');
    }
  }, [editingReminder, defaultDate]);

  useEffect(() => {
    if (visible) {
      resetFromProps();
      setShowAndroidTime(false);
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
    setTimeDate((prev) => timeOnDate(dateToHHMM(prev), day));
  }, []);

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed || !user?.id) {
      Alert.alert(tHe('admin.calendarReminder.validationTitle', 'נא להזין כותרת'));
      return;
    }
    const timeStr = dateToHHMM(timeDate);
    setSaving(true);
    try {
      if (editingReminder) {
        const ok = await updateCalendarReminder(editingReminder.id, {
          event_date: eventDateISO,
          start_time: timeStr,
          duration_minutes: duration,
          title: trimmed,
          notes: notes.trim() || null,
          color_key: colorKey,
        });
        if (!ok) {
          Alert.alert(tHe('error.generic', 'שגיאה'), tHe('admin.calendarReminder.saveFailed', 'לא ניתן לשמור'));
        } else {
          await onSaved();
          onClose();
        }
      } else {
        const row = await createCalendarReminder({
          barberId: user.id,
          eventDate: eventDateISO,
          startTime: timeStr,
          durationMinutes: duration,
          title: trimmed,
          notes: notes.trim() || null,
          colorKey,
        });
        if (!row) {
          Alert.alert(tHe('error.generic', 'שגיאה'), tHe('admin.calendarReminder.saveFailed', 'לא ניתן לשמור'));
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, layoutRtl && styles.rtlRoot]}>
        <SafeAreaView style={[styles.safeTop, layoutRtl && styles.rtlRoot]} edges={['top', 'left', 'right']}>
          <LinearGradient
            colors={[`${primary}18`, `${primary}06`, 'transparent']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.headerRow}>
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
              <Text style={[styles.headerTitle, layoutRtl && styles.hebrewText]} numberOfLines={1}>
                {editingReminder
                  ? tHe('admin.calendarReminder.editTitle', 'עריכת תזכורת')
                  : tHe('admin.calendarReminder.newTitle', 'תזכורת ביומן')}
              </Text>
              <Text style={[styles.headerSubtitle, layoutRtl && styles.hebrewText]} numberOfLines={2}>
                {tHe(
                  'admin.calendarReminder.hint',
                  'לא חוסם תורים — מוצג לצד התורים לעזרה לארגון היום'
                )}
              </Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>

        <KeyboardAwareScreenScroll
          style={[styles.scrollFlex, layoutRtl && styles.rtlRoot]}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, layoutRtl && styles.rtlRoot]}>
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
              style={[styles.titleInput, layoutRtl && styles.hebrewText]}
            />
          </View>

          <View style={[styles.card, layoutRtl && styles.rtlRoot]}>
            <CardSectionHeader
              icon="calendar-outline"
              layoutRtl={layoutRtl}
              primary={primary}
              label={tHe('admin.hoursAdmin.pickDateShort', 'בחירת תאריך')}
            />
            <View style={styles.calendarShell}>
              <RNCalendar
                key={`reminder-cal-${calendarLocale}`}
                current={eventDateISO}
                onDayPress={(d: { dateString: string }) => onDayPicked(d.dateString)}
                markedDates={{ [eventDateISO]: { selected: true, selectedColor: primary } }}
                enableSwipeMonths
                hideDayNames={false}
                firstDay={0}
                renderArrow={calendarRenderArrow}
                style={{ direction: layoutRtl ? 'rtl' : 'ltr' }}
                theme={calendarTheme as object}
              />
            </View>
          </View>

          <View style={[styles.card, layoutRtl && styles.rtlRoot]}>
            <CardSectionHeader
              icon="time-outline"
              layoutRtl={layoutRtl}
              primary={primary}
              label={tHe('admin.calendarReminder.fieldTime', 'שעה')}
            />
            {Platform.OS === 'android' ? (
              <TouchableOpacity
                style={styles.timeRow}
                onPress={() => setShowAndroidTime(true)}
                activeOpacity={0.88}
              >
                <View style={[styles.timeRowInner, layoutRtl && styles.timeRowInnerRtl]}>
                  <View style={[styles.timeBadge, { backgroundColor: `${primary}14` }]}>
                    <Ionicons name="time" size={18} color={primary} />
                  </View>
                  <Text style={[styles.timeRowValue, { writingDirection: 'ltr', textAlign: layoutRtl ? 'right' : 'left' }]}>
                    {formatTimeLabel(timeDate)}
                  </Text>
                  <Ionicons name={layoutRtl ? 'chevron-back' : 'chevron-forward'} size={20} color={UI.textTertiary} />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.timeRow}>
                <View style={[styles.timeRowInner, layoutRtl && styles.timeRowInnerRtl]}>
                  <View style={[styles.timeBadge, { backgroundColor: `${primary}14` }]}>
                    <Ionicons name="time" size={18} color={primary} />
                  </View>
                  <Text style={[styles.timeRowValue, { writingDirection: 'ltr', textAlign: layoutRtl ? 'right' : 'left' }]}>
                    {formatTimeLabel(timeDate)}
                  </Text>
                </View>
              </View>
            )}
            {Platform.OS === 'ios' && (
              <View style={styles.iosPickerWrap}>
                <DateTimePicker
                  value={timeDate}
                  mode="time"
                  display="spinner"
                  themeVariant="light"
                  style={styles.iosPicker}
                  onChange={(_, d) => {
                    if (d) setTimeDate(d);
                  }}
                  locale={isHebrew ? 'he-IL' : 'en-US'}
                />
              </View>
            )}
          </View>

          <View style={[styles.card, layoutRtl && styles.rtlRoot]}>
            <CardSectionHeader
              icon="hourglass-outline"
              layoutRtl={layoutRtl}
              primary={primary}
              label={tHe('admin.calendarReminder.fieldDuration', 'משך')}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={layoutRtl ? { direction: 'rtl' } : undefined}
              contentContainerStyle={styles.durationRow}
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setDuration(m)}
                  style={[
                    styles.durationChip,
                    duration === m && { backgroundColor: primary, borderColor: primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      layoutRtl && styles.hebrewText,
                      duration === m && styles.durationChipTextActive,
                    ]}
                  >
                    {`${m} ${tHe('admin.calendarReminder.minShort', 'דק׳')}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.card, layoutRtl && styles.rtlRoot]}>
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

          <View style={[styles.card, layoutRtl && styles.rtlRoot]}>
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

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <LinearGradient colors={[UI.bg, UI.bg]} style={StyleSheet.absoluteFill} />
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
                <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" style={{ marginEnd: 8 }} />
                <Text style={[styles.saveBtnText, layoutRtl && styles.hebrewText]}>{tHe('save', 'שמירה')}</Text>
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
      </View>

      {Platform.OS === 'android' && showAndroidTime ? (
        <DateTimePicker
          value={timeDate}
          mode="time"
          display="default"
          onChange={(ev, date) => {
            setShowAndroidTime(false);
            if (ev.type === 'set' && date) setTimeDate(date);
          }}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  rtlRoot: { direction: 'rtl' },
  safeTop: { zIndex: 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
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
  headerTitles: { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  /** RTL/Hebrew: stretch so `textAlign: 'right'` anchors to the physical right edge */
  headerTitlesRtl: { alignSelf: 'stretch', width: '100%', alignItems: 'stretch' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: UI.text, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: UI.textSecondary, marginTop: 4, lineHeight: 18 },
  hebrewText: { textAlign: 'right', writingDirection: 'rtl' },
  card: {
    marginHorizontal: 16,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    width: '100%',
  },
  cardHeaderRtl: { justifyContent: 'flex-end' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: UI.text },
  cardTitleFlex: { flex: 1 },
  calendarShell: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.surface,
  },
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
  iosPickerWrap: { marginTop: 8, alignItems: 'center' },
  iosPicker: { height: 180, width: '100%' },
  durationRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  durationChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: UI.border,
    backgroundColor: 'rgba(60,60,67,0.04)',
  },
  durationChipText: { fontSize: 14, fontWeight: '700', color: UI.text },
  durationChipTextActive: { color: '#FFFFFF' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-start' },
  colorRowRtl: { justifyContent: 'flex-end' },
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
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
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
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  deleteTextBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  deleteText: { fontSize: 15, fontWeight: '700', color: UI.danger },
});
