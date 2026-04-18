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
  Modal,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import BookingSummarySheet, { type BookingSummarySheetHandle, type BookingSuccessData } from '@/components/book-appointment/BookingSummarySheet';
import type { BookingProgressChipModel } from '@/components/book-appointment/BookingProgressChipsStrip';
import { toBcp47Locale } from '@/lib/i18nLocale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Search, User, UserPlus, Phone, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import ServiceSelection from '@/components/book-appointment/ServiceSelection';
import DaySelection from '@/components/book-appointment/DaySelection';
import { filterServicesForBookingBarber } from '@/lib/api/services';
import { businessProfileApi, isMultiServiceBookingAllowed } from '@/lib/api/businessProfile';
import { useAuthStore } from '@/stores/authStore';
import { prefetchBookingDayAvailabilityMap } from '@/lib/utils/prefetchBookingDayAvailability';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import {
  useAdminAddAppointmentForm,
  formatDateToLocalString,
  formatBookingTimeLabel,
  totalServicesDurationMinutes,
  type AdminBookingSaveSuccessPayload,
} from '@/lib/hooks/useAdminAddAppointmentForm';
import type { Service } from '@/lib/supabase';
import { ADMIN_CALENDAR_APPOINTMENTS_CHANGED } from '@/constants/adminCalendarEvents';
import { BOOKING_TIME_PERIOD_EMOJI } from '@/constants/bookingTimePeriodEmoji';
import { bookingTimeRowEntering } from '@/components/book-appointment/bookingStepListEnterAnimation';

