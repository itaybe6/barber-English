import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { Calendar, Search, User, Clock, CalendarDays, X, Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
  FadeInUp,
  FadeIn,
  type SharedValue,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { servicesApi } from '@/lib/api/services';
import type { Service } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_W } = Dimensions.get('window');
/** Horizontal padding: scroll (18) + group card (18) each side — matches first layout pass before onLayout. */
const SCROLL_H_PAD = 18;
const GROUP_CARD_H_PAD = 18;
const INITIAL_STEP_VIEWPORT = Math.max(280, SCREEN_W - SCROLL_H_PAD * 2 - GROUP_CARD_H_PAD * 2);

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

const STEP_SPRING = { damping: 26, stiffness: 260, mass: 0.85 };
const STEP_TIMING_MS = 420;

function formatDateToLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeToAMPM(time24: string): string {
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minutes} ${ampm}`;
}

function triggerLightHaptic() {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* optional */
  }
}

function triggerMediumHaptic() {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    /* optional */
  }
}

function StepDotCell({
  index,
  label,
  stepSv,
  primary,
}: {
  index: number;
  label: string;
  stepSv: SharedValue<number>;
  primary: string;
}) {
  const dotAnim = useAnimatedStyle(() => {
    const current = stepSv.value === index;
    const done = stepSv.value > index;
    return {
      transform: [{ scale: current ? 1.22 : done ? 1 : 0.9 }],
      opacity: stepSv.value < index ? 0.42 : 1,
    };
  });

  const ringAnim = useAnimatedStyle(() => {
    const done = stepSv.value > index;
    const current = stepSv.value === index;
    return {
      borderColor: current || done ? primary : '#D1D1D6',
      backgroundColor: done ? primary : '#FFFFFF',
    };
  });

  const checkAnim = useAnimatedStyle(() => ({
    opacity: stepSv.value > index ? 1 : 0,
    transform: [{ scale: stepSv.value > index ? 1 : 0.5 }],
  }));

  const labelAnim = useAnimatedStyle(() => {
    const on = stepSv.value >= index;
    return { opacity: on ? 1 : 0.5 };
  });

  return (
    <View style={styles.stepperLabelWrap}>
      <Animated.View style={[styles.stepDotOuter, ringAnim]}>
        <Animated.View style={[styles.stepDotInner, dotAnim]}>
          <Animated.View style={checkAnim}>
            <Check size={9} color="#FFFFFF" strokeWidth={3} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <Animated.Text style={[styles.stepLabelText, labelAnim]} numberOfLines={1}>
        {label}
      </Animated.Text>
    </View>
  );
}

/** Renders step dots; stepSv must mirror current step (0–3). */
function StepDotRow({ labels, stepSv, primary }: { labels: string[]; stepSv: SharedValue<number>; primary: string }) {
  return (
    <View style={styles.stepperLabels}>
      {labels.map((label, idx) => (
        <StepDotCell key={String(idx)} index={idx} label={label} stepSv={stepSv} primary={primary} />
      ))}
    </View>
  );
}

interface AddAppointmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Pre-fill the date step with this calendar day (local midnight). */
  initialDate?: Date | null;
}

export default function AddAppointmentModal({
  visible,
  onClose,
  onSuccess,
  initialDate = null,
}: AddAppointmentModalProps) {
  const user = useAuthStore((state) => state.user);
  const { colors: businessColors } = useBusinessColors();
  const { t, i18n } = useTranslation();
  const primary = businessColors.primary;
  const secondary = businessColors.secondary;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedClient, setSelectedClient] = useState<{ name: string; phone: string } | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);

  const [clients, setClients] = useState<Array<{ name: string; phone: string }>>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(INITIAL_STEP_VIEWPORT);

  const translateX = useSharedValue(0);
  const progress = useSharedValue(0);
  const stepSv = useSharedValue(0);
  const currentStepRef = useRef(0);

  const [clientSearch, setClientSearch] = useState('');
  const [filteredClients, setFilteredClients] = useState<Array<{ name: string; phone: string }>>([]);

  const stepLabels = useMemo(
    () => [
      t('admin.appointmentsAdmin.client', 'Client'),
      t('booking.field.service', 'Service'),
      t('booking.field.date', 'Date'),
      t('booking.field.time', 'Time'),
    ],
    [t]
  );

  const dateLocale = i18n.language?.startsWith('he') ? 'he-IL' : 'en-US';
  const calendarLocale = i18n.language?.startsWith('he') ? 'he' : 'en';
  if (visible) {
    LocaleConfig.defaultLocale = calendarLocale;
  }

  useEffect(() => {
    if (!visible) return;
    loadClients();
    loadServices();
    resetForm();
    goToStep(0, false);
    if (initialDate) {
      const d = new Date(initialDate);
      d.setHours(0, 0, 0, 0);
      setSelectedDate(d);
    }
  }, [visible, initialDate]);

  useEffect(() => {
    const query = clientSearch.trim().toLowerCase();
    if (query === '') {
      setFilteredClients(clients);
    } else {
      setFilteredClients(
        clients.filter(
          (client) => client.name.toLowerCase().includes(query) || client.phone.includes(query)
        )
      );
    }
  }, [clientSearch, clients]);

  /** Reanimated `entering` on off-screen step panes often never finishes → stuck opacity 0. Open services when landing on step 1. */
  useEffect(() => {
    if (currentStep === 1) {
      setShowServiceDropdown(true);
    } else {
      setShowServiceDropdown(false);
    }
  }, [currentStep]);

  const loadClients = async () => {
    try {
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();

      const { data, error } = await supabase
        .from('users')
        .select('name, phone')
        .eq('user_type', 'client')
        .eq('business_id', businessId)
        .order('name');

      if (error) throw error;

      const validClients = (data || [])
        .filter((client: any) => client.phone && client.phone.trim() !== '')
        .map((client: any) => ({
          name: client.name || t('admin.appointmentsAdmin.client', 'Client'),
          phone: client.phone,
        }));

      setClients(validClients);
      setFilteredClients(validClients);
    } catch (error) {
      console.error('Error loading clients:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.loadClientsFailed', 'Error loading client list'));
    }
  };

  const loadServices = async () => {
    try {
      const data = await servicesApi.getAllServices();
      setServices(data);
    } catch (error) {
      console.error('Error loading services:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.loadServicesFailed', 'Error loading services list'));
    }
  };

  const resetForm = useCallback(() => {
    setSelectedDate(null);
    setSelectedClient(null);
    setSelectedService(null);
    setSelectedTime(null);
    setClientSearch('');
    setShowClientDropdown(false);
    setShowServiceDropdown(false);
    setShowTimeDropdown(false);
    setAvailableTimes([]);
    setCurrentStep(0);
    currentStepRef.current = 0;
    translateX.value = 0;
    progress.value = 0;
    stepSv.value = 0;
  }, [translateX, progress, stepSv]);

  const goToStep = useCallback(
    (next: number, animate: boolean = true) => {
      const clamped = Math.max(0, Math.min(3, next));
      setCurrentStep(clamped);
      currentStepRef.current = clamped;
      stepSv.value = clamped;
      const w = viewportWidth > 0 ? viewportWidth : INITIAL_STEP_VIEWPORT;
      if (animate) {
        triggerLightHaptic();
        translateX.value = withSpring(-clamped * w, STEP_SPRING);
        progress.value = withTiming(clamped / 3, { duration: STEP_TIMING_MS });
      } else {
        translateX.value = -clamped * w;
        progress.value = clamped / 3;
      }
    },
    [viewportWidth, translateX, progress, stepSv]
  );

  const goNext = () => goToStep(currentStep + 1);
  const goBack = () => {
    triggerLightHaptic();
    goToStep(currentStep - 1);
  };

  const stepsRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const loadAvailableTimesForDate = async (date: Date) => {
    if (!selectedService) return;

    setIsLoadingTimes(true);
    setAvailableTimes([]);

    try {
      const dateString = formatDateToLocalString(date);
      const dayOfWeek = date.getDay();

      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();

      let businessHours: any | null = null;
      try {
        const { data: bhUser } = await supabase
          .from('business_hours')
          .select('*')
          .eq('business_id', businessId)
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true)
          .eq('user_id', user?.id)
          .maybeSingle();
        if (bhUser) businessHours = bhUser;
      } catch {}
      if (!businessHours) {
        const { data: bhGlobal } = await supabase
          .from('business_hours')
          .select('*')
          .eq('business_id', businessId)
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true)
          .is('user_id', null)
          .maybeSingle();
        businessHours = bhGlobal || null;
      }

      if (!businessHours) {
        setAvailableTimes([]);
        return;
      }

      const normalize = (s: any) => String(s).slice(0, 5);
      const startTime = normalize(businessHours.start_time);
      const endTime = normalize(businessHours.end_time);
      const slotDuration =
        selectedService?.duration_minutes && selectedService.duration_minutes > 0
          ? selectedService.duration_minutes
          : businessHours.slot_duration_minutes || 60;

      type Window = { start: string; end: string };
      const baseWindows: Window[] = [{ start: startTime, end: endTime }];
      const brks: Array<{ start_time: string; end_time: string }> = (businessHours as any).breaks || [];
      const singleBreak =
        businessHours.break_start_time && businessHours.break_end_time
          ? [{ start_time: businessHours.break_start_time, end_time: businessHours.break_end_time }]
          : [];
      const allBreaks = [...brks, ...singleBreak].map((b) => ({
        start_time: normalize(b.start_time),
        end_time: normalize(b.end_time),
      }));

      const subtractBreaks = (wins: Window[], breaks: typeof allBreaks): Window[] => {
        let result = wins.slice();
        for (const b of breaks) {
          const next: Window[] = [];
          for (const w of result) {
            if (b.end_time <= w.start || b.start_time >= w.end) {
              next.push(w);
              continue;
            }
            if (w.start < b.start_time) next.push({ start: w.start, end: b.start_time });
            if (b.end_time < w.end) next.push({ start: b.end_time, end: w.end });
          }
          result = next;
        }
        return result.filter((w) => w.start < w.end);
      };

      const windows = subtractBreaks(baseWindows, allBreaks);

      const addMinutes = (hhmm: string, minutes: number): string => {
        const [h, m] = hhmm.split(':').map((x: string) => parseInt(x, 10));
        const total = h * 60 + m + minutes;
        const hh = Math.floor(total / 60) % 24;
        const mm = total % 60;
        return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
      };
      const compareTimes = (a: string, b: string) => a.localeCompare(b);

      const slots: string[] = [];
      for (const w of windows) {
        let tt = w.start as string;
        while (compareTimes(addMinutes(tt, slotDuration), w.end) <= 0) {
          slots.push(tt.slice(0, 5));
          tt = addMinutes(tt, slotDuration);
        }
      }

      const { data: existingAppointments } = await supabase
        .from('appointments')
        .select('slot_time, is_available')
        .eq('business_id', businessId)
        .eq('slot_date', dateString)
        .eq('user_id', user?.id);

      const bookedTimes = new Set(
        (existingAppointments || [])
          .filter((apt: any) => apt.is_available === false)
          .map((apt: any) => String(apt.slot_time).slice(0, 5))
      );

      let constraintsQuery = supabase
        .from('business_constraints')
        .select('start_time, end_time')
        .eq('business_id', businessId)
        .eq('date', dateString)
        .order('start_time');
      if (user?.id) {
        constraintsQuery = constraintsQuery.or(`user_id.is.null,user_id.eq.${user.id}`);
      } else {
        constraintsQuery = constraintsQuery.is('user_id', null);
      }
      const { data: constraintsRows } = await constraintsQuery;
      const withinConstraint = (slot: string) => {
        return (constraintsRows || []).some((c: any) => {
          const s = String(c.start_time).slice(0, 5);
          const e = String(c.end_time).slice(0, 5);
          return s <= slot && slot < e;
        });
      };

      const availableSlots = slots.filter((slot) => !bookedTimes.has(slot)).filter((slot) => !withinConstraint(slot));
      setAvailableTimes(availableSlots);
    } catch (error) {
      console.error('Error loading available times:', error);
      Alert.alert(t('error.generic', 'Error'), t('settings.recurring.timesLoadFailed', 'Failed to load available times. Please try again.'));
    } finally {
      setIsLoadingTimes(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setShowTimeDropdown(true);
    setIsLoadingTimes(true);
    if (selectedService) {
      loadAvailableTimesForDate(date);
    } else {
      setIsLoadingTimes(false);
    }
    goToStep(3);
    triggerMediumHaptic();
  };

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setShowServiceDropdown(false);
    triggerMediumHaptic();
    if (selectedDate) {
      setIsLoadingTimes(true);
      loadAvailableTimesForDate(selectedDate);
    }
    goToStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedClient || !selectedService || !selectedTime) {
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.fillAllRequired', 'Please fill in all required fields'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.userNotLogged', 'User not logged in'));
      return;
    }

    const dateString = formatDateToLocalString(selectedDate);
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();

    const { data: conflictingAppointments } = await supabase
      .from('appointments')
      .select('id')
      .eq('business_id', businessId)
      .eq('slot_date', dateString)
      .eq('slot_time', `${selectedTime}:00`)
      .eq('user_id', user.id);

    if (conflictingAppointments && conflictingAppointments.length > 0) {
      Alert.alert(t('settings.recurring.slotTakenTitle', 'Slot taken'), t('settings.recurring.slotTaken', 'The selected time is already booked this week. Please choose another time.'));
      return;
    }

    setIsSubmitting(true);
    triggerMediumHaptic();

    try {
      const { error } = await supabase.from('appointments').insert({
        business_id: businessId,
        slot_date: dateString,
        slot_time: `${selectedTime}:00`,
        is_available: false,
        client_name: selectedClient.name,
        client_phone: selectedClient.phone,
        service_name: selectedService.name,
        user_id: user.id,
        barber_id: user.id,
      });

      if (error) throw error;

      Alert.alert(t('success.generic', 'Success'), t('admin.appointmentsAdmin.scheduled', 'Appointment scheduled successfully'), [
        {
          text: t('ok', 'OK'),
          onPress: () => {
            onSuccess?.();
            onClose();
          },
        },
      ]);
    } catch (error) {
      console.error('Error creating appointment:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.scheduleFailed', 'Error scheduling appointment'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const calendarTheme = useMemo(
    () => ({
      textDayFontSize: 16,
      textMonthFontSize: 17,
      textDayHeaderFontSize: 13,
      arrowColor: primary,
      selectedDayBackgroundColor: primary,
      todayTextColor: primary,
      dayTextColor: '#1C1C1E',
      monthTextColor: '#1C1C1E',
      textDisabledColor: '#C6C6C8',
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
          fontSize: 12,
          fontWeight: '700' as const,
          color: '#8E8E93',
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
    [primary]
  );

  const calendarRenderArrow = useCallback(
    (direction: string) => {
      const size = 22;
      if (calendarLocale === 'he') {
        return direction === 'left' ? (
          <ChevronRight size={size} color={primary} strokeWidth={2.5} />
        ) : (
          <ChevronLeft size={size} color={primary} strokeWidth={2.5} />
        );
      }
      return direction === 'left' ? (
        <ChevronLeft size={size} color={primary} strokeWidth={2.5} />
      ) : (
        <ChevronRight size={size} color={primary} strokeWidth={2.5} />
      );
    },
    [primary, calendarLocale]
  );

  const renderDatePicker = () => {
    const today = new Date();
    const minDate = today.toISOString().slice(0, 10);
    const selected = selectedDate ? formatDateToLocalString(selectedDate) : undefined;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <LinearGradient colors={[primary + '22', primary + '08']} style={styles.iconBubble}>
            <CalendarDays size={20} color={primary} />
          </LinearGradient>
          <Text style={styles.sectionTitle}>{t('booking.field.date', 'Date')}</Text>
        </View>
        <Text style={styles.sectionSubtitle}>{t('admin.appointmentsAdmin.pickDate', 'Select the date for this appointment')}</Text>
        <View style={[styles.calendarContainer, { borderColor: primary + '28' }]}>
          <RNCalendar
            key={`add-appt-cal-${calendarLocale}`}
            current={selected || undefined}
            minDate={minDate}
            onDayPress={(day: any) => {
              const date = new Date(day.dateString);
              handleDateSelect(date);
            }}
            markedDates={selected ? { [selected]: { selected: true, selectedColor: primary } } : undefined}
            enableSwipeMonths
            hideDayNames={false}
            firstDay={0}
            renderArrow={calendarRenderArrow}
            style={{
              direction: calendarLocale === 'he' ? 'rtl' : 'ltr',
              width: '100%',
            }}
            theme={calendarTheme as any}
          />
        </View>
      </View>
    );
  };

  const renderClientSelector = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <LinearGradient colors={[primary + '33', primary + '12']} style={styles.iconBubble}>
          <User size={20} color={primary} />
        </LinearGradient>
        <Text style={styles.sectionTitle}>{t('admin.appointmentsAdmin.client', 'Client')}</Text>
      </View>
      <Text style={styles.sectionSubtitle}>{t('admin.appointmentsAdmin.pickClient', 'Pick the client for this appointment')}</Text>

      {!selectedClient ? (
        <>
          <View style={[styles.selectorShell, styles.selectorGlow, { shadowColor: primary }]}>
            <View style={[styles.selectorButton, styles.grayField]}>
              <View style={styles.selectorContent}>
                <TextInput
                  style={styles.selectorTextInput}
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  placeholder={t('admin.appointmentsAdmin.selectClientPlaceholder', 'Select client...')}
                  placeholderTextColor={Colors.subtext}
                  textAlign="left"
                  onFocus={() => setShowClientDropdown(true)}
                />
                <Search size={18} color={Colors.subtext} />
              </View>
            </View>
          </View>

          {showClientDropdown ? (
            <View style={styles.dropdownContainer}>
              <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {filteredClients.slice(0, 50).map((client, idx) => (
                  <View key={client.phone}>
                    <Pressable
                      style={({ pressed }) => [styles.dropdownItem, pressed && styles.dropdownItemPressed]}
                      onPress={() => {
                        triggerLightHaptic();
                        setSelectedClient(client);
                        setShowClientDropdown(false);
                        setClientSearch('');
                        goToStep(1);
                      }}
                    >
                      <LinearGradient colors={[primary, secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.clientAvatar}>
                        <Text style={styles.clientAvatarText}>{client.name.charAt(0).toUpperCase()}</Text>
                      </LinearGradient>
                      <View style={styles.clientInfo}>
                        <Text style={styles.clientName}>{client.name}</Text>
                        <Text style={styles.clientPhone}>{client.phone}</Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
                {filteredClients.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>{t('common.noResults', 'No results')}</Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </>
      ) : (
        <View style={[styles.selectedClientCard, { borderColor: primary + '40' }]}>
          <LinearGradient colors={[primary, secondary]} style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>{selectedClient.name.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
          <View style={styles.selectedClientInfo}>
            <Text style={styles.selectedClientName}>{selectedClient.name}</Text>
            <Text style={styles.selectedClientPhone}>{selectedClient.phone}</Text>
          </View>
          <Pressable onPress={() => setSelectedClient(null)} style={({ pressed }) => [styles.changeButton, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.changeButtonText, { color: primary }]}>{t('common.change', 'Change')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderServiceSelector = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <LinearGradient colors={[primary + '33', primary + '12']} style={styles.iconBubble}>
          <Calendar size={20} color={primary} />
        </LinearGradient>
        <Text style={styles.sectionTitle}>{t('booking.field.service', 'Service')}</Text>
      </View>
      <Text style={styles.sectionSubtitle}>{t('admin.appointmentsAdmin.pickService', 'Choose the service to perform')}</Text>

      <Pressable
        style={({ pressed }) => [
          styles.selectorShell,
          styles.selectorGlow,
          { shadowColor: primary },
          pressed && { transform: [{ scale: 0.992 }] },
        ]}
        onPress={() => setShowServiceDropdown(!showServiceDropdown)}
      >
        <View style={[styles.selectorButton, styles.grayField]}>
          <View style={styles.selectorContent}>
            <Text
              style={selectedService ? styles.selectorText : styles.selectorPlaceholder}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {selectedService
                ? `${selectedService.name} · ₪${selectedService.price}`
                : t('admin.appointmentsAdmin.selectServicePlaceholder', 'Select service...')}
            </Text>
            <Calendar size={18} color={Colors.subtext} />
          </View>
        </View>
      </Pressable>

      {showServiceDropdown ? (
        <View style={styles.dropdownContainer}>
          <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {services.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {t('booking.noServices', 'No services available')}
                </Text>
              </View>
            ) : (
              services.map((service) => (
                <View key={service.id}>
                  <Pressable
                    style={({ pressed }) => [styles.dropdownItem, pressed && styles.dropdownItemPressed]}
                    onPress={() => handleServiceSelect(service)}
                  >
                    <View style={styles.serviceInfo}>
                      <Text style={styles.serviceName}>{service.name}</Text>
                      <Text style={styles.servicePrice}>₪{service.price}</Text>
                    </View>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  const renderTimeSelector = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <LinearGradient colors={[primary + '33', primary + '12']} style={styles.iconBubble}>
          <Clock size={20} color={primary} />
        </LinearGradient>
        <Text style={styles.sectionTitle}>{t('booking.field.time', 'Time')}</Text>
      </View>
      <Text style={styles.sectionSubtitle}>{t('admin.appointmentsAdmin.pickTime', 'Pick an available time slot')}</Text>

      <Pressable
        style={({ pressed }) => [
          styles.selectorShell,
          styles.selectorGlow,
          { shadowColor: primary },
          { opacity: selectedDate && selectedService ? 1 : 0.55 },
          pressed && selectedDate && selectedService ? { transform: [{ scale: 0.992 }] } : null,
        ]}
        onPress={() => {
          if (!selectedDate || !selectedService) {
            Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.selectDateAndService', 'Please select date and service first'));
            return;
          }
          if (!showTimeDropdown) {
            setIsLoadingTimes(true);
            loadAvailableTimesForDate(selectedDate);
          }
          setShowTimeDropdown(!showTimeDropdown);
          triggerLightHaptic();
        }}
      >
        <View style={[styles.selectorButton, styles.grayField]}>
          <View style={styles.selectorContent}>
            <Text
              style={selectedTime ? styles.selectorText : styles.selectorPlaceholder}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {selectedTime
                ? formatTimeToAMPM(selectedTime)
                : isLoadingTimes
                  ? t('selectTime.loadingTimes', 'Loading available times...')
                  : t('selectTime.selectTime', 'Select Time')}
            </Text>
            <Clock size={18} color={Colors.subtext} />
          </View>
        </View>
      </Pressable>

      {showTimeDropdown ? (
        <View style={styles.timeChipsWrap}>
          {isLoadingTimes ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={primary} />
              <Text style={styles.loadingText}>{t('selectTime.loadingTimes', 'Loading available times...')}</Text>
            </View>
          ) : availableTimes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{t('selectTime.noTimes', 'No available times for this day')}</Text>
            </View>
          ) : (
            <View style={styles.timeChipsInner}>
              {availableTimes.map((time) => {
                const sel = selectedTime === time;
                return (
                  <View key={time}>
                    <Pressable
                      onPress={() => {
                        triggerMediumHaptic();
                        setSelectedTime(time);
                        setShowTimeDropdown(false);
                      }}
                      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                    >
                      {sel ? (
                        <LinearGradient colors={[primary, secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.timeChipActive}>
                          <Text style={styles.timeChipTextActive}>{formatTimeToAMPM(time)}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.timeChipIdle}>
                          <Text style={styles.timeChipTextIdle}>{formatTimeToAMPM(time)}</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );

  const navPrimaryDisabled =
    (currentStep === 0 && !selectedClient) ||
    (currentStep === 1 && !selectedService) ||
    (currentStep === 2 && !selectedDate) ||
    (currentStep === 3 && (!selectedTime || isSubmitting));

  const summaryReady = !!(selectedDate && selectedClient && selectedService && selectedTime);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.headerWrap}>
          <LinearGradient colors={['#FFFFFF', '#FAFAFC', '#F4F4F8']} style={StyleSheet.absoluteFill} />
          <View style={[styles.headerAccent, { backgroundColor: primary }]} />
          <View style={styles.header}>
            <Pressable
              onPress={() => {
                triggerLightHaptic();
                onClose();
              }}
              style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.75, transform: [{ scale: 0.94 }] }]}
            >
              <BlurView intensity={Platform.OS === 'ios' ? 28 : 18} tint="light" style={styles.closeBlur}>
                <X size={20} color={Colors.text} />
              </BlurView>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {t('admin.appointmentsAdmin.addAppointment', 'Add appointment')}
            </Text>
            <View style={{ width: 44 }} />
          </View>
        </Animated.View>

        <LinearGradient colors={['#ECECF3', '#F2F2F7', '#EFEFF5']} style={styles.bodyWrapper}>
          <KeyboardAwareScreenScroll
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.stepperContainer}>
              <View style={styles.stepperTrack}>
                <Animated.View style={[styles.stepperProgressTrack]} />
                <Animated.View style={[styles.stepperProgress, { backgroundColor: primary }, progressFillStyle]} />
              </View>
              <StepDotRow labels={stepLabels} stepSv={stepSv} primary={primary} />
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(120).springify()} style={styles.groupCard}>
              <LinearGradient
                colors={['#FFFFFF', '#FBFBFD']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <View style={[styles.groupCardBorder, { borderColor: primary + '18' }]} />
              <View
                style={styles.stepsViewport}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0 && Math.abs(w - viewportWidth) > 0.5) {
                    setViewportWidth(w);
                    translateX.value = -currentStepRef.current * w;
                  }
                }}
              >
                <Animated.View
                  style={[
                    styles.stepsContainer,
                    { width: (viewportWidth > 0 ? viewportWidth : INITIAL_STEP_VIEWPORT) * 4 },
                    stepsRowStyle,
                  ]}
                >
                  <View style={[styles.stepPane, { width: viewportWidth > 0 ? viewportWidth : INITIAL_STEP_VIEWPORT }]}>
                    <View style={styles.stepPaneInner}>{renderClientSelector()}</View>
                  </View>
                  <View style={[styles.stepPane, { width: viewportWidth > 0 ? viewportWidth : INITIAL_STEP_VIEWPORT }]}>
                    <View style={styles.stepPaneInner}>{renderServiceSelector()}</View>
                  </View>
                  <View style={[styles.stepPane, { width: viewportWidth > 0 ? viewportWidth : INITIAL_STEP_VIEWPORT }]}>
                    <View style={styles.stepPaneInner}>{renderDatePicker()}</View>
                  </View>
                  <View style={[styles.stepPane, { width: viewportWidth > 0 ? viewportWidth : INITIAL_STEP_VIEWPORT }]}>
                    <View style={styles.stepPaneInner}>{renderTimeSelector()}</View>
                  </View>
                </Animated.View>
              </View>

              <View style={styles.stepNavRow}>
                <Pressable
                  onPress={goBack}
                  disabled={currentStep === 0}
                  style={({ pressed }) => [
                    styles.stepNavButtonWrap,
                    currentStep === 0 && styles.stepNavButtonDisabled,
                    pressed && currentStep > 0 ? { transform: [{ scale: 0.97 }] } : null,
                  ]}
                >
                  <BlurView intensity={22} tint="light" style={styles.stepNavBlur}>
                    <Text style={[styles.stepNavText, currentStep === 0 && styles.stepNavTextDisabled]}>{t('back', 'Back')}</Text>
                  </BlurView>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (currentStep < 3) goNext();
                    else void handleSubmit();
                  }}
                  disabled={navPrimaryDisabled}
                  style={({ pressed }) => [
                    styles.stepNavPrimaryWrap,
                    pressed && !navPrimaryDisabled ? { transform: [{ scale: 0.985 }] } : null,
                  ]}
                >
                  <LinearGradient
                    colors={navPrimaryDisabled ? ['#C7C7CC', '#AEAEB2'] : [primary, secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.stepNavPrimary, navPrimaryDisabled && { opacity: 0.88 }]}
                  >
                    {isSubmitting && currentStep === 3 ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.stepNavPrimaryText}>
                        {currentStep < 3 ? t('next', 'Next') : isSubmitting ? t('settings.common.saving', 'Saving...') : t('done', 'Done')}
                      </Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>

            {summaryReady ? (
              <Animated.View entering={FadeInUp.springify()} style={[styles.summaryCard, { borderColor: primary + '30' }]}>
                <LinearGradient colors={[primary + '14', 'transparent']} style={styles.summaryGradientHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <Text style={styles.summaryTitle}>{t('admin.appointmentsAdmin.summary', 'Appointment Summary')}</Text>
                <View style={styles.summaryContent}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t('admin.appointmentsAdmin.client', 'Client')}</Text>
                    <Text style={styles.summaryValue} numberOfLines={3} ellipsizeMode="tail">
                      {selectedClient?.name}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t('booking.field.service', 'Service')}</Text>
                    <Text style={styles.summaryValue} numberOfLines={3} ellipsizeMode="tail">
                      {selectedService?.name}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t('booking.field.date', 'Date')}</Text>
                    <Text style={styles.summaryValue} numberOfLines={3} ellipsizeMode="tail">
                      {selectedDate
                        ? selectedDate.toLocaleDateString(dateLocale, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'long',
                          })
                        : ''}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryRowLast]}>
                    <Text style={styles.summaryLabel}>{t('booking.field.time', 'Time')}</Text>
                    <Text style={styles.summaryValue}>{selectedTime ? formatTimeToAMPM(selectedTime) : ''}</Text>
                  </View>
                </View>
              </Animated.View>
            ) : null}
          </KeyboardAwareScreenScroll>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerWrap: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.12)',
  },
  headerAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    opacity: 0.95,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
  },
  closeButton: {
    zIndex: 10,
  },
  closeBlur: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: '700',
    color: '#0A0A0B',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  bodyWrapper: {
    flex: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: SCROLL_H_PAD,
    paddingTop: SCROLL_H_PAD,
    paddingBottom: 28,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'stretch',
  },
  stepperContainer: {
    marginBottom: 18,
    width: '100%',
    alignSelf: 'stretch',
  },
  stepperTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    width: '100%',
    alignSelf: 'stretch',
  },
  stepperProgressTrack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
  },
  stepperProgress: {
    height: '100%',
    borderRadius: 3,
  },
  stepperLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  stepperLabelWrap: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  stepDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  stepDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#636366',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  section: {
    marginBottom: 4,
    width: '100%',
    alignSelf: 'stretch',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: -2,
    marginBottom: 14,
    textAlign: 'left',
    lineHeight: 20,
    width: '100%',
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0A0A0B',
    flex: 1,
    textAlign: 'left',
    letterSpacing: -0.4,
  },
  selectorShell: {
    borderRadius: 16,
    width: '100%',
    alignSelf: 'stretch',
  },
  selectorGlow: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  selectorButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    width: '100%',
    minHeight: 54,
    justifyContent: 'center',
  },
  grayField: {
    backgroundColor: '#F2F2F7',
    borderColor: 'transparent',
    borderWidth: 0,
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    minWidth: 0,
  },
  selectorText: {
    fontSize: 17,
    color: '#000000',
    flex: 1,
    textAlign: 'left',
    fontWeight: '600',
  },
  selectorPlaceholder: {
    fontSize: 17,
    color: '#8E8E93',
    flex: 1,
    textAlign: 'left',
  },
  selectorTextInput: {
    fontSize: 17,
    color: '#000000',
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    paddingVertical: 0,
    fontWeight: '500',
  },
  dropdownContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginTop: 12,
    maxHeight: 300,
    width: '100%',
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
    overflow: 'hidden',
  },
  dropdownList: {
    maxHeight: 280,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
    minWidth: 0,
  },
  dropdownItemPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  clientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  clientAvatarText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  clientInfo: {
    flex: 1,
    alignItems: 'flex-start',
    minWidth: 0,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    alignSelf: 'stretch',
  },
  clientPhone: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  serviceInfo: {
    flex: 1,
    alignItems: 'flex-start',
    minWidth: 0,
    width: '100%',
  },
  serviceName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  servicePrice: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 2,
    fontWeight: '500',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
  },
  emptyStateText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
  },
  selectedClientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  selectedClientInfo: {
    flex: 1,
    alignItems: 'flex-start',
    marginStart: 4,
    minWidth: 0,
  },
  selectedClientName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
  },
  selectedClientPhone: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  changeButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
  },
  loadingText: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 10,
    fontWeight: '500',
  },
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 8,
    direction: 'ltr',
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  groupCard: {
    borderRadius: 24,
    padding: GROUP_CARD_H_PAD,
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.11,
    shadowRadius: 32,
    elevation: 12,
  },
  groupCardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    pointerEvents: 'none',
  },
  stepsViewport: {
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
  },
  stepsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepPane: {
    paddingHorizontal: 0,
    minHeight: 300,
    alignItems: 'stretch',
  },
  stepPaneInner: {
    width: '100%',
    flex: 1,
    minWidth: 0,
    minHeight: 280,
  },
  stepNavRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 20,
    gap: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  stepNavButtonWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    minWidth: 108,
    flexShrink: 0,
    justifyContent: 'center',
  },
  stepNavPrimaryWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  stepNavBlur: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 52,
  },
  stepNavButtonDisabled: {
    opacity: 0.45,
  },
  stepNavText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '700',
  },
  stepNavTextDisabled: {
    color: '#AEAEB2',
  },
  stepNavPrimary: {
    flex: 1,
    width: '100%',
    minHeight: 52,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  stepNavPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  timeChipsWrap: {
    marginTop: 14,
    paddingVertical: 4,
    width: '100%',
    alignSelf: 'stretch',
  },
  timeChipsInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    justifyContent: 'flex-start',
  },
  timeChipActive: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  timeChipIdle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: '#EDEEF2',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  timeChipTextActive: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  timeChipTextIdle: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: '700',
  },
  summaryCard: {
    borderRadius: 24,
    padding: 20,
    marginTop: 20,
    marginBottom: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.11,
    shadowRadius: 28,
    elevation: 9,
  },
  summaryGradientHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 72,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0A0A0B',
    marginBottom: 16,
    textAlign: 'left',
    letterSpacing: -0.4,
  },
  summaryContent: {
    gap: 0,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.12)',
  },
  summaryRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '600',
    textAlign: 'left',
    flexShrink: 0,
    maxWidth: '38%',
  },
  summaryValue: {
    fontSize: 15,
    color: '#000000',
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
    minWidth: 0,
    lineHeight: 21,
  },
});
