import React, { useCallback, useMemo, useState } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
  DeviceEventEmitter,
  I18nManager,
  Modal,
  Alert,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import * as Calendar from 'expo-calendar';
import BookingSuccessAnimatedOverlay, {
  type SuccessLine,
} from '@/components/book-appointment/BookingSuccessAnimatedOverlay';
import { isRtlLanguage, toBcp47Locale } from '@/lib/i18nLocale';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  Calendar as CalendarIcon,
  Search,
  User,
  Clock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  ClipboardList,
} from 'lucide-react-native';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import {
  useAdminAddAppointmentForm,
  formatDateToLocalString,
  formatBookingTimeLabel,
  parseDateKeyToLocalDate,
  type AdminBookingSaveSuccessPayload,
} from '@/lib/hooks/useAdminAddAppointmentForm';
import type { Service } from '@/lib/supabase';
import { ADMIN_CALENDAR_APPOINTMENTS_CHANGED } from '@/constants/adminCalendarEvents';
import { BOOKING_TIME_PERIOD_EMOJI } from '@/constants/bookingTimePeriodEmoji';
import { bookingTimeRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

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

function lightenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * ratio));
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}

function darkenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = 1 - ratio;
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n * f))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function parseDateParam(raw: string | string[] | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) && raw[0] ? String(raw[0]).trim() : '';
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

const TOTAL_WIZARD_STEPS = 5;

type AdminTimePeriod = 'morning' | 'afternoon' | 'evening';

const ADMIN_TIME_PERIODS: {
  key: AdminTimePeriod;
  labelKey: string;
  labelFallback: string;
  emoji: string;
  fromHour: number;
  toHour: number;
}[] = [
  {
    key: 'morning',
    labelKey: 'booking.timePeriod.morning',
    labelFallback: 'בוקר',
    emoji: BOOKING_TIME_PERIOD_EMOJI.morning,
    fromHour: 0,
    toHour: 11,
  },
  {
    key: 'afternoon',
    labelKey: 'booking.timePeriod.afternoon',
    labelFallback: 'צהריים',
    emoji: BOOKING_TIME_PERIOD_EMOJI.afternoon,
    fromHour: 12,
    toHour: 16,
  },
  {
    key: 'evening',
    labelKey: 'booking.timePeriod.evening',
    labelFallback: 'ערב',
    emoji: BOOKING_TIME_PERIOD_EMOJI.evening,
    fromHour: 17,
    toHour: 23,
  },
];

function adminGetPeriod(timeStr: string): AdminTimePeriod {
  const hour = parseInt(timeStr.split(':')[0], 10);
  if (hour <= 11) return 'morning';
  if (hour <= 16) return 'afternoon';
  return 'evening';
}

/** Max height for admin time list: screen minus header, step intro, glass insets, and floating footer + gap. */
function computeAdminTimeSlotsMaxHeight(windowHeight: number, topInset: number, bottomInset: number): number {
  const headerBlock = topInset + 52 + 8;
  const scrollTop = 4;
  const progressBlock = 4 + 14;
  const stepIntroApprox = 6 + 16 + 44 + 10 + 22 * 3 + 8;
  const glassTop = 18;
  const topReserve = headerBlock + scrollTop + progressBlock + stepIntroApprox + glassTop;

  const footerBottom = Math.max(bottomInset, 12) + 8;
  const footerPill = 54;
  const gapAboveFooter = 22;
  const glassBottom = 18;
  const bottomReserve = footerBottom + footerPill + gapAboveFooter + glassBottom;

  return Math.max(200, Math.round(windowHeight - topReserve - bottomReserve));
}

const adminBookingGridStyles = StyleSheet.create({
  grid: { gap: 9 },
  row: { flexDirection: 'row', gap: 9 },
  cellWrap: { flex: 1 },
  cellPress: { flex: 1 },
  cellIdle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 4,
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  cellGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 4,
    minHeight: 52,
    borderRadius: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  cellTime: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  cellTimeSelected: { color: '#FFFFFF', fontWeight: '800' },
  timeSlotsScroll: { alignSelf: 'stretch' },
  timeSlotsScrollInner: { gap: 16, paddingBottom: 14 },
  timeSection: { gap: 10 },
  /** `direction: 'ltr'` + [line][label][emoji] keeps period title flush to the card’s visual end (right in Hebrew RTL). */
  sectionLabelRow: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    gap: 7,
  },
  sectionEmoji: { fontSize: 15, lineHeight: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, opacity: 0.55 },
});

type AdminBookingTimeGridProps = {
  slots: string[];
  selectedTime: string | null;
  primary: string;
  secondary: string;
  fieldBorder: string;
  fieldBg: string;
  innerText: string;
  i18nLang?: string;
  onSelectTime: (time: string) => void;
  baseDelay: number;
};

