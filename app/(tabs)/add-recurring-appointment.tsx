import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, { FadeIn, useAnimatedStyle } from 'react-native-reanimated';
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
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import BookingSummarySheet, { type BookingSummarySheetHandle } from '@/components/book-appointment/BookingSummarySheet';
import type { BookingProgressChipModel } from '@/components/book-appointment/BookingProgressChipsStrip';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Search, User, UserPlus, Phone, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import ServiceSelection from '@/components/book-appointment/ServiceSelection';
import { filterServicesForBookingBarber } from '@/lib/api/services';
import { businessProfileApi, isMultiServiceBookingAllowed } from '@/lib/api/businessProfile';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import {
  formatBookingTimeLabel,
  totalServicesDurationMinutes,
} from '@/lib/hooks/useAdminAddAppointmentForm';
import { useAddRecurringAppointmentForm } from '@/lib/hooks/useAddRecurringAppointmentForm';
import type { Service } from '@/lib/supabase';
import { ADMIN_RECURRING_APPOINTMENTS_CHANGED } from '@/constants/adminCalendarEvents';
import { BOOKING_TIME_PERIOD_EMOJI } from '@/constants/bookingTimePeriodEmoji';
import {
  bookingTimeRowEntering,
  bookingStepRowEntering,
} from '@/components/book-appointment/bookingStepListEnterAnimation';
import { useAuthStore } from '@/stores/authStore';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** 3 columns per row: reverse each row so RTL calendar reads Sun→Sat right-to-left (e.g. Sun swaps with Tue). */
function mirrorWeekdayRowsForDisplay(days: number[]): number[] {
  const cols = 3;
  const out: number[] = [];
  for (let i = 0; i < days.length; i += cols) {
    out.push(...days.slice(i, i + cols).reverse());
  }
  return out;
}

const SETTINGS_TAB = '/(tabs)/settings' as const;
const TOTAL_WIZARD_STEPS = 5;
const SHEET_PEEK_H = 124;
const ADMIN_CLIENT_DETAILS_INTRO_LIFT = -26;
const ADMIN_CLIENT_DETAILS_SECTION_LIFT = -18;

const bookingLikeStyles = StyleSheet.create({
  section: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  calendarSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 14,
    marginTop: 10,
    padding: 0,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.09,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
    }),
  },
  calendarFixedBox: {
    minHeight: 280,
    borderRadius: 20,
    overflow: 'hidden',
  },
});

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

