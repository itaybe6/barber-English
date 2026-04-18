import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Dimensions,
  Modal,
  I18nManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { businessConstraintsApi, constraintTimeToMinutes } from '@/lib/api/businessConstraints';
import type { Appointment, BusinessConstraint } from '@/lib/supabase';
import { cancelBookedAppointmentsDueToConstraint } from '@/lib/api/constraintAppointmentBulkCancel';
import { findBookedAppointmentsOverlappingConstraintWindows } from '@/lib/api/constraintAppointmentConflicts';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import BookingSuccessAnimatedOverlay, {
  type SuccessLine,
} from '@/components/book-appointment/BookingSuccessAnimatedOverlay';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useAdminCalendarSheetTimingConfig } from '@/components/admin-calendar/useAdminCalendarSheetTiming';

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

// ─── types ────────────────────────────────────────────────────────────────────

type ConstraintDraft = {
  date: string;
  start_time: string;
  end_time: string;
  reason?: string | null;
};

export type ConstraintsCalendarChangedPayload = { dateMin: string; dateMax: string };

type PendingConstraintConflict =
  | { kind: 'create'; entries: ConstraintDraft[]; conflicts: Appointment[] }
  | {
      kind: 'edit';
      entry: ConstraintDraft;
      underlyingIds: string[];
      userIdForCreate: string | null;
      conflicts: Appointment[];
    };

interface BusinessConstraintsModalProps {
  visible: boolean;
  onClose: () => void;
  onConstraintsChanged?: (payload?: ConstraintsCalendarChangedPayload) => void;
  /** When set, the sheet opens pre-filled for updating this constraint (same UI as add). */
  editingConstraint?: BusinessConstraint | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
  return constraintTimeToMinutes(e) >= 23 * 60 + 45;
}

