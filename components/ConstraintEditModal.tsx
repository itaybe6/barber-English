import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { businessConstraintsApi } from '@/lib/api/businessConstraints';
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

function isFullDayStored(c: BusinessConstraint): boolean {
  const s = sliceHHMM(c.start_time);
  const e = sliceHHMM(c.end_time);
  if (s !== '00:00') return false;
  return minutesFromHHMM(e) >= 23 * 60 + 45;
}

export interface ConstraintEditModalProps {
  visible: boolean;
  constraint: BusinessConstraint | null;
  onClose: () => void;
  onSaved: () => void;
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

  useEffect(() => {
    if (!visible || !constraint) return;
    setDateISO(constraint.date);
    const fd = isFullDayStored(constraint);
    setAllDay(fd);
    setStartHHMM(fd ? '00:00' : sliceHHMM(constraint.start_time));
    setEndHHMM(fd ? '23:59' : sliceHHMM(constraint.end_time));
    setReason(constraint.reason?.trim() ?? '');
  }, [visible, constraint]);

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

  const handleSave = async () => {
    if (!constraint) return;
    const normReason = reason.trim() || null;
    const start = allDay ? '00:00' : startHHMM.trim();
    const end = allDay ? '23:59' : endHHMM.trim();
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      Alert.alert(t('error.generic', 'Error'), t('admin.calendar.constraintEditInvalidTime', 'Use HH:MM format'));
      return;
    }
    if (!allDay && minutesFromHHMM(end) <= minutesFromHHMM(start)) {
      Alert.alert(t('error.generic', 'Error'), t('admin.hoursAdmin.endAfterStart', 'End time must be after start time'));
      return;
    }
    try {
      setSaving(true);
      if (underlyingIds.length === 1) {
        const ok = await businessConstraintsApi.updateConstraint(underlyingIds[0]!, {
          date: dateISO,
          start_time: start,
          end_time: end,
          reason: normReason,
        });
        if (!ok) throw new Error('update');
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
      onSaved();
      onClose();
    } catch {
      Alert.alert(t('error.generic', 'Error'), t('admin.calendar.constraintEditSaveFailed', 'Could not save changes'));
    } finally {
      setSaving(false);
    }
  };

  const runDelete = async () => {
    if (!constraint) return;
    try {
      setDeleting(true);
      let ok = true;
      for (const id of underlyingIds) {
        const one = await businessConstraintsApi.deleteConstraint(id);
        if (!one) ok = false;
      }
      if (!ok) throw new Error('delete');
      onSaved();
      onClose();
    } catch {
      Alert.alert(t('error.generic', 'Error'), t('admin.calendar.constraintEditDeleteFailed', 'Could not delete'));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      t('admin.calendar.constraintEditDeleteTitle', 'Delete constraint?'),
      t('admin.calendar.constraintEditDeleteMessage', 'This will remove this blocked time from the calendar.'),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        { text: t('admin.calendar.constraintEditDelete', 'Delete'), style: 'destructive', onPress: () => void runDelete() },
      ]
    );
  };

  if (!constraint) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close', 'Close')}>
        <Pressable style={[styles.sheet, { marginBottom: insets.bottom + 12, marginTop: insets.top + 12 }]} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={[styles.title, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
              {t('admin.calendar.constraintEditTitle', 'Edit blocked time')}
            </Text>
            {isComposite ? (
              <Text style={[styles.hint, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                {t(
                  'admin.calendar.constraintEditCompositeHint',
                  'Several entries were merged on the calendar. Saving replaces them with one block.'
                )}
              </Text>
            ) : null}
            <Text style={[styles.label, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
              {t('admin.calendar.constraintEditDate', 'Date')}
            </Text>
            <Text style={[styles.datePretty, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>{formatDatePretty(dateISO)}</Text>
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
              <Text style={[styles.label, { marginBottom: 0, writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                {t('admin.hoursAdmin.allDay', 'All day')}
              </Text>
              <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: `${primary}88`, false: '#E8EAED' }} thumbColor={allDay ? primary : '#f4f3f4'} />
            </View>
            {!allDay ? (
              <View style={styles.timeRow}>
                <View style={styles.timeCol}>
                  <Text style={[styles.label, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                    {t('admin.hoursAdmin.start', 'Start')}
                  </Text>
                  <TextInput
                    value={startHHMM}
                    onChangeText={setStartHHMM}
                    placeholder="09:00"
                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                    style={[styles.input, { textAlign: rtl ? 'right' : 'left', writingDirection: 'ltr' }]}
                  />
                </View>
                <View style={styles.timeCol}>
                  <Text style={[styles.label, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                    {t('admin.hoursAdmin.end', 'End')}
                  </Text>
                  <TextInput
                    value={endHHMM}
                    onChangeText={setEndHHMM}
                    placeholder="17:00"
                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                    style={[styles.input, { textAlign: rtl ? 'right' : 'left', writingDirection: 'ltr' }]}
                  />
                </View>
              </View>
            ) : null}
            <Text style={[styles.label, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
              {t('admin.calendar.constraintEditReason', 'Reason (optional)')}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={t('admin.hoursAdmin.noReason', 'No reason')}
              multiline
              style={[styles.input, styles.reasonInput, { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }]}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: primary, opacity: saving ? 0.7 : 1 }]}
              onPress={() => void handleSave()}
              disabled={saving || deleting}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{t('admin.calendar.constraintEditSave', 'Save')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dangerBtn, { opacity: deleting ? 0.7 : 1 }]}
              onPress={confirmDelete}
              disabled={saving || deleting}
            >
              {deleting ? (
                <ActivityIndicator color={UI.danger} />
              ) : (
                <Text style={styles.dangerBtnText}>{t('admin.calendar.constraintEditDelete', 'Delete')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} disabled={saving || deleting}>
              <Text style={styles.secondaryBtnText}>{t('cancel', 'Cancel')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
