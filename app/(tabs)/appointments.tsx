import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Dimensions,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Animated as RNAnimated,
  TouchableOpacity,
  View,
  Modal,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import Colors from '@/constants/colors';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import DaySelector from '@/components/DaySelector';
import { AvailableTimeSlot, supabase, getBusinessId } from '@/lib/supabase';
import { businessHoursApi } from '@/lib/api/businessHours';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { FlashList, FlashListProps } from '@shopify/flash-list';
import Animated, {
  setNativeProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

// Press feedback: scale-on-press animated touchable
const AnimatedTouchable = RNAnimated.createAnimatedComponent(TouchableOpacity);
type PressableScaleProps = {
  onPress: () => void;
  style?: any;
  disabled?: boolean;
  hitSlop?: any;
  pressRetentionOffset?: any;
  accessibilityLabel?: string;
  children?: React.ReactNode;
};
const PressableScale = ({ onPress, style, children, disabled, hitSlop, pressRetentionOffset, accessibilityLabel }: PressableScaleProps) => {
  const scale = React.useRef(new RNAnimated.Value(1)).current;

  const handlePressIn = React.useCallback(() => {
    RNAnimated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      stiffness: 300,
      damping: 22,
      mass: 0.6,
    }).start();
  }, [scale]);

  const handlePressOut = React.useCallback(() => {
    RNAnimated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: 300,
      damping: 22,
      mass: 0.6,
    }).start();
  }, [scale]);

  return (
    <AnimatedTouchable
      activeOpacity={0.8}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      delayPressIn={0}
      delayPressOut={0}
      pressRetentionOffset={pressRetentionOffset || { top: 24, bottom: 24, left: 24, right: 24 }}
      hitSlop={hitSlop || { top: 24, bottom: 24, left: 24, right: 24 }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedTouchable>
  );
};

type DayBlock = {
  date: Date;
  formatted: string; // YYYY-MM-DD
};

const { width: _screenWidth } = Dimensions.get('window');
const _daysInWeekToDisplay = 7;
// +1 is for the hours column
const _baseDaySize = _screenWidth / (_daysInWeekToDisplay + 1);
// When showing all 7 days, the grid gets too cramped on phones.
// Keep all days, but allow horizontal scroll with a readable minimum width.
const _daySize = Math.max(_baseDaySize, 64);
const _hourSize = Math.max(_daySize * 1.35, 78);
const _extraPaddingBottom = _hourSize;
const _startOfDay = dayjs().startOf('day').set('hour', 0).set('minute', 0);
const _hourBlocks = [...Array(25).keys()].map((hour) => _startOfDay.add(hour, 'hour'));

Animated.addWhitelistedNativeProps?.({
  contentOffset: true,
});

const AnimatedFlashList = Animated.createAnimatedComponent<FlashListProps<DayBlock>>(FlashList);

function _formatLocalYyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function _getStartOfWeek(date: Date) {
  // Israel typically starts week on Sunday (0)
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 (Sun) -> 6 (Sat)
  d.setDate(d.getDate() - day);
  return d;
}

function _buildDays(start: Date, count: number): DayBlock[] {
  const out: DayBlock[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    d.setHours(0, 0, 0, 0);
    out.push({ date: d, formatted: _formatLocalYyyyMmDd(d) });
  }
  return out;
}

function _safeIntl(locale: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return null;
  }
}

function _hebrewHeaderParts(date: Date) {
  const fmt =
    _safeIntl('he-IL-u-ca-hebrew', { weekday: 'short', day: 'numeric' }) ||
    _safeIntl('he-IL', { weekday: 'short', day: 'numeric' });
  if (!fmt?.formatToParts) {
    const raw = fmt?.format(date) ?? '';
    return { dayNum: raw, weekday: '' };
  }
  const parts = fmt.formatToParts(date);
  const dayNum = parts.find((p) => p.type === 'day')?.value ?? '';
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  return { dayNum, weekday };
}

function _formatGregorianMonthYear(date: Date) {
  // Keep Hebrew UI, but force Gregorian calendar ("לועזי")
  const fmt =
    _safeIntl('he-IL-u-ca-gregory', { month: 'long', year: 'numeric' }) ||
    _safeIntl('he-IL', { month: 'long', year: 'numeric' });
  return fmt?.format(date) ?? '';
}

