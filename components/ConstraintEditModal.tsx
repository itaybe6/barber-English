import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { businessConstraintsApi } from '@/lib/api/businessConstraints';
import { findBookedAppointmentsOverlappingConstraintWindows } from '@/lib/api/constraintAppointmentConflicts';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import type { BusinessConstraint } from '@/lib/supabase';

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

const UI = {
  bg: 'rgba(0,0,0,0.45)',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#636366',
  border: 'rgba(60, 60, 67, 0.12)',
  danger: '#FF3B30',
};

const SLOT_OPTIONS_15 = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function sliceHHMM(t: string | null | undefined): string {
  const s = String(t || '').trim().slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const parts = s.split(':');
  if (parts.length >= 2) {
    const h = String(parseInt(parts[0] || '0', 10)).padStart(2, '0');
    const m = String(parseInt(parts[1] || '0', 10)).padStart(2, '0');
    return `${h}:${m}`;
  }
  return '09:00';
}

function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function nearestSlot15(hhmm: string): string {
  const raw = sliceHHMM(hhmm);
  const idx = SLOT_OPTIONS_15.findIndex((o) => o === raw);
  if (idx >= 0) return raw;
  const mins = minutesFromHHMM(raw);
  const slot = Math.round(mins / 15);
  const clamped = Math.max(0, Math.min(SLOT_OPTIONS_15.length - 1, slot));
  return SLOT_OPTIONS_15[clamped] ?? '09:00';
}

function isFullDayStored(c: BusinessConstraint): boolean {
  const s = sliceHHMM(c.start_time);
  const e = sliceHHMM(c.end_time);
  if (s !== '00:00') return false;
  return minutesFromHHMM(e) >= 23 * 60 + 45;
}

/**
 * In-modal time sheet (no nested Modal — nested Modal often fails on Android / behind parent).
 */
function TimePickerSheet({
  title,
  options,
  selected,
  onSelect,
  onClose,
  primary,
  rtl,
  bottomInset,
}: {
  title: string;
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  primary: string;
  rtl: boolean;
  bottomInset: number;
}) {
  return (
    <View style={pickerStyles.overlayRoot} pointerEvents="box-none">
      <Pressable style={pickerStyles.overlayDim} onPress={onClose} accessibilityRole="button" accessibilityLabel={title} />
      <View style={[pickerStyles.card, { paddingBottom: bottomInset + 16, zIndex: 2 }]}>
        <View style={[pickerStyles.cardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Text style={[pickerStyles.cardTitle, { textAlign: rtl ? 'right' : 'left', flex: 1 }]} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Ionicons name="close" size={26} color={UI.textSecondary} />
          </TouchableOpacity>
        </View>
        <FlatList
          key={title}
          data={options}
          keyExtractor={(item) => item}
          style={pickerStyles.list}
          contentContainerStyle={pickerStyles.listContent}
          showsVerticalScrollIndicator
          {...(options.length > 0
            ? {
                initialScrollIndex: Math.max(0, options.indexOf(selected)),
                getItemLayout: (_: unknown, index: number) => ({ length: 52, offset: 52 * index, index }),
              }
            : {})}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = item === selected;
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={[pickerStyles.row, active && { backgroundColor: `${primary}14` }]}
              >
                <Text
                  style={[
                    pickerStyles.rowText,
                    active && { color: primary, fontWeight: '800' },
                    { textAlign: rtl ? 'right' : 'left', writingDirection: 'ltr' },
                  ]}
                >
                  {item}
                </Text>
                {active ? <Ionicons name="checkmark-circle" size={22} color={primary} /> : <View style={{ width: 22 }} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
    justifyContent: 'flex-end',
  },
  overlayDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  card: {
    backgroundColor: UI.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '72%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UI.border,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 24 },
    }),
  },
  cardHeader: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.border,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: UI.text,
  },
  list: { maxHeight: 360 },
  listContent: { paddingVertical: 8, paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.08)',
  },
  rowText: {
    fontSize: 18,
    fontWeight: '600',
    color: UI.text,
  },
});