function pickNearestTimeOption(dbHHMM: string, timeOptions: string[], to24: (s: string) => string): string {
  const targetMins = minutesFromHHMM(sliceHHMM(dbHHMM));
  let best = timeOptions[0]!;
  let bestDist = Infinity;
  for (const o of timeOptions) {
    const [h, m] = to24(o).split(':').map(Number);
    const om = h * 60 + m;
    const d = Math.abs(om - targetMins);
    if (d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return best;
}

const formatISOToMMDDYYYY = (iso: string) => {
  try {
    const [yyyy, mm, dd] = iso.split('-');
    if (!yyyy || !mm || !dd) return iso;
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return iso;
  }
};

// ─── design tokens ────────────────────────────────────────────────────────────

const UI = {
  bg: '#F2F4F8',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#636366',
  textTertiary: '#8E8E93',
  border: 'rgba(60, 60, 67, 0.12)',
  danger: '#FF3B30',
};

/** נקודה תחת יום בלוח — ימים שיש בהם תור שאינו זמין (לקוח קבע) */
const BOOKING_DOT_COLOR = UI.danger;

// ─── wheel picker ─────────────────────────────────────────────────────────────

import { ScrollView } from 'react-native';

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

// ─── calendar theme ────────────────────────────────────────────────────────────

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

// ─── main component ───────────────────────────────────────────────────────────

export default function BusinessConstraintsModal({
  visible,
  onClose,
  onConstraintsChanged,
  editingConstraint = null,
}: BusinessConstraintsModalProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { colors: businessColors } = useBusinessColors();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const rawLang = (i18n.resolvedLanguage || i18n.language || '').toLowerCase();
  const isHebrew = rawLang.startsWith('he') || rawLang.startsWith('iw');
  /** Bottom sheet portal can ignore app RTL; force layout direction for RTL locales. */
  const layoutRtl = isHebrew || rawLang.startsWith('ar') || I18nManager.isRTL;
  const use24hTime = isHebrew;
  const calendarLocale = isHebrew ? 'he' : 'en';
  const dateLocale = isHebrew ? 'he-IL' : 'en-US';
  const rtl = true;

  const primary = businessColors.primary;
  const calendarTheme = useMemo(() => buildCalendarTheme(primary), [primary]);
  /** Same height as `CalendarReminderEditorModal` (תזכורת ביומן) */
  const snapPoints = useMemo(() => ['90%'], []);

  const sheetMaxHeight = Dimensions.get('window').height - Math.max(insets.top, 16) - 12;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [mode, setMode] = useState<'hours' | 'single-day' | 'multi-days'>('hours');
  const [singleDateISO, setSingleDateISO] = useState<string>(toISODate(today));
  const [rangeStartISO, setRangeStartISO] = useState<string | null>(null);
  const [rangeEndISO, setRangeEndISO] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string>('12:00');
  const [endTime, setEndTime] = useState<string>('13:00');
  const [reason, setReason] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState<boolean>(false);
  const [tempStartHour, setTempStartHour] = useState<string>(startTime);
  const [tempEndHour, setTempEndHour] = useState<string>(endTime);
  const [showConstraintSuccess, setShowConstraintSuccess] = useState(false);
  const [constraintSuccessLines, setConstraintSuccessLines] = useState<SuccessLine[]>([]);
  const [constraintSuccessAnimKey, setConstraintSuccessAnimKey] = useState(0);
  const [contentReady, setContentReady] = useState(false);
  /** מפתחות `YYYY-MM-DD` מופרדים בפסיק — תאריכים עם תור של לקוח (`is_available` false) */
  const [bookedSlotDateKeys, setBookedSlotDateKeys] = useState('');
  const [pendingConstraintConflict, setPendingConstraintConflict] = useState<PendingConstraintConflict | null>(null);
  const [isConfirmingConstraintConflict, setIsConfirmingConstraintConflict] = useState(false);

  const editingId = editingConstraint?.id ?? null;
  const isEditMode = Boolean(editingId);
  const editingRef = useRef<BusinessConstraint | null>(null);
  useEffect(() => {
    editingRef.current = editingConstraint;
  }, [editingConstraint]);

  const animationConfigs = useAdminCalendarSheetTimingConfig();

  const calendarMinDate = useMemo(() => {
    const todayIso = toISODate(today);
    const d = editingConstraint?.date;
    if (!d) return todayIso;
    return d < todayIso ? d : todayIso;
  }, [editingConstraint?.date, today]);

  useEffect(() => {
    if (!visible) {
      setBookedSlotDateKeys('');
      return;
    }
    const barberId = (user as { id?: string } | null)?.id;
    if (!barberId) {
      setBookedSlotDateKeys('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const startD = new Date(today);
        startD.setDate(startD.getDate() - 120);
        const endD = new Date(today);
        endD.setDate(endD.getDate() + 450);
        const { data, error } = await supabase
          .from('appointments')
          .select('slot_date')
          .eq('is_available', false)
          .eq('barber_id', barberId)
          .gte('slot_date', formatLocalYmd(startD))
          .lte('slot_date', formatLocalYmd(endD));
        if (cancelled) return;
        if (error) {
          setBookedSlotDateKeys('');
          return;
        }
        const uniq = new Set<string>();
        for (const row of data ?? []) {
          const sd = (row as { slot_date?: string }).slot_date;
          if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd)) uniq.add(sd);
        }
        setBookedSlotDateKeys([...uniq].sort().join(','));
      } catch {
        if (!cancelled) setBookedSlotDateKeys('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, user, today]);

  useEffect(() => {
    if (!visible) {
      setPendingConstraintConflict(null);
      setIsConfirmingConstraintConflict(false);
    }
  }, [visible]);

  const singleCalendarMarkedDates = useMemo(() => {
    const booked = new Set(
      bookedSlotDateKeys.length > 0 ? bookedSlotDateKeys.split(',').filter(Boolean) : [],
    );
    const marks: Record<string, any> = {
      [singleDateISO]: { selected: true, selectedColor: primary },
    };
    const out: Record<string, any> = { ...marks };
    for (const d of booked) {
      out[d] = { ...(out[d] ?? {}), marked: true, dotColor: BOOKING_DOT_COLOR };
    }
    return out;
  }, [singleDateISO, primary, bookedSlotDateKeys]);

  const rangeCalendarMarkedDates = useMemo(() => {
    const booked = new Set(
      bookedSlotDateKeys.length > 0 ? bookedSlotDateKeys.split(',').filter(Boolean) : [],
    );
    const marks: Record<string, any> = {};
    if (rangeStartISO) {
      marks[rangeStartISO] = { startingDay: true, color: primary, textColor: '#FFFFFF' };
    }
    if (rangeStartISO && rangeEndISO) {
      const s = new Date(rangeStartISO);
      const e = new Date(rangeEndISO);
      const cur = new Date(s);
      while (cur <= e) {
        const iso = formatLocalYmd(cur);
        marks[iso] = marks[iso] || { color: `${primary}35`, textColor: UI.text };
        cur.setDate(cur.getDate() + 1);
      }
      marks[rangeStartISO] = { startingDay: true, color: primary, textColor: '#FFFFFF' };
      marks[rangeEndISO] = { endingDay: true, color: primary, textColor: '#FFFFFF' };
    }
    const out: Record<string, any> = { ...marks };
    for (const d of booked) {
      out[d] = { ...(out[d] ?? {}), marked: true, dotColor: BOOKING_DOT_COLOR };
    }
    return out;
  }, [rangeStartISO, rangeEndISO, primary, bookedSlotDateKeys]);

  // ── helpers ─────────────────────────────────────────────────────────────────

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

  const formatTime24Hour = useCallback((timeInput: string) => {
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
      if (period === 'AM' && hours === 12) hours24 = 0;
      else if (period === 'PM' && hours !== 12) hours24 = hours + 12;
      return `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    } catch {
      return timeInput;
    }
  }, []);

  const displayTimeLabel = (stored: string) =>
    use24hTime && /^\d{1,2}:\d{2}$/.test(stored.trim()) ? formatTime24Hour(stored) : stored;

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

  // ── present / dismiss based on visible prop (after timeOptions + formatTime24Hour) ──
  useEffect(() => {
    if (visible) {
      if (calendarLocale) LocaleConfig.defaultLocale = calendarLocale;
      setContentReady(false);
      sheetRef.current?.present();
      let cancelled = false;
      const timer = setTimeout(() => {
        if (cancelled) return;
        const ec = editingRef.current;
        if (ec?.id) {
          setReason(ec.reason?.trim() ?? '');
          setSingleDateISO(ec.date);
          setRangeStartISO(null);
          setRangeEndISO(null);
          const fd = isFullDayStored(ec);
          if (fd) {
            setMode('single-day');
            setStartTime('12:00');
            setEndTime('13:00');
          } else {
            setMode('hours');
            let sOpt = pickNearestTimeOption(sliceHHMM(ec.start_time), timeOptions, formatTime24Hour);
            let eOpt = pickNearestTimeOption(sliceHHMM(ec.end_time), timeOptions, formatTime24Hour);
            if (formatTime24Hour(eOpt) <= formatTime24Hour(sOpt)) {
              const si = Math.max(0, timeOptions.indexOf(sOpt));
              eOpt = timeOptions[Math.min(timeOptions.length - 1, si + 1)] ?? eOpt;
            }
            setStartTime(sOpt);
            setEndTime(eOpt);
          }
        } else {
          setMode('hours');
          setSingleDateISO(toISODate(today));
          setRangeStartISO(null);
          setRangeEndISO(null);
          setStartTime('12:00');
          setEndTime('13:00');
          setReason('');
        }
        setContentReady(true);
      }, 340);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible, calendarLocale, today, editingId, timeOptions, formatTime24Hour]);

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

  const modeOptions = useMemo(
    () =>
      [
        {
          key: 'hours' as const,
          icon: 'time' as const,
          label: t('admin.hoursAdmin.segment.hours', 'שעות'),
          hint: t('admin.hoursAdmin.modeHint.hours', 'חלון זמן ביום אחד'),
        },
        {
          key: 'single-day' as const,
          icon: 'calendar' as const,
          label: t('admin.hoursAdmin.segment.singleDay', 'יום אחד'),
          hint: t('admin.hoursAdmin.modeHint.singleDay', 'סגור כל היום\nתאריך בודד'),
        },
        {
          key: 'multi-days' as const,
          icon: 'calendar-outline' as const,
          label: t('admin.hoursAdmin.segment.multiDays', 'מספר ימים'),
          hint: t('admin.hoursAdmin.modeHint.multiDays', 'שתי תאריכים בלוח\nכל מה שביניהם נסגר'),
        },
      ] as const,
    [t],
  );

  // ── calendar renderers ──────────────────────────────────────────────────────

  const renderCalendar = (variant: 'hours' | 'single' | 'range') => {
    if (!contentReady) {
      return <View style={styles.calendarSkeleton} />;
    }
    if (variant === 'range') {
      return (
        <RNCalendar
          key={`constraints-range-${calendarLocale}`}
          current={rangeStartISO || toISODate(today)}
          minDate={calendarMinDate}
          markingType="period"
          markedDates={rangeCalendarMarkedDates}
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
        minDate={calendarMinDate}
        onDayPress={(d: any) => setSingleDateISO(d.dateString)}
        markedDates={singleCalendarMarkedDates}
        enableSwipeMonths
        hideDayNames={false}
        firstDay={0}
        renderArrow={calendarRenderArrow}
        style={{ direction: rtl ? 'rtl' : 'ltr' }}
        theme={calendarTheme as any}
      />
    );
  };

  const handleConfirmConstraintConflict = async () => {
    const pending = pendingConstraintConflict;
    if (!pending) return;
    setIsConfirmingConstraintConflict(true);
    try {
      const normReason = reason?.trim() || null;
      const cancelRes = await cancelBookedAppointmentsDueToConstraint(pending.conflicts, (apt) => ({
        title: t('admin.hoursAdmin.appointmentCancelledByConstraintTitle', 'התור בוטל'),
        content: t('admin.hoursAdmin.appointmentCancelledByConstraintBody', '{{service}} · {{date}} · {{time}}', {
          service: (apt.service_name || '').trim() || t('booking.field.service', 'שירות'),
          date: apt.slot_date,
          time: sliceHHMM(apt.slot_time),
        }),
      }));
      if (!cancelRes.ok) {
        Alert.alert(
          t('error.generic', 'שגיאה'),
          t('admin.hoursAdmin.constraintCancelAppointmentsFailed', 'לא ניתן היה לבטל את כל התורים. נסו שוב.'),
        );
        return;
      }

      if (pending.kind === 'create') {
        await businessConstraintsApi.createConstraints(pending.entries as any, (user as any)?.id || null);
        const sortedDates = pending.entries.map((e) => e.date).sort();
        onConstraintsChanged?.({
          dateMin: sortedDates[0]!,
          dateMax: sortedDates[sortedDates.length - 1]!,
        });
        const successLines: SuccessLine[] = [
          { variant: 'headline', text: t('admin.hoursAdmin.successAnimatedHeadline', 'האילוץ נשמר') },
        ];
        if (mode === 'hours') {
          successLines.push(
            { variant: 'accent', text: `${t('booking.field.date', 'תאריך')}: ${formatDatePretty(singleDateISO)}` },
            {
              variant: 'body',
              text: `${t('admin.hoursAdmin.closedHours', 'שעות חסומות')}: ${displayTimeLabel(startTime)} – ${displayTimeLabel(endTime)}`,
            },
          );
        } else if (mode === 'single-day') {
          successLines.push(
            { variant: 'accent', text: `${t('booking.field.date', 'תאריך')}: ${formatDatePretty(singleDateISO)}` },
            { variant: 'body', text: t('admin.hoursAdmin.allDay', 'כל היום') },
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
              text: t('admin.hoursAdmin.successDaysClosed', '{{count}} ימים סגורים (כל היום)', {
                count: pending.entries.length,
              }),
            },
          );
        }
        if (normReason) {
          successLines.push({
            variant: 'body',
            text: t('admin.hoursAdmin.successReasonLine', 'סיבה: {{reason}}', { reason: normReason }),
          });
        }
        setConstraintSuccessLines(successLines);
        setConstraintSuccessAnimKey((k) => k + 1);
        setShowConstraintSuccess(true);
      } else {
        const { entry, underlyingIds, userIdForCreate } = pending;
        if (underlyingIds.length === 1) {
          const res = await businessConstraintsApi.updateConstraint(underlyingIds[0]!, {
            date: entry.date,
            start_time: entry.start_time,
            end_time: entry.end_time,
            reason: normReason,
          });
          if (res.ok === false) {
            Alert.alert(t('error.generic', 'שגיאה'), res.message);
            return;
          }
        } else {
          for (const id of underlyingIds) {
            await businessConstraintsApi.deleteConstraint(id);
          }
          await businessConstraintsApi.createConstraints(
            [{ date: entry.date, start_time: entry.start_time, end_time: entry.end_time, reason: normReason }] as any,
            userIdForCreate,
          );
        }
        onConstraintsChanged?.({ dateMin: entry.date, dateMax: entry.date });
        const successLinesEdit: SuccessLine[] = [
          { variant: 'headline', text: t('admin.hoursAdmin.successUpdateHeadline', 'האילוץ עודכן') },
        ];
        if (mode === 'hours') {
          successLinesEdit.push(
            { variant: 'accent', text: `${t('booking.field.date', 'תאריך')}: ${formatDatePretty(singleDateISO)}` },
            {
              variant: 'body',
              text: `${t('admin.hoursAdmin.closedHours', 'שעות חסומות')}: ${displayTimeLabel(startTime)} – ${displayTimeLabel(endTime)}`,
            },
          );
        } else {
          successLinesEdit.push(
            { variant: 'accent', text: `${t('booking.field.date', 'תאריך')}: ${formatDatePretty(singleDateISO)}` },
            { variant: 'body', text: t('admin.hoursAdmin.allDay', 'כל היום') },
          );
        }
        if (normReason) {
          successLinesEdit.push({
            variant: 'body',
            text: t('admin.hoursAdmin.successReasonLine', 'סיבה: {{reason}}', { reason: normReason }),
          });
        }
        setConstraintSuccessLines(successLinesEdit);
        setConstraintSuccessAnimKey((k) => k + 1);
        setShowConstraintSuccess(true);
      }
      setPendingConstraintConflict(null);
    } catch {
      Alert.alert(t('error.generic', 'שגיאה'), t('admin.hoursAdmin.saveFailed', 'שמירת האילוצים נכשלה'));
    } finally {
      setIsConfirmingConstraintConflict(false);
    }
  };

  // ── save ─────────────────────────────────────────────────────────────────────

  const save = async () => {
    try {
      setIsSaving(true);
      let entries: ConstraintDraft[] = [];
      const normReason = reason?.trim() || null;

      if (mode === 'hours') {
        if (!singleDateISO) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.hoursAdmin.selectDate', 'נא לבחור תאריך'));
          return;
        }
        if (formatTime24Hour(startTime) >= formatTime24Hour(endTime)) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.hoursAdmin.endAfterStart', 'שעת הסיום חייבת להיות אחרי שעת ההתחלה'));
          return;
        }
        entries = [{ date: singleDateISO, start_time: formatTime24Hour(startTime), end_time: formatTime24Hour(endTime), reason: normReason }];
      } else if (mode === 'single-day') {
        if (!singleDateISO) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.hoursAdmin.selectDate', 'נא לבחור תאריך'));
          return;
        }
        entries = [{ date: singleDateISO, start_time: '00:00', end_time: '23:59', reason: normReason }];
      } else {
        if (!rangeStartISO || !rangeEndISO) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.hoursAdmin.selectDateRange', 'נא לבחור טווח תאריכים'));
          return;
        }
        const start = new Date(rangeStartISO);
        const end = new Date(rangeEndISO);
        if (start > end) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.hoursAdmin.invalidDateRange', 'טווח תאריכים לא תקין'));
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

      const editTarget = editingRef.current;

      if (editTarget?.id) {
        if (mode === 'multi-days') {
          Alert.alert(
            t('error.generic', 'שגיאה'),
            t(
              'admin.hoursAdmin.editMultiDayNotSupported',
              'לא ניתן להפוך אילוץ לטווח של מספר ימים ממסך עריכה זה.',
            ),
          );
          return;
        }
        if (entries.length !== 1) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.calendar.constraintEditSaveFailed', 'Could not save changes'));
          return;
        }
        const entry = entries[0]!;
        const underlyingIds = editTarget.id.split('|').filter((x) => x.length > 0);
        if (underlyingIds.length === 0) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.calendar.constraintEditSaveFailed', 'Could not save changes'));
          return;
        }

        const origFull = isFullDayStored(editTarget);
        const newFull = mode === 'single-day';
        const origStartModal = pickNearestTimeOption(sliceHHMM(editTarget.start_time), timeOptions, formatTime24Hour);
        const origEndModal = pickNearestTimeOption(sliceHHMM(editTarget.end_time), timeOptions, formatTime24Hour);
        const noWindowChange =
          singleDateISO === editTarget.date &&
          ((newFull && origFull) ||
            (!newFull &&
              !origFull &&
              formatTime24Hour(startTime) === formatTime24Hour(origStartModal) &&
              formatTime24Hour(endTime) === formatTime24Hour(origEndModal)));

        if (!noWindowChange && editTarget.user_id) {
          const conflicts = await findBookedAppointmentsOverlappingConstraintWindows(editTarget.user_id, [
            { date: entry.date, start_time: entry.start_time, end_time: entry.end_time },
          ]);
          if (conflicts.length > 0) {
            setPendingConstraintConflict({
              kind: 'edit',
              entry,
              underlyingIds,
              userIdForCreate: editTarget.user_id ?? ((user as any)?.id ?? null),
              conflicts,
            });
            return;
          }
        }

        if (underlyingIds.length === 1) {
          const res = await businessConstraintsApi.updateConstraint(underlyingIds[0]!, {
            date: entry.date,
            start_time: entry.start_time,
            end_time: entry.end_time,
            reason: normReason,
          });
          if (res.ok === false) {
            Alert.alert(t('error.generic', 'שגיאה'), res.message);
            return;
          }
        } else {
          for (const id of underlyingIds) {
            await businessConstraintsApi.deleteConstraint(id);
          }
          await businessConstraintsApi.createConstraints(
            [{ date: entry.date, start_time: entry.start_time, end_time: entry.end_time, reason: normReason }] as any,
            editTarget.user_id ?? ((user as any)?.id ?? null),
          );
        }

        onConstraintsChanged?.({ dateMin: entry.date, dateMax: entry.date });

        const successLinesEdit: SuccessLine[] = [
          { variant: 'headline', text: t('admin.hoursAdmin.successUpdateHeadline', 'האילוץ עודכן') },
        ];
        if (mode === 'hours') {
          successLinesEdit.push(
            { variant: 'accent', text: `${t('booking.field.date', 'תאריך')}: ${formatDatePretty(singleDateISO)}` },
            {
              variant: 'body',
              text: `${t('admin.hoursAdmin.closedHours', 'שעות חסומות')}: ${displayTimeLabel(startTime)} – ${displayTimeLabel(endTime)}`,
            },
          );
        } else {
          successLinesEdit.push(
            { variant: 'accent', text: `${t('booking.field.date', 'תאריך')}: ${formatDatePretty(singleDateISO)}` },
            { variant: 'body', text: t('admin.hoursAdmin.allDay', 'כל היום') },
          );
        }
        if (normReason) {
          successLinesEdit.push({
            variant: 'body',
            text: t('admin.hoursAdmin.successReasonLine', 'סיבה: {{reason}}', { reason: normReason }),
          });
        }
        setConstraintSuccessLines(successLinesEdit);
        setConstraintSuccessAnimKey((k) => k + 1);
        setShowConstraintSuccess(true);
        return;
      }

      const barberId = (user as any)?.id as string | undefined;
      if (barberId) {
        const windows = entries.map((e) => ({
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
        }));
        const conflicts = await findBookedAppointmentsOverlappingConstraintWindows(barberId, windows);
        if (conflicts.length > 0) {
          setPendingConstraintConflict({ kind: 'create', entries, conflicts });
          return;
        }
      }

      await businessConstraintsApi.createConstraints(entries as any, (user as any)?.id || null);

      const sortedDates = entries.map((e) => e.date).sort();
      onConstraintsChanged?.({
        dateMin: sortedDates[0]!,
        dateMax: sortedDates[sortedDates.length - 1]!,
      });

      const successLines: SuccessLine[] = [
        { variant: 'headline', text: t('admin.hoursAdmin.successAnimatedHeadline', 'האילוץ נשמר') },
      ];
      if (mode === 'hours') {
        successLines.push(
          { variant: 'accent', text: `${t('booking.field.date', 'תאריך')}: ${formatDatePretty(singleDateISO)}` },
          { variant: 'body', text: `${t('admin.hoursAdmin.closedHours', 'שעות חסומות')}: ${displayTimeLabel(startTime)} – ${displayTimeLabel(endTime)}` },
        );
      } else if (mode === 'single-day') {
        successLines.push(
          { variant: 'accent', text: `${t('booking.field.date', 'תאריך')}: ${formatDatePretty(singleDateISO)}` },
          { variant: 'body', text: t('admin.hoursAdmin.allDay', 'כל היום') },
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
            text: t('admin.hoursAdmin.successDaysClosed', '{{count}} ימים סגורים (כל היום)', { count: entries.length }),
          },
        );
      }
      if (normReason) {
        successLines.push({
          variant: 'body',
          text: t('admin.hoursAdmin.successReasonLine', 'סיבה: {{reason}}', { reason: normReason }),
        });
      }
      setConstraintSuccessLines(successLines);
      setConstraintSuccessAnimKey((k) => k + 1);
      setShowConstraintSuccess(true);
    } catch {
      Alert.alert(t('error.generic', 'שגיאה'), t('admin.hoursAdmin.saveFailed', 'שמירת האילוצים נכשלה'));
    } finally {
      setIsSaving(false);
    }
  };

  // ── sheet animation & backdrop ──────────────────────────────────────────────

  const renderBackdrop = useCallback(
    (bsProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...bsProps}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
        pressBehavior="close"
      />
    ),
    [],
  );

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
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
        <View style={[styles.sheetBody, layoutRtl ? styles.sheetBodyRtl : styles.sheetBodyLtr]}>
          {/* ── header (fixed; form scrolls like calendar reminder sheet) ── */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderInner}>
              <View style={styles.sheetTitleBlock}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {isEditMode
                    ? t('admin.hoursAdmin.editTitle', 'עריכת אילוץ')
                    : t('admin.hoursAdmin.title', 'אילוצי עבודה')}
                </Text>
                <Text style={styles.sheetSubtitle} numberOfLines={2}>
                  {isEditMode
                    ? t('admin.hoursAdmin.editSubtitle', 'עדכן את הפרטים ושמור')
                    : t('admin.hoursAdmin.whatToBlock', 'מה לחסום?')}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
          </View>

          <BottomSheetScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ── 1. Reason — top, styled prominently ── */}
            <View style={[styles.reasonCard, { borderColor: reason.trim() ? `${primary}50` : UI.border }]}>
              <View style={styles.reasonCardHeader}>
                <View style={[styles.reasonIconCircle, { backgroundColor: `${primary}14` }]}>
                  <Ionicons name="create-outline" size={20} color={primary} />
                </View>
                <View style={styles.reasonHeaderText}>
                  <Text style={[styles.reasonCardTitle, { color: UI.text }]}>
                    {t('admin.hoursAdmin.optionalReason', 'סיבה לחסימה')}
                  </Text>
                  <Text style={styles.reasonCardSub}>
                    {t('admin.hoursAdmin.reasonOptional', 'אופציונלי — מוצג רק לך')}
                  </Text>
                </View>
                {!!reason.trim() && (
                  <TouchableOpacity onPress={() => setReason('')} hitSlop={12} accessibilityRole="button">
                    <Ionicons name="close-circle" size={22} color={UI.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t('admin.hoursAdmin.reasonExamples', 'למשל: חופשה, אירוע, סגירה זמנית...')}
                placeholderTextColor={UI.textTertiary}
                style={[styles.reasonBigInput, { textAlign: 'right', writingDirection: 'rtl' }]}
                multiline
                textAlignVertical="top"
              />
              {/* Quick chips */}
              <View style={styles.reasonChips}>
                {['חופשה', 'מחלה', 'אירוע משפחתי', 'סגירה זמנית'].map((chip) => (
                  <TouchableOpacity
                    key={chip}
                    onPress={() => setReason(chip)}
                    style={[
                      styles.reasonChip,
                      reason === chip && { backgroundColor: `${primary}18`, borderColor: `${primary}60` },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.reasonChipText, reason === chip && { color: primary }]}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── 2. Mode — 3 compact tiles in a row ── */}
            <View style={styles.modeTileRow}>
              {modeOptions.map((opt) => {
                const active = mode === opt.key;
                const tileDisabled = isEditMode && opt.key === 'multi-days';
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => {
                      if (tileDisabled) return;
                      setMode(opt.key);
                    }}
                    activeOpacity={tileDisabled ? 1 : 0.8}
                    disabled={tileDisabled}
                    style={[
                      styles.modeTile,
                      active && { borderColor: primary, backgroundColor: `${primary}0F` },
                      tileDisabled && { opacity: 0.42 },
                    ]}
                  >
                    <View style={[styles.modeTileIcon, { backgroundColor: active ? `${primary}22` : 'rgba(60,60,67,0.06)' }]}>
                      <Ionicons name={opt.icon} size={20} color={active ? primary : UI.textSecondary} />
                    </View>
                    <Text style={[styles.modeTileLabel, active && { color: primary }]} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    <Text style={styles.modeTileHint} numberOfLines={4}>
                      {opt.hint}
                    </Text>
                    {active && (
                      <View
                        style={[
                          styles.modeTileActiveDot,
                          { backgroundColor: primary },
                          layoutRtl ? styles.modeTileActiveDotRtl : styles.modeTileActiveDotLtr,
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── 3. Date / time content based on mode ── */}

            {/* Hours mode: date + time range */}
            {mode === 'hours' && (
              <>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{t('admin.hoursAdmin.pickDateShort', 'בחרי תאריך')}</Text>
                  </View>
                  <View style={styles.calendarShell}>{renderCalendar('hours')}</View>
                </View>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{t('admin.hoursAdmin.closedHours', 'שעות חסומות')}</Text>
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
                    <View style={styles.timeRowInner}>
                      <View style={[styles.timeBadge, { backgroundColor: `${primary}14` }]}>
                        <Ionicons name="time" size={18} color={primary} />
                      </View>
                      <View style={styles.timeRowTextCol}>
                        <Text style={styles.timeRowLabel}>{t('admin.hoursAdmin.tapToEditHours', 'לחץ לבחירת שעות')}</Text>
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

            {/* Single-day mode */}
            {mode === 'single-day' && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{t('admin.hoursAdmin.pickDateAllDay', 'בחרי תאריך (סגור כל היום)')}</Text>
                </View>
                <View style={styles.calendarShell}>{renderCalendar('single')}</View>
              </View>
            )}

            {/* Multi-days mode */}
            {mode === 'multi-days' && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{t('admin.hoursAdmin.pickDateRangeAllDay', 'בחרי טווח תאריכים')}</Text>
                </View>
                <Text style={styles.rangeHelp}>{t('admin.hoursAdmin.rangeHelp', 'לחץ על יום ההתחלה, ואז על יום הסיום')}</Text>
                <View style={styles.calendarShell}>{renderCalendar('range')}</View>
                {rangeStartISO && rangeEndISO && (
                  <LinearGradient
                    colors={[`${primary}20`, `${primary}08`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.rangePill}
                  >
                    <Ionicons name="checkmark-done" size={18} color={primary} />
                    <Text style={styles.rangePillText}>
                      {formatISOToMMDDYYYY(rangeStartISO)} — {formatISOToMMDDYYYY(rangeEndISO)}
                    </Text>
                  </LinearGradient>
                )}
              </View>
            )}

            {/* ── 4. Save button ── */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: primary, shadowColor: primary }, isSaving && styles.saveBtnDisabled]}
              onPress={save}
              disabled={isSaving}
              activeOpacity={0.9}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={22} color="#FFFFFF" style={{ marginStart: 8 }} />
                  <Text style={styles.saveBtnText}>
                    {isEditMode
                      ? t('admin.hoursAdmin.saveEditCTA', 'שמור שינויים')
                      : t('admin.hoursAdmin.saveCTA', 'שמור אילוצים')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </BottomSheetScrollView>
        </View>
      </BottomSheetModal>

      {/* ── time picker wheel (stays as standard Modal, floats above the sheet) ── */}
      <Modal
        visible={isHoursModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsHoursModalOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsHoursModalOpen(false)}
            accessibilityRole="button"
          />
          <View style={[styles.bottomSheetPicker, { paddingBottom: Math.max(insets.bottom, 16), maxHeight: sheetMaxHeight }]}>
            <View style={styles.sheetGrabber} />
            <Text style={[styles.sheetTitle2, layoutRtl && { writingDirection: 'rtl' as const }]}>
              {t('admin.hoursAdmin.chooseClosedHours', 'בחרי שעות חסימה')}
            </Text>
            <View style={styles.wheelRow}>
              <View style={styles.wheelCol}>
                <Text style={styles.wheelLabel}>{t('admin.hoursAdmin.start', 'התחלה')}</Text>
                <WheelPicker options={timeOptions} value={tempStartHour} onChange={setTempStartHour} primaryColor={primary} />
              </View>
              <View style={{ width: 12 }} />
              <View style={styles.wheelCol}>
                <Text style={styles.wheelLabel}>{t('admin.hoursAdmin.end', 'סיום')}</Text>
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
              <Text style={styles.sheetPrimaryBtnText}>{t('save', 'שמור')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── overlap: cancel client appointments + confirm constraint ── */}
      <Modal
        visible={pendingConstraintConflict !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!isConfirmingConstraintConflict) setPendingConstraintConflict(null);
        }}
      >
        <View style={styles.conflictOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isConfirmingConstraintConflict) setPendingConstraintConflict(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('cancel', 'ביטול')}
          />
          <View style={[styles.conflictCard, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
            <View style={[styles.conflictIconRing, { borderColor: `${UI.danger}44` }]}>
              <Ionicons name="alert-circle" size={32} color={UI.danger} />
            </View>
            <Text
              style={[styles.conflictCardTitle, { textAlign: layoutRtl ? 'right' : 'center', writingDirection: layoutRtl ? 'rtl' : 'ltr' }]}
            >
              {t('admin.hoursAdmin.constraintConflictSheetTitle', 'יש תורים שחופפים לאילוץ')}
            </Text>
            <Text
              style={[styles.conflictCardBody, { textAlign: layoutRtl ? 'right' : 'center', writingDirection: layoutRtl ? 'rtl' : 'ltr' }]}
            >
              {t('admin.hoursAdmin.constraintConflictSheetBody', 'זיהינו {{count}} תורים של לקוחות שכבר נקבעו בטווח הזמן שבחרת.', {
                count: pendingConstraintConflict?.conflicts.length ?? 0,
              })}
            </Text>
            <Text
              style={[styles.conflictCardHint, { textAlign: layoutRtl ? 'right' : 'center', writingDirection: layoutRtl ? 'rtl' : 'ltr' }]}
            >
              {t(
                'admin.hoursAdmin.constraintConflictSheetHint',
                'אם תאשר/י — כל התורים האלה יוסרו מהיומן, ולכל לקוח שמספר הטלפון שלו רשום במערכת תישלח התראה באפליקציה והודעת SMS על ביטול התור.',
              )}
            </Text>
            <View style={[styles.conflictActionsRow, layoutRtl && styles.conflictActionsRowRtl]}>
              <TouchableOpacity
                style={[styles.conflictBtnSecondary, { borderColor: UI.border }]}
                onPress={() => {
                  if (!isConfirmingConstraintConflict) setPendingConstraintConflict(null);
                }}
                disabled={isConfirmingConstraintConflict}
                activeOpacity={0.85}
              >
                <Text style={styles.conflictBtnSecondaryText}>{t('admin.hoursAdmin.constraintConflictCancel', 'ביטול')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.conflictBtnPrimary, { backgroundColor: UI.danger }]}
                onPress={() => void handleConfirmConstraintConflict()}
                disabled={isConfirmingConstraintConflict}
                activeOpacity={0.88}
              >
                {isConfirmingConstraintConflict ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.conflictBtnPrimaryText}>
                    {t('admin.hoursAdmin.constraintConflictConfirm', 'אשר/י ובטל/י תורים')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── success animation ── */}
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
          onDismiss={() => {
            setShowConstraintSuccess(false);
            onClose();
          }}
          gotItLabel={t('booking.gotIt', 'הבנתי')}
        />
      </Modal>
    </>
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
  sheetBodyRtl: {
    direction: 'rtl',
  },
  sheetBodyLtr: {
    direction: 'ltr',
  },

  // ── header (aligned with calendar reminder sheet) ───────────────────────────
  sheetHeader: { paddingTop: 4 },
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
  },

  // ── scroll ────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 0,
  },

  // ── reason card (top section) ──────────────────────────────────────────────
  reasonCard: {
    backgroundColor: UI.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: UI.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  reasonCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  reasonIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reasonHeaderText: { flex: 1, alignItems: 'flex-start' },
  reasonCardTitle: { fontSize: 16, fontWeight: '800', textAlign: 'right' },
  reasonCardSub: { fontSize: 11, fontWeight: '500', color: UI.textTertiary, marginTop: 1, textAlign: 'right' },
  reasonBigInput: {
    fontSize: 16,
    fontWeight: '500',
    color: UI.text,
    minHeight: 64,
    backgroundColor: 'rgba(60,60,67,0.04)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 10,
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reasonChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: 'rgba(60,60,67,0.04)',
  },
  reasonChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: UI.textSecondary,
  },

  // ── mode selector — 3 tiles in a row ──────────────────────────────────────
  modeTileRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  modeTile: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: UI.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: UI.border,
    gap: 6,
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  modeTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTileLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.text,
    textAlign: 'center',
  },
  modeTileHint: {
    fontSize: 9,
    fontWeight: '600',
    color: UI.textSecondary,
    textAlign: 'center',
    lineHeight: 12,
    alignSelf: 'stretch',
  },
  modeTileActiveDot: {
    position: 'absolute',
    top: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  modeTileActiveDotRtl: { right: 8 },
  modeTileActiveDotLtr: { left: 8 },

  // ── cards ─────────────────────────────────────────────────────────────────
  card: {
    marginBottom: 14,
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
    marginBottom: 12,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: UI.text,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  calendarShell: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.surface,
  },
  calendarSkeleton: {
    height: 300,
    borderRadius: 16,
    backgroundColor: 'rgba(60,60,67,0.04)',
  },

  // ── range ─────────────────────────────────────────────────────────────────
  rangeHelp: { fontSize: 13, fontWeight: '600', color: UI.textSecondary, marginBottom: 10, lineHeight: 18, textAlign: 'right' },
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
  rangePillText: { fontSize: 14, fontWeight: '800', color: UI.text, flex: 1, textAlign: 'right' },

  // ── time row ──────────────────────────────────────────────────────────────
  timeRow: {
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(60,60,67,0.04)',
    overflow: 'hidden',
  },
  timeRowInner: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  timeRowTextCol: { flex: 1, alignItems: 'flex-start' },
  timeBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  timeRowLabel: { fontSize: 12, fontWeight: '700', color: UI.textSecondary, marginBottom: 2, textAlign: 'right' },
  timeRowValue: { fontSize: 17, fontWeight: '800', color: UI.text },


  // ── save button ────────────────────────────────────────────────────────────
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    borderRadius: 18,
    gap: 6,
    marginBottom: 4,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.30, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' },

  // ── time picker bottom sheet (standard Modal) ──────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  bottomSheetPicker: {
    backgroundColor: UI.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.14, shadowRadius: 16 },
      android: { elevation: 20 },
    }),
  },
  sheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle2: {
    fontSize: 17,
    fontWeight: '800',
    color: UI.text,
    marginBottom: 16,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  wheelRow: { flexDirection: 'row', alignItems: 'center' },
  wheelCol: { flex: 1 },
  wheelLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: UI.textSecondary,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  sheetPrimaryBtn: {
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  conflictOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.52)',
    justifyContent: 'flex-end',
  },
  conflictCard: {
    backgroundColor: UI.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 22,
    alignItems: 'stretch',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.18, shadowRadius: 28 },
      android: { elevation: 24 },
    }),
  },
  conflictIconRing: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 2,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: `${UI.danger}10`,
  },
  conflictCardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: UI.text,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  conflictCardBody: {
    fontSize: 15,
    fontWeight: '600',
    color: UI.text,
    lineHeight: 22,
    marginBottom: 10,
  },
  conflictCardHint: {
    fontSize: 13,
    fontWeight: '500',
    color: UI.textSecondary,
    lineHeight: 19,
    marginBottom: 22,
  },
  conflictActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  conflictActionsRowRtl: {
    flexDirection: 'row-reverse',
  },
  conflictBtnSecondary: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    backgroundColor: '#F2F2F7',
  },
  conflictBtnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: UI.textSecondary,
  },
  conflictBtnPrimary: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    ...Platform.select({
      ios: { shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  conflictBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
