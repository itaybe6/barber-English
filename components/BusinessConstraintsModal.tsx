import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { businessConstraintsApi } from '@/lib/api/businessConstraints';
import { findBookedAppointmentsOverlappingConstraintWindows } from '@/lib/api/constraintAppointmentConflicts';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import BookingSuccessAnimatedOverlay, {
  type SuccessLine,
} from '@/components/book-appointment/BookingSuccessAnimatedOverlay';

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

type ConstraintDraft = {
  date: string;
  start_time: string;
  end_time: string;
  reason?: string | null;
};

export type ConstraintsCalendarChangedPayload = { dateMin: string; dateMax: string };

interface BusinessConstraintsModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pass saved date range so the parent can refetch a wide enough window immediately */
  onConstraintsChanged?: (payload?: ConstraintsCalendarChangedPayload) => void;
}

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatISOToMMDDYYYY = (iso: string) => {
  try {
    const [yyyy, mm, dd] = iso.split('-');
    if (!yyyy || !mm || !dd) return iso;
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return iso;
  }
};

const UI = {
  bg: '#F2F4F8',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#636366',
  textTertiary: '#8E8E93',
  border: 'rgba(60, 60, 67, 0.12)',
  danger: '#FF3B30',
};

function WheelPicker({
  options,
  value,
  onChange,
  primaryColor,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  primaryColor: string;
}) {
  const listRef = useRef<ScrollView | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, options.findIndex((o) => o === value)));
  useEffect(() => {
    const idx = Math.max(0, options.findIndex((o) => o === value));
    setSelectedIndex(idx);
    requestAnimationFrame(() => listRef.current?.scrollTo({ y: idx * 44, animated: false }));
  }, [value, options]);
  const handleMomentumEnd = (e: any) => {
    const offsetY = e.nativeEvent.contentOffset.y as number;
    const idx = Math.round(offsetY / 44);
    const clamped = Math.min(options.length - 1, Math.max(0, idx));
    setSelectedIndex(clamped);
    onChange(options[clamped]);
    requestAnimationFrame(() => listRef.current?.scrollTo({ y: clamped * 44, animated: true }));
  };
  const rowH = 44;
  const h = 220;
  const pad = h / 2 - rowH / 2;
  return (
    <View style={wheelStyles.container}>
      <View
        pointerEvents="none"
        style={[
          wheelStyles.highlight,
          {
            top: pad,
            height: rowH,
            borderColor: primaryColor,
            backgroundColor: `${primaryColor}12`,
          },
        ]}
      />
      <ScrollView
        ref={(ref) => {
          (listRef as React.MutableRefObject<ScrollView | null>).current = ref;
        }}
        showsVerticalScrollIndicator={false}
        snapToInterval={rowH}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
      >
        <View style={{ height: pad }} />
        {options.map((opt, i) => {
          const active = i === selectedIndex;
          return (
            <View key={`${opt}-${i}`} style={wheelStyles.item}>
              <Text style={[wheelStyles.text, active && { color: primaryColor, fontWeight: '800' }]}>{opt}</Text>
            </View>
          );
        })}
        <View style={{ height: pad }} />
      </ScrollView>
    </View>
  );
}

const wheelStyles = StyleSheet.create({
  container: { height: 220, overflow: 'hidden', paddingHorizontal: 8 },
  highlight: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  item: { height: 44, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 19, fontWeight: '600', color: UI.text },
});

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