function daypartLabelFromHour24(
  hour24: number,
  t: (key: string, defaultValue?: string) => string,
): string {
  const h = ((Math.floor(hour24) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return t('booking.daypart.morning', 'בוקר');
  if (h >= 12 && h < 17) return t('booking.daypart.afternoon', 'צהריים');
  return t('booking.daypart.evening', 'ערב');
}

const adminBookingGridStyles = StyleSheet.create({
  grid: { gap: 9 },
  row: { flexDirection: 'row', gap: 9 },
  cellWrap: { flex: 1 },
  cellPress: { flex: 1 },
  cell: {
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
        shadowOpacity: 0.13,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  cellPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.94 }],
  },
  cellTime: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    color: '#1C1C1E',
  },
  cellTimeSelected: { color: '#FFFFFF', fontWeight: '800' },
  timeSlotsList: { alignSelf: 'stretch', gap: 16, paddingBottom: 6 },
  timeSection: { gap: 10 },
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

type AdminClientWizardPhase = 'chooseMode' | 'details';

const weekdayShellStyles = StyleSheet.create({
  shell: {
    gap: 14,
    paddingHorizontal: 16,
  },
  header: {
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default function AddRecurringAppointmentScreen() {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const summarySheetRef = useRef<BookingSummarySheetHandle>(null);

  const goBackToSettings = useCallback(() => {
    router.replace(SETTINGS_TAB);
  }, []);

  const onCreated = useCallback(() => {
    DeviceEventEmitter.emit(ADMIN_RECURRING_APPOINTMENTS_CHANGED);
    goBackToSettings();
  }, [goBackToSettings]);

  const form = useAddRecurringAppointmentForm(onCreated);

  const [wizardStep, setWizardStep] = useState(1);
  const [clientWizardPhase, setClientWizardPhase] = useState<AdminClientWizardPhase>('chooseMode');
  const [newClientNameFocused, setNewClientNameFocused] = useState(false);
  const [newClientPhoneFocused, setNewClientPhoneFocused] = useState(false);
  const [existingClientSearchFocused, setExistingClientSearchFocused] = useState(false);

  const backFromClientDetailsToChooser = useCallback(() => {
    setClientWizardPhase('chooseMode');
    setNewClientNameFocused(false);
    setNewClientPhoneFocused(false);
    setExistingClientSearchFocused(false);
    form.setSelectedClient(null);
    form.setClientSearch('');
    form.setShowClientDropdown(false);
    form.applyClientEntryMode('existing');
  }, [form]);

  useFocusEffect(
    useCallback(() => {
      form.reset();
      setWizardStep(1);
      summarySheetRef.current?.collapse();
      setClientWizardPhase('chooseMode');
      setNewClientNameFocused(false);
      setNewClientPhoneFocused(false);
      setExistingClientSearchFocused(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (wizardStep === 1 && clientWizardPhase === 'details') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          backFromClientDetailsToChooser();
          return true;
        }
        if (wizardStep > 1) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setWizardStep((s) => Math.max(1, s - 1));
          return true;
        }
        goBackToSettings();
        return true;
      });
      return () => sub.remove();
    }, [backFromClientDetailsToChooser, clientWizardPhase, goBackToSettings, wizardStep]),
  );

  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const layoutRtl = I18nManager.isRTL;
  const isHeCopy = i18n.language?.startsWith('he') ?? true;
  const rtl = layoutRtl || isHeCopy;
  const primary = businessColors.primary;
  const secondary = businessColors.secondary;
  const authUser = useAuthStore((s) => s.user);
  const [allowMultiServiceBooking, setAllowMultiServiceBooking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const p = await businessProfileApi.getProfile();
          if (!cancelled && p) {
            setAllowMultiServiceBooking(isMultiServiceBookingAllowed(p));
          }
        } catch {
          if (!cancelled) setAllowMultiServiceBooking(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  useEffect(() => {
    if (!allowMultiServiceBooking && form.selectedServices.length > 1) {
      form.setSelectedServices([form.selectedServices[0]!]);
    }
  }, [allowMultiServiceBooking, form.selectedServices, form.setSelectedServices]);

  const adminFilteredServices = useMemo(
    () => filterServicesForBookingBarber(form.services, authUser?.id, 1),
    [form.services, authUser?.id],
  );

  const step2FadeStyle = useAnimatedStyle(() => ({ opacity: 1 }));

  const loginGradient = useMemo(
    () => [lightenHex(primary, 0.1), darkenHex(primary, 0.42)] as const,
    [primary],
  );
  const gradientEnd = loginGradient[1];
  const contrastAnchor = useMemo(() => darkenHex(primary, 0.22), [primary]);
  const useLightFg = readableOnHex(contrastAnchor) === '#FFFFFF';
  const heroText = useLightFg ? '#FFFFFF' : '#141414';
  const heroMuted = useLightFg ? 'rgba(255,255,255,0.97)' : 'rgba(0,0,0,0.62)';
  const registerHeroFaint = useLightFg ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.28)';
  const registerPhoneBorderUnfocus = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.22)';
  const registerPhoneBorderFocus = useLightFg ? '#FFFFFF' : primary;
  const newClientOpenFieldText = heroText;
  const newClientOpenPlaceholder = useLightFg ? 'rgba(255,255,255,0.78)' : registerHeroFaint;
  const newClientOpenIcon = (focused: boolean) =>
    useLightFg ? '#FFFFFF' : focused ? registerPhoneBorderFocus : registerHeroFaint;
  const glassBg = useLightFg ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.92)';
  const glassBorder = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.08)';
  const fieldBg = useLightFg ? 'rgba(255,255,255,0.18)' : '#F5F5F7';
  const fieldBorder = useLightFg ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.08)';
  const innerText = useLightFg ? '#FFFFFF' : businessColors.text;
  const innerMuted = useLightFg ? 'rgba(255,255,255,0.96)' : businessColors.textSecondary;
  const iconOnGlass = useLightFg ? heroText : primary;
  const dateLocale = isHeCopy ? 'he-IL' : 'en-US';
  const textAlignPrimary = (rtl ? 'right' : 'left') as 'right' | 'left';
  const inputTextAlign = (rtl ? 'right' : 'left') as 'right' | 'left';
  const writingDir = (rtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr';
  const newClientFieldsRtl = rtl;
  const newClientInputTextAlign = inputTextAlign;
  const newClientWritingDir = writingDir;
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
    return activePeriods.map((period, idx) => ({
      period,
      slots: grouped[period.key],
      sectionDelay: idx,
    }));
  }, [form.availableTimes]);

  const summaryReady = !!(
    form.selectedClient &&
    form.selectedServices.length > 0 &&
    form.selectedDayOfWeek !== null &&
    form.selectedTime
  );
  const canSubmit = summaryReady && !form.isSubmitting;

  const adminSummaryServiceNames = useMemo(
    () => form.selectedServices.map((s) => s.name).join(' + '),
    [form.selectedServices],
  );
  const adminSummaryServicePrice = useMemo(
    () => form.selectedServices.reduce((a, s) => a + (Number((s as { price?: unknown }).price) || 0), 0),
    [form.selectedServices],
  );
  const adminBookingTotalDuration = useMemo(
    () => (form.selectedServices.length > 0 ? totalServicesDurationMinutes(form.selectedServices) : 60),
    [form.selectedServices],
  );

  const repeatSummaryLine = useMemo(() => {
    const w = form.repeatWeeks;
    if (w == null) return '';
    if (w === 1) return t('settings.recurring.everyWeek', 'every week');
    return t('settings.recurring.everyNWeeks', 'every {{count}} weeks', { count: w });
  }, [form.repeatWeeks, t]);

  const recurringWeekdayDisplayOrder = useMemo(() => {
    if (!form.activeDaysOfWeek || form.activeDaysOfWeek.length === 0) return [];
    return mirrorWeekdayRowsForDisplay(form.activeDaysOfWeek);
  }, [form.activeDaysOfWeek]);

  const adminBookingChips = useMemo((): BookingProgressChipModel[] => {
    const chips: BookingProgressChipModel[] = [];
    if (form.selectedClient) {
      chips.push({
        key: 'barber',
        kind: 'barber',
        label: form.selectedClient.name,
        customRowLabel: t('admin.client', 'לקוח'),
      });
    }
    if (form.selectedServices.length > 0) {
      chips.push({
        key: 'service',
        kind: 'service',
        label: adminSummaryServiceNames,
        serviceName: adminSummaryServiceNames,
        servicePriceText: adminSummaryServicePrice > 0 ? `₪${adminSummaryServicePrice}` : '—',
        serviceDurationMinutes: adminBookingTotalDuration,
      });
    }
    if (form.summaryDateForChips && form.selectedDayOfWeek !== null) {
      const d = form.summaryDateForChips;
      const dateLine = d.toLocaleDateString(dateLocale, {
        day: 'numeric',
        month: 'numeric',
        year: '2-digit',
      });
      chips.push({
        key: 'day',
        kind: 'day',
        label: d.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' }),
        dayWeekday: d.toLocaleDateString(dateLocale, { weekday: 'short' }),
        dayWeekdayLong: d.toLocaleDateString(dateLocale, { weekday: 'long' }),
        dayDateLine: repeatSummaryLine ? `${dateLine} · ${repeatSummaryLine}` : dateLine,
      });
    }
    if (form.selectedTime) {
      const hRaw = Number(form.selectedTime.split(':')[0]);
      const hour = Number.isFinite(hRaw) ? hRaw : 12;
      chips.push({
        key: 'time',
        kind: 'time',
        label: form.selectedTime,
        timeDaypart: daypartLabelFromHour24(hour, (key, def) => String(t(key, def ?? ''))),
      });
    }
    return chips;
  }, [
    form.selectedClient,
    form.selectedServices,
    form.summaryDateForChips,
    form.selectedDayOfWeek,
    form.selectedTime,
    adminSummaryServiceNames,
    adminSummaryServicePrice,
    adminBookingTotalDuration,
    repeatSummaryLine,
    dateLocale,
    t,
  ]);

  useEffect(() => {
    if (form.selectedTime && wizardStep === 5) {
      summarySheetRef.current?.expand();
    } else if (!form.selectedTime) {
      summarySheetRef.current?.collapse();
    }
  }, [form.selectedTime, wizardStep]);

  useEffect(() => {
    if (wizardStep === 4) {
      form.setRepeatWeeks(null);
    }
  }, [wizardStep, form.setRepeatWeeks]);

  const newClientPhoneDigits = useMemo(() => form.newClientPhone.replace(/\D/g, ''), [form.newClientPhone]);

  const showNewClientInlineContinue = useMemo(
    () =>
      wizardStep === 1 &&
      clientWizardPhase === 'details' &&
      form.clientEntryMode === 'new' &&
      !form.selectedClient &&
      form.newClientFullName.trim().length >= 2 &&
      newClientPhoneDigits.length >= 9,
    [
      wizardStep,
      clientWizardPhase,
      form.clientEntryMode,
      form.selectedClient,
      form.newClientFullName,
      newClientPhoneDigits,
    ],
  );

  const canAdvanceFromStep = useMemo(() => {
    switch (wizardStep) {
      case 1:
        if (clientWizardPhase === 'chooseMode') return false;
        if (form.clientEntryMode === 'existing') {
          return !!form.selectedClient;
        }
        return form.newClientFullName.trim().length >= 2 && newClientPhoneDigits.length >= 9;
      case 2:
        return form.selectedServices.length > 0;
      case 3:
        return (
          form.selectedDayOfWeek !== null &&
          !!form.activeDaysOfWeek?.includes(form.selectedDayOfWeek)
        );
      case 4:
        return false;
      case 5:
        return !!form.selectedTime;
      default:
        return false;
    }
  }, [
    wizardStep,
    clientWizardPhase,
    form.clientEntryMode,
    form.selectedClient,
    form.newClientFullName,
    newClientPhoneDigits,
    form.selectedServices,
    form.selectedDayOfWeek,
    form.repeatWeeks,
    form.selectedTime,
    form.activeDaysOfWeek,
  ]);

  const sheetVisible = adminBookingChips.length > 0;

  const hideFooterContinue =
    (wizardStep === 1 &&
      (clientWizardPhase === 'chooseMode' ||
        !!form.selectedClient ||
        (clientWizardPhase === 'details' && !form.selectedClient))) ||
    wizardStep === 2 ||
    wizardStep === 3 ||
    wizardStep === 4 ||
    wizardStep === 5;

  const footerPrimaryEnabled =
    wizardStep === TOTAL_WIZARD_STEPS ? canSubmit : canAdvanceFromStep && !form.isFinalizingClientStep;

  const onHeaderBack = useCallback(() => {
    if (wizardStep === 1 && clientWizardPhase === 'details') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      backFromClientDetailsToChooser();
      return;
    }
    if (wizardStep > 1) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setWizardStep((s) => Math.max(1, s - 1));
    } else {
      goBackToSettings();
    }
  }, [backFromClientDetailsToChooser, clientWizardPhase, goBackToSettings, wizardStep]);

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
        const nextStep = Math.min(TOTAL_WIZARD_STEPS, wizardStep + 1);
        setWizardStep(nextStep);
        if (nextStep === 5) {
          form.loadAvailableTimesNow();
        }
      })();
    } else if (summaryReady) {
      void form.submit();
    }
  }, [footerPrimaryEnabled, form, summaryReady, wizardStep]);

  const stepTitle = useMemo(() => {
    switch (wizardStep) {
      case 1:
        if (clientWizardPhase === 'chooseMode') {
          return t('admin.appointmentsAdmin.wizardStepTitleClientType', 'סוג לקוח');
        }
        if (clientWizardPhase === 'details' && form.clientEntryMode === 'new') {
          return t('admin.appointmentsAdmin.wizardStepTitleAddNewClient', 'הוספת לקוח חדש');
        }
        if (clientWizardPhase === 'details' && form.clientEntryMode === 'existing' && !form.selectedClient) {
          return t('admin.appointmentsAdmin.wizardStepTitlePickExistingClient', 'בחר לקוח קיים');
        }
        return t('settings.recurring.wizardStepTitleClient', 'Client');
      case 2:
        return t('settings.recurring.wizardStepTitleService', 'Service');
      case 3:
        return t('settings.recurring.wizardStepTitleDay', 'Day of week');
      case 4:
        return t('settings.recurring.wizardStepTitleRepeat', 'How often');
      case 5:
      default:
        return t('settings.recurring.wizardStepTitleTime', 'Time');
    }
  }, [wizardStep, clientWizardPhase, form.clientEntryMode, form.selectedClient, t]);

  const stepSubtitle = useMemo(() => {
    switch (wizardStep) {
      case 1:
        if (clientWizardPhase === 'chooseMode') {
          return t(
            'admin.appointmentsAdmin.pickClientModeHint',
            'Tap a card — existing clients are loaded from your list, or add someone new.',
          );
        }
        if (form.clientEntryMode === 'existing') {
          if (!form.selectedClient) {
            return t(
              'admin.appointmentsAdmin.pickExistingClientSubtitle',
              'בחר לקוח קיים מהרשימה לקביעת התור.',
            );
          }
          return t('admin.appointmentsAdmin.pickClient', 'Pick the client for this appointment');
        }
        return t(
          'admin.appointmentsAdmin.newClientStepHint',
          'Enter details — the client can sign in later with this phone number.',
        );
      case 2:
        return allowMultiServiceBooking
          ? t('booking.selectMultipleHint', 'Tap to select one or more services')
          : t('admin.appointmentsAdmin.pickService', 'Choose the service to perform');
      case 3:
        return t('settings.recurring.selectDayOfWeek', 'Select a day of the week');
      case 4:
        return t('settings.recurring.repeatHint', 'Set how often this repeats');
      case 5:
      default:
        return form.selectedServices.length === 0 || form.selectedDayOfWeek === null
          ? t('settings.recurring.selectServiceAndDayFirst', 'Select a service and day to see available times')
          : t('admin.appointmentsAdmin.pickTime', 'Pick an available time slot');
    }
  }, [
    wizardStep,
    clientWizardPhase,
    t,
    form.clientEntryMode,
    form.selectedClient,
    form.selectedServices.length,
    form.selectedDayOfWeek,
    allowMultiServiceBooking,
  ]);

  const showWizardStepIntro = wizardStep !== 2 && wizardStep !== 3;

  const scrollBottomPad = useMemo(() => {
    if (wizardStep === 5 && sheetVisible) {
      return Math.max(insets.bottom, 12) + SHEET_PEEK_H + 12;
    }
    return Math.max(insets.bottom, 20) + 88 + (sheetVisible ? SHEET_PEEK_H : 0);
  }, [insets.bottom, wizardStep, sheetVisible]);

  const scrollPaddingTop = Math.max(insets.top, 8) + 64;
  const adminWizardContentMinHeight = Math.max(320, windowHeight - scrollPaddingTop - scrollBottomPad);
  const adminNewClientFieldsMaxWidth = useMemo(
    () => Math.min(340, Math.max(260, windowWidth - 72)),
    [windowWidth],
  );

  const adminClientDetailsNeedsVerticalLift = useMemo(
    () => wizardStep === 1 && clientWizardPhase === 'details' && !form.selectedClient,
    [wizardStep, clientWizardPhase, form.selectedClient],
  );

  const bundleClientSelected = wizardStep === 1 && clientWizardPhase === 'details' && !!form.selectedClient;

  const selectedClientStepClusterEl = useMemo(() => {
    const c = form.selectedClient;
    if (!c || wizardStep !== 1 || clientWizardPhase !== 'details') return null;
    return (
      <View style={styles.adminSelectedClientCluster}>
        <View style={[styles.stepIntroWrap, styles.stepIntroWrapAttached]}>
          <Animated.View entering={FadeIn.duration(160)} style={styles.stepIntroInner}>
            <View style={styles.stepIntroTitleRow}>
              <Text
                style={[
                  styles.stepIntroTitle,
                  titleShadowStyle,
                  {
                    color: heroText,
                    textAlign: 'center',
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
        <View style={styles.adminSelectedClientSection}>
          <View style={[styles.adminSelectedClientCard, { maxWidth: adminNewClientFieldsMaxWidth }]}>
            <View style={[styles.selectedRowFlat, rtl && styles.fieldShellVisualRtl]}>
              <LinearGradient colors={[primary, secondary]} style={styles.avatarSm}>
                <Text style={styles.avatarSmText}>{c.name.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
              <View style={styles.selectedRowMid}>
                <Text
                  style={[
                    styles.dropdownName,
                    {
                      color: businessColors.text,
                      textAlign: textAlignPrimary,
                      writingDirection: writingDir,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
                <Text
                  style={[
                    styles.dropdownSub,
                    {
                      color: businessColors.textSecondary,
                      textAlign: textAlignPrimary,
                      writingDirection: writingDir,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {c.phone}
                </Text>
              </View>
              <Pressable onPress={() => form.setSelectedClient(null)} hitSlop={12}>
                <Text style={[styles.changeLink, { color: primary }]}>{t('common.change', 'Change')}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Pressable
          onPress={onFooterPrimary}
          disabled={form.isFinalizingClientStep}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.inlineContinueBtn,
            {
              backgroundColor: useLightFg ? 'rgba(255,255,255,0.9)' : primary,
              opacity: form.isFinalizingClientStep || pressed ? 0.72 : 1,
            },
          ]}
        >
          {form.isFinalizingClientStep ? (
            <ActivityIndicator color={useLightFg ? primary : '#fff'} size="small" />
          ) : (
            <View style={[styles.inlineContinueBtnInner, { flexDirection: 'row' }]}>
              <Text style={[styles.inlineContinueBtnText, { color: useLightFg ? primary : '#fff' }]}>
                {t('booking.continue', 'המשך')}
              </Text>
              {rtl ? (
                <ChevronLeft size={18} color={useLightFg ? primary : '#fff'} strokeWidth={2.5} />
              ) : (
                <ChevronRight size={18} color={useLightFg ? primary : '#fff'} strokeWidth={2.5} />
              )}
            </View>
          )}
        </Pressable>
      </View>
    );
  }, [
    adminNewClientFieldsMaxWidth,
    businessColors.text,
    businessColors.textSecondary,
    clientWizardPhase,
    form.isFinalizingClientStep,
    form.selectedClient,
    form.setSelectedClient,
    heroMuted,
    heroText,
    onFooterPrimary,
    primary,
    rtl,
    secondary,
    stepSubtitle,
    stepTitle,
    t,
    textAlignPrimary,
    titleShadowStyle,
    useLightFg,
    wizardStep,
    writingDir,
  ]);

  /** Display order: row1 = every 2 weeks, every week — row2 = every 4 weeks, every 3 weeks (LTR). */
  const repeatWizardDisplayOrder = [2, 1, 4, 3] as const;

  return (
    <View style={[styles.root, { backgroundColor: gradientEnd }]}>
      <LinearGradient colors={[...loginGradient]} style={StyleSheet.absoluteFill} />
      {Platform.OS !== 'web' ? (
        <BrandLavaLampBackground
          primaryColor={primary}
          baseColor={gradientEnd}
          count={3}
          duration={20000}
          blurIntensity={36}
        />
      ) : null}
      <StatusBar style={useLightFg ? 'light' : 'dark'} />

      <View
        style={[styles.fabBackWrap, { top: Math.max(insets.top, 8) + 4 }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={onHeaderBack}
          style={({ pressed }) => [
            styles.fabBack,
            {
              backgroundColor: useLightFg ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
              borderColor: useLightFg ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.08)',
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            wizardStep === 1 && clientWizardPhase === 'details'
              ? t('admin.appointmentsAdmin.backToClientType', 'Back to client type')
              : wizardStep > 1
                ? t('settings.recurring.wizardBackStep', 'Previous step')
                : t('back', 'Back')
          }
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-forward" size={22} color={heroText} />
        </Pressable>
      </View>

      <KeyboardAwareScreenScroll
        style={styles.scrollFlex}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: scrollBottomPad,
            paddingTop: scrollPaddingTop,
            flexGrow: wizardStep === 5 && sheetVisible ? 0 : 1,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.adminWizardScrollInner,
            wizardStep === 5 && styles.adminWizardScrollInnerAlignStart,
            wizardStep !== 5 ? { minHeight: adminWizardContentMinHeight } : null,
          ]}
        >
          {showWizardStepIntro && !bundleClientSelected ? (
            <View
              style={[
                styles.stepIntroWrap,
                adminClientDetailsNeedsVerticalLift
                  ? { transform: [{ translateY: ADMIN_CLIENT_DETAILS_INTRO_LIFT }] }
                  : null,
              ]}
            >
              <Animated.View
                key={wizardStep === 1 ? `${wizardStep}-${clientWizardPhase}` : wizardStep}
                entering={FadeIn.duration(160)}
                style={styles.stepIntroInner}
              >
                <View style={styles.stepIntroTitleRow}>
                  <Text
                    style={[
                      styles.stepIntroTitle,
                      titleShadowStyle,
                      {
                        color: heroText,
                        textAlign: 'center',
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
          ) : null}

          {wizardStep === 2 ? (
            <ServiceSelection
              visible
              styles={bookingLikeStyles}
              step2FadeStyle={step2FadeStyle}
              topOffset={0}
              safeAreaBottom={insets.bottom}
              isLoading={false}
              services={adminFilteredServices}
              selectedServiceIds={form.selectedServices.map((s) => String((s as { id?: unknown }).id ?? ''))}
              multiSelectEnabled={allowMultiServiceBooking}
              onContinueMulti={
                allowMultiServiceBooking
                  ? () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (form.selectedServices.length > 0) {
                        form.setShowServiceDropdown(false);
                        setWizardStep((s) => Math.min(TOTAL_WIZARD_STEPS, s + 1));
                      }
                    }
                  : undefined
              }
              t={t}
              onSelectService={(service: Service, _index: number) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                form.setShowServiceDropdown(false);
                const id = String((service as { id?: unknown }).id ?? '');
                const exists = form.selectedServices.some((s) => String((s as { id?: unknown }).id ?? '') === id);
                let next: Service[];
                if (!allowMultiServiceBooking) {
                  next = exists ? [] : [service];
                } else {
                  next = exists
                    ? form.selectedServices.filter((s) => String((s as { id?: unknown }).id ?? '') !== id)
                    : [...form.selectedServices, service];
                }
                form.setSelectedServices(next);
                form.setSelectedTime(null);
                if (next.length > 0 && !allowMultiServiceBooking) {
                  setWizardStep((s) => Math.min(TOTAL_WIZARD_STEPS, s + 1));
                }
              }}
            />
          ) : wizardStep === 3 ? (
            <View style={{ width: '100%', paddingTop: 6, paddingBottom: 12 }}>
              <Animated.View entering={bookingStepRowEntering(0)}>
                <View style={weekdayShellStyles.shell}>
                  <View style={weekdayShellStyles.header}>
                    <Text
                      style={[weekdayShellStyles.title, { writingDirection: writingDir }]}
                      maxFontSizeMultiplier={1.35}
                    >
                      {t('settings.recurring.weekdayPickerTitle', { defaultValue: 'Fixed weekday' })}
                    </Text>
                    <Text
                      style={[weekdayShellStyles.subtitle, { writingDirection: writingDir }]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {t('settings.recurring.weekdayPickerSubtitle', {
                        defaultValue: 'Pick a day when you have active opening hours',
                      })}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.weekdayContentOnGradient,
                      /** LTR flex + `mirrorWeekdayRowsForDisplay`: each row RTL (Sun on the right). */
                      { direction: 'ltr' },
                    ]}
                  >
                    {form.activeDaysOfWeek === null ? (
                      <View style={styles.weekdayLoading}>
                        <ActivityIndicator color="rgba(255,255,255,0.95)" />
                        <Text style={[styles.weekdayLoadingTextOnGradient, { writingDirection: writingDir }]}>
                          {t('settings.recurring.weekdayPickerLoading', { defaultValue: 'Loading your schedule…' })}
                        </Text>
                      </View>
                    ) : form.activeDaysOfWeek.length === 0 ? (
                      <View style={styles.weekdayEmpty}>
                        <Text style={[styles.weekdayEmptyTitleOnGradient, { writingDirection: writingDir }]}>
                          {t('settings.recurring.noActiveWeekdaysTitle', {
                            defaultValue: 'No active days in your schedule',
                          })}
                        </Text>
                        <Text style={[styles.weekdayEmptyHintOnGradient, { writingDirection: writingDir }]}>
                          {t('settings.recurring.noActiveWeekdaysHint', {
                            defaultValue: 'Turn on at least one weekday in Business hours so you can add a fixed slot.',
                          })}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.weekdayGrid}>
                        {recurringWeekdayDisplayOrder.map((dow) => {
                          const key = DAY_KEYS[dow];
                          const sel = form.selectedDayOfWeek === dow;
                          const label = t(`day.${key}`, key);
                          return (
                            <View key={`${dow}-${key}`} style={styles.weekdayCellWrap}>
                              <Pressable
                                onPress={() => {
                                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  form.setSelectedDayOfWeek(dow);
                                  form.setSelectedTime(null);
                                  setWizardStep(4);
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: sel }}
                                style={({ pressed }) => [
                                  adminBookingGridStyles.cellPress,
                                  adminBookingGridStyles.cell,
                                  sel
                                    ? { backgroundColor: primary }
                                    : { backgroundColor: '#F5F5F7' },
                                  pressed && adminBookingGridStyles.cellPressed,
                                ]}
                              >
                                <Text
                                  style={[
                                    adminBookingGridStyles.cellTime,
                                    sel ? adminBookingGridStyles.cellTimeSelected : { color: '#1C1C1E' },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {label}
                                </Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              </Animated.View>
            </View>
          ) : (
            <View
              style={[
                styles.glassCard,
                wizardStep === 1 || wizardStep === 4 || wizardStep === 5
                  ? styles.glassCardNoBackdrop
                  : { backgroundColor: glassBg, borderColor: glassBorder },
                wizardStep === 1 && clientWizardPhase === 'details' && form.selectedClient
                  ? styles.glassCardClientSelectedFill
                  : null,
              ]}
            >
              <Animated.View
                key={wizardStep === 1 ? `${wizardStep}-${clientWizardPhase}` : wizardStep}
                entering={FadeIn.duration(180)}
                style={
                  wizardStep === 1 && clientWizardPhase === 'details' && form.selectedClient
                    ? styles.glassCardInnerSelectedClientFill
                    : undefined
                }
              >
                {wizardStep === 1 ? (
                  <View
                    style={[
                      styles.section,
                      adminClientDetailsNeedsVerticalLift
                        ? { transform: [{ translateY: ADMIN_CLIENT_DETAILS_SECTION_LIFT }] }
                        : null,
                    ]}
                  >
                    {clientWizardPhase === 'chooseMode' ? (
                      <View style={[styles.clientModeCardsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                        <Pressable
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            form.applyClientEntryMode('existing');
                            setClientWizardPhase('details');
                          }}
                          style={({ pressed }) => [
                            styles.clientModeCard,
                            {
                              backgroundColor: useLightFg ? '#FFFFFF' : fieldBg,
                              borderColor: useLightFg ? 'rgba(255,255,255,0.55)' : fieldBorder,
                              opacity: pressed ? 0.92 : 1,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={t(
                            'admin.appointmentsAdmin.clientModeExistingA11y',
                            'Existing client — search and select from the list',
                          )}
                        >
                          <View style={[styles.clientModeCardIconCircle, { backgroundColor: `${primary}22` }]}>
                            <User size={26} color={primary} strokeWidth={2.2} />
                          </View>
                          <Text
                            style={[styles.clientModeCardTitle, { color: primary, writingDirection: writingDir }]}
                            numberOfLines={2}
                          >
                            {t('admin.appointmentsAdmin.clientModeExisting', 'Existing client')}
                          </Text>
                          <Text
                            style={[
                              styles.clientModeCardHint,
                              {
                                color: useLightFg ? 'rgba(0,0,0,0.5)' : innerMuted,
                                writingDirection: writingDir,
                              },
                            ]}
                            numberOfLines={3}
                          >
                            {t(
                              'admin.appointmentsAdmin.clientModeCardHintExisting',
                              'Search and pick from your saved clients',
                            )}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            form.applyClientEntryMode('new');
                            setClientWizardPhase('details');
                          }}
                          style={({ pressed }) => [
                            styles.clientModeCard,
                            {
                              backgroundColor: useLightFg ? '#FFFFFF' : fieldBg,
                              borderColor: useLightFg ? 'rgba(255,255,255,0.55)' : fieldBorder,
                              opacity: pressed ? 0.92 : 1,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={t(
                            'admin.appointmentsAdmin.clientModeNewA11y',
                            'New client — enter name and phone',
                          )}
                        >
                          <View style={[styles.clientModeCardIconCircle, { backgroundColor: `${primary}22` }]}>
                            <UserPlus size={26} color={primary} strokeWidth={2.2} />
                          </View>
                          <Text
                            style={[styles.clientModeCardTitle, { color: primary, writingDirection: writingDir }]}
                            numberOfLines={2}
                          >
                            {t('admin.appointmentsAdmin.clientModeNew', 'New client')}
                          </Text>
                          <Text
                            style={[
                              styles.clientModeCardHint,
                              {
                                color: useLightFg ? 'rgba(0,0,0,0.5)' : innerMuted,
                                writingDirection: writingDir,
                              },
                            ]}
                            numberOfLines={3}
                          >
                            {t(
                              'admin.appointmentsAdmin.clientModeCardHintNew',
                              'Add name and phone for a first-time client',
                            )}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {clientWizardPhase === 'details' ? (
                      form.clientEntryMode === 'existing' ? (
                        !form.selectedClient ? (
                          <>
                            <View style={[styles.adminNewClientInputStack, { maxWidth: adminNewClientFieldsMaxWidth }]}>
                              <View
                                style={[
                                  styles.registerOpenRow,
                                  { flexDirection: newClientFieldsRtl ? 'row-reverse' : 'row' },
                                  {
                                    borderBottomColor: existingClientSearchFocused
                                      ? registerPhoneBorderFocus
                                      : registerPhoneBorderUnfocus,
                                    borderBottomWidth: existingClientSearchFocused ? 2.5 : 1.5,
                                  },
                                ]}
                              >
                                <View style={styles.registerOpenIconSlot} accessible={false}>
                                  <Search
                                    size={18}
                                    color={existingClientSearchFocused ? registerPhoneBorderFocus : registerHeroFaint}
                                    strokeWidth={2}
                                  />
                                </View>
                                <TextInput
                                  style={[
                                    styles.registerOpenInput,
                                    {
                                      textAlign: newClientInputTextAlign,
                                      writingDirection: newClientWritingDir,
                                      color: heroText,
                                    },
                                  ]}
                                  value={form.clientSearch}
                                  onChangeText={form.setClientSearch}
                                  placeholder={t('admin.appointmentsAdmin.selectClientPlaceholder', 'Select client...')}
                                  placeholderTextColor={registerHeroFaint}
                                  autoCorrect={false}
                                  onFocus={() => {
                                    setExistingClientSearchFocused(true);
                                    form.setShowClientDropdown(true);
                                  }}
                                  onBlur={() => setExistingClientSearchFocused(false)}
                                  textAlignVertical="center"
                                  accessibilityLabel={t('admin.appointmentsAdmin.selectClientPlaceholder', 'Select client...')}
                                />
                              </View>
                            </View>
                            {form.showClientDropdown ? (
                              <View
                                style={[
                                  styles.dropdown,
                                  styles.existingClientDropdownSurface,
                                  {
                                    alignSelf: 'center',
                                    maxWidth: adminNewClientFieldsMaxWidth,
                                    width: '100%',
                                    borderColor: useLightFg ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.1)',
                                  },
                                ]}
                              >
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
                                            {
                                              color: businessColors.text,
                                              textAlign: textAlignPrimary,
                                              writingDirection: writingDir,
                                            },
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {client.name}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.dropdownSub,
                                            {
                                              color: businessColors.textSecondary,
                                              textAlign: textAlignPrimary,
                                              writingDirection: writingDir,
                                            },
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
                                        {
                                          color: businessColors.textSecondary,
                                          textAlign: textAlignPrimary,
                                          writingDirection: writingDir,
                                        },
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
                          selectedClientStepClusterEl
                        )
                      ) : !form.selectedClient ? (
                        <View style={[styles.adminNewClientInputStack, { maxWidth: adminNewClientFieldsMaxWidth }]}>
                          <View
                            style={[
                              styles.registerOpenRow,
                              { flexDirection: newClientFieldsRtl ? 'row-reverse' : 'row' },
                              {
                                borderBottomColor: newClientNameFocused ? registerPhoneBorderFocus : registerPhoneBorderUnfocus,
                                borderBottomWidth: newClientNameFocused ? 2.5 : 1.5,
                              },
                            ]}
                          >
                            <View style={styles.registerOpenIconSlot} accessible={false}>
                              <User
                                size={18}
                                color={newClientOpenIcon(newClientNameFocused)}
                                strokeWidth={1.6}
                              />
                            </View>
                            <TextInput
                              style={[
                                styles.registerOpenInput,
                                {
                                  textAlign: newClientInputTextAlign,
                                  writingDirection: newClientWritingDir,
                                  color: newClientOpenFieldText,
                                },
                              ]}
                              value={form.newClientFullName}
                              onChangeText={form.setNewClientFullName}
                              placeholder={t('register.profile.namePlaceholder', 'כתוב/י שם מלא')}
                              placeholderTextColor={newClientOpenPlaceholder}
                              autoCapitalize="words"
                              autoCorrect={false}
                              onFocus={() => setNewClientNameFocused(true)}
                              onBlur={() => setNewClientNameFocused(false)}
                              accessibilityLabel={t('admin.appointmentsAdmin.newClientFullName', 'Full name')}
                            />
                          </View>

                          <View
                            style={[
                              styles.registerOpenRow,
                              styles.registerOpenRowSpacing,
                              { flexDirection: newClientFieldsRtl ? 'row-reverse' : 'row' },
                              {
                                borderBottomColor: newClientPhoneFocused ? registerPhoneBorderFocus : registerPhoneBorderUnfocus,
                                borderBottomWidth: newClientPhoneFocused ? 2.5 : 1.5,
                              },
                            ]}
                          >
                            <View style={styles.registerOpenIconSlot} accessible={false}>
                              <Phone
                                size={18}
                                color={newClientOpenIcon(newClientPhoneFocused)}
                                strokeWidth={1.5}
                              />
                            </View>
                            <TextInput
                              style={[
                                styles.registerOpenInput,
                                {
                                  textAlign: newClientInputTextAlign,
                                  writingDirection: newClientWritingDir,
                                  color: newClientOpenFieldText,
                                },
                              ]}
                              value={form.newClientPhone}
                              onChangeText={form.setNewClientPhone}
                              placeholder={t('profile.edit.phonePlaceholder', 'מספר טלפון')}
                              placeholderTextColor={newClientOpenPlaceholder}
                              keyboardType="phone-pad"
                              autoCorrect={false}
                              onFocus={() => setNewClientPhoneFocused(true)}
                              onBlur={() => setNewClientPhoneFocused(false)}
                              accessibilityLabel={t('admin.appointmentsAdmin.newClientPhone', 'Mobile phone')}
                            />
                          </View>

                          {showNewClientInlineContinue ? (
                            <Animated.View entering={FadeIn.duration(180)}>
                              <Pressable
                                onPress={onFooterPrimary}
                                disabled={form.isFinalizingClientStep}
                                accessibilityRole="button"
                                style={({ pressed }) => [
                                  styles.inlineContinueBtn,
                                  {
                                    backgroundColor: useLightFg ? 'rgba(255,255,255,0.9)' : primary,
                                    opacity: form.isFinalizingClientStep || pressed ? 0.72 : 1,
                                  },
                                ]}
                              >
                                {form.isFinalizingClientStep ? (
                                  <ActivityIndicator color={useLightFg ? primary : '#fff'} size="small" />
                                ) : (
                                  <View style={[styles.inlineContinueBtnInner, { flexDirection: 'row' }]}>
                                    <Text style={[styles.inlineContinueBtnText, { color: useLightFg ? primary : '#fff' }]}>
                                      {t('booking.continue', 'המשך')}
                                    </Text>
                                    {rtl ? (
                                      <ChevronLeft size={18} color={useLightFg ? primary : '#fff'} strokeWidth={2.5} />
                                    ) : (
                                      <ChevronRight size={18} color={useLightFg ? primary : '#fff'} strokeWidth={2.5} />
                                    )}
                                  </View>
                                )}
                              </Pressable>
                            </Animated.View>
                          ) : null}
                        </View>
                      ) : (
                        selectedClientStepClusterEl
                      )
                    ) : null}
                  </View>
                ) : null}

                {wizardStep === 4 ? (
                  <View style={[styles.section, styles.sectionLast]}>
                    <View style={styles.repeatFreqRows}>
                      {(
                        [
                          repeatWizardDisplayOrder.slice(0, 2),
                          repeatWizardDisplayOrder.slice(2, 4),
                        ] as const
                      ).map((rowWeeks, rowIdx) => (
                        <View key={`repeat-row-${rowIdx}`} style={styles.repeatFreqRow}>
                          {rowWeeks.map((w) => {
                            const sel = form.repeatWeeks === w;
                            const label =
                              w === 1
                                ? t('settings.recurring.everyWeek', 'every week')
                                : t('settings.recurring.everyNWeeks', 'every {{count}} weeks', { count: w });
                            return (
                              <View key={w} style={styles.repeatFreqCellWrap}>
                                <Pressable
                                  onPress={() => {
                                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    form.setRepeatWeeks(w);
                                    setWizardStep(5);
                                    form.loadAvailableTimesNow();
                                  }}
                                  style={({ pressed }) => [
                                    styles.repeatFreqCellPress,
                                    styles.repeatFreqCell,
                                    sel ? { backgroundColor: primary } : { backgroundColor: '#F5F5F7' },
                                    pressed && adminBookingGridStyles.cellPressed,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.repeatFreqCellText,
                                      sel ? styles.repeatFreqCellTextSelected : { color: '#1C1C1E' },
                                    ]}
                                    numberOfLines={2}
                                  >
                                    {label}
                                  </Text>
                                </Pressable>
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {wizardStep === 5 ? (
                  <View style={[styles.section, styles.sectionLast]}>
                    {form.selectedServices.length > 0 && form.selectedDayOfWeek !== null ? (
                      form.isLoadingTimes ? (
                        <View style={styles.timesLoading}>
                          <ActivityIndicator color={iconOnGlass} />
                          <Text
                            style={[
                              styles.timesLoadingLabel,
                              {
                                color: innerMuted,
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
                        <View style={adminBookingGridStyles.timeSlotsList}>
                          {adminTimeSections.map(({ period, slots, sectionDelay }) => {
                            const rows: string[][] = [];
                            for (let i = 0; i < slots.length; i += 3) rows.push(slots.slice(i, i + 3));
                            return (
                              <Animated.View
                                key={period.key}
                                entering={bookingTimeRowEntering(sectionDelay)}
                                style={adminBookingGridStyles.timeSection}
                              >
                                <View style={adminBookingGridStyles.sectionLabelRow}>
                                  {rtl ? (
                                    <>
                                      <View
                                        style={[
                                          adminBookingGridStyles.sectionLine,
                                          { backgroundColor: useLightFg ? 'rgba(255,255,255,0.25)' : fieldBorder },
                                        ]}
                                      />
                                      <Text
                                        style={[
                                          adminBookingGridStyles.sectionLabel,
                                          { color: useLightFg ? 'rgba(255,255,255,0.85)' : innerText },
                                        ]}
                                      >
                                        {t(period.labelKey, period.labelFallback)}
                                      </Text>
                                      <Text style={adminBookingGridStyles.sectionEmoji}>{period.emoji}</Text>
                                    </>
                                  ) : (
                                    <>
                                      <Text style={adminBookingGridStyles.sectionEmoji}>{period.emoji}</Text>
                                      <Text
                                        style={[
                                          adminBookingGridStyles.sectionLabel,
                                          { color: useLightFg ? 'rgba(255,255,255,0.85)' : innerText },
                                        ]}
                                      >
                                        {t(period.labelKey, period.labelFallback)}
                                      </Text>
                                      <View
                                        style={[
                                          adminBookingGridStyles.sectionLine,
                                          { backgroundColor: useLightFg ? 'rgba(255,255,255,0.25)' : fieldBorder },
                                        ]}
                                      />
                                    </>
                                  )}
                                </View>
                                <View style={adminBookingGridStyles.grid}>
                                  {rows.map((row, rowIdx) => (
                                    <View key={`row-${rowIdx}`} style={adminBookingGridStyles.row}>
                                      {row.map((slot) => {
                                        const selected = form.selectedTime === slot;
                                        return (
                                          <View key={slot} style={adminBookingGridStyles.cellWrap}>
                                            <Pressable
                                              onPress={() => void form.onPickTime(slot)}
                                              accessibilityRole="button"
                                              accessibilityState={{ selected }}
                                              style={({ pressed }) => [
                                                adminBookingGridStyles.cellPress,
                                                adminBookingGridStyles.cell,
                                                selected
                                                  ? { backgroundColor: primary }
                                                  : { backgroundColor: useLightFg ? 'rgba(255,255,255,0.93)' : fieldBg },
                                                pressed && adminBookingGridStyles.cellPressed,
                                              ]}
                                            >
                                              <Text
                                                style={[
                                                  adminBookingGridStyles.cellTime,
                                                  selected
                                                    ? adminBookingGridStyles.cellTimeSelected
                                                    : { color: useLightFg ? '#1C1C1E' : businessColors.text },
                                                ]}
                                              >
                                                {formatBookingTimeLabel(slot, i18n.language)}
                                              </Text>
                                            </Pressable>
                                          </View>
                                        );
                                      })}
                                      {row.length < 3
                                        ? Array.from({ length: 3 - row.length }).map((_, phIdx) => (
                                            <View key={`ph-${phIdx}`} style={adminBookingGridStyles.cellWrap} />
                                          ))
                                        : null}
                                    </View>
                                  ))}
                                </View>
                              </Animated.View>
                            );
                          })}
                        </View>
                      )
                    ) : null}
                  </View>
                ) : null}
              </Animated.View>
            </View>
          )}
        </View>
      </KeyboardAwareScreenScroll>

      {!hideFooterContinue ? (
        <View
          pointerEvents="box-none"
          style={[styles.footerAnchor, { bottom: Math.max(insets.bottom, 12) + 8 + (sheetVisible ? SHEET_PEEK_H : 0) }]}
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
      ) : null}

      <BookingSummarySheet
        ref={summarySheetRef}
        visible={sheetVisible}
        chips={adminBookingChips}
        primaryColor={primary}
        bottomOffset={0}
        safeAreaBottom={insets.bottom}
        onChipPress={(kind) => {
          summarySheetRef.current?.collapse();
          setTimeout(() => {
            if (kind === 'barber') setWizardStep(1);
            else if (kind === 'service') setWizardStep(2);
            else if (kind === 'day') setWizardStep(3);
            else if (kind === 'time') {
              form.setSelectedTime(null);
              setWizardStep(5);
            }
          }, 200);
        }}
        onConfirm={() => {
          void form.submit();
        }}
        confirmLoading={form.isSubmitting}
        gotItLabel={t('booking.gotIt', 'הבנתי')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fabBackWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 200,
    height: 48,
    flexDirection: 'row',
    direction: 'ltr',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingRight: 14,
  },
  fabBack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  adminNewClientInputStack: {
    alignSelf: 'center',
    width: '100%',
  },
  existingClientDropdownSurface: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
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
    marginBottom: 10,
    alignSelf: 'stretch',
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
  adminWizardScrollInner: {
    width: '100%',
    justifyContent: 'center',
  },
  adminWizardScrollInnerAlignStart: {
    justifyContent: 'flex-start',
  },
  glassCard: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  glassCardNoBackdrop: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 4,
    paddingHorizontal: 0,
    overflow: 'visible',
  },
  glassCardClientSelectedFill: {
    flex: 1,
    minHeight: 0,
  },
  glassCardInnerSelectedClientFill: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
  },
  adminSelectedClientCluster: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
  },
  stepIntroWrapAttached: {
    marginTop: 0,
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  adminSelectedClientSection: {
    alignSelf: 'stretch',
  },
  adminSelectedClientCard: {
    alignSelf: 'center',
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: { elevation: 5 },
    }),
  },
  selectedRowFlat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldShellVisualRtl: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
  },
  registerOpenRow: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 1,
    minHeight: 48,
    gap: 6,
  },
  registerOpenRowSpacing: {
    marginTop: 14,
  },
  registerOpenIconSlot: {
    paddingBottom: 1,
    opacity: 0.95,
  },
  registerOpenInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '400',
    letterSpacing: 0.2,
    paddingVertical: Platform.OS === 'ios' ? 8 : 7,
    paddingHorizontal: 0,
    margin: 0,
  },
  clientModeCardsRow: {
    alignSelf: 'stretch',
    gap: 12,
    marginBottom: 4,
  },
  clientModeCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 10,
    minHeight: 172,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  clientModeCardIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientModeCardTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.25,
    textAlign: 'center',
    alignSelf: 'stretch',
    marginTop: 10,
  },
  clientModeCardHint: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
    alignSelf: 'stretch',
    marginTop: 6,
  },
  section: {
    marginBottom: 4,
  },
  sectionLast: {
    marginBottom: 0,
  },
  hintBlock: {
    alignSelf: 'stretch',
    width: '100%',
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
  selectedRowMid: {
    flex: 1,
    minWidth: 0,
  },
  changeLink: {
    fontSize: 15,
    fontWeight: '700',
  },
  inlineContinueBtn: {
    alignSelf: 'center',
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 28,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  inlineContinueBtnInner: {
    alignItems: 'center',
    gap: 4,
  },
  inlineContinueBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  timesLoading: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  timesLoadingLabel: {
    width: '100%',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
  },
  emptyTxt: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 14,
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
  weekdayContentOnGradient: {
    marginTop: 12,
    alignSelf: 'stretch',
  },
  weekdayLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  weekdayLoadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  weekdayLoadingTextOnGradient: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  weekdayEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 10,
  },
  weekdayEmptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  weekdayEmptyTitleOnGradient: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  weekdayEmptyHint: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  weekdayEmptyHintOnGradient: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    lineHeight: 20,
  },
  weekdayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 14,
    gap: 10,
    justifyContent: 'center',
  },
  weekdayCellWrap: {
    width: '30%',
    minWidth: 92,
    maxWidth: 120,
  },
  /** Recurring frequency: 2×2 on gradient, LTR positions (row1: 2wk, 1wk — row2: 4wk, 3wk). */
  repeatFreqRows: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 14,
    direction: 'ltr',
  },
  repeatFreqRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 10,
    alignSelf: 'stretch',
  },
  repeatFreqCellWrap: {
    flex: 1,
    minWidth: 0,
    maxWidth: 152,
  },
  repeatFreqCellPress: {
    flex: 1,
  },
  repeatFreqCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    minHeight: 46,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  repeatFreqCellText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.25,
    textAlign: 'center',
  },
  repeatFreqCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