function AdminBookingTimeGrid({
  slots,
  selectedTime,
  primary,
  secondary,
  fieldBorder,
  fieldBg,
  innerText,
  i18nLang,
  onSelectTime,
  baseDelay,
}: AdminBookingTimeGridProps) {
  const rows: string[][] = [];
  for (let i = 0; i < slots.length; i += 3) {
    rows.push(slots.slice(i, i + 3));
  }
  return (
    <View style={adminBookingGridStyles.grid}>
      {rows.map((row, rowIdx) => (
        <View key={`admin-time-row-${rowIdx}`} style={adminBookingGridStyles.row}>
          {row.map((slot, colIdx) => {
            const selected = selectedTime === slot;
            const delay = baseDelay + rowIdx * 3 + colIdx;
            return (
              <Animated.View
                key={slot}
                entering={bookingTimeRowEntering(delay)}
                style={adminBookingGridStyles.cellWrap}
              >
                <Pressable
                  onPress={() => onSelectTime(slot)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    adminBookingGridStyles.cellPress,
                    pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  {selected ? (
                    <LinearGradient
                      colors={[primary, secondary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={adminBookingGridStyles.cellGradient}
                    >
                      <Text style={[adminBookingGridStyles.cellTime, adminBookingGridStyles.cellTimeSelected]}>
                        {formatBookingTimeLabel(slot, i18nLang)}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View style={[adminBookingGridStyles.cellIdle, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
                      <Text style={[adminBookingGridStyles.cellTime, { color: innerText }]}>
                        {formatBookingTimeLabel(slot, i18nLang)}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            );
          })}
          {row.length < 3
            ? Array.from({ length: 3 - row.length }).map((_, i) => (
                <View key={`admin-time-ph-${rowIdx}-${i}`} style={adminBookingGridStyles.cellWrap} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

export default function AddAppointmentScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const initialDateKey = parseDateParam(params.date);

  const goBackToAppointments = useCallback(() => {
    router.replace('/(tabs)/appointments');
  }, []);

  const onBookedSuccess = useCallback(() => {
    DeviceEventEmitter.emit(ADMIN_CALENDAR_APPOINTMENTS_CHANGED);
    goBackToAppointments();
  }, [goBackToAppointments]);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successAnimKey, setSuccessAnimKey] = useState(0);
  const [successSnapshot, setSuccessSnapshot] = useState<AdminBookingSaveSuccessPayload | null>(null);

  const onSaveSuccess = useCallback((payload: AdminBookingSaveSuccessPayload) => {
    setSuccessSnapshot(payload);
    setSuccessAnimKey((k) => k + 1);
    setShowSuccessModal(true);
  }, []);

  const form = useAdminAddAppointmentForm({
    initialDateKey,
    onSaveSuccess,
    onSuccess: onBookedSuccess,
  });

  const [wizardStep, setWizardStep] = useState(1);

  useFocusEffect(
    useCallback(() => {
      form.reset();
      setWizardStep(1);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (wizardStep > 1) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setWizardStep((s) => Math.max(1, s - 1));
          return true;
        }
        goBackToAppointments();
        return true;
      });
      return () => sub.remove();
    }, [goBackToAppointments, wizardStep])
  );

  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const layoutRtl = I18nManager.isRTL;
  const isHeCopy = i18n.language?.startsWith('he') ?? true;
  /** True when the UI should behave RTL — either system RTL or Hebrew language. */
  const rtl = layoutRtl || isHeCopy;
  const primary = businessColors.primary;
  const secondary = businessColors.secondary;

  const calendarLocale = isHeCopy ? 'he' : 'en';
  LocaleConfig.defaultLocale = calendarLocale;

  const loginGradient = useMemo(
    () => [lightenHex(primary, 0.1), darkenHex(primary, 0.42)] as const,
    [primary],
  );
  const gradientEnd = loginGradient[1];
  const contrastAnchor = useMemo(() => darkenHex(primary, 0.22), [primary]);
  const useLightFg = readableOnHex(contrastAnchor) === '#FFFFFF';
  const heroText = useLightFg ? '#FFFFFF' : '#141414';
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.97)' : 'rgba(0,0,0,0.62)';
  const glassBg = useLightFg ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.92)';
  const glassBorder = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.08)';
  const fieldBg = useLightFg ? 'rgba(255,255,255,0.18)' : '#F5F5F7';
  const fieldBorder = useLightFg ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.08)';
  const innerText = useLightFg ? '#FFFFFF' : businessColors.text;
  const innerMuted = useLightFg ? 'rgba(255,255,255,0.96)' : businessColors.textSecondary;
  const placeholderOnGlass = useLightFg ? 'rgba(255,255,255,0.78)' : undefined;
  const iconOnGlass = useLightFg ? heroText : primary;
  const iconOnField = useLightFg ? heroText : innerMuted;

  const dateLocale = isHeCopy ? 'he-IL' : 'en-US';
  const textAlignPrimary = (rtl ? 'right' : 'left') as 'right' | 'left';
  const inputTextAlign = (rtl ? 'right' : 'left') as 'right' | 'left';
  const useRtlInputPlaceholder = rtl;
  const writingDir = (rtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr';
  // aliases kept for readability where used in new-client / service / summary blocks
  const newClientFieldsRtl = rtl;
  const newClientInputTextAlign = inputTextAlign;
  const newClientWritingDir = writingDir;
  const newClientUseRtlPlaceholder = useRtlInputPlaceholder;
  const titleShadowStyle = useMemo(
    () =>
      useLightFg
        ? {
            textShadowColor: 'rgba(0,0,0,0.32)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
          }
        : {},
    [useLightFg],
  );

  const adminTimeSlotsMaxHeight = useMemo(
    () => computeAdminTimeSlotsMaxHeight(windowHeight, insets.top, insets.bottom),
    [windowHeight, insets.top, insets.bottom],
  );

  const adminTimeSections = useMemo(() => {
    const grouped: Record<AdminTimePeriod, string[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const slot of form.availableTimes) {
      grouped[adminGetPeriod(slot)].push(slot);
    }
    const activePeriods = ADMIN_TIME_PERIODS.filter((p) => grouped[p.key].length > 0);
    let runningDelay = 1;
    return activePeriods.map((period) => {
      const slots = grouped[period.key];
      const sectionDelay = runningDelay;
      runningDelay += Math.ceil(slots.length / 3) * 3 + 2;
      return { period, slots, sectionDelay };
    });
  }, [form.availableTimes]);

  const adminBookingSuccessLines = useMemo((): SuccessLine[] => {
    if (!showSuccessModal || !successSnapshot) return [];
    const { client, service, date, time } = successSnapshot;
    const loc = toBcp47Locale(i18n?.language);
    const dateFormatted = date.toLocaleDateString(loc, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const durationM =
      service.duration_minutes && service.duration_minutes > 0 ? service.duration_minutes : 60;

    const lines: SuccessLine[] = [
      {
        variant: 'headline',
        text: t('booking.successAnimatedHeadline', 'התור נקבע בהצלחה'),
      },
      {
        variant: 'accent',
        text: `${t('booking.field.service', 'שירות')}: ${service.name}`,
      },
      {
        variant: 'body',
        text: `${t('admin.appointmentsAdmin.client', 'Client')}: ${client.name} (${client.phone})`,
      },
      {
        variant: 'body',
        text: `${t('booking.field.date', 'תאריך')}: ${dateFormatted}`,
      },
      {
        variant: 'body',
        text: `${t('booking.field.time', 'שעה')}: ${formatBookingTimeLabel(time, i18n?.language)}`,
      },
    ];
    lines.push({
      variant: 'body',
      text:
        (service.price ?? 0) > 0
          ? `${durationM} ${t('booking.min', 'דק׳')} · ₪${service.price}`
          : `${durationM} ${t('booking.min', 'דק׳')}`,
    });
    return lines;
  }, [showSuccessModal, successSnapshot, i18n?.language, t]);

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: 'transparent',
      textDayFontSize: 15,
      textMonthFontSize: 16,
      textDayHeaderFontSize: 12,
      arrowColor: useLightFg ? heroText : primary,
      selectedDayBackgroundColor: primary,
      todayTextColor: primary,
      dayTextColor: useLightFg ? 'rgba(255,255,255,0.95)' : '#1C1C1E',
      monthTextColor: useLightFg ? '#FFFFFF' : '#1C1C1E',
      textDisabledColor: useLightFg ? 'rgba(255,255,255,0.48)' : '#C6C6C8',
      textDayFontWeight: '500' as const,
      'stylesheet.calendar.header': {
        week: {
          flexDirection: 'row' as const,
          justifyContent: 'space-around' as const,
          paddingHorizontal: 0,
        },
        dayHeader: {
          flex: 1,
          textAlign: 'center' as const,
          fontSize: 11,
          fontWeight: '700' as const,
          color: useLightFg ? 'rgba(255,255,255,0.9)' : '#8E8E93',
        },
      },
      'stylesheet.calendar.main': {
        week: {
          flexDirection: 'row' as const,
          justifyContent: 'space-around' as const,
          paddingHorizontal: 0,
        },
        day: {
          flex: 1,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
      },
    }),
    [primary, useLightFg, heroText]
  );

  const calendarRenderArrow = useCallback(
    (direction: string) => {
      const size = 22;
      const c = heroText;
      if (calendarLocale === 'he') {
        return direction === 'left' ? (
          <ChevronRight size={size} color={c} strokeWidth={2.5} />
        ) : (
          <ChevronLeft size={size} color={c} strokeWidth={2.5} />
        );
      }
      return direction === 'left' ? (
        <ChevronLeft size={size} color={c} strokeWidth={2.5} />
      ) : (
        <ChevronRight size={size} color={c} strokeWidth={2.5} />
      );
    },
    [calendarLocale, heroText]
  );

  const summaryReady = !!(
    form.selectedDate &&
    form.selectedClient &&
    form.selectedService &&
    form.selectedTime
  );
  const canSubmit = summaryReady && !form.isSubmitting;

  const newClientPhoneDigits = useMemo(
    () => form.newClientPhone.replace(/\D/g, ''),
    [form.newClientPhone],
  );

  const canAdvanceFromStep = useMemo(() => {
    switch (wizardStep) {
      case 1:
        if (form.clientEntryMode === 'existing') {
          return !!form.selectedClient;
        }
        return form.newClientFullName.trim().length >= 2 && newClientPhoneDigits.length >= 9;
      case 2:
        return !!form.selectedService;
      case 3:
        return !!form.selectedDate;
      case 4:
        return !!form.selectedTime;
      default:
        return false;
    }
  }, [
    wizardStep,
    form.clientEntryMode,
    form.selectedClient,
    form.newClientFullName,
    newClientPhoneDigits,
    form.selectedService,
    form.selectedDate,
    form.selectedTime,
  ]);

  const footerPrimaryEnabled =
    wizardStep === TOTAL_WIZARD_STEPS
      ? canSubmit
      : canAdvanceFromStep && !form.isFinalizingClientStep;

  const onHeaderBack = useCallback(() => {
    if (wizardStep > 1) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setWizardStep((s) => Math.max(1, s - 1));
    } else {
      goBackToAppointments();
    }
  }, [wizardStep, goBackToAppointments]);

  const onFooterPrimary = useCallback(() => {
    if (!footerPrimaryEnabled || form.isSubmitting) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    if (wizardStep < TOTAL_WIZARD_STEPS) {
      void (async () => {
        if (wizardStep === 1) {
          const ok = await form.finalizeClientStepIfNeeded();
          if (!ok) return;
        }
        form.setShowClientDropdown(false);
        form.setShowServiceDropdown(false);
        setWizardStep((s) => Math.min(TOTAL_WIZARD_STEPS, s + 1));
      })();
    } else {
      void form.submit();
    }
  }, [footerPrimaryEnabled, form, wizardStep]);

  const stepTitle = useMemo(() => {
    switch (wizardStep) {
      case 1:
        return t('settings.recurring.wizardStepTitleClient', 'Client');
      case 2:
        return t('settings.recurring.wizardStepTitleService', 'Service');
      case 3:
        return t('booking.field.date', 'Date');
      case 4:
        return t('settings.recurring.wizardStepTitleTime', 'Time');
      default:
        return t('settings.recurring.wizardStepTitleSummary', 'Summary');
    }
  }, [wizardStep, t]);

  const stepSubtitle = useMemo(() => {
    switch (wizardStep) {
      case 1:
        return form.clientEntryMode === 'existing'
          ? t('admin.appointmentsAdmin.pickClient', 'Pick the client for this appointment')
          : t(
              'admin.appointmentsAdmin.newClientStepHint',
              'Enter details — the client can sign in later with this phone number.',
            );
      case 2:
        return t('admin.appointmentsAdmin.pickService', 'Choose the service to perform');
      case 3:
        return t('admin.appointmentsAdmin.pickDate', 'Select the date for this appointment');
      case 4:
        return !form.selectedDate || !form.selectedService
          ? t('admin.appointmentsAdmin.selectDateAndServiceFirst', 'בחרו תאריך ושירות כדי לראות שעות פנויות')
          : t('admin.appointmentsAdmin.pickTime', 'Pick an available time slot');
      default:
        return t('settings.recurring.wizardStepSubtitleSummary', 'Review the details before saving');
    }
  }, [wizardStep, t, form.selectedDate, form.selectedService, form.clientEntryMode]);

  const scrollBottomPad = Math.max(insets.bottom, 20) + 88;

  const newClientNameInputSlot = (
    <View style={styles.fieldInputSlot}>
      <TextInput
        style={[
          styles.fieldInput,
          {
            color: innerText,
            textAlign: newClientInputTextAlign,
            writingDirection: newClientWritingDir,
          },
        ]}
        value={form.newClientFullName}
        onChangeText={form.setNewClientFullName}
        placeholder={newClientUseRtlPlaceholder ? '' : t('admin.appointmentsAdmin.newClientNamePh', 'Enter full name')}
        placeholderTextColor={placeholderOnGlass ?? innerMuted}
        textAlignVertical="center"
        autoCapitalize="words"
        accessibilityLabel={t('admin.appointmentsAdmin.newClientFullName', 'Full name')}
      />
      {newClientUseRtlPlaceholder && !form.newClientFullName.trim() ? (
        <Text
          pointerEvents="none"
          numberOfLines={1}
          style={[
            styles.inputPlaceholderOverlay,
            {
              color: placeholderOnGlass ?? innerMuted,
              textAlign: newClientInputTextAlign,
              writingDirection: newClientWritingDir,
            },
          ]}
        >
          {t('admin.appointmentsAdmin.newClientNamePh', 'הזן שם מלא')}
        </Text>
      ) : null}
    </View>
  );
  const newClientNameIconSlot = (
    <View style={styles.labeledFieldIconSlot}>
      <User size={18} color={innerMuted} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: gradientEnd }]}>
      <LinearGradient colors={[...loginGradient]} style={StyleSheet.absoluteFill} />
      {Platform.OS !== 'web' ? (
        <BrandLavaLampBackground
          primaryColor={primary}
          baseColor={gradientEnd}
          count={4}
          duration={16000}
          blurIntensity={48}
        />
      ) : null}
      <StatusBar style={useLightFg ? 'light' : 'dark'} />

      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={onHeaderBack}
            style={({ pressed }) => [
              styles.headerBackCircle,
              {
                backgroundColor: useLightFg ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)',
                borderColor: useLightFg ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.08)',
                opacity: pressed ? 0.82 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              wizardStep > 1 ? t('settings.recurring.wizardBackStep', 'Previous step') : t('back', 'Back')
            }
          >
            <Ionicons name="arrow-forward" size={20} color={heroText} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text
              style={[styles.headerTitle, titleShadowStyle, { color: heroText, writingDirection: writingDir }]}
              numberOfLines={1}
            >
              {t('admin.appointmentsAdmin.addAppointment', 'Add appointment')}
            </Text>
          </View>
          <View style={styles.headerIconBtn} />
        </View>
      </SafeAreaView>

      <KeyboardAwareScreenScroll
        style={styles.scrollFlex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_WIZARD_STEPS }, (_, i) => {
            const done = i < wizardStep;
            const segBg = useLightFg
              ? done
                ? '#FFFFFF'
                : 'rgba(255,255,255,0.22)'
              : done
                ? primary
                : 'rgba(0,0,0,0.08)';
            return <View key={i} style={[styles.progressSegment, { backgroundColor: segBg }]} />;
          })}
        </View>

        <View style={styles.stepIntroWrap}>
          <Animated.View key={wizardStep} entering={FadeIn.duration(220)} style={styles.stepIntroInner}>
            <View style={[styles.stepIntroTitleRow, { flexDirection: newClientFieldsRtl ? 'row-reverse' : 'row' }]}>
              <View style={[styles.stepIntroIconWrap, { backgroundColor: `${primary}40` }]}>
                {wizardStep === 1 ? (
                  <User size={22} color={heroText} strokeWidth={2} />
                ) : wizardStep === 2 ? (
                  <CalendarIcon size={22} color={heroText} strokeWidth={2} />
                ) : wizardStep === 3 ? (
                  <CalendarDays size={22} color={heroText} strokeWidth={2} />
                ) : wizardStep === 4 ? (
                  <Clock size={22} color={heroText} strokeWidth={2} />
                ) : (
                  <ClipboardList size={22} color={heroText} strokeWidth={2} />
                )}
              </View>
              <Text
                style={[
                  styles.stepIntroTitle,
                  titleShadowStyle,
                  {
                    color: heroText,
                    textAlign: textAlignPrimary,
                    writingDirection: writingDir,
                  },
                ]}
                numberOfLines={2}
              >
                {stepTitle}
              </Text>
            </View>
            <Text
              style={[
                styles.stepIntroSubtitle,
                titleShadowStyle,
                { color: heroMuted, textAlign: 'center', writingDirection: writingDir },
              ]}
              numberOfLines={3}
            >
              {stepSubtitle}
            </Text>
          </Animated.View>
        </View>

        <View
          style={[
            styles.glassCard,
            {
              backgroundColor: glassBg,
              borderColor: glassBorder,
            },
          ]}
        >
          <Animated.View key={wizardStep} entering={FadeIn.duration(280)}>
          {/* Client */}
          {wizardStep === 1 ? (
          <View style={styles.section}>
            {/* Segmented control — tab itself becomes white pill when selected, no absolute positioning */}
            <View
              style={[
                styles.segContainer,
                {
                  backgroundColor: useLightFg ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)',
                },
              ]}
            >
              <Pressable
                onPress={() => form.applyClientEntryMode('existing')}
                style={[
                  styles.segTab,
                  form.clientEntryMode === 'existing' && styles.segTabActive,
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.segTabText,
                    {
                      color: form.clientEntryMode === 'existing'
                        ? primary
                        : (useLightFg ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.42)'),
                      fontWeight: form.clientEntryMode === 'existing' ? '800' : '600',
                      writingDirection: writingDir,
                    },
                  ]}
                >
                  {t('admin.appointmentsAdmin.clientModeExisting', 'Existing client')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => form.applyClientEntryMode('new')}
                style={[
                  styles.segTab,
                  form.clientEntryMode === 'new' && styles.segTabActive,
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.segTabText,
                    {
                      color: form.clientEntryMode === 'new'
                        ? primary
                        : (useLightFg ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.42)'),
                      fontWeight: form.clientEntryMode === 'new' ? '800' : '600',
                      writingDirection: writingDir,
                    },
                  ]}
                >
                  {t('admin.appointmentsAdmin.clientModeNew', 'New client')}
                </Text>
              </Pressable>
            </View>

            {form.clientEntryMode === 'existing' ? (
              !form.selectedClient ? (
                <>
                  <View
                    style={[
                      styles.fieldShell,
                      { backgroundColor: fieldBg, borderColor: fieldBorder },
                      rtl && styles.fieldShellVisualRtl,
                    ]}
                  >
                    <View style={styles.fieldInputSlot}>
                      <TextInput
                        style={[
                          styles.fieldInput,
                          {
                            color: innerText,
                            textAlign: newClientInputTextAlign,
                            writingDirection: newClientWritingDir,
                          },
                        ]}
                        value={form.clientSearch}
                        onChangeText={form.setClientSearch}
                        placeholder={
                          useRtlInputPlaceholder
                            ? ''
                            : t('admin.appointmentsAdmin.selectClientPlaceholder', 'Select client...')
                        }
                        placeholderTextColor={placeholderOnGlass ?? innerMuted}
                        onFocus={() => form.setShowClientDropdown(true)}
                        textAlignVertical="center"
                      />
                      {useRtlInputPlaceholder && !form.clientSearch.trim() ? (
                        <Text
                          pointerEvents="none"
                          numberOfLines={1}
                          style={[
                            styles.inputPlaceholderOverlay,
                            {
                              color: placeholderOnGlass ?? innerMuted,
                              textAlign: newClientInputTextAlign,
                              writingDirection: newClientWritingDir,
                            },
                          ]}
                        >
                          {t('admin.appointmentsAdmin.selectClientPlaceholder', 'Select client...')}
                        </Text>
                      ) : null}
                    </View>
                    <Search size={18} color={innerMuted} />
                  </View>
                  {form.showClientDropdown ? (
                    <View style={[styles.dropdown, { borderColor: fieldBorder, backgroundColor: glassBg }]}>
                      <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {form.filteredClients.slice(0, 60).map((client) => (
                          <Pressable
                            key={client.id ?? client.phone}
                            style={({ pressed }) => [
                              styles.dropdownRow,
                              rtl && styles.fieldShellVisualRtl,
                              pressed && { opacity: 0.85 },
                            ]}
                            onPress={() => form.onPickClient(client)}
                          >
                            <LinearGradient
                              colors={[primary, secondary]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.avatarSm}
                            >
                              <Text style={styles.avatarSmText}>{client.name.charAt(0).toUpperCase()}</Text>
                            </LinearGradient>
                            <View style={styles.dropdownRowText}>
                              <Text
                                style={[
                                  styles.dropdownName,
                                  { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                                ]}
                                numberOfLines={1}
                              >
                                {client.name}
                              </Text>
                              <Text
                                style={[
                                  styles.dropdownSub,
                                  { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                                ]}
                                numberOfLines={1}
                              >
                                {client.phone}
                              </Text>
                            </View>
                          </Pressable>
                        ))}
                        {form.filteredClients.length === 0 ? (
                          <Text
                            style={[
                              styles.emptyTxt,
                              styles.hintBlock,
                              { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                            ]}
                          >
                            {t('common.noResults', 'No results')}
                          </Text>
                        ) : null}
                      </ScrollView>
                    </View>
                  ) : null}
                </>
              ) : (
                <View
                  style={[
                    styles.selectedRow,
                    { borderColor: fieldBorder, backgroundColor: fieldBg },
                    rtl && styles.fieldShellVisualRtl,
                  ]}
                >
                  <LinearGradient colors={[primary, secondary]} style={styles.avatarSm}>
                    <Text style={styles.avatarSmText}>{form.selectedClient.name.charAt(0).toUpperCase()}</Text>
                  </LinearGradient>
                  <View style={styles.selectedRowMid}>
                    <Text
                      style={[
                        styles.dropdownName,
                        { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                      ]}
                      numberOfLines={1}
                    >
                      {form.selectedClient.name}
                    </Text>
                    <Text
                      style={[
                        styles.dropdownSub,
                        { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                      ]}
                      numberOfLines={1}
                    >
                      {form.selectedClient.phone}
                    </Text>
                  </View>
                  <Pressable onPress={() => form.setSelectedClient(null)} hitSlop={12}>
                    <Text style={[styles.changeLink, { color: primary }]}>{t('common.change', 'Change')}</Text>
                  </Pressable>
                </View>
              )
            ) : !form.selectedClient ? (
              <>
                <View
                  style={[
                    styles.fieldShell,
                    { backgroundColor: fieldBg, borderColor: fieldBorder, marginBottom: 12 },
                  ]}
                >
                  {newClientFieldsRtl ? (
                    <>
                      {newClientNameInputSlot}
                      {newClientNameIconSlot}
                    </>
                  ) : (
                    <>
                      {newClientNameIconSlot}
                      {newClientNameInputSlot}
                    </>
                  )}
                </View>

                <View
                  style={[
                    styles.fieldShell,
                    { backgroundColor: fieldBg, borderColor: fieldBorder },
                  ]}
                >
                  <View style={styles.fieldInputSlot}>
                    <TextInput
                        style={[
                          styles.fieldInput,
                          {
                            color: innerText,
                            textAlign: newClientInputTextAlign,
                            writingDirection: newClientWritingDir,
                          },
                        ]}
                      value={form.newClientPhone}
                      onChangeText={form.setNewClientPhone}
                      placeholder={newClientUseRtlPlaceholder ? '' : t('admin.appointmentsAdmin.newClientPhonePh', 'Enter mobile phone number')}
                      placeholderTextColor={placeholderOnGlass ?? innerMuted}
                      keyboardType="phone-pad"
                      textAlignVertical="center"
                      accessibilityLabel={t('admin.appointmentsAdmin.newClientPhone', 'Mobile phone')}
                    />
                    {newClientUseRtlPlaceholder && !form.newClientPhone.trim() ? (
                      <Text
                        pointerEvents="none"
                        numberOfLines={1}
                        style={[
                          styles.inputPlaceholderOverlay,
                          {
                            color: placeholderOnGlass ?? innerMuted,
                            textAlign: newClientInputTextAlign,
                            writingDirection: newClientWritingDir,
                          },
                        ]}
                      >
                        {t('admin.appointmentsAdmin.newClientPhonePh', 'הזן מספר טלפון נייד')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </>
            ) : (
              <View
                style={[
                  styles.selectedRow,
                  { borderColor: fieldBorder, backgroundColor: fieldBg },
                  rtl && styles.fieldShellVisualRtl,
                ]}
              >
                <LinearGradient colors={[primary, secondary]} style={styles.avatarSm}>
                  <Text style={styles.avatarSmText}>{form.selectedClient.name.charAt(0).toUpperCase()}</Text>
                </LinearGradient>
                <View style={styles.selectedRowMid}>
                  <Text
                    style={[
                      styles.dropdownName,
                      { color: innerText, textAlign: textAlignPrimary, writingDirection: writingDir },
                    ]}
                    numberOfLines={1}
                  >
                    {form.selectedClient.name}
                  </Text>
                  <Text
                    style={[
                      styles.dropdownSub,
                      { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                    ]}
                    numberOfLines={1}
                  >
                    {form.selectedClient.phone}
                  </Text>
                </View>
                <Pressable onPress={() => form.setSelectedClient(null)} hitSlop={12}>
                  <Text style={[styles.changeLink, { color: primary }]}>{t('common.change', 'Change')}</Text>
                </Pressable>
              </View>
            )}
          </View>
          ) : null}

          {wizardStep === 2 ? (
          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [
                styles.fieldShell,
                { backgroundColor: fieldBg, borderColor: fieldBorder },
                rtl && styles.fieldShellVisualRtl,
                pressed && { opacity: 0.92 },
              ]}
              onPress={() => form.setShowServiceDropdown(!form.showServiceDropdown)}
            >
              <Text
                style={[
                  styles.fieldInput,
                  styles.fieldPlaceholderText,
                  {
                    flex: 1,
                    color: form.selectedService ? innerText : innerMuted,
                    textAlign: newClientInputTextAlign,
                    writingDirection: newClientWritingDir,
                  },
                ]}
                numberOfLines={2}
              >
                {form.selectedService
                  ? `${form.selectedService.name} · ₪${form.selectedService.price}`
                  : t('admin.appointmentsAdmin.selectServicePlaceholder', 'Select service...')}
              </Text>
              <CalendarIcon size={18} color={iconOnField} />
            </Pressable>
            {form.showServiceDropdown ? (
              <View style={[styles.dropdown, { borderColor: fieldBorder, backgroundColor: glassBg }]}>
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {form.services.length === 0 ? (
                    <Text
                      style={[
                        styles.emptyTxt,
                        styles.hintBlock,
                        { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                      ]}
                    >
                      {t('booking.noServices', 'No services available')}
                    </Text>
                  ) : (
                    form.services.map((service: Service) => {
                      const showPrice = (service.price ?? 0) > 0;
                      const priceEl = showPrice ? (
                        <Text
                          key="p"
                          style={[styles.servicePriceInline, { color: innerText, flexShrink: 0 }]}
                          numberOfLines={1}
                        >
                          {`₪${service.price}`}
                        </Text>
                      ) : null;
                      const nameEl = (
                        <Text
                          key="n"
                          style={[
                            styles.serviceRowText,
                            {
                              flex: 1,
                              minWidth: 0,
                              color: innerText,
                              textAlign: rtl ? 'right' : 'left',
                              writingDirection: newClientWritingDir,
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {service.name}
                        </Text>
                      );
                      return (
                        <Pressable
                          key={service.id}
                          style={({ pressed }) => [styles.serviceRow, pressed && { opacity: 0.88 }]}
                          onPress={() => form.onPickService(service)}
                        >
                          {/* `direction: 'ltr'` avoids double-mirror with RN RTL so [price,name] stays price-left / name-right */}
                          <View style={styles.serviceRowInner}>
                            {rtl ? (
                              <>
                                {priceEl}
                                {nameEl}
                              </>
                            ) : (
                              <>
                                {nameEl}
                                {priceEl}
                              </>
                            )}
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            ) : null}
          </View>
          ) : null}

          {wizardStep === 3 ? (
          <View style={styles.section}>
            <View style={[styles.calWrap, { borderColor: fieldBorder }]}>
              <RNCalendar
                key={`add-appt-${calendarLocale}`}
                current={form.selectedDate ? formatDateToLocalString(form.selectedDate) : undefined}
                minDate={formatDateToLocalString(new Date())}
                onDayPress={(day: { dateString: string }) => {
                  const date = parseDateKeyToLocalDate(day.dateString);
                  if (date) form.onPickDate(date);
                }}
                markedDates={
                  form.selectedDate
                    ? {
                        [formatDateToLocalString(form.selectedDate)]: {
                          selected: true,
                          selectedColor: primary,
                        },
                      }
                    : undefined
                }
                enableSwipeMonths
                hideDayNames={false}
                firstDay={0}
                renderArrow={calendarRenderArrow}
                style={{
                  direction: calendarLocale === 'he' ? 'rtl' : 'ltr',
                  width: '100%',
                }}
                theme={calendarTheme as never}
              />
            </View>
          </View>
          ) : null}

          {wizardStep === 4 ? (
          <View style={[styles.section, styles.sectionLast]}>
            {form.selectedDate && form.selectedService ? (
              form.isLoadingTimes ? (
                <View style={styles.timesLoading}>
                  <ActivityIndicator color={iconOnGlass} />
                  <Text
                    style={[
                      styles.emptyTxt,
                      styles.hintBlock,
                      {
                        color: innerMuted,
                        marginTop: 8,
                        textAlign: textAlignPrimary,
                        writingDirection: writingDir,
                      },
                    ]}
                  >
                    {t('selectTime.loadingTimes', 'Loading available times...')}
                  </Text>
                </View>
              ) : form.availableTimes.length === 0 ? (
                <Text
                  style={[
                    styles.emptyTxt,
                    styles.hintBlock,
                    { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                  ]}
                >
                  {t('selectTime.noTimes', 'No available times for this day')}
                </Text>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={[adminBookingGridStyles.timeSlotsScroll, { maxHeight: adminTimeSlotsMaxHeight }]}
                  contentContainerStyle={adminBookingGridStyles.timeSlotsScrollInner}
                >
                  {adminTimeSections.map(({ period, slots, sectionDelay }) => (
                    <Animated.View
                      key={period.key}
                      entering={bookingTimeRowEntering(sectionDelay)}
                      style={adminBookingGridStyles.timeSection}
                    >
                      <View style={adminBookingGridStyles.sectionLabelRow}>
                        {rtl ? (
                          <>
                            <View style={[adminBookingGridStyles.sectionLine, { backgroundColor: fieldBorder }]} />
                            <Text style={[adminBookingGridStyles.sectionLabel, { color: innerText }]}>
                              {t(period.labelKey, period.labelFallback)}
                            </Text>
                            <Text style={adminBookingGridStyles.sectionEmoji}>{period.emoji}</Text>
                          </>
                        ) : (
                          <>
                            <Text style={adminBookingGridStyles.sectionEmoji}>{period.emoji}</Text>
                            <Text style={[adminBookingGridStyles.sectionLabel, { color: innerText }]}>
                              {t(period.labelKey, period.labelFallback)}
                            </Text>
                            <View style={[adminBookingGridStyles.sectionLine, { backgroundColor: fieldBorder }]} />
                          </>
                        )}
                      </View>
                      <AdminBookingTimeGrid
                        slots={slots}
                        selectedTime={form.selectedTime}
                        primary={primary}
                        secondary={secondary}
                        fieldBorder={fieldBorder}
                        fieldBg={fieldBg}
                        innerText={innerText}
                        i18nLang={i18n.language}
                        onSelectTime={form.onPickTime}
                        baseDelay={sectionDelay + 1}
                      />
                    </Animated.View>
                  ))}
                </ScrollView>
              )
            ) : null}
          </View>
          ) : null}

          {wizardStep === 5 && summaryReady ? (
            <>
              <View style={[styles.summaryDivider, { backgroundColor: fieldBorder }]} />
              <View style={[styles.summaryBlock, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
                <Text
                  style={[
                    styles.summaryBlockTitle,
                    styles.hintBlock,
                    { color: innerMuted, textAlign: textAlignPrimary, writingDirection: writingDir },
                  ]}
                >
                  {t('admin.appointmentsAdmin.summary', 'Appointment Summary')}
                </Text>

                <View style={[styles.summaryRow, { flexDirection: newClientFieldsRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <User size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: newClientFieldsRtl ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('admin.appointmentsAdmin.client', 'Client')}
                    </Text>
                    <Text
                      style={[styles.summaryRowVal, { color: innerText, writingDirection: writingDir }]}
                      numberOfLines={1}
                    >
                      {form.selectedClient?.name}
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: fieldBorder }]} />

                <View style={[styles.summaryRow, { flexDirection: newClientFieldsRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <CalendarIcon size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: newClientFieldsRtl ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('booking.field.service', 'Service')}
                    </Text>
                    <Text
                      style={[styles.summaryRowVal, { color: innerText, writingDirection: writingDir }]}
                      numberOfLines={2}
                    >
                      {form.selectedService?.name}
                      {form.selectedService?.price ? (
                        <Text style={{ fontWeight: '800' }}>{` · ₪${form.selectedService.price}`}</Text>
                      ) : null}
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: fieldBorder }]} />

                <View style={[styles.summaryRow, { flexDirection: newClientFieldsRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <CalendarDays size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: newClientFieldsRtl ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('booking.field.date', 'Date')}
                    </Text>
                    <Text style={[styles.summaryRowVal, { color: innerText, writingDirection: writingDir }]}>
                      {form.selectedDate
                        ? form.selectedDate.toLocaleDateString(dateLocale, {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })
                        : ''}
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: fieldBorder }]} />

                <View style={[styles.summaryRow, styles.summaryRowLast, { flexDirection: newClientFieldsRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.summaryRowIcon, { backgroundColor: `${primary}22` }]}>
                    <Clock size={18} color={iconOnGlass} strokeWidth={2} />
                  </View>
                  <View style={[styles.summaryRowBody, { alignItems: newClientFieldsRtl ? 'flex-end' : 'flex-start', flex: 1 }]}>
                    <Text style={[styles.summaryRowLbl, { color: innerMuted, writingDirection: writingDir }]}>
                      {t('booking.field.time', 'Time')}
                    </Text>
                    <View
                      style={[
                        styles.summaryTimePill,
                        { backgroundColor: `${primary}22`, alignSelf: newClientFieldsRtl ? 'flex-end' : 'flex-start' },
                      ]}
                    >
                      <Text style={[styles.summaryTimePillText, { color: innerText }]}>
                        {form.selectedTime ? formatBookingTimeLabel(form.selectedTime, i18n.language) : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </>
          ) : null}
          </Animated.View>
        </View>
      </KeyboardAwareScreenScroll>

      <View
        pointerEvents="box-none"
        style={[styles.footerAnchor, { bottom: Math.max(insets.bottom, 12) + 8 }]}
      >
        <View style={[styles.footerBarInner, { direction: 'ltr' }]}>
          <Pressable
            onPress={onFooterPrimary}
            disabled={!footerPrimaryEnabled || form.isSubmitting || form.isFinalizingClientStep}
            accessibilityRole="button"
            accessibilityState={{
              disabled: !footerPrimaryEnabled || form.isSubmitting || form.isFinalizingClientStep,
            }}
            style={({ pressed }) => [
              styles.footerPrimaryPill,
              styles.footerPrimaryShadow,
              {
                opacity:
                  !footerPrimaryEnabled || form.isSubmitting || form.isFinalizingClientStep ? 0.5 : pressed ? 0.88 : 1,
              },
            ]}
          >
            {form.isFinalizingClientStep && wizardStep === 1 ? (
              <ActivityIndicator color={primary} />
            ) : form.isSubmitting && wizardStep === TOTAL_WIZARD_STEPS ? (
              <ActivityIndicator color={primary} />
            ) : wizardStep === TOTAL_WIZARD_STEPS ? (
              <View style={styles.footerPrimaryFill}>
                <Text style={[styles.footerPrimaryText, { color: primary }]}>
                  {t('admin.appointmentsAdmin.saveAppointment', 'שמירת תור')}
                </Text>
                <Check size={20} color={primary} strokeWidth={2.6} />
              </View>
            ) : (
              <View style={styles.footerPrimaryFill}>
                {rtl ? (
                  <ChevronLeft
                    size={20}
                    color={footerPrimaryEnabled ? primary : '#c4c7cf'}
                    strokeWidth={2.5}
                  />
                ) : (
                  <ChevronRight
                    size={20}
                    color={footerPrimaryEnabled ? primary : '#c4c7cf'}
                    strokeWidth={2.5}
                  />
                )}
                <Text
                  style={[
                    styles.footerPrimaryText,
                    { color: footerPrimaryEnabled ? primary : '#c4c7cf' },
                  ]}
                >
                  {t('booking.continue', 'Continue')}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {showSuccessModal ? (
        <Modal
          visible={showSuccessModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => {
            setShowSuccessModal(false);
            setSuccessSnapshot(null);
            onBookedSuccess();
          }}
        >
          <BookingSuccessAnimatedOverlay
            key={successAnimKey}
            lines={adminBookingSuccessLines}
            rtl={isRtlLanguage(i18n?.language)}
            accentColor={primary}
            onDismiss={() => {
              setShowSuccessModal(false);
              setSuccessSnapshot(null);
              onBookedSuccess();
            }}
            onAddToCalendar={async () => {
              if (!successSnapshot) return;
              try {
                const { date, time, service, client } = successSnapshot;
                const duration =
                  service.duration_minutes && service.duration_minutes > 0 ? service.duration_minutes : 60;
                const dateStr = formatDateToLocalString(date);
                const timeStr = time || '00:00';
                const start = new Date(`${dateStr}T${timeStr}:00`);
                const end = new Date(start.getTime() + duration * 60000);

                const perm = await Calendar.requestCalendarPermissionsAsync();
                if (perm.status !== 'granted') {
                  Alert.alert(
                    t('booking.permissionsRequired', 'נדרש אישור'),
                    t('booking.calendarPermissionMessage', 'נדרש אישור גישה ליומן כדי להוסיף אירוע.')
                  );
                  return;
                }

                let calendarId: string | undefined;
                if (Platform.OS === 'ios') {
                  const defCal = await Calendar.getDefaultCalendarAsync();
                  calendarId = defCal?.id;
                } else {
                  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
                  calendarId =
                    cals.find(
                      (c) => c.allowsModifications || c.accessLevel === Calendar.CalendarAccessLevel.OWNER
                    )?.id || cals[0]?.id;
                }

                if (!calendarId) {
                  Alert.alert(t('error.generic', 'שגיאה'), t('booking.noCalendar', 'לא נמצא יומן שניתן לכתוב אליו.'));
                  return;
                }

                await Calendar.createEventAsync(calendarId, {
                  title: `${service.name} · ${client.name}`,
                  startDate: start,
                  endDate: end,
                  notes: t('booking.calendarNotes', 'Booked via the app'),
                });

                Alert.alert(t('booking.added', 'נוסף'), t('booking.eventAdded', 'האירוע נוסף ליומן שלך.'));
              } catch {
                Alert.alert(
                  t('error.generic', 'שגיאה'),
                  t('booking.eventAddFailed', 'לא ניתן להוסיף את האירוע ליומן.')
                );
              }
            }}
            addToCalendarLabel={t('booking.addToCalendar', 'Add to Calendar')}
            gotItLabel={t('booking.gotIt', 'Got it')}
          />
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeTop: {
    backgroundColor: 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    minHeight: 52,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    alignSelf: 'stretch',
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 3,
  },
  stepIntroWrap: {
    marginTop: 6,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  stepIntroInner: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  stepIntroTitleRow: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  stepIntroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIntroTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.4,
    flexShrink: 1,
    maxWidth: 280,
  },
  stepIntroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    maxWidth: 340,
    alignSelf: 'center',
  },
  scrollFlex: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  glassCard: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  segContainer: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 4,
    marginBottom: 20,
    alignSelf: 'stretch',
    minHeight: 52,
    alignItems: 'stretch',
    gap: 0,
  },
  segTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
  },
  segTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  segTabText: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  labeledFieldIconSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  section: {
    marginBottom: 4,
  },
  sectionLast: {
    marginBottom: 0,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    alignSelf: 'stretch',
  },
  /** LTR + row-reverse: icon stays visually on the right; title text hugs the correct edge */
  sectionHeadVisualRtl: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  hintBlock: {
    alignSelf: 'stretch',
    width: '100%',
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  sectionHint: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
    fontWeight: '700',
  },
  fieldShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 52,
    gap: 10,
  },
  /** Match section headers: input hugging the right, trailing icon (search / calendar) on the left */
  fieldShellVisualRtl: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
  },
  fieldInputSlot: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    justifyContent: 'center',
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    minHeight: Platform.OS === 'ios' ? 44 : 40,
  },
  /** Service row uses Text as placeholder — must span full width so `textAlign: right` applies */
  fieldPlaceholderText: {
    alignSelf: 'stretch',
    width: '100%',
  },
  /** RN TextInput native placeholder ignores textAlign on many builds — custom layer for RTL */
  inputPlaceholderOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    fontSize: 16,
    lineHeight: Platform.OS === 'ios' ? 22 : 20,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'android' ? { elevation: 1 } : {}),
  },
  dropdown: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: 220,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  dropdownRowText: {
    flex: 1,
    minWidth: 0,
  },
  dropdownName: {
    fontSize: 16,
    fontWeight: '600',
  },
  dropdownSub: {
    fontSize: 13,
    marginTop: 2,
  },
  avatarSm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  selectedRowMid: {
    flex: 1,
    minWidth: 0,
  },
  changeLink: {
    fontSize: 15,
    fontWeight: '700',
  },
  serviceRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  serviceRowInner: {
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  serviceRowText: {
    fontSize: 16,
    fontWeight: '600',
  },
  servicePriceInline: {
    fontSize: 15,
    fontWeight: '800',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
    opacity: 0.85,
  },
  calWrap: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  timesLoading: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyTxt: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 14,
  },
  summaryBlock: {
    marginTop: 4,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  summaryBlockTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    marginBottom: 10,
    opacity: 0.85,
  },
  summaryRow: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  summaryRowLast: {
    paddingBottom: 4,
  },
  summaryRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryRowBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  summaryRowLbl: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  summaryRowVal: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.5,
    marginHorizontal: 2,
  },
  summaryTimePill: {
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 2,
  },
  summaryTimePillText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  footerAnchor: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 50,
  },
  footerBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrimaryPill: {
    flex: 1,
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F1F1',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  footerPrimaryShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  footerPrimaryFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  footerPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