function DeleteConfirmOverlay({
  title,
  message,
  cancelLabel,
  confirmLabel,
  errorText,
  deleting,
  onCancel,
  onConfirm,
  rtl,
}: {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  errorText: string | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  rtl: boolean;
}) {
  return (
    <View style={deleteConfirmStyles.root} pointerEvents="box-none">
      <Pressable style={deleteConfirmStyles.dim} onPress={deleting ? undefined : onCancel} accessibilityRole="button" />
      <View style={deleteConfirmStyles.card}>
        <Text style={[deleteConfirmStyles.cardTitle, { textAlign: 'center', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
          {title}
        </Text>
        <Text style={[deleteConfirmStyles.cardBody, { textAlign: 'center', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
          {message}
        </Text>
        {errorText ? (
          <Text style={[deleteConfirmStyles.errorText, { textAlign: 'center', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
            {errorText}
          </Text>
        ) : null}
        <View style={[deleteConfirmStyles.actions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity style={deleteConfirmStyles.cancelBtn} onPress={onCancel} disabled={deleting} activeOpacity={0.8}>
            <Text style={deleteConfirmStyles.cancelBtnText}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[deleteConfirmStyles.confirmBtn, { backgroundColor: UI.danger, opacity: deleting ? 0.75 : 1 }]}
            onPress={onConfirm}
            disabled={deleting}
            activeOpacity={0.85}
          >
            {deleting ? <ActivityIndicator color="#fff" /> : <Text style={deleteConfirmStyles.confirmBtnText}>{confirmLabel}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const deleteConfirmStyles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
    elevation: 3000,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: UI.surface,
    borderRadius: 16,
    padding: 20,
    zIndex: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UI.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: UI.text,
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 15,
    fontWeight: '600',
    color: UI.textSecondary,
    lineHeight: 21,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: UI.danger,
    marginBottom: 12,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: UI.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export interface ConstraintEditModalProps {
  visible: boolean;
  constraint: BusinessConstraint | null;
  onClose: () => void;
  onSaved: (payload?: { dateMin: string; dateMax: string }) => void;
}

export default function ConstraintEditModal({ visible, constraint, onClose, onSaved }: ConstraintEditModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useBusinessColors();
  const primary = colors.primary;
  const { t, i18n } = useTranslation();
  const rawLang = (i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  const isHebrew = rawLang.startsWith('he') || rawLang.startsWith('iw');
  const calendarLocale = isHebrew ? 'he' : 'en';
  const dateLocale = isHebrew ? 'he-IL' : 'en-US';
  const rtl = isHebrew || I18nManager.isRTL;

  if (visible) {
    LocaleConfig.defaultLocale = calendarLocale;
  }

  const [dateISO, setDateISO] = useState('');
  const [startHHMM, setStartHHMM] = useState('09:00');
  const [endHHMM, setEndHHMM] = useState('10:00');
  const [reason, setReason] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [timePicker, setTimePicker] = useState<null | 'start' | 'end'>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveConflictMsg, setSaveConflictMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setTimePicker(null);
      setDeleteConfirmOpen(false);
      setDeleteError(null);
      setSaveConflictMsg(null);
    }
  }, [visible]);

  useEffect(() => {
    setSaveConflictMsg(null);
  }, [dateISO, startHHMM, endHHMM, allDay]);

  useEffect(() => {
    if (!visible || !constraint) return;
    setDateISO(constraint.date);
    const fd = isFullDayStored(constraint);
    setAllDay(fd);
    setStartHHMM(fd ? '00:00' : nearestSlot15(sliceHHMM(constraint.start_time)));
    setEndHHMM(fd ? '23:59' : nearestSlot15(sliceHHMM(constraint.end_time)));
    setReason(constraint.reason?.trim() ?? '');
  }, [visible, constraint]);

  useEffect(() => {
    if (allDay) return;
    if (minutesFromHHMM(endHHMM) <= minutesFromHHMM(startHHMM)) {
      const next = SLOT_OPTIONS_15.find((o) => minutesFromHHMM(o) > minutesFromHHMM(startHHMM));
      if (next) setEndHHMM(next);
    }
  }, [allDay, startHHMM, endHHMM]);

  const calendarTheme = useMemo(
    () => ({
      backgroundColor: UI.surface,
      calendarBackground: UI.surface,
      textSectionTitleColor: UI.text,
      textDayFontWeight: '600' as const,
      textMonthFontWeight: '800' as const,
      arrowColor: primary,
      selectedDayBackgroundColor: primary,
      todayTextColor: primary,
      dayTextColor: UI.text,
      monthTextColor: UI.text,
    }),
    [primary]
  );

  const formatDatePretty = useCallback(
    (iso: string) => {
      try {
        const dt = new Date(`${iso}T12:00:00`);
        return dt.toLocaleDateString(dateLocale, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch {
        return iso;
      }
    },
    [dateLocale]
  );

  const underlyingIds = useMemo(() => {
    if (!constraint?.id) return [];
    return constraint.id.split('|').filter((x) => x.length > 0);
  }, [constraint]);

  const isComposite = underlyingIds.length > 1;

  const endSlotOptions = useMemo(() => {
    if (allDay) return SLOT_OPTIONS_15;
    const sm = minutesFromHHMM(startHHMM);
    const filtered = SLOT_OPTIONS_15.filter((o) => minutesFromHHMM(o) > sm);
    if (filtered.length === 0) return ['23:59'];
    return filtered;
  }, [allDay, startHHMM]);

  const handleSave = async () => {
    if (!constraint) return;
    if (underlyingIds.length === 0) {
      Alert.alert(t('error.generic', 'Error'), t('admin.calendar.constraintEditSaveFailed', 'Could not save changes'));
      return;
    }
    const normReason = reason.trim() || null;
    const start = allDay ? '00:00' : startHHMM.trim();
    const end = allDay ? '23:59' : endHHMM.trim();
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      Alert.alert(t('error.generic', 'Error'), t('admin.calendar.constraintEditInvalidTime', 'Use HH:MM format (24h)'));
      return;
    }
    if (!allDay && minutesFromHHMM(end) <= minutesFromHHMM(start)) {
      Alert.alert(t('error.generic', 'Error'), t('admin.hoursAdmin.endAfterStart', 'End time must be after start time'));
      return;
    }

    setSaveConflictMsg(null);
    const noWindowChange =
      dateISO === constraint.date &&
      allDay === isFullDayStored(constraint) &&
      (allDay ||
        (startHHMM === nearestSlot15(sliceHHMM(constraint.start_time)) &&
          endHHMM === nearestSlot15(sliceHHMM(constraint.end_time))));

    if (!noWindowChange && constraint.user_id) {
      try {
        const conflicts = await findBookedAppointmentsOverlappingConstraintWindows(constraint.user_id, [
          { date: dateISO, start_time: start, end_time: end },
        ]);
        if (conflicts.length > 0) {
          setSaveConflictMsg(
            t(
              'admin.hoursAdmin.constraintConflictsWithAppointments',
              'There are already client appointments in this time range. Cancel or move those appointments first, then you can add this block.'
            )
          );
          return;
        }
      } catch {
        setSaveConflictMsg(String(t('admin.calendar.constraintEditSaveFailed', 'Could not save changes')));
        return;
      }
    }

    try {
      setSaving(true);
      if (underlyingIds.length === 1) {
        const res = await businessConstraintsApi.updateConstraint(underlyingIds[0]!, {
          date: dateISO,
          start_time: start,
          end_time: end,
          reason: normReason,
        });
        if (!res.ok) {
          Alert.alert(t('error.generic', 'Error'), res.message);
          return;
        }
      } else {
        for (const id of underlyingIds) {
          await businessConstraintsApi.deleteConstraint(id);
        }
        await businessConstraintsApi.createConstraints(
          [{ date: dateISO, start_time: start, end_time: end, reason: normReason }] as Parameters<
            typeof businessConstraintsApi.createConstraints
          >[0],
          constraint.user_id ?? null
        );
      }
      onSaved({ dateMin: dateISO, dateMax: dateISO });
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(t('admin.calendar.constraintEditSaveFailed', 'Could not save changes'));
      Alert.alert(t('error.generic', 'Error'), msg);
    } finally {
      setSaving(false);
    }
  };

  const runDelete = async () => {
    if (!constraint) return;
    setDeleteError(null);
    if (underlyingIds.length === 0) {
      setDeleteError(String(t('admin.calendar.constraintEditDeleteFailed', 'Could not delete')));
      return;
    }
    try {
      setDeleting(true);
      let ok = true;
      for (const id of underlyingIds) {
        const one = await businessConstraintsApi.deleteConstraint(id);
        if (!one) ok = false;
      }
      if (!ok) throw new Error(String(t('admin.calendar.constraintEditDeleteFailed', 'Could not delete')));
      setDeleteConfirmOpen(false);
      onSaved({ dateMin: constraint.date, dateMax: constraint.date });
      onClose();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : String(t('admin.calendar.constraintEditDeleteFailed', 'Could not delete')));
    } finally {
      setDeleting(false);
    }
  };

  if (!constraint) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (deleteConfirmOpen) {
          if (!deleting) {
            setDeleteConfirmOpen(false);
            setDeleteError(null);
          }
          return;
        }
        if (timePicker !== null) setTimePicker(null);
        else onClose();
      }}
      statusBarTranslucent
    >
      <View style={styles.modalRoot} collapsable={false}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close', 'Close')}>
          <View style={[styles.sheet, { marginBottom: insets.bottom + 12, marginTop: insets.top + 12 }]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              nestedScrollEnabled
            >
              <Text style={[styles.title, rtl && { writingDirection: 'rtl' }]}>
                {t('admin.calendar.constraintEditTitle', 'Edit blocked time')}
              </Text>
              {isComposite ? (
                <Text style={[styles.hint, rtl && { writingDirection: 'rtl', textAlign: 'right' }]}>
                  {t(
                    'admin.calendar.constraintEditCompositeHint',
                    'Several entries were merged on the calendar. Saving replaces them with one block.'
                  )}
                </Text>
              ) : null}
              <Text style={[styles.label, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}>
                {t('admin.calendar.constraintEditDate', 'Date')}
              </Text>
              <Text style={[styles.datePretty, rtl && { writingDirection: 'rtl', textAlign: 'right' }]}>{formatDatePretty(dateISO)}</Text>
              <RNCalendar
                current={dateISO}
                onDayPress={(d: { dateString: string }) => setDateISO(d.dateString)}
                markedDates={{ [dateISO]: { selected: true, selectedColor: primary } }}
                enableSwipeMonths
                firstDay={0}
                style={{ direction: rtl ? 'rtl' : 'ltr' }}
                theme={calendarTheme as object}
              />
              <View style={[styles.rowBetween, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Text
                  style={[
                    styles.label,
                    { marginBottom: 0, writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' },
                  ]}
                >
                  {t('admin.hoursAdmin.allDay', 'All day')}
                </Text>
                <Switch
                  value={allDay}
                  onValueChange={setAllDay}
                  trackColor={{ true: `${primary}88`, false: '#E8EAED' }}
                  thumbColor={allDay ? primary : '#f4f3f4'}
                />
              </View>
              {!allDay ? (
                <View style={[styles.timeRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <View style={styles.timeCol}>
                    <Text style={[styles.label, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}>
                      {t('admin.hoursAdmin.start', 'Start')}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => setTimePicker('start')}
                      style={[styles.selectField, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('admin.hoursAdmin.start', 'Start')}
                    >
                      <Text style={[styles.selectFieldText, { textAlign: rtl ? 'right' : 'left' }]}>{startHHMM}</Text>
                      <Ionicons name="chevron-down" size={20} color={UI.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.timeCol}>
                    <Text style={[styles.label, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}>
                      {t('admin.hoursAdmin.end', 'End')}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => setTimePicker('end')}
                      style={[styles.selectField, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('admin.hoursAdmin.end', 'End')}
                    >
                      <Text style={[styles.selectFieldText, { textAlign: rtl ? 'right' : 'left' }]}>{endHHMM}</Text>
                      <Ionicons name="chevron-down" size={20} color={UI.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              <Text style={[styles.label, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}>
                {t('admin.calendar.constraintEditReason', 'Reason (optional)')}
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t('admin.hoursAdmin.noReason', 'No reason')}
                multiline
                style={[styles.input, styles.reasonInput, { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }]}
              />
              {saveConflictMsg ? (
                <Text
                  style={[styles.saveConflictText, { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'center' }]}
                >
                  {saveConflictMsg}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: primary, opacity: saving ? 0.7 : 1 }]}
                onPress={() => void handleSave()}
                disabled={saving || deleting}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.primaryBtnText, rtl && { writingDirection: 'rtl' }]}>{t('admin.calendar.constraintEditSave', 'Save')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dangerBtn, { opacity: saving ? 0.5 : 1 }]}
                onPress={() => {
                  setTimePicker(null);
                  setDeleteError(null);
                  setDeleteConfirmOpen(true);
                }}
                disabled={saving || deleting}
                activeOpacity={0.85}
              >
                {deleting ? (
                  <ActivityIndicator color={UI.danger} />
                ) : (
                  <Text style={[styles.dangerBtnText, rtl && { writingDirection: 'rtl' }]}>{t('admin.calendar.constraintEditDelete', 'Delete')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} disabled={saving || deleting} activeOpacity={0.85}>
                <Text style={[styles.secondaryBtnText, rtl && { writingDirection: 'rtl' }]}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Pressable>

        {timePicker !== null ? (
          <TimePickerSheet
            title={
              timePicker === 'end'
                ? t('admin.hoursAdmin.end', 'End')
                : t('admin.hoursAdmin.start', 'Start')
            }
            options={timePicker === 'end' ? endSlotOptions : SLOT_OPTIONS_15}
            selected={timePicker === 'end' ? endHHMM : startHHMM}
            onSelect={(v) => {
              if (timePicker === 'start') setStartHHMM(v);
              else if (timePicker === 'end') setEndHHMM(v);
            }}
            onClose={() => setTimePicker(null)}
            primary={primary}
            rtl={rtl}
            bottomInset={insets.bottom}
          />
        ) : null}

        {deleteConfirmOpen ? (
          <DeleteConfirmOverlay
            title={t('admin.calendar.constraintEditDeleteTitle', 'Delete constraint?')}
            message={t(
              'admin.calendar.constraintEditDeleteMessage',
              'This will remove this blocked time from the calendar.'
            )}
            cancelLabel={t('cancel', 'Cancel')}
            confirmLabel={t('admin.calendar.constraintEditDelete', 'Delete')}
            errorText={deleteError}
            deleting={deleting}
            onCancel={() => {
              if (deleting) return;
              setDeleteConfirmOpen(false);
              setDeleteError(null);
            }}
            onConfirm={() => void runDelete()}
            rtl={rtl}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    position: 'relative',
  },
  backdrop: {
    flex: 1,
    backgroundColor: UI.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: UI.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UI.border,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: UI.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    fontWeight: '600',
    color: UI.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: UI.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  datePretty: {
    fontSize: 15,
    fontWeight: '600',
    color: UI.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  rowBetween: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  timeCol: {
    flex: 1,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    backgroundColor: '#FAFAFA',
    gap: 8,
  },
  selectFieldText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: UI.text,
    writingDirection: 'ltr',
  },
  input: {
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: UI.text,
    backgroundColor: '#FAFAFA',
  },
  reasonInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  saveConflictText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: UI.danger,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  dangerBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: `${UI.danger}12`,
  },
  dangerBtnText: {
    color: UI.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: UI.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
});