/** Same rolling window shape as client `book-appointment` (Hebrew weekday labels in data; calendar uses `language`). */
function getNextNDays(n: number) {
  const today = new Date();
  const days: { date: number; dayName: string; fullDate: Date }[] = [];
  const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  for (let i = 0; i < Math.max(1, n); i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push({
      date: date.getDate(),
      dayName: hebrewDays[date.getDay()],
      fullDate: date,
    });
  }
  return days;
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

/** Height of the BookingSummarySheet peek strip (handle + title + chips row). */
const SHEET_PEEK_H = 124;
/** Extra space below the date-step legend — the sheet handle sits above the peek and needs clearance. */
const ADMIN_DATE_LEGEND_ABOVE_SHEET = 44;
/** Pull client-details intro + fields slightly above vertical center (existing search + new-client form). */
const ADMIN_CLIENT_DETAILS_INTRO_LIFT = -26;
const ADMIN_CLIENT_DETAILS_SECTION_LIFT = -18;

/** Subset of `book-appointment` `createStyles` used by `ServiceSelection` / `DaySelection`. */
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
    minHeight: 420,
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

function parseDateParam(raw: string | string[] | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) && raw[0] ? String(raw[0]).trim() : '';
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

const TOTAL_WIZARD_STEPS = 4;

type AdminClientWizardPhase = 'chooseMode' | 'details';

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

const adminBookingGridStyles = StyleSheet.create({
  grid: { gap: 9 },
  row: { flexDirection: 'row', gap: 9 },
  cellWrap: { flex: 1 },
  cellPress: { flex: 1 },
  /** Match `TimeSelection` `gridStyles.cell` — solid fill, no outline “glass” chip. */
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
  /** Time grid sits in the outer wizard scroll (same as client `TimeSelection`) — no nested maxHeight ScrollView. */
  timeSlotsList: { alignSelf: 'stretch', gap: 16, paddingBottom: 6 },
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


export default function AddAppointmentScreen() {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
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

  const summarySheetRef = useRef<BookingSummarySheetHandle>(null);
  const [adminSuccessData, setAdminSuccessData] = useState<BookingSuccessData | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [clientWizardPhase, setClientWizardPhase] = useState<AdminClientWizardPhase>('chooseMode');
  const [globalBreakMinutes, setGlobalBreakMinutes] = useState(0);

  const { t, i18n } = useTranslation();

  const onSaveSuccess = useCallback((payload: AdminBookingSaveSuccessPayload) => {
    const { client, service, services, date, time } = payload;
    const allSvcs = services?.length ? services : [service];
    const namesJoined = allSvcs.map((s) => s.name).join(' + ');
    const loc = toBcp47Locale(i18n?.language);
    const dateLabel = date.toLocaleDateString(loc, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const durationM = totalServicesDurationMinutes(allSvcs);
    const toMin = (hhmm: string) => {
      const [hh = 0, mm = 0] = hhmm.split(':').map(Number);
      return hh * 60 + mm;
    };
    const fromMin = (min: number) => {
      const h = Math.floor(min / 60) % 24;
      const m = min % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const endTime = fromMin(toMin(time) + durationM);
    const timeLabel = `${time} – ${endTime}`;

    setAdminSuccessData({
      serviceName: namesJoined,
      barberName: client.name,
      personRowLabel: t('admin.client', 'לקוח'),
      dateLabel,
      timeLabel,
    });
    summarySheetRef.current?.expand();
  }, [t, i18n?.language]);

  const form = useAdminAddAppointmentForm({
    initialDateKey,
    onSaveSuccess,
    onSuccess: onBookedSuccess,
    globalBreakMinutes,
  });
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
      setAdminSuccessData(null);
      setClientWizardPhase('chooseMode');
      setNewClientNameFocused(false);
      setNewClientPhoneFocused(false);
      setExistingClientSearchFocused(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
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
        goBackToAppointments();
        return true;
      });
      return () => sub.remove();
    }, [
      backFromClientDetailsToChooser,
      clientWizardPhase,
      form,
      goBackToAppointments,
      wizardStep,
    ])
  );

  const { colors: businessColors } = useBusinessColors();
  const layoutRtl = I18nManager.isRTL;
  const isHeCopy = i18n.language?.startsWith('he') ?? true;
  /** True when the UI should behave RTL — either system RTL or Hebrew language. */
  const rtl = layoutRtl || isHeCopy;
  const primary = businessColors.primary;
  const secondary = businessColors.secondary;

  const authUser = useAuthStore((s) => s.user);
  const [bookingOpenDays, setBookingOpenDays] = useState(7);
  const [adminDayAvailability, setAdminDayAvailability] = useState<Record<string, number>>({});
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const daysN = authUser?.id ? await businessProfileApi.getBookingOpenDaysForUser(authUser.id) : 7;
        if (!cancelled) {
          const validDays = Math.max(0, Math.min(60, Number(daysN ?? 7)));
          setBookingOpenDays(validDays);
        }
      } catch {
        if (!cancelled) setBookingOpenDays(7);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const minutes = authUser?.id ? await businessProfileApi.getBreakMinutesForUser(authUser.id) : 0;
        if (!cancelled) {
          const br = Math.max(0, Math.min(180, Number(minutes ?? 0)));
          setGlobalBreakMinutes(br);
        }
      } catch {
        if (!cancelled) setGlobalBreakMinutes(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  const bookingDays = useMemo(() => getNextNDays(bookingOpenDays), [bookingOpenDays]);

  const adminFilteredServices = useMemo(
    () => filterServicesForBookingBarber(form.services, authUser?.id, 1),
    [form.services, authUser?.id],
  );

  const adminServiceDuration = useMemo(
    () => totalServicesDurationMinutes(form.selectedServices),
    [form.selectedServices],
  );

  const adminSelectedServicesKey = useMemo(
    () => form.selectedServices.map((s) => String((s as { id?: unknown }).id ?? '')).join(','),
    [form.selectedServices],
  );

  const adminSelectedDayIndex = useMemo(() => {
    if (!form.selectedDate) return null;
    const key = formatDateToLocalString(form.selectedDate);
    const idx = bookingDays.findIndex((d) => formatDateToLocalString(d.fullDate) === key);
    return idx >= 0 ? idx : null;
  }, [form.selectedDate, bookingDays]);

  useEffect(() => {
    if (wizardStep !== 3 || form.selectedServices.length === 0 || !authUser?.id) return undefined;
    let stale = false;
    (async () => {
      try {
        const map = await prefetchBookingDayAvailabilityMap({
          days: bookingDays,
          barberId: authUser.id,
          serviceDurationMinutes: adminServiceDuration,
          globalBreakMinutes,
        });
        if (!stale) setAdminDayAvailability(map);
      } catch {
        if (!stale) setAdminDayAvailability({});
      }
    })();
    return () => {
      stale = true;
    };
  }, [wizardStep, adminSelectedServicesKey, authUser?.id, bookingDays, adminServiceDuration, globalBreakMinutes]);

  const showWizardStepIntro = wizardStep !== 2 && wizardStep !== 3;
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
  /** Match `app/register.tsx` open-field underlines for admin “new client” step. */
  const registerHeroFaint = useLightFg ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.28)';
  const registerPhoneBorderUnfocus = useLightFg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.22)';
  const registerPhoneBorderFocus = useLightFg ? '#FFFFFF' : primary;
  /** On hero gradient, typed text + placeholders + icons read as white/light on orange. */
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
  const placeholderOnGlass = useLightFg ? 'rgba(255,255,255,0.78)' : undefined;
  const iconOnGlass = useLightFg ? heroText : primary;
  const iconOnField = useLightFg ? heroText : innerMuted;

  const dateLocale = isHeCopy ? 'he-IL' : 'en-US';
  const textAlignPrimary = (rtl ? 'right' : 'left') as 'right' | 'left';
  const inputTextAlign = (rtl ? 'right' : 'left') as 'right' | 'left';
  const writingDir = (rtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr';
  // aliases kept for readability where used in new-client / service blocks
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
    // Fixed per-section entry delays (0 / 60 / 120 ms) so animation cost is O(1)
    // regardless of how many slots exist — avoids giant stagger delays for busy days.
    return activePeriods.map((period, idx) => ({
      period,
      slots: grouped[period.key],
      sectionDelay: idx,  // 0, 1, 2 — multiplied by stagger inside bookingTimeRowEntering
    }));
  }, [form.availableTimes]);


  const summaryReady = !!(
    form.selectedDate &&
    form.selectedClient &&
    form.selectedServices.length > 0 &&
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

  const adminBookingTimePanelDateLine = useMemo(() => {
    if (!form.selectedDate) return '';
    return form.selectedDate.toLocaleDateString(dateLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }, [form.selectedDate, dateLocale]);

  const adminBookingTimePanelTimeLine = useMemo(() => {
    if (!form.selectedTime) return '';
    return formatBookingTimeLabel(form.selectedTime, i18n?.language);
  }, [form.selectedTime, i18n?.language]);

  const adminBookingTotalDuration = useMemo(
    () => totalServicesDurationMinutes(form.selectedServices),
    [form.selectedServices],
  );

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
    if (form.selectedDate) {
      const dateLine = form.selectedDate.toLocaleDateString(dateLocale, {
        day: 'numeric',
        month: 'numeric',
        year: '2-digit',
      });
      chips.push({
        key: 'day',
        kind: 'day',
        label: adminBookingTimePanelDateLine,
        dayWeekday: form.selectedDate.toLocaleDateString(dateLocale, { weekday: 'short' }),
        dayWeekdayLong: form.selectedDate.toLocaleDateString(dateLocale, { weekday: 'long' }),
        dayDateLine: dateLine,
      });
    }
    if (form.selectedTime) {
      const hRaw = Number(form.selectedTime.split(':')[0]);
      const hour = Number.isFinite(hRaw) ? hRaw : 12;
      chips.push({
        key: 'time',
        kind: 'time',
        label: form.selectedTime,
        timeDaypart: daypartLabelFromHour24(hour, t),
      });
    }
    return chips;
  }, [
    form.selectedClient,
    form.selectedServices,
    form.selectedDate,
    form.selectedTime,
    adminSummaryServiceNames,
    adminSummaryServicePrice,
    adminBookingTotalDuration,
    adminBookingTimePanelDateLine,
    dateLocale,
    t,
  ]);

  useEffect(() => {
    if (form.selectedTime && wizardStep === 4) {
      summarySheetRef.current?.expand();
    } else if (!form.selectedTime) {
      summarySheetRef.current?.collapse();
    }
  }, [form.selectedTime, wizardStep]);

  const newClientPhoneDigits = useMemo(
    () => form.newClientPhone.replace(/\D/g, ''),
    [form.newClientPhone],
  );

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
        return !!form.selectedDate;
      case 4:
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
    form.selectedDate,
    form.selectedTime,
  ]);

  const hideFooterContinue =
    (wizardStep === 1 &&
      (clientWizardPhase === 'chooseMode' ||
        !!form.selectedClient ||
        (clientWizardPhase === 'details' && !form.selectedClient))) ||
    wizardStep === 2 ||
    wizardStep === 3 ||
    wizardStep === 4;

  const footerPrimaryEnabled =
    wizardStep === TOTAL_WIZARD_STEPS
      ? canSubmit
      : canAdvanceFromStep && !form.isFinalizingClientStep;

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
      goBackToAppointments();
    }
  }, [backFromClientDetailsToChooser, clientWizardPhase, goBackToAppointments, wizardStep]);

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
        // Only start loading available times when the user actively advances to the
        // time-selection step. Loading earlier (on date pick) caused re-renders that
        // blocked the JS thread and made the Continue button feel unresponsive.
        if (nextStep === 4) {
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
        if (
          clientWizardPhase === 'details' &&
          form.clientEntryMode === 'existing' &&
          !form.selectedClient
        ) {
          return t('admin.appointmentsAdmin.wizardStepTitlePickExistingClient', 'בחר לקוח קיים');
        }
        return t('settings.recurring.wizardStepTitleClient', 'Client');
      case 2:
        return t('settings.recurring.wizardStepTitleService', 'Service');
      case 3:
        return t('booking.field.date', 'Date');
      case 4:
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
        return t('admin.appointmentsAdmin.pickDate', 'Select the date for this appointment');
      case 4:
      default:
        return !form.selectedDate || form.selectedServices.length === 0
          ? t('admin.appointmentsAdmin.selectDateAndServiceFirst', 'בחרו תאריך ושירות כדי לראות שעות פנויות')
          : t('admin.appointmentsAdmin.pickTime', 'Pick an available time slot');
    }
  }, [
    wizardStep,
    clientWizardPhase,
    t,
    form.selectedDate,
    form.selectedServices.length,
    form.clientEntryMode,
    form.selectedClient,
    allowMultiServiceBooking,
  ]);

  const adminClientDetailsNeedsVerticalLift = useMemo(
    () => wizardStep === 1 && clientWizardPhase === 'details' && !form.selectedClient,
    [wizardStep, clientWizardPhase, form.selectedClient],
  );

  const sheetVisible = adminBookingChips.length > 0;
  const scrollBottomPad = useMemo(() => {
    if (wizardStep === 4 && sheetVisible) {
      // Single outer scroll for step 4: pad so the last time row can scroll above the summary sheet.
      return Math.max(insets.bottom, 12) + SHEET_PEEK_H + 12;
    }
    return Math.max(insets.bottom, 20) + 88 + (sheetVisible ? SHEET_PEEK_H : 0);
  }, [insets.bottom, wizardStep, sheetVisible]);
  const scrollPaddingTop = Math.max(insets.top, 8) + 64;
  /** Min height so short steps (client type, services, date) sit visually centered like client booking. */
  const adminWizardContentMinHeight = Math.max(320, windowHeight - scrollPaddingTop - scrollBottomPad);
  const adminNewClientFieldsMaxWidth = useMemo(
    () => Math.min(340, Math.max(260, windowWidth - 72)),
    [windowWidth],
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

        {/* Inline compact Continue button — replaces the large global footer button on step 1 */}
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

      {/* Floating FAB back button — mirrors client booking flow */}
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
            // Step 4: short day — avoid stretching content taller than the sheet peek (orange “air”).
            flexGrow: wizardStep === 4 && sheetVisible ? 0 : 1,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.adminWizardScrollInner,
            wizardStep === 4 && styles.adminWizardScrollInnerAlignStart,
            wizardStep !== 4 ? { minHeight: adminWizardContentMinHeight } : null,
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
              form.setSelectedDate(null);
              form.setSelectedTime(null);
              if (next.length > 0 && !allowMultiServiceBooking) {
                setWizardStep((s) => Math.min(TOTAL_WIZARD_STEPS, s + 1));
              }
            }}
          />
        ) : wizardStep === 3 ? (
          <DaySelection
            visible
            styles={bookingLikeStyles}
            days={bookingDays}
            bookingOpenDays={bookingOpenDays}
            selectedDate={form.selectedDate}
            selectedDayIndex={adminSelectedDayIndex}
            dayAvailability={adminDayAvailability}
            language={i18n?.language || 'he'}
            primaryColor={primary}
            t={t}
            contentLiftPx={sheetVisible ? 22 : 0}
            legendBottomPad={sheetVisible ? SHEET_PEEK_H + ADMIN_DATE_LEGEND_ABOVE_SHEET : 0}
            onSelectDayIndex={(idx) => {
              if (idx === null) {
                form.setSelectedDate(null);
                form.setSelectedTime(null);
                return;
              }
              const d = bookingDays[idx];
              if (d) {
                form.onPickDate(d.fullDate);
                form.setShowClientDropdown(false);
                form.setShowServiceDropdown(false);
                setWizardStep(4);
                form.loadAvailableTimesNow(d.fullDate);
              }
            }}
            onClearTime={() => form.setSelectedTime(null)}
          />
        ) : (
        <View
          style={[
            styles.glassCard,
            wizardStep === 1 || wizardStep === 4
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
          {/* Client */}
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
            {form.selectedDate && form.selectedServices.length > 0 ? (
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
                                      onPress={() => form.onPickTime(slot)}
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
        visible={sheetVisible || !!adminSuccessData}
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
              setWizardStep(4);
            }
          }, 200);
        }}
        onConfirm={() => { void form.submit(); }}
        confirmLoading={form.isSubmitting}
        successData={adminSuccessData ?? undefined}
        onSuccessDismiss={() => {
          setAdminSuccessData(null);
          onBookedSuccess();
        }}
        gotItLabel={t('booking.gotIt', 'הבנתי')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
  /** Narrower centered column for register-style new-client fields. */
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
  /** Centers short wizard steps vertically within the visible scroll area (below FAB, above footer/sheet). */
  adminWizardScrollInner: {
    width: '100%',
    justifyContent: 'center',
  },
  /** Time step: align like client booking — title + grid from the top, no dead band above the hours. */
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
  /** Client type cards (קיים / חדש): no frosted panel — cards sit on the gradient like service/date steps. */
  glassCardNoBackdrop: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 4,
    paddingHorizontal: 0,
    overflow: 'visible',
  },
  /** Fills scroll area under step intro so the selected-client card can sit visually centered. */
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
  /** Tighter spacing when step intro sits directly above the white client card. */
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
  /** Same pattern as `register.tsx` `phoneOpenRow` — underline only, no boxed field. */
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
  },
  clientModeCardHint: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
    alignSelf: 'stretch',
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
});