export default function BusinessConstraintsModal({ visible, onClose, onConstraintsChanged }: BusinessConstraintsModalProps) {
  const insets = useSafeAreaInsets();
  const { colors: businessColors } = useBusinessColors();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const rawLang = (i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  const isHebrew = rawLang.startsWith('he') || rawLang.startsWith('iw');
  const use24hTime = isHebrew;
  const calendarLocale = isHebrew ? 'he' : 'en';
  const dateLocale = isHebrew ? 'he-IL' : 'en-US';
  /** Layout + text flow: app is Hebrew-first — always RTL. */
  const rtl = true;

  if (visible) {
    LocaleConfig.defaultLocale = calendarLocale;
  }

  const primary = businessColors.primary;
  const calendarTheme = useMemo(() => buildCalendarTheme(primary), [primary]);

  /** Modal windows often report 0 safe-area from SafeAreaView — use explicit insets + status bar + minimum gap. */
  const modalTopInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
    16
  );
  const sheetMaxHeight = Dimensions.get('window').height - modalTopInset - 12;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [mode, setMode] = useState<'hours' | 'single-day' | 'multi-days'>('hours');
  const [singleDateISO, setSingleDateISO] = useState<string>(toISODate(today));
  const [rangeStartISO, setRangeStartISO] = useState<string | null>(null);
  const [rangeEndISO, setRangeEndISO] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string>('12:00 PM');
  const [endTime, setEndTime] = useState<string>('1:00 PM');
  const [reason, setReason] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [existing, setExisting] = useState<Array<{ id: string; date: string; start_time: string; end_time: string; reason?: string }>>([]);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState<boolean>(false);
  const [tempStartHour, setTempStartHour] = useState<string>(startTime);
  const [tempEndHour, setTempEndHour] = useState<string>(endTime);
  const [isExistingModalOpen, setIsExistingModalOpen] = useState(false);
  const [showConstraintSuccess, setShowConstraintSuccess] = useState(false);
  const [constraintSuccessLines, setConstraintSuccessLines] = useState<SuccessLine[]>([]);
  const [constraintSuccessAnimKey, setConstraintSuccessAnimKey] = useState(0);

  const formatDatePretty = (iso: string) => {
    try {
      const dt = new Date(`${iso}T12:00:00`);
      const weekday = dt.toLocaleDateString(dateLocale, { weekday: 'long' });
      const day = String(dt.getDate()).padStart(2, '0');
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const year = dt.getFullYear();
      return `${weekday}, ${day}/${month}/${year}`;
    } catch {
      return iso;
    }
  };

  const formatTime12Hour = (time24: string) => {
    try {
      const [hRaw, mRaw] = time24.split(':');
      const hours = Number(hRaw);
      const minutes = Number(mRaw);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch {
      return time24;
    }
  };

  const formatTime24Hour = (timeInput: string) => {
    const trimmed = timeInput.trim();
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      const [h, m] = trimmed.split(':').map(Number);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    try {
      const parts = trimmed.split(' ');
      if (parts.length < 2) return trimmed;
      const period = parts[parts.length - 1];
      const time = parts.slice(0, -1).join(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let hours24 = hours;
      if (period === 'AM' && hours === 12) {
        hours24 = 0;
      } else if (period === 'PM' && hours !== 12) {
        hours24 = hours + 12;
      }
      return `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    } catch {
      return timeInput;
    }
  };

  const displayTimeLabel = (stored: string) =>
    use24hTime && /^\d{1,2}:\d{2}$/.test(stored.trim()) ? formatTime24Hour(stored) : stored;

  useEffect(() => {
    if (use24hTime) {
      setStartTime((s) => formatTime24Hour(s));
      setEndTime((e) => formatTime24Hour(e));
    } else {
      const to12 = (s: string) => {
        if (/\b(AM|PM)\b/i.test(s)) return s;
        if (/^\d{1,2}:\d{2}$/.test(s.trim())) return formatTime12Hour(s.trim());
        return s;
      };
      setStartTime((s) => to12(s));
      setEndTime((e) => to12(e));
    }
  }, [use24hTime]);

  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      try {
        const start = toISODate(today);
        const end = toISODate(addDays(today, 365));
        const rows = (user as any)?.id
          ? await businessConstraintsApi.getPersonalConstraintsForBarberInRange(start, end, (user as any).id)
          : [];
        setExisting((rows || []).filter((r: any) => (r.date as string) >= start) as any);
      } catch {}
    };
    load();
  }, [visible, today, (user as any)?.id]);

  const save = async () => {
    try {
      setIsSaving(true);
      let entries: ConstraintDraft[] = [];
      const normReason = reason?.trim() || null;
      if (mode === 'hours') {
        if (!singleDateISO) {
          Alert.alert(t('error.generic', 'Error'), t('admin.hoursAdmin.selectDate', 'Please select a date'));
          return;
        }
        if (formatTime24Hour(startTime) >= formatTime24Hour(endTime)) {
          Alert.alert(t('error.generic', 'Error'), t('admin.hoursAdmin.endAfterStart', 'End time must be after start time'));
          return;
        }
        entries = [{ date: singleDateISO, start_time: formatTime24Hour(startTime), end_time: formatTime24Hour(endTime), reason: normReason }];
      } else if (mode === 'single-day') {
        if (!singleDateISO) {
          Alert.alert(t('error.generic', 'Error'), t('admin.hoursAdmin.selectDate', 'Please select a date'));
          return;
        }
        entries = [{ date: singleDateISO, start_time: '00:00', end_time: '23:59', reason: normReason }];
      } else {
        if (!rangeStartISO || !rangeEndISO) {
          Alert.alert(t('error.generic', 'Error'), t('admin.hoursAdmin.selectDateRange', 'Please select a date range'));
          return;
        }
        const start = new Date(rangeStartISO);
        const end = new Date(rangeEndISO);
        if (start > end) {
          Alert.alert(t('error.generic', 'Error'), t('admin.hoursAdmin.invalidDateRange', 'Invalid date range'));
          return;
        }
        const days: string[] = [];
        const cur = new Date(start);
        while (cur <= end) {
          days.push(toISODate(cur));
          cur.setDate(cur.getDate() + 1);
        }
        entries = days.map((date) => ({ date, start_time: '00:00', end_time: '23:59', reason: normReason }));
      }

      if (entries.length === 0) return;

      const barberId = (user as any)?.id as string | undefined;
      if (barberId) {
        const windows = entries.map((e) => ({
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
        }));
        const conflicts = await findBookedAppointmentsOverlappingConstraintWindows(barberId, windows);
        if (conflicts.length > 0) {
          Alert.alert(
            t('error.generic', 'Error'),
            t(
              'admin.hoursAdmin.constraintConflictsWithAppointments',
              'There are already client appointments in this time range. Cancel or move those appointments first, then you can add this block.'
            )
          );
          return;
        }
      }

      await businessConstraintsApi.createConstraints(entries as any, (user as any)?.id || null);
      const start = toISODate(today);
      const end = toISODate(addDays(today, 365));
      const rows = (user as any)?.id
        ? await businessConstraintsApi.getPersonalConstraintsForBarberInRange(start, end, (user as any).id)
        : [];
      setExisting((rows || []).filter((r: any) => (r.date as string) >= start) as any);
      const sortedDates = entries.map((e) => e.date).sort();
      onConstraintsChanged?.({
        dateMin: sortedDates[0]!,
        dateMax: sortedDates[sortedDates.length - 1]!,
      });

      const successLines: SuccessLine[] = [
        { variant: 'headline', text: t('admin.hoursAdmin.successAnimatedHeadline', 'Constraint saved') },
      ];
      if (mode === 'hours') {
        successLines.push(
          { variant: 'accent', text: `${t('booking.field.date', 'Date')}: ${formatDatePretty(singleDateISO)}` },
          {
            variant: 'body',
            text: `${t('admin.hoursAdmin.closedHours', 'Closed hours')}: ${displayTimeLabel(startTime)} – ${displayTimeLabel(endTime)}`,
          }
        );
      } else if (mode === 'single-day') {
        successLines.push(
          { variant: 'accent', text: `${t('booking.field.date', 'Date')}: ${formatDatePretty(singleDateISO)}` },
          { variant: 'body', text: t('admin.hoursAdmin.allDay', 'All day') }
        );
      } else {
        successLines.push(
          {
            variant: 'accent',
            text: t('admin.hoursAdmin.successDateRangeLine', '{{start}} — {{end}}', {
              start: formatDatePretty(rangeStartISO!),
              end: formatDatePretty(rangeEndISO!),
            }),
          },
          {
            variant: 'body',
            text: t('admin.hoursAdmin.successDaysClosed', '{{count}} days closed (all day)', { count: entries.length }),
          }
        );
      }
      if (normReason) {
        successLines.push({
          variant: 'body',
          text: t('admin.hoursAdmin.successReasonLine', 'Reason: {{reason}}', { reason: normReason }),
        });
      }
      setConstraintSuccessLines(successLines);
      setConstraintSuccessAnimKey((k) => k + 1);
      setShowConstraintSuccess(true);
    } catch {
      Alert.alert(t('error.generic', 'Error'), t('admin.hoursAdmin.saveFailed', 'Failed to save constraints'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const ok = await businessConstraintsApi.deleteConstraint(id);
      if (ok) {
        setExisting((prev) => prev.filter((x) => x.id !== id));
        onConstraintsChanged?.();
      }
    } catch {}
  };

  const timeOptions = useMemo(() => {
    if (use24hTime) {
      return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
    }
    return Array.from({ length: 24 }, (_, h) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const hours12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${hours12}:00 ${period}`;
    });
  }, [use24hTime]);

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
    [primary, rtl]
  );

  const modeOptions = useMemo(
    () =>
      [
        {
          key: 'hours' as const,
          icon: 'time' as const,
          label: t('admin.hoursAdmin.segment.hours', 'Hours'),
          hint: t('admin.hoursAdmin.modeHint.hours'),
        },
        {
          key: 'single-day' as const,
          icon: 'calendar' as const,
          label: t('admin.hoursAdmin.segment.singleDay', 'Single day'),
          hint: t('admin.hoursAdmin.modeHint.singleDay'),
        },
        {
          key: 'multi-days' as const,
          icon: 'calendar-outline' as const,
          label: t('admin.hoursAdmin.segment.multiDays', 'Multiple days'),
          hint: t('admin.hoursAdmin.modeHint.multiDays'),
        },
      ] as const,
    [t]
  );

  const renderCalendar = (variant: 'hours' | 'single' | 'range') => {
    if (variant === 'range') {
      return (
        <RNCalendar
          key={`constraints-range-${calendarLocale}`}
          current={rangeStartISO || toISODate(today)}
          minDate={toISODate(today)}
          markingType="period"
          markedDates={(() => {
            const marks: Record<string, any> = {};
            if (rangeStartISO) {
              marks[rangeStartISO] = { startingDay: true, color: primary, textColor: '#FFFFFF' };
            }
            if (rangeStartISO && rangeEndISO) {
              const s = new Date(rangeStartISO);
              const e = new Date(rangeEndISO);
              const cur = new Date(s);
              while (cur <= e) {
                const iso = toISODate(cur);
                marks[iso] = marks[iso] || { color: `${primary}35`, textColor: UI.text };
                cur.setDate(cur.getDate() + 1);
              }
              marks[rangeStartISO] = { startingDay: true, color: primary, textColor: '#FFFFFF' };
              marks[rangeEndISO] = { endingDay: true, color: primary, textColor: '#FFFFFF' };
            }
            return marks;
          })()}
          onDayPress={(d: any) => {
            const sel = d.dateString as string;
            if (!rangeStartISO || (rangeStartISO && rangeEndISO)) {
              setRangeStartISO(sel);
              setRangeEndISO(null);
            } else if (!rangeEndISO) {
              if (sel >= rangeStartISO) setRangeEndISO(sel);
              else {
                setRangeStartISO(sel);
                setRangeEndISO(null);
              }
            }
          }}
          enableSwipeMonths
          hideDayNames={false}
          firstDay={0}
          renderArrow={calendarRenderArrow}
          style={{ direction: rtl ? 'rtl' : 'ltr' }}
          theme={calendarTheme as any}
        />
      );
    }
    return (
      <RNCalendar
        key={`constraints-${variant}-${calendarLocale}`}
        current={singleDateISO}
        minDate={toISODate(today)}
        onDayPress={(d: any) => setSingleDateISO(d.dateString)}
        markedDates={{ [singleDateISO]: { selected: true, selectedColor: primary } }}
        enableSwipeMonths
        hideDayNames={false}
        firstDay={0}
        renderArrow={calendarRenderArrow}
        style={{ direction: rtl ? 'rtl' : 'ltr' }}
        theme={calendarTheme as any}
      />
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, rtl && styles.rtlRoot]}>
        <View style={[styles.safeAreaTopStripe, { height: modalTopInset }]} />
        <View
          style={[
            styles.mainModalBody,
            {
              paddingLeft: Math.max(insets.left, 0),
              paddingRight: Math.max(insets.right, 0),
            },
          ]}
        >
          <View style={[styles.safeTop, styles.headerSurface, rtl && styles.rtlRoot]}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.headerIconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <View style={[styles.iconCircle, { backgroundColor: UI.surface }]}>
                <Ionicons name="close" size={22} color={UI.text} />
              </View>
            </TouchableOpacity>
            <View style={[styles.headerTitles, rtl && styles.headerTitlesHebrew]}>
              <Text style={[styles.headerTitle, rtl && styles.hebrewText]} numberOfLines={1}>
                {t('admin.hoursAdmin.title', 'Work constraints')}
              </Text>
            </View>
            <View style={styles.headerEndSpacer} />
          </View>
        </View>

          <KeyboardAwareScreenScroll
          style={[styles.scrollFlex, rtl && styles.rtlRoot]}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.manageBtnOnlyWrap}>
            <TouchableOpacity
              onPress={() => setIsExistingModalOpen(true)}
              activeOpacity={0.85}
              style={[styles.modeCard, styles.modeCardRtl, { borderColor: UI.border }]}
              accessibilityRole="button"
              accessibilityLabel={t('admin.hoursAdmin.openConstraintsManager', 'Manage constraints')}
            >
              <View style={styles.modeIconWrap}>
                <Ionicons name="list-outline" size={22} color={UI.textSecondary} />
              </View>
              <View style={[styles.modeTextCol, rtl && styles.modeTextColHebrew]}>
                <Text style={[styles.modeTitle, rtl && styles.hebrewText]} numberOfLines={2}>
                  {t('admin.hoursAdmin.openConstraintsManager', 'Manage constraints')}
                </Text>
              </View>
              <Ionicons name="chevron-back" size={24} color={UI.textTertiary} />
            </TouchableOpacity>
          </View>

          <View style={styles.sectionPad}>
            <Text style={[styles.sectionLabel, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.whatToBlock')}</Text>
            <View style={styles.modeList}>
              {modeOptions.map((opt) => {
                const active = mode === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setMode(opt.key)}
                    activeOpacity={0.85}
                    style={[styles.modeCard, styles.modeCardRtl, active && { borderColor: primary, backgroundColor: `${primary}0F`, shadowColor: primary }]}
                  >
                    <View style={[styles.modeIconWrap, active && { backgroundColor: `${primary}22` }]}>
                      <Ionicons name={opt.icon} size={22} color={active ? primary : UI.textSecondary} />
                    </View>
                    <View style={[styles.modeTextCol, rtl && styles.modeTextColHebrew]}>
                      <Text style={[styles.modeTitle, active && { color: primary }, rtl && styles.hebrewText]}>{opt.label}</Text>
                      <Text style={[styles.modeHint, rtl && styles.hebrewText]}>{opt.hint}</Text>
                    </View>
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={active ? primary : UI.textTertiary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {mode === 'hours' && (
            <>
              <View style={styles.card}>
                <View style={[styles.cardHeader, styles.cardHeaderRtl]}>
                  <Ionicons name="calendar-outline" size={20} color={primary} />
                  <Text style={[styles.cardTitle, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.pickDateShort', 'Pick a date')}</Text>
                </View>
                <View style={styles.calendarShell}>{renderCalendar('hours')}</View>
              </View>
              <View style={styles.card}>
                <View style={[styles.cardHeader, styles.cardHeaderRtl]}>
                  <Ionicons name="hourglass-outline" size={20} color={primary} />
                  <Text style={[styles.cardTitle, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.closedHours', 'Closed hours')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setTempStartHour(startTime);
                    setTempEndHour(endTime);
                    setIsHoursModalOpen(true);
                  }}
                  activeOpacity={0.88}
                  style={[styles.timeRow, { borderColor: UI.border }]}
                >
                  <View style={[styles.timeRowInner, styles.timeRowInnerRtl]}>
                    <View style={[styles.timeBadge, { backgroundColor: `${primary}14` }]}>
                      <Ionicons name="time" size={18} color={primary} />
                    </View>
                    <View style={[styles.timeRowTextCol, rtl && styles.timeRowTextColHebrew]}>
                      <Text style={[styles.timeRowLabel, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.tapToEditHours')}</Text>
                      <Text style={[styles.timeRowValue, { writingDirection: 'ltr', textAlign: 'right' }]}>
                        {displayTimeLabel(startTime)} — {displayTimeLabel(endTime)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-back" size={20} color={UI.textTertiary} />
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}

          {mode === 'single-day' && (
            <View style={styles.card}>
              <View style={[styles.cardHeader, styles.cardHeaderRtl]}>
                <Ionicons name="sunny-outline" size={20} color={primary} />
                <Text style={[styles.cardTitle, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.pickDateAllDay', 'Pick a date (closed all day)')}</Text>
              </View>
              <View style={styles.calendarShell}>{renderCalendar('single')}</View>
            </View>
          )}

          {mode === 'multi-days' && (
            <View style={styles.card}>
              <View style={[styles.cardHeader, styles.cardHeaderRtl]}>
                <Ionicons name="git-merge-outline" size={20} color={primary} />
                <Text style={[styles.cardTitle, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.pickDateRangeAllDay', 'Pick a date range (closed all day)')}</Text>
              </View>
              <Text style={[styles.rangeHelp, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.rangeHelp')}</Text>
              <View style={styles.calendarShell}>{renderCalendar('range')}</View>
              {rangeStartISO && rangeEndISO && (
                <LinearGradient colors={[`${primary}20`, `${primary}08`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.rangePill, styles.rangePillRtl]}>
                  <Ionicons name="checkmark-done" size={18} color={primary} />
                  <Text style={[styles.rangePillText, rtl && styles.hebrewText]}>
                    {formatISOToMMDDYYYY(rangeStartISO)} — {formatISOToMMDDYYYY(rangeEndISO)}
                  </Text>
                </LinearGradient>
              )}
            </View>
          )}

          <View style={styles.card}>
            <View style={[styles.cardHeader, styles.cardHeaderRtl]}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={primary} />
              <Text style={[styles.cardTitle, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.optionalReason', 'Reason (optional)')}</Text>
            </View>
            <Text style={[styles.reasonHelper, rtl && styles.hebrewText]}>{t('admin.hoursAdmin.reasonHelper')}</Text>
            <View style={[styles.reasonInputShell, { borderColor: reason.trim() ? `${primary}40` : UI.border }]}>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t('admin.hoursAdmin.reasonExamples', 'e.g., vacation, errands, temporary closure')}
                placeholderTextColor={UI.textTertiary}
                style={[
                  styles.reasonInput,
                  rtl
                    ? { textAlign: 'right', writingDirection: 'rtl', paddingEnd: 36, paddingStart: 4 }
                    : { textAlign: 'left', writingDirection: 'ltr', paddingEnd: 36, paddingStart: 4 },
                ]}
                multiline
                textAlignVertical="top"
                accessibilityLabel={t('admin.hoursAdmin.optionalReason', 'Reason (optional)')}
              />
              {!!reason.trim() && (
                <TouchableOpacity
                  onPress={() => setReason('')}
                  style={styles.clearReasonBtn}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.clear')}
                >
                  <Ionicons name="close-circle" size={22} color={UI.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAwareScreenScroll>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <LinearGradient colors={[UI.bg, UI.bg]} style={StyleSheet.absoluteFill} />
          <TouchableOpacity
            style={[styles.saveBtn, styles.saveBtnRtl, { backgroundColor: primary, shadowColor: primary }, isSaving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={isSaving}
            activeOpacity={0.9}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="shield-checkmark-outline" size={22} color="#FFFFFF" style={{ marginStart: 8 }} />
                <Text style={styles.saveBtnText}>{t('admin.hoursAdmin.saveCTA', 'Save constraints')}</Text>
              </>
            )}
          </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={isExistingModalOpen} animationType="slide" onRequestClose={() => setIsExistingModalOpen(false)}>
        <View
          style={[
            styles.listModalRoot,
            rtl && styles.rtlRoot,
            {
              paddingTop: modalTopInset,
              paddingBottom: Math.max(insets.bottom, 12),
              paddingLeft: Math.max(insets.left, 0),
              paddingRight: Math.max(insets.right, 0),
            },
          ]}
        >
          <View style={[styles.listModalHeader, { borderBottomColor: UI.border }]}>
            <TouchableOpacity
              onPress={() => setIsExistingModalOpen(false)}
              style={styles.headerIconBtn}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <View style={[styles.iconCircle, { backgroundColor: UI.surface }]}>
                <Ionicons name="arrow-back" size={22} color={UI.text} style={rtl ? { transform: [{ scaleX: -1 }] } : undefined} />
              </View>
            </TouchableOpacity>
            <Text style={[styles.listModalTitle, rtl && { writingDirection: 'rtl' }]}>{t('admin.hoursAdmin.upcomingConstraints', 'Upcoming constraints')}</Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView
            style={[styles.listModalScroll, styles.listModalScrollBg]}
            contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
          >
            {existing.length === 0 ? (
              <View style={[styles.emptyWrap, rtl && styles.emptyWrapHebrew]}>
                <LinearGradient
                  colors={[`${primary}22`, `${primary}08`]}
                  style={[styles.emptyOrb, rtl && styles.emptyOrbCentered]}
                >
                  <Ionicons name="calendar-clear-outline" size={48} color={primary} />
                </LinearGradient>
                <Text style={[styles.emptyTitle, rtl && { writingDirection: 'rtl' }]}>{t('admin.hoursAdmin.noUpcomingConstraints', 'No upcoming constraints')}</Text>
                <Text style={[styles.emptySub, rtl && { writingDirection: 'rtl' }]}>{t('admin.hoursAdmin.emptyListHint')}</Text>
              </View>
            ) : (
              <View style={styles.listBody}>
                {(() => {
                  const groups = (existing || []).reduce((m: Record<string, any[]>, c: any) => {
                    const key = (c.reason || '').trim() || t('admin.hoursAdmin.noReason', 'No reason');
                    (m[key] = m[key] || []).push(c);
                    return m;
                  }, {} as Record<string, any[]>);
                  return Object.entries(groups).map(([reasonKey, rows]) => {
                    const dates = Array.from(new Set(rows.map((r: any) => r.date as string))).sort();
                    const first = dates[0];
                    const last = dates[dates.length - 1];
                    return (
                      <View key={reasonKey} style={styles.groupBlock}>
                        <View style={[styles.groupHeader, styles.groupHeaderRtl]}>
                          <View style={[styles.groupAccent, { backgroundColor: primary }]} />
                          <View style={[styles.groupTextCol, rtl && styles.groupTextColHebrew]}>
                            <Text style={[styles.groupReason, rtl && styles.hebrewText]} numberOfLines={2}>
                              {reasonKey}
                            </Text>
                            <Text style={[styles.groupDates, rtl && styles.hebrewText]}>
                              {dates.length > 1 ? (
                                <Text style={{ writingDirection: 'ltr' }}>
                                  {formatISOToMMDDYYYY(first)} — {formatISOToMMDDYYYY(last)}
                                </Text>
                              ) : (
                                formatDatePretty(first)
                              )}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.groupItems}>
                          {rows
                            .sort(
                              (a: any, b: any) =>
                                (a.date as string).localeCompare(b.date as string) || String(a.start_time).localeCompare(String(b.start_time))
                            )
                            .map((c: any) => {
                              const start = String(c.start_time).slice(0, 5);
                              const end = String(c.end_time).slice(0, 5);
                              const isFullDay = start === '00:00' && end === '23:59';
                              return (
                                <View key={c.id} style={[styles.constraintItem, styles.constraintItemRtl, { borderColor: UI.border }]}>
                                  <View style={[styles.constraintTextBlock, rtl && styles.constraintTextBlockHebrew]}>
                                    <Text style={[styles.constraintDate, rtl && styles.hebrewText]}>{formatDatePretty(c.date)}</Text>
                                    <View style={[styles.timeChipInline, rtl && styles.timeChipInlineHebrew]}>
                                      <Ionicons name="time-outline" size={15} color={UI.textSecondary} />
                                      <Text
                                        style={[
                                          styles.timeChipInlineText,
                                          use24hTime && { writingDirection: 'ltr' },
                                          rtl && styles.hebrewText,
                                        ]}
                                      >
                                        {isFullDay
                                          ? t('admin.hoursAdmin.allDay', 'All day')
                                          : use24hTime
                                            ? `${formatTime24Hour(start)}–${formatTime24Hour(end)}`
                                            : `${formatTime12Hour(start)}–${formatTime12Hour(end)}`}
                                      </Text>
                                    </View>
                                  </View>
                                  <TouchableOpacity
                                    onPress={() => remove(c.id)}
                                    style={styles.deleteIconBtn}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('delete')}
                                  >
                                    <Ionicons name="trash-outline" size={20} color={UI.danger} />
                                  </TouchableOpacity>
                                </View>
                              );
                            })}
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={isHoursModalOpen} transparent animationType="fade" onRequestClose={() => setIsHoursModalOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsHoursModalOpen(false)} accessibilityRole="button" accessibilityLabel={t('close')} />
          <View
            style={[
              styles.bottomSheet,
              {
                paddingBottom: Math.max(insets.bottom, 16),
                maxHeight: sheetMaxHeight,
              },
            ]}
          >
            <View style={styles.sheetGrabber} />
            <Text style={[styles.sheetTitle, rtl && { writingDirection: 'rtl' }]}>{t('admin.hoursAdmin.chooseClosedHours', 'Choose closed hours')}</Text>
            <View style={styles.wheelRow}>
              <View style={styles.wheelCol}>
                <Text style={[styles.wheelLabel, rtl && styles.wheelLabelRtl]}>{t('admin.hoursAdmin.start', 'Start')}</Text>
                <WheelPicker options={timeOptions} value={tempStartHour} onChange={setTempStartHour} primaryColor={primary} />
              </View>
              <View style={{ width: 12 }} />
              <View style={styles.wheelCol}>
                <Text style={[styles.wheelLabel, rtl && styles.wheelLabelRtl]}>{t('admin.hoursAdmin.end', 'End')}</Text>
                <WheelPicker options={timeOptions} value={tempEndHour} onChange={setTempEndHour} primaryColor={primary} />
              </View>
            </View>
            <TouchableOpacity
              onPress={() => {
                setStartTime(tempStartHour);
                setEndTime(tempEndHour);
                setIsHoursModalOpen(false);
              }}
              style={[styles.sheetPrimaryBtn, { backgroundColor: primary }]}
              activeOpacity={0.9}
            >
              <Text style={[styles.sheetPrimaryBtnText, rtl && { writingDirection: 'rtl' }]}>{t('save', 'Save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showConstraintSuccess}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowConstraintSuccess(false)}
      >
        <BookingSuccessAnimatedOverlay
          key={constraintSuccessAnimKey}
          lines={constraintSuccessLines}
          rtl={rtl}
          accentColor={primary}
          onDismiss={() => setShowConstraintSuccess(false)}
          gotItLabel={t('booking.gotIt', 'Got it')}
        />
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  /** Full screen white so status-bar inset matches the list modal header */
  listModalRoot: { flex: 1, backgroundColor: UI.surface },
  listModalScrollBg: { backgroundColor: UI.bg },
  rtlRoot: { direction: 'ltr' },
  safeAreaTopStripe: { backgroundColor: UI.surface, alignSelf: 'stretch' },
  mainModalBody: { flex: 1, minHeight: 0 },
  safeTop: { zIndex: 2 },
  headerSurface: { backgroundColor: UI.surface },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  /** Same width as the old trailing FAB so the title block stays visually centered */
  headerEndSpacer: { width: 44, minHeight: 44 },
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
  headerTitlesHebrew: { alignSelf: 'stretch', alignItems: 'stretch' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: UI.text, letterSpacing: -0.3 },
  hebrewText: { textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch' },
  manageBtnOnlyWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  sectionPad: { paddingHorizontal: 16, paddingTop: 4 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    alignSelf: 'stretch',
    textAlign: 'right',
  },
  modeList: { gap: 10 },
  modeCardRtl: { flexDirection: 'row-reverse' },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.surface,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: UI.border,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  modeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(60,60,67,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTextCol: { flex: 1 },
  modeTextColHebrew: { alignItems: 'stretch', minWidth: 0 },
  modeTitle: { fontSize: 16, fontWeight: '800', color: UI.text },
  modeHint: { fontSize: 12, fontWeight: '600', color: UI.textSecondary, marginTop: 3, lineHeight: 16 },
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardHeaderRtl: { flexDirection: 'row-reverse' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: UI.text, flex: 1 },
  calendarShell: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.surface,
  },
  rangeHelp: { fontSize: 13, fontWeight: '600', color: UI.textSecondary, marginBottom: 10, lineHeight: 18 },
  rangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignSelf: 'stretch',
  },
  rangePillRtl: { flexDirection: 'row-reverse' },
  rangePillText: { fontSize: 14, fontWeight: '800', color: UI.text, flex: 1 },
  timeRow: {
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(60,60,67,0.04)',
    overflow: 'hidden',
  },
  timeRowInner: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  timeRowInnerRtl: { flexDirection: 'row-reverse' },
  timeRowTextCol: { flex: 1, minWidth: 0 },
  timeRowTextColHebrew: { alignItems: 'stretch' },
  timeBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  timeRowLabel: { fontSize: 12, fontWeight: '700', color: UI.textSecondary, marginBottom: 2 },
  timeRowValue: { fontSize: 17, fontWeight: '800', color: UI.text },
  reasonHelper: { fontSize: 12, fontWeight: '600', color: UI.textSecondary, marginBottom: 10, lineHeight: 17 },
  reasonInputShell: {
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(60,60,67,0.03)',
    minHeight: 100,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  reasonInput: { fontSize: 16, fontWeight: '600', color: UI.text, minHeight: 88 },
  clearReasonBtn: { position: 'absolute', top: 8, end: 8 },
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
  saveBtnRtl: { flexDirection: 'row-reverse' },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  listModalScroll: { flex: 1 },
  listModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: UI.surface,
  },
  listModalTitle: { fontSize: 17, fontWeight: '800', color: UI.text, flex: 1, textAlign: 'center' },
  listBody: { paddingHorizontal: 16, paddingTop: 16 },
  groupBlock: { marginBottom: 20 },
  groupHeader: { flexDirection: 'row', gap: 12, marginBottom: 10, alignItems: 'flex-start' },
  groupHeaderRtl: { flexDirection: 'row-reverse' },
  groupAccent: { width: 4, borderRadius: 2, minHeight: 40 },
  groupTextCol: { flex: 1, minWidth: 0 },
  groupTextColHebrew: { alignItems: 'flex-end' },
  groupReason: { fontSize: 15, fontWeight: '800', color: UI.text },
  groupDates: { fontSize: 13, fontWeight: '600', color: UI.textSecondary, marginTop: 4 },
  groupItems: { gap: 8 },
  constraintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.surface,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  constraintItemRtl: { flexDirection: 'row-reverse' },
  constraintTextBlock: { flex: 1, minWidth: 0 },
  constraintTextBlockHebrew: { alignItems: 'flex-end' },
  constraintDate: { fontSize: 14, fontWeight: '800', color: UI.textSecondary },
  timeChipInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  timeChipInlineHebrew: { flexDirection: 'row-reverse', alignSelf: 'flex-end' },
  timeChipInlineText: { fontSize: 15, fontWeight: '700', color: UI.text },
  deleteIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: { paddingHorizontal: 32, paddingTop: 48, alignItems: 'center' },
  emptyWrapHebrew: { alignItems: 'stretch', alignSelf: 'stretch' },
  emptyOrb: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyOrbCentered: { alignSelf: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: UI.text, textAlign: 'center' },
  emptySub: { fontSize: 14, fontWeight: '600', color: UI.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: UI.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(60,60,67,0.25)',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: UI.text, marginBottom: 8, textAlign: 'center' },
  wheelRow: { flexDirection: 'row', marginTop: 4 },
  wheelCol: { flex: 1, minWidth: 0, alignItems: 'stretch' },
  /** Do not use `hebrewText` here — it sets textAlign:right and breaks centering above each column. */
  wheelLabelRtl: { writingDirection: 'rtl', textAlign: 'center', alignSelf: 'stretch' },
  wheelLabel: { fontSize: 12, fontWeight: '800', color: UI.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  sheetPrimaryBtn: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  sheetPrimaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' },
});