function _formatHebrewTimeLabel(date: Date) {
  const fmt =
    _safeIntl('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) ||
    _safeIntl('he-IL', { hour: '2-digit', minute: '2-digit' });
  return fmt?.format(date) ?? '';
}

const HeaderDay = memo(({ day }: { day: DayBlock }) => {
  const { dayNum, weekday } = _hebrewHeaderParts(day.date);
  return (
    <View
      style={[
        {
          alignItems: 'center',
          justifyContent: 'flex-end',
          width: _daySize,
          height: _hourSize,
        },
        weekStyles.borderRight,
        weekStyles.borderBottom,
      ]}
    >
      <Text style={{ fontWeight: '800', fontSize: 22, writingDirection: 'rtl' }}>{dayNum}</Text>
      <Text style={{ writingDirection: 'rtl' }}>{weekday}</Text>
    </View>
  );
});

const WeekDayColumn = memo(
  ({
    day,
    index,
    appts,
    onPressAppointment,
    minutesFromMidnight,
  }: {
    day: DayBlock;
    index: number;
    appts: AvailableTimeSlot[];
    onPressAppointment: (apt: AvailableTimeSlot) => void;
    minutesFromMidnight: (time?: string | null) => number;
  }) => {
    return (
      <View
        style={[
          {
            width: _daySize,
            backgroundColor: index % 2 === 1 ? '#f6f6f6' : '#fff',
          },
          weekStyles.borderRight,
        ]}
      >
        <View style={{ height: _hourSize * 24, position: 'relative' }}>
          {_hourBlocks.map((hourBlock, i) => {
            const hourDate = hourBlock.toDate();
            return (
              <View
                key={`day-${day.formatted}-hour-${i}`}
                style={[
                  {
                    height: _hourSize,
                    justifyContent: 'flex-start',
                    alignItems: 'flex-end',
                    padding: 2,
                  },
                  weekStyles.borderBottom,
                ]}
              >
                <Text style={{ fontSize: 10, opacity: 0.08, writingDirection: 'rtl' }}>
                  {_formatHebrewTimeLabel(hourDate)}
                </Text>
              </View>
            );
          })}

          {appts.map((apt) => {
            const aptMinutes = minutesFromMidnight(apt.slot_time);
            const durationMinutes = apt.duration_minutes || 30;
            const top = (aptMinutes / 60) * _hourSize;
            const height = (durationMinutes / 60) * _hourSize;
            const clientName = apt.client_name || 'לקוח';
            const serviceName = apt.service_name || 'שירות';
            return (
              <PressableScale
                key={`wk-${apt.id}-${apt.slot_date}-${apt.slot_time}`}
                onPress={() => onPressAppointment(apt)}
                style={[
                  weekStyles.weekAptCard,
                  {
                    top: Math.max(0, top + 2),
                    height: Math.max(42, height - 4),
                    left: 4,
                    right: 4,
                  },
                ]}
              >
                <BlurView intensity={85} tint="light" style={weekStyles.weekAptBlur} />
                <View style={weekStyles.weekAptTint} />
                <View style={weekStyles.weekAptInner}>
                  <Text numberOfLines={1} style={weekStyles.weekAptClient}>
                    {clientName}
                  </Text>
                  <Text numberOfLines={1} style={weekStyles.weekAptService}>
                    {serviceName}
                  </Text>
                  <View style={weekStyles.weekAptMetaRow}>
                    {!!apt.slot_time && (
                      <Text numberOfLines={1} style={weekStyles.weekAptTime}>
                        {_formatHebrewTimeLabel(new Date(`${apt.slot_date}T${apt.slot_time}`))}
                      </Text>
                    )}
                    <Ionicons name="time-outline" size={12} color="#6B7280" />
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </View>
    );
  }
);

export default function AdminAppointmentsScreen() {
  const { t } = useTranslation();
  const isRtl = I18nManager.isRTL;
  const user = useAuthStore((state) => state.user);
  const { colors: businessColors } = useBusinessColors();
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [appointments, setAppointments] = useState<AvailableTimeSlot[]>([]);
  const [dayStart, setDayStart] = useState<string>('07:00');
  const [dayEnd, setDayEnd] = useState<string>('21:00');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AvailableTimeSlot | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());
  const [showActionsModal, setShowActionsModal] = useState<boolean>(false);
  const [actionsAppointment, setActionsAppointment] = useState<AvailableTimeSlot | null>(null);
  const [rangeAppointments, setRangeAppointments] = useState<Map<string, AvailableTimeSlot[]>>(new Map());


  const scrollRef = useRef<ScrollView | null>(null);

  const selectedDateStr = useMemo(() => {
    // Build YYYY-MM-DD in local time to avoid UTC shift
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  const loadAppointmentsForDate = useCallback(async (dateString: string, isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setIsLoading(true);
      }

      // Fix any existing appointments with null service_name first
      await businessHoursApi.fixNullServiceNames();

      // Ensure slots exist for the day (idempotent and will not override booked ones)
      await businessHoursApi.generateTimeSlotsForDate(dateString);

      let query = supabase
        .from('appointments')
        .select('*')
        .eq('slot_date', dateString)
        .eq('is_available', false); // booked only

      // סינון לפי המשתמש הנוכחי - רק תורים שהוא יצר
      if (user?.id) {
        query = query.eq('barber_id', user.id);
      }

      const { data, error } = await query.order('slot_time', { ascending: true });

      if (error) {
        console.error('Error loading appointments for date:', error);
        setAppointments([]);
      } else {
        setAppointments((data as unknown as AvailableTimeSlot[]) || []);
      }
    } catch (e) {
      console.error('Error in loadAppointmentsForDate:', e);
      setAppointments([]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  const loadAppointmentsForRange = useCallback(
    async (startDateStr: string, endDateStr: string) => {
      try {
        if (!user?.id) {
          setRangeAppointments(new Map());
          return;
        }
        const { data, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('is_available', false)
          .eq('barber_id', user.id)
          .gte('slot_date', startDateStr)
          .lte('slot_date', endDateStr)
          .order('slot_date', { ascending: true })
          .order('slot_time', { ascending: true });

        if (error) {
          console.error('Error loading range appointments:', error);
          setRangeAppointments(new Map());
          return;
        }

        const map = new Map<string, AvailableTimeSlot[]>();
        ((data as unknown as AvailableTimeSlot[]) || []).forEach((apt) => {
          const key = (apt as any).slot_date as string;
          if (!key) return;
          const arr = map.get(key) ?? [];
          arr.push(apt);
          map.set(key, arr);
        });
        setRangeAppointments(map);
      } catch (e) {
        console.error('Error in loadAppointmentsForRange:', e);
        setRangeAppointments(new Map());
      }
    },
    [user?.id]
  );

  useEffect(() => {
    // Load business hours for selected day to drive the grid
    const loadBH = async () => {
      try {
        const dow = selectedDate.getDay();
        const businessId = getBusinessId();

        // Prefer user-specific hours for this day, then fallback to business default (user_id null)
        let start: string | null = null;
        let end: string | null = null;

        if (user?.id) {
          const { data: bhUser, error: eUser } = await supabase
            .from('business_hours')
            .select('start_time,end_time,is_active')
            .eq('business_id', businessId)
            .eq('day_of_week', dow)
            .eq('user_id', user.id)
            .maybeSingle();
          if (!eUser && bhUser && bhUser.is_active) {
            start = (bhUser.start_time as any) ?? null;
            end = (bhUser.end_time as any) ?? null;
          }
        }

        if (!start || !end) {
          const { data: bhGlobal } = await supabase
            .from('business_hours')
            .select('start_time,end_time,is_active')
            .eq('business_id', businessId)
            .eq('day_of_week', dow)
            .is('user_id', null)
            .maybeSingle();
          if (bhGlobal && bhGlobal.is_active) {
            start = (start ?? (bhGlobal.start_time as any)) ?? null;
            end = (end ?? (bhGlobal.end_time as any)) ?? null;
          }
        }

        setDayStart((start as string) || '07:00');
        setDayEnd((end as string) || '21:00');
      } catch (e) {
        setDayStart('07:00');
        setDayEnd('21:00');
      }
    };
    loadBH();
    loadAppointmentsForDate(selectedDateStr);
  }, [selectedDate, selectedDateStr, loadAppointmentsForDate]);

  // Load marked dates (days with at least one booked appointment) for the current month
  useEffect(() => {
    const loadMonthMarks = async () => {
      try {
        // If no logged-in user, do not show any marks
        if (!user?.id) {
          setMarkedDates(new Set());
          return;
        }

        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstOfMonth = new Date(year, month, 1);
        firstOfMonth.setHours(0, 0, 0, 0);
        const firstOfNextMonth = new Date(year, month + 1, 1);
        firstOfNextMonth.setHours(0, 0, 0, 0);

        const fmt = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const da = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${da}`;
        };

        const { data, error } = await supabase
          .from('appointments')
          .select('slot_date')
          .eq('is_available', false)
          .eq('barber_id', user.id)
          .gte('slot_date', fmt(firstOfMonth))
          .lt('slot_date', fmt(firstOfNextMonth));

        if (error) {
          console.error('Error loading month marks:', error);
          setMarkedDates(new Set());
          return;
        }

        const unique = new Set<string>((data as any[] | null)?.map((r: any) => r.slot_date) || []);
        setMarkedDates(unique);
      } catch (e) {
        console.error('Error in loadMonthMarks:', e);
        setMarkedDates(new Set());
      }
    };
    loadMonthMarks();
  }, [selectedDate.getFullYear(), selectedDate.getMonth(), user?.id]);

  // Scroll to morning by default for convenience
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedDateStr, dayStart]);

  const onRefresh = useCallback(() => {
    loadAppointmentsForDate(selectedDateStr, true);
  }, [loadAppointmentsForDate, selectedDateStr]);

  // Helpers for the time grid
  const minutesFromMidnight = (time?: string | null): number => {
    if (!time) return 0;
    const parts = String(time).split(':');
    const hh = parseInt(parts[0] || '0', 10);
    const mm = parseInt(parts[1] || '0', 10);
    return hh * 60 + mm;
  };

  const formatTime = (time?: string | null): string => {
    if (!time) return '';
    return formatTime12Hour(time);
  };

  const addMinutes = (hhmm: string, minutes: number): string => {
    const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
    const total = h * 60 + m + minutes;
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const compareTimes = (a: string, b: string) => a.localeCompare(b);

  const halfHourLabels = useMemo(() => {
    const labels: string[] = [];
    let t = dayStart;
    while (compareTimes(t, dayEnd) < 0) {
      labels.push(formatTime(t));
      t = addMinutes(t, 30);
    }
    return labels;
  }, [dayStart, dayEnd]);

  const weekDays = useMemo(() => {
    const start = _getStartOfWeek(selectedDate);
    // show 30 days like the sample so you can pan forward
    return _buildDays(start, 30);
  }, [selectedDateStr]);

  useEffect(() => {
    if (viewMode !== 'week') return;
    if (weekDays.length === 0) return;
    void loadAppointmentsForRange(weekDays[0]!.formatted, weekDays[weekDays.length - 1]!.formatted);
  }, [viewMode, weekDays, loadAppointmentsForRange]);

  const hoursScrollViewRef = useAnimatedRef<any>();
  const scrollX = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const onScrollX = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  const headerStylez = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: -scrollX.value }],
    };
  });
  const onScrollY = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    setNativeProps(hoursScrollViewRef, {
      contentOffset: { x: 0, y: scrollY.value },
    });
  });

  // Actions
  const startPhoneCall = useCallback(async (rawPhone?: string | null) => {
    if (!rawPhone) {
      Alert.alert(t('appointments.noPhone.title','No phone number'), t('appointments.noPhone.message','No valid phone number was found for this client.'));
      return;
    }
    // Sanitize phone: keep + and digits
    const phone = rawPhone.trim().replace(/[^+\d]/g, '');
    if (!phone) {
      Alert.alert(t('appointments.noPhone.title','No phone number'), t('appointments.noPhone.message','No valid phone number was found for this client.'));
      return;
    }

    const iosUrl = `tel:${phone}`; // iOS handles confirmation UI
    const androidUrl = `tel:${phone}`;
    const url = Platform.OS === 'android' ? androidUrl : iosUrl;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(t('error.generic','Error'), t('common.phoneOpenFailed','Unable to open the dialer on this device'));
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.error('Failed to initiate phone call:', e);
      Alert.alert(t('error.generic','Error'), t('common.phoneOpenFailed','Unable to open the dialer on this device'));
    }
  }, []);

  const askCancelAppointment = useCallback((apt: AvailableTimeSlot) => {
    // Ensure immediate responsiveness between consecutive presses
    setSelectedAppointment(apt);
    setShowCancelModal(true);
  }, []);

  const openActionsMenu = useCallback((apt: AvailableTimeSlot) => {
    setActionsAppointment(apt);
    setShowActionsModal(true);
  }, []);

  const closeActionsMenu = useCallback(() => {
    setShowActionsModal(false);
    setActionsAppointment(null);
  }, []);

  const confirmCancelAppointment = useCallback(async () => {
    if (!selectedAppointment) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          is_available: true,
          client_name: null,
          client_phone: null,
          service_name: 'Available Slot', // Set to default value instead of null
        })
        .eq('id', selectedAppointment.id)
        .eq('is_available', false);

      if (error) {
        console.error('Error canceling appointment:', error);
      } else {
        setAppointments((prev) => prev.filter((a) => a.id !== selectedAppointment.id));
        setShowCancelModal(false);
        setSelectedAppointment(null);
      }
    } catch (e) {
      console.error('Error in confirmCancelAppointment:', e);
    } finally {
      setIsCancelling(false);
    }
  }, [selectedAppointment]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('appointments.title','Appointments')}</Text>
        <View style={styles.monthSwitcher}>
          <TouchableOpacity onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(1);
            d.setMonth(d.getMonth() - 1);
            d.setHours(0,0,0,0);
            setSelectedDate(d);
          }} style={styles.monthNavBtn} activeOpacity={0.7}>
            <ChevronLeft size={16} color={'#1C1C1E'} />
          </TouchableOpacity>
          <Text style={[styles.monthText, { writingDirection: isRtl ? 'rtl' : 'ltr' }]}>
            {_formatGregorianMonthYear(selectedDate) || (() => {
              const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
              return `${months[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
            })()}
          </Text>
          <TouchableOpacity onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(1);
            d.setMonth(d.getMonth() + 1);
            d.setHours(0,0,0,0);
            setSelectedDate(d);
          }} style={styles.monthNavBtn} activeOpacity={0.7}>
            <ChevronRight size={16} color={'#1C1C1E'} />
          </TouchableOpacity>
        </View>
      </View>

      <DaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} mode={'month'} markedDates={markedDates} />

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.text} />
          <Text style={styles.loadingText}>{t('admin.appointments.loadingForDate','Loading appointments for {{date}}...', { date: selectedDateStr })}</Text>
        </View>
      ) : (
        <>
          <View style={styles.viewModeRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setViewMode('week')}
              style={[styles.viewModeBtn, viewMode === 'week' && styles.viewModeBtnActive]}
            >
              <Text style={[styles.viewModeText, viewMode === 'week' && styles.viewModeTextActive, { writingDirection: 'rtl' }]}>
                שבוע
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setViewMode('day')}
              style={[styles.viewModeBtn, viewMode === 'day' && styles.viewModeBtnActive]}
            >
              <Text style={[styles.viewModeText, viewMode === 'day' && styles.viewModeTextActive, { writingDirection: 'rtl' }]}>
                יום
              </Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'week' ? (
            <View style={weekStyles.container}>
              <View style={weekStyles.row}>
                <Animated.ScrollView
                  ref={hoursScrollViewRef}
                  style={[weekStyles.hoursCol, { marginTop: _hourSize - 9 }]}
                  contentContainerStyle={{ paddingBottom: _extraPaddingBottom * 10 }}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                >
                  {_hourBlocks.map((hourBlock, idx) => {
                    const hourDate = hourBlock.toDate();
                    return (
                      <View key={`wk-hour-${idx}`} style={weekStyles.hourRow}>
                        <Text style={weekStyles.hourText}>{_formatHebrewTimeLabel(hourDate)}</Text>
                      </View>
                    );
                  })}
                </Animated.ScrollView>

                <View style={weekStyles.gridOuter}>
                  <Animated.View style={[weekStyles.headerRow, headerStylez]}>
                    {weekDays.map((d) => (
                      <HeaderDay day={d} key={`hdr-${d.formatted}`} />
                    ))}
                  </Animated.View>

                  <Animated.ScrollView
                    bounces={false}
                    onScroll={onScrollY}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: _extraPaddingBottom }}
                  >
                    <AnimatedFlashList
                      data={weekDays}
                      horizontal
                      keyExtractor={(item) => item.formatted}
                      estimatedItemSize={_hourSize}
                      snapToInterval={_daySize * 2}
                      decelerationRate={'fast'}
                      bounces={false}
                      contentContainerStyle={{ paddingBottom: _extraPaddingBottom }}
                      showsHorizontalScrollIndicator={false}
                      renderItem={({ item, index }) => (
                        <WeekDayColumn
                          day={item}
                          index={index}
                          appts={rangeAppointments.get(item.formatted) ?? []}
                          onPressAppointment={openActionsMenu}
                          minutesFromMidnight={minutesFromMidnight}
                        />
                      )}
                      onScroll={onScrollX}
                      scrollEventThrottle={16}
                    />
                  </Animated.ScrollView>
                </View>
              </View>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="always"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[Colors.text]}
                  tintColor={Colors.text}
                  title={t('refreshing','Refreshing...')}
                  titleColor={Colors.text}
                />
              }
            >
              <View style={styles.timelineContainer}>
                {/* Grid rows for each 30 minutes */}
                {halfHourLabels.map((label, idx) => (
                  <View key={idx} style={[styles.gridRow, { height: HALF_HOUR_BLOCK_HEIGHT }]}>
                    <Text style={styles.timeLabel} numberOfLines={1} adjustsFontSizeToFit={true}>
                      {label}
                    </Text>
                    <View style={styles.gridLine} />
                  </View>
                ))}

                {/* Appointments overlay */}
                <View pointerEvents="box-none" style={[styles.overlayContainer, { height: halfHourLabels.length * HALF_HOUR_BLOCK_HEIGHT }]}>
                  {appointments.map((apt) => {
                    // Calculate exact position using minutes from midnight
                    const aptMinutes = minutesFromMidnight(apt.slot_time);
                    const dayStartMinutes = minutesFromMidnight(dayStart);

                    // Calculate the exact offset in minutes from day start
                    const offsetMinutes = aptMinutes - dayStartMinutes;

                    // Convert to precise grid position (30-min per row)
                    // Grid line is centered in each row, so add half-row to align to the line
                    const top = (offsetMinutes / 30) * HALF_HOUR_BLOCK_HEIGHT + HALF_HOUR_BLOCK_HEIGHT / 2;

                    // Calculate height based on duration
                    const durationMinutes = apt.duration_minutes || 30;
                    const height = (durationMinutes / 30) * HALF_HOUR_BLOCK_HEIGHT;

                    const startTime = formatTime(apt.slot_time);
                    const endTime = formatTime(addMinutes(apt.slot_time, durationMinutes));

                    return (
                      <PressableScale
                        key={`${apt.id}-${apt.slot_time}`}
                        onPress={() => openActionsMenu(apt)}
                        accessibilityLabel={t('admin.appointments.openActions','Open appointment actions')}
                        style={[
                          styles.appointmentCard,
                          {
                            top,
                            height,
                            left: LABELS_WIDTH + 8,
                            right: 8,
                          },
                        ]}
                      >
                        {/* Strong blur background */}
                        <BlurView intensity={95} tint="light" style={styles.appointmentBlur} />
                        <View style={styles.appointmentBlurTint} />
                        {/* Accent bar removed per request */}

                        {/* Content */}
                        <View style={styles.appointmentInner}>
                          <View style={styles.infoContainer}>
                            <BlurView intensity={28} tint="light" style={styles.pillBlur} />
                            <View style={styles.pillTint} />

                            {/* Title row with green check icon on the right */}
                            <View style={styles.titleRow}>
                              <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.titleText, styles.titleTextFlex]}>
                                {[apt.client_name || 'לקוח', apt.service_name || 'שירות'].filter(Boolean).join(' - ')}
                              </Text>
                              <CheckCircle size={18} color="#34C759" />
                            </View>

                            {/* Time range row with grey rounded background */}
                            <View style={styles.durationRow}>
                              <Text numberOfLines={1} style={styles.durationText}>
                                {`${startTime} - ${endTime}`}
                              </Text>
                              <Ionicons name="time-outline" size={16} color="#8E8E93" />
                            </View>
                          </View>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>

              {appointments.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>{t('admin.appointments.emptyTitle','No appointments for this day')}</Text>
                  <Text style={styles.emptySubtitle}>{t('admin.appointments.emptySubtitle','Choose another day from the top bar')}</Text>
                </View>
              )}
            </ScrollView>
          )}
        </>
      )}

      {/* Actions menu modal */}
      <Modal
        visible={showActionsModal}
        transparent
        animationType="fade"
        onRequestClose={closeActionsMenu}
      >
        <View style={styles.actionsOverlay}>
          <View style={styles.actionsSheet}>
            <Text style={styles.actionsTitle}>{t('admin.appointments.chooseAction','Choose an action')}</Text>
            {!!actionsAppointment?.client_phone && (
              <PressableScale
                style={styles.actionsOption}
                accessibilityLabel={t('admin.appointments.callClient','Call client')}
                onPress={async () => {
                  const phone = actionsAppointment?.client_phone;
                  closeActionsMenu();
                  if (phone) await startPhoneCall(phone);
                }}
              >
                <View style={[styles.actionsIconCircle, { backgroundColor: '#E8F0FF' }]}>
                  <Ionicons name="call" size={18} color="#0A84FF" />
                </View>
                <Text style={styles.actionsOptionText}>{t('admin.appointments.callClient','Call client')}</Text>
              </PressableScale>
            )}
            <View style={styles.actionsDivider} />
            <PressableScale
              style={styles.actionsOption}
              accessibilityLabel={t('appointments.cancel.title','Cancel Appointment')}
              onPress={() => {
                if (actionsAppointment) {
                  askCancelAppointment(actionsAppointment);
                }
                closeActionsMenu();
              }}
            >
              <View style={[styles.actionsIconCircle, { backgroundColor: '#FFECEC' }]}>
                <Ionicons name="close" size={18} color="#FF3B30" />
              </View>
              <Text style={[styles.actionsOptionText, { color: Colors.error }]}>{t('appointments.cancel.title','Cancel Appointment')}</Text>
            </PressableScale>
            <PressableScale
              style={styles.actionsCancelButton}
              accessibilityLabel={t('close','Close')}
              onPress={closeActionsMenu}
            >
              <Text style={styles.actionsCancelText}>{t('close','Close')}</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>

      {/* iOS-style confirmation modal */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCancelModal(false);
          setSelectedAppointment(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.iosAlertContainer}>
            <Text style={styles.iosAlertTitle}>{t('appointments.cancel.title','Cancel Appointment')}</Text>
            <Text style={styles.iosAlertMessage}>
              {t('admin.appointments.cancelMessage','This will free the time and remove the client details for the selected appointment.')}
            </Text>
            <View style={styles.iosAlertButtonsRow}>
              <TouchableOpacity
                style={styles.iosAlertButton}
                activeOpacity={0.8}
                onPress={() => {
                  setShowCancelModal(false);
                  setSelectedAppointment(null);
                }}
                disabled={isCancelling}
              >
                <Text style={styles.iosAlertButtonDefaultText}>{t('cancel','Cancel')}</Text>
              </TouchableOpacity>
              <View style={styles.iosAlertButtonDivider} />
              <TouchableOpacity
                style={styles.iosAlertButton}
                activeOpacity={0.8}
                onPress={confirmCancelAppointment}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Text style={styles.iosAlertButtonDestructiveText}>{t('confirm','Confirm')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Layout constants for the time grid
const HOUR_BLOCK_HEIGHT = 180; // Further increase spacing per hour for larger proportions
const HALF_HOUR_BLOCK_HEIGHT = HOUR_BLOCK_HEIGHT / 2; // 30-min rows
const LABELS_WIDTH = 64; // left column width for time labels

// Labels are built dynamically from business hours per selected day

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    marginRight: 8,
  },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  monthText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 14,
  },
  monthNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  pickDayBtn: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  pickDayText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 14,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.subtext,
  },
  scroll: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  viewModeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: Colors.white,
  },
  viewModeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  viewModeBtnActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  viewModeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  viewModeTextActive: {
    color: '#FFFFFF',
  },
  timelineContainer: {
    marginTop: 8,
    marginHorizontal: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeLabel: {
    width: LABELS_WIDTH,
    textAlign: 'left',
    paddingLeft: 8,
    color: Colors.subtext,
    fontSize: 14,
    fontWeight: '700',
    minWidth: LABELS_WIDTH,
  },
  gridLine: {
    height: 1,
    backgroundColor: '#E5E5EA',
    flex: 1,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingLeft: LABELS_WIDTH + 12,
    paddingRight: 12,
  },
  appointmentCard: {
    position: 'absolute',
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3A3A3C',
    borderRadius: 14,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'flex-start',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 52,
    overflow: 'hidden',
  },
  appointmentBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    overflow: 'hidden',
  },
  appointmentBlurTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: 'rgba(242,242,247,0.9)',
  },
  appointmentFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  pillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  appointmentAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  appointmentInner: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    paddingRight: 16,
  },
  appointmentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 6,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  timePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  serviceTitle: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  clientRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appointmentClientText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  clientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  clientPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  servicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  pillBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  servicePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  // New compact info container: title and duration on blur background
  infoContainer: {
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 2,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  titleTextFlex: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 0,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  appointmentActions: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 20,
    elevation: 20,
  },
  phoneButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cancelButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appointmentTime: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '800',
    marginBottom: 2,
    textAlign: 'left',
  },
  appointmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  appointmentTimeInline: {
    marginBottom: 0,
    marginRight: 8,
  },
  appointmentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'left',
  },
  appointmentTitleInline: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'left',
    flexShrink: 1,
  },
  appointmentClient: {
    fontSize: 12,
    color: '#666',
    textAlign: 'left',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.subtext,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 24,
  },
  actionsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.25)'
  },
  actionsSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: Colors.white,
    paddingTop: 12,
    paddingBottom: 26,
    paddingHorizontal: 16,
  },
  actionsTitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  actionsOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
  actionsOptionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
  },
  actionsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginHorizontal: -16,
  },
  actionsIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsCancelButton: {
    marginTop: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  actionsCancelText: {
    fontSize: 16,
    color: '#0A84FF',
    fontWeight: '800',
  },
  moreButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosAlertContainer: {
    width: 300,
    borderRadius: 14,
    backgroundColor: Colors.white,
    overflow: 'hidden',
    paddingTop: 16,
  },
  iosAlertTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  iosAlertMessage: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'center',
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  iosAlertButtonsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
  },
  iosAlertButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  iosAlertButtonDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#D1D1D6',
  },
  iosAlertButtonDefaultText: {
    fontSize: 17,
    color: '#0A84FF',
    fontWeight: '600',
  },
  iosAlertButtonDestructiveText: {
    fontSize: 17,
    color: '#FF3B30',
    fontWeight: '700',
  },
});

const weekStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  hoursCol: {
    width: _daySize,
    flexGrow: 0,
  },
  hourRow: {
    height: _hourSize,
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  hourText: {
    fontWeight: '800',
    opacity: 0.22,
    fontSize: 12,
    writingDirection: 'rtl',
  },
  gridOuter: {
    flex: 1,
    overflow: 'hidden',
    borderLeftColor: '#ddd',
    borderLeftWidth: 1,
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
  },
  borderBottom: {
    borderBottomColor: '#ddd',
    borderBottomWidth: 1,
  },
  borderRight: {
    borderRightColor: '#ddd',
    borderRightWidth: 1,
  },
  weekAptCard: {
    position: 'absolute',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  weekAptBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: 'hidden',
  },
  weekAptTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  weekAptInner: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  weekAptClient: {
    fontSize: 13,
    fontWeight: '900',
    color: '#000',
    writingDirection: 'rtl',
  },
  weekAptService: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    opacity: 0.9,
    writingDirection: 'rtl',
  },
  weekAptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekAptTime: {
    fontSize: 12,
    fontWeight: '900',
    color: '#374151',
    writingDirection: 'rtl',
  },
});


