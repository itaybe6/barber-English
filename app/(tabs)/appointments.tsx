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
  TextInput,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Colors from '@/constants/colors';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import DaySelector from '@/components/DaySelector';
import { AvailableTimeSlot, supabase, getBusinessId, type CalendarReminder } from '@/lib/supabase';
import {
  listCalendarRemindersForDate,
  listCalendarRemindersForRange,
  createCalendarReminder,
  updateCalendarReminder,
  deleteCalendarReminder,
  listCalendarReminderDatesInMonth,
  CALENDAR_REMINDER_COLOR_KEYS,
  type CalendarReminderColorKey,
} from '@/lib/api/calendarReminders';
import { businessHoursApi } from '@/lib/api/businessHours';
import { checkWaitlistAndNotify, notifyServiceWaitlistClients } from '@/lib/api/waitlistNotifications';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { ChevronLeft, ChevronRight, CheckCircle, Plus, StickyNote } from 'lucide-react-native';
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

/** תצוגות בסגנון Google Calendar */
type CalendarViewMode = 'schedule' | 'day' | 'threeDay' | 'week' | 'month';

const GC_BLUE = '#1A73E8';
const GC_SURFACE = '#FFFFFF';
const GC_PAGE_BG = '#F8F9FA';

function ThreeDayMenuIcon({ color }: { color: string }) {
  const h = 18;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: h }}>
      {[0.55, 0.95, 0.7].map((f, i) => (
        <View
          key={i}
          style={{
            width: 5,
            height: Math.max(8, h * f),
            borderRadius: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

function WeekMenuIcon({ color }: { color: string }) {
  const h = 18;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: h }}>
      {[0.5, 0.85, 0.65, 0.9].map((f, i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: Math.max(7, h * f),
            borderRadius: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

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

const HeaderDay = memo(
  ({ day, columnWidth, headerHeight, isSelected, isToday, onPress }: { day: DayBlock; columnWidth: number; headerHeight: number; isSelected: boolean; isToday?: boolean; onPress?: () => void }) => {
    const { dayNum, weekday } = _hebrewHeaderParts(day.date);
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.75 : 1}
        style={[
          {
            alignItems: 'center',
            justifyContent: 'center',
            width: columnWidth,
            height: headerHeight,
            paddingBottom: 6,
            paddingTop: 6,
            backgroundColor: isSelected ? '#F0F4FF' : 'transparent',
          },
          weekStyles.borderRight,
          weekStyles.borderBottom,
        ]}
      >
        <Text style={[weekStyles.headerWeekday, { writingDirection: 'rtl', color: isSelected ? GC_BLUE : '#5F6368' }]}>{weekday}</Text>
        <View style={[
          weekStyles.headerDayCircle,
          isToday && weekStyles.headerDayCircleToday,
          isSelected && weekStyles.headerDayCircleSelected,
        ]}>
          <Text
            style={[
              weekStyles.headerDayNum,
              { writingDirection: 'rtl' },
              isToday && weekStyles.headerDayNumToday,
              isSelected && weekStyles.headerDayNumSelected,
            ]}
          >
            {dayNum}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
);

const WeekDayColumn = memo(
  ({
    day,
    index,
    appts,
    reminders,
    columnWidth,
    hourRowHeight,
    onPressAppointment,
    onPressReminder,
    minutesFromMidnight,
  }: {
    day: DayBlock;
    index: number;
    appts: AvailableTimeSlot[];
    reminders: CalendarReminder[];
    columnWidth: number;
    hourRowHeight: number;
    onPressAppointment: (apt: AvailableTimeSlot) => void;
    onPressReminder: (r: CalendarReminder) => void;
    minutesFromMidnight: (time?: string | null) => number;
  }) => {
    return (
      <View
        style={[
          {
            width: columnWidth,
            backgroundColor: index % 2 === 1 ? '#F3F4F6' : GC_SURFACE,
          },
          weekStyles.borderRight,
        ]}
      >
        <View style={{ height: hourRowHeight * 24, position: 'relative' }}>
          {_hourBlocks.map((hourBlock, i) => {
            const hourDate = hourBlock.toDate();
            return (
              <View
                key={`day-${day.formatted}-hour-${i}`}
                style={[
                  {
                    height: hourRowHeight,
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

          {reminders.map((r) => {
            const startM = minutesFromMidnight(r.start_time);
            const durationMinutes = r.duration_minutes || 30;
            const top = (startM / 60) * hourRowHeight;
            const height = (durationMinutes / 60) * hourRowHeight;
            const pal = reminderPalette(r.color_key);
            return (
              <PressableScale
                key={`wk-rm-${r.id}`}
                onPress={() => onPressReminder(r)}
                style={[
                  weekStyles.weekReminderCard,
                  {
                    top: Math.max(0, top + 2),
                    height: Math.max(36, height - 4),
                    left: 4,
                    right: 4,
                    zIndex: 1,
                    elevation: 1,
                    backgroundColor: pal.bg,
                    borderLeftColor: pal.bar,
                  },
                ]}
              >
                <View style={weekStyles.weekReminderRow}>
                  <StickyNote size={11} color={pal.bar} />
                  <Text numberOfLines={2} style={[weekStyles.weekReminderTitle, { color: '#1C1C1E' }]}>
                    {r.title}
                  </Text>
                </View>
              </PressableScale>
            );
          })}

          {appts.map((apt) => {
            const aptMinutes = minutesFromMidnight(apt.slot_time);
            const durationMinutes = apt.duration_minutes || 30;
            const top = (aptMinutes / 60) * hourRowHeight;
            const height = (durationMinutes / 60) * hourRowHeight;
            const clientName = apt.client_name || 'לקוח';
            const serviceName = apt.service_name || 'שירות';
            const hasPhone = !!apt.client_phone;
            const cardHeight = Math.max(40, height - 4);
            return (
              <PressableScale
                key={`wk-${apt.id}-${apt.slot_date}-${apt.slot_time}`}
                onPress={() => onPressAppointment(apt)}
                style={[
                  weekStyles.weekAptCard,
                  {
                    top: Math.max(0, top + 2),
                    height: cardHeight,
                    left: 3,
                    right: 3,
                    zIndex: 2,
                    elevation: 3,
                  },
                ]}
              >
                <View style={weekStyles.weekAptAccent} />
                <View style={weekStyles.weekAptInner}>
                  <View style={weekStyles.weekAptHeaderRow}>
                    <Text numberOfLines={1} style={weekStyles.weekAptClient}>
                      {clientName}
                    </Text>
                    {hasPhone && (
                      <Ionicons name="call-outline" size={9} color={GC_BLUE} />
                    )}
                  </View>
                  {cardHeight >= 38 && (
                    <Text numberOfLines={1} style={weekStyles.weekAptService}>
                      {serviceName}
                    </Text>
                  )}
                  {cardHeight >= 56 && !!apt.slot_time && (
                    <View style={weekStyles.weekAptMetaRow}>
                      <Ionicons name="time-outline" size={9} color="#6B7280" />
                      <Text numberOfLines={1} style={weekStyles.weekAptTime}>
                        {_formatHebrewTimeLabel(new Date(`${apt.slot_date}T${apt.slot_time}`))}
                      </Text>
                    </View>
                  )}
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
  const { t, i18n } = useTranslation();
  /** Hebrew UI for admin cancel/delete flows (per product requirement) */
  const tHe = useCallback(
    (key: string, fallback: string) => String(i18n.t(key, { lng: 'he', defaultValue: fallback })),
    [i18n]
  );
  const isRtl = I18nManager.isRTL;
  const user = useAuthStore((state) => state.user);
  const { colors: businessColors } = useBusinessColors();
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('week');
  const [showViewMenu, setShowViewMenu] = useState(false);
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
  const [calendarReminders, setCalendarReminders] = useState<CalendarReminder[]>([]);
  const [rangeReminders, setRangeReminders] = useState<Map<string, CalendarReminder[]>>(new Map());

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<CalendarReminder | null>(null);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderNotes, setReminderNotes] = useState('');
  const [reminderTimeDate, setReminderTimeDate] = useState<Date>(() => new Date());
  const [reminderDuration, setReminderDuration] = useState(30);
  const [reminderColorKey, setReminderColorKey] = useState<CalendarReminderColorKey>('blue');
  const [showReminderAndroidTime, setShowReminderAndroidTime] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [deletingReminder, setDeletingReminder] = useState(false);

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

      if (user?.id) {
        const rem = await listCalendarRemindersForDate(dateString, user.id);
        setCalendarReminders(rem);
      } else {
        setCalendarReminders([]);
      }
    } catch (e) {
      console.error('Error in loadAppointmentsForDate:', e);
      setAppointments([]);
      setCalendarReminders([]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [user?.id]);

  const loadAppointmentsForRange = useCallback(
    async (startDateStr: string, endDateStr: string) => {
      try {
        if (!user?.id) {
          setRangeAppointments(new Map());
          setRangeReminders(new Map());
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
          setRangeReminders(new Map());
        } else {
          const map = new Map<string, AvailableTimeSlot[]>();
          ((data as unknown as AvailableTimeSlot[]) || []).forEach((apt) => {
            const key = (apt as any).slot_date as string;
            if (!key) return;
            const arr = map.get(key) ?? [];
            arr.push(apt);
            map.set(key, arr);
          });
          setRangeAppointments(map);
        }

        const remList = await listCalendarRemindersForRange(startDateStr, endDateStr, user.id);
        const rmap = new Map<string, CalendarReminder[]>();
        remList.forEach((r) => {
          const key = r.event_date;
          if (!key) return;
          const arr = rmap.get(key) ?? [];
          arr.push(r);
          rmap.set(key, arr);
        });
        setRangeReminders(rmap);
      } catch (e) {
        console.error('Error in loadAppointmentsForRange:', e);
        setRangeAppointments(new Map());
        setRangeReminders(new Map());
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
        const reminderDates = await listCalendarReminderDatesInMonth(year, month, user.id);
        reminderDates.forEach((d) => unique.add(d));
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

  const goToToday = useCallback(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    setSelectedDate(t0);
  }, []);

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

  const gridDays = useMemo((): DayBlock[] => {
    if (calendarView === 'week') {
      const start = _getStartOfWeek(selectedDate);
      const days = _buildDays(start, 7);
      // RTL (שעות מימין): שבת בשמאל הגריד, א׳ בימין ליד עמודת השעות — רק אז צריך reverse.
      // LTR: שעות משמאל, א׳ צמוד לשעות משמאל → סדר כרונולוגי רגיל.
      return isRtl ? [...days].reverse() : days;
    }
    if (calendarView === 'threeDay') {
      const d0 = new Date(selectedDate);
      d0.setHours(0, 0, 0, 0);
      const days = _buildDays(d0, 3);
      return isRtl ? [...days].reverse() : days;
    }
    return [];
  }, [selectedDateStr, calendarView, isRtl]);

  const gridDims = useMemo(() => {
    const sw = Dimensions.get('window').width;
    const cols = calendarView === 'threeDay' ? 3 : 7;
    const timeCol = 48;
    const inner = sw - timeCol;
    // For week view, enforce a minimum width per day so cards are readable; enables horizontal scroll
    const minDaySize = calendarView === 'threeDay' ? 110 : 82;
    const daySize = Math.max(inner / cols, minDaySize);
    const hourSize = 72;
    return { cols, daySize, hourSize, timeCol, padBottom: hourSize * 2 };
  }, [calendarView]);

  useEffect(() => {
    if (calendarView !== 'week' && calendarView !== 'threeDay') return;
    if (gridDays.length === 0) return;
    void loadAppointmentsForRange(gridDays[0]!.formatted, gridDays[gridDays.length - 1]!.formatted);
  }, [calendarView, gridDays, loadAppointmentsForRange]);

  type AgendaRow =
    | { kind: 'appt'; sortKey: number; appt: AvailableTimeSlot }
    | { kind: 'reminder'; sortKey: number; rem: CalendarReminder };

  const agendaRows = useMemo((): AgendaRow[] => {
    const rows: AgendaRow[] = [];
    appointments.forEach((appt) => {
      rows.push({ kind: 'appt', sortKey: minutesFromMidnight(appt.slot_time), appt });
    });
    calendarReminders.forEach((rem) => {
      rows.push({ kind: 'reminder', sortKey: minutesFromMidnight(rem.start_time), rem });
    });
    rows.sort((a, b) => a.sortKey - b.sortKey);
    return rows;
  }, [appointments, calendarReminders]);

  const nowLineOffsetY = useMemo(() => {
    if (calendarView !== 'day') return null;
    if (selectedDateStr !== _formatLocalYyyyMmDd(new Date())) return null;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const d0 = minutesFromMidnight(dayStart);
    const offset = mins - d0;
    if (offset < 0 || halfHourLabels.length === 0) return null;
    const maxM = halfHourLabels.length * 30;
    if (offset > maxM) return null;
    return (offset / 30) * HALF_HOUR_BLOCK_HEIGHT + HALF_HOUR_BLOCK_HEIGHT / 2;
  }, [calendarView, selectedDateStr, dayStart, halfHourLabels.length]);

  const hoursScrollViewRef = useAnimatedRef<any>();
  const flashListRef = useRef<any>(null);
  const scrollX = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const onScrollX = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const scrollWeekGridToInitialOffset = useCallback(() => {
    if ((calendarView !== 'week' && calendarView !== 'threeDay') || gridDays.length === 0) return;
    const sw = Dimensions.get('window').width;
    const totalWidth = gridDays.length * gridDims.daySize;
    const visibleWidth = sw - gridDims.timeCol;
    const targetOffset = isRtl ? Math.max(0, totalWidth - visibleWidth) : 0;
    scrollX.value = targetOffset;
    requestAnimationFrame(() => {
      flashListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
    });
  }, [calendarView, gridDays.length, gridDims.daySize, gridDims.timeCol, isRtl]);

  // RTL: גלול לסוף כדי שא׳ יופיע ליד עמודת השעות; LTR: התחלה (א׳ משמאל). ב-web לפעמים צריך אחרי layout.
  useEffect(() => {
    const timer = setTimeout(scrollWeekGridToInitialOffset, 0);
    return () => clearTimeout(timer);
  }, [scrollWeekGridToInitialOffset]);
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

  /** Week view reads from rangeAppointments — keep it in sync after cancel/delete */
  const removeBookedFromRangeMap = useCallback((id: string, slotDate: string) => {
    setRangeAppointments((prev) => {
      const next = new Map(prev);
      const arr = next.get(slotDate);
      if (!arr) return prev;
      const filtered = arr.filter((a) => a.id !== id);
      if (filtered.length === 0) next.delete(slotDate);
      else next.set(slotDate, filtered);
      return next;
    });
  }, []);

  const confirmCancelAppointment = useCallback(async () => {
    if (!selectedAppointment) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
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
        try {
          await checkWaitlistAndNotify(selectedAppointment);
          await notifyServiceWaitlistClients(selectedAppointment);
        } catch (e) {}
        const dateKey = String((selectedAppointment as any).slot_date ?? '');
        setAppointments((prev) => prev.filter((a) => a.id !== selectedAppointment.id));
        if (dateKey) removeBookedFromRangeMap(selectedAppointment.id, dateKey);
        setShowCancelModal(false);
        setSelectedAppointment(null);
      }
    } catch (e) {
      console.error('Error in confirmCancelAppointment:', e);
    } finally {
      setIsCancelling(false);
    }
  }, [selectedAppointment, removeBookedFromRangeMap]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<AvailableTimeSlot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const askDeleteAppointment = useCallback((apt: AvailableTimeSlot) => {
    setAppointmentToDelete(apt);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAppointment = useCallback(async () => {
    if (!appointmentToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentToDelete.id)
        .eq('business_id', appointmentToDelete.business_id);

      if (error) {
        console.error('Error deleting appointment:', error);
      } else {
        const dateKey = String((appointmentToDelete as any).slot_date ?? '');
        setAppointments((prev) => prev.filter((a) => a.id !== appointmentToDelete.id));
        if (dateKey) removeBookedFromRangeMap(appointmentToDelete.id, dateKey);
        setShowDeleteModal(false);
        setAppointmentToDelete(null);
        closeActionsMenu();
      }
    } catch (e) {
      console.error('Error in confirmDeleteAppointment:', e);
    } finally {
      setIsDeleting(false);
    }
  }, [appointmentToDelete, removeBookedFromRangeMap, closeActionsMenu]);

  const refreshCalendarRemindersOnly = useCallback(async () => {
    if (!user?.id) return;
    const rem = await listCalendarRemindersForDate(selectedDateStr, user.id);
    setCalendarReminders(rem);
    if ((calendarView === 'week' || calendarView === 'threeDay') && gridDays.length > 0) {
      const list = await listCalendarRemindersForRange(
        gridDays[0]!.formatted,
        gridDays[gridDays.length - 1]!.formatted,
        user.id
      );
      const rmap = new Map<string, CalendarReminder[]>();
      list.forEach((r) => {
        const key = r.event_date;
        if (!key) return;
        const arr = rmap.get(key) ?? [];
        arr.push(r);
        rmap.set(key, arr);
      });
      setRangeReminders(rmap);
    }
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    const reminderDates = await listCalendarReminderDatesInMonth(y, m, user.id);
    setMarkedDates((prev) => {
      const n = new Set(prev);
      reminderDates.forEach((d) => n.add(d));
      return n;
    });
  }, [user?.id, selectedDateStr, calendarView, gridDays, selectedDate]);

  const closeReminderModal = useCallback(() => {
    setShowReminderModal(false);
    setEditingReminder(null);
    setShowReminderAndroidTime(false);
  }, []);

  const openNewReminderModal = useCallback(() => {
    setEditingReminder(null);
    setReminderTitle('');
    setReminderNotes('');
    setReminderTimeDate(timeOnDate('09:00', selectedDate));
    setReminderDuration(30);
    setReminderColorKey('blue');
    setShowReminderModal(true);
  }, [selectedDate]);

  const openEditReminderModal = useCallback(
    (r: CalendarReminder) => {
      const day =
        r.event_date && r.event_date.length >= 10
          ? new Date(
              parseInt(r.event_date.slice(0, 4), 10),
              parseInt(r.event_date.slice(5, 7), 10) - 1,
              parseInt(r.event_date.slice(8, 10), 10)
            )
          : selectedDate;
      day.setHours(0, 0, 0, 0);
      setEditingReminder(r);
      setReminderTitle(r.title);
      setReminderNotes(r.notes || '');
      setReminderTimeDate(timeOnDate(r.start_time, day));
      setReminderDuration(r.duration_minutes || 30);
      setReminderColorKey((r.color_key as CalendarReminderColorKey) || 'blue');
      setShowReminderModal(true);
    },
    [selectedDate]
  );

  const saveReminder = useCallback(async () => {
    const title = reminderTitle.trim();
    if (!title || !user?.id) {
      Alert.alert(tHe('admin.calendarReminder.validationTitle', 'נא להזין כותרת'));
      return;
    }
    setSavingReminder(true);
    try {
      const timeStr = dateToHHMM(reminderTimeDate);
      if (editingReminder) {
        const ok = await updateCalendarReminder(editingReminder.id, {
          start_time: timeStr,
          duration_minutes: reminderDuration,
          title,
          notes: reminderNotes.trim() || null,
          color_key: reminderColorKey,
        });
        if (!ok) {
          Alert.alert(tHe('error.generic', 'שגיאה'), tHe('admin.calendarReminder.saveFailed', 'לא ניתן לשמור'));
        } else {
          closeReminderModal();
          await refreshCalendarRemindersOnly();
        }
      } else {
        const row = await createCalendarReminder({
          barberId: user.id,
          eventDate: selectedDateStr,
          startTime: timeStr,
          durationMinutes: reminderDuration,
          title,
          notes: reminderNotes.trim() || null,
          colorKey: reminderColorKey,
        });
        if (!row) {
          Alert.alert(tHe('error.generic', 'שגיאה'), tHe('admin.calendarReminder.saveFailed', 'לא ניתן לשמור'));
        } else {
          closeReminderModal();
          await refreshCalendarRemindersOnly();
        }
      }
    } finally {
      setSavingReminder(false);
    }
  }, [
    reminderTitle,
    user?.id,
    reminderTimeDate,
    editingReminder,
    reminderDuration,
    reminderNotes,
    reminderColorKey,
    selectedDateStr,
    tHe,
    closeReminderModal,
    refreshCalendarRemindersOnly,
  ]);

  const confirmDeleteReminder = useCallback(() => {
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
            setDeletingReminder(true);
            try {
              const ok = await deleteCalendarReminder(editingReminder.id);
              if (!ok) {
                Alert.alert(tHe('error.generic', 'שגיאה'), tHe('admin.calendarReminder.deleteFailed', 'המחיקה נכשלה'));
              } else {
                closeReminderModal();
                await refreshCalendarRemindersOnly();
              }
            } finally {
              setDeletingReminder(false);
            }
          },
        },
      ]
    );
  }, [editingReminder, tHe, closeReminderModal, refreshCalendarRemindersOnly]);

  const viewMenuItems: { id: CalendarViewMode; label: string; subtitle?: string }[] = [
    { id: 'day', label: tHe('admin.calendar.viewDay', 'יומי'), subtitle: tHe('admin.calendar.viewDaySub', 'תצוגת יום בודד') },
    { id: 'week', label: tHe('admin.calendar.viewWeek', 'שבועי'), subtitle: tHe('admin.calendar.viewWeekSub', 'כל ימי השבוע') },
    { id: 'month', label: tHe('admin.calendar.viewMonth', 'חודשי'), subtitle: tHe('admin.calendar.viewMonthSub', 'תצוגת חודש מלא') },
    { id: 'threeDay', label: tHe('admin.calendar.viewThreeDay', '3 ימים'), subtitle: tHe('admin.calendar.viewThreeDaySub', 'שלושה ימים רצופים') },
    { id: 'schedule', label: tHe('admin.calendar.viewSchedule', 'לוח זמנים'), subtitle: tHe('admin.calendar.viewScheduleSub', 'רשימת אירועים') },
  ];

  const renderViewMenuIcon = (id: CalendarViewMode, active: boolean) => {
    const c = active ? GC_BLUE : '#5F6368';
    switch (id) {
      case 'schedule':
        return <Ionicons name="list-outline" size={22} color={c} />;
      case 'day':
        return <Ionicons name="today-outline" size={22} color={c} />;
      case 'threeDay':
        return <ThreeDayMenuIcon color={c} />;
      case 'week':
        return <WeekMenuIcon color={c} />;
      case 'month':
        return <Ionicons name="grid-outline" size={22} color={c} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.gcSafeArea} edges={['top']}>
      <View style={styles.gcHeader}>
        <View style={styles.gcHeaderTop}>
          <TouchableOpacity
            onPress={() => setShowViewMenu(true)}
            style={styles.gcIconBtn}
            accessibilityLabel={tHe('admin.calendar.viewMenu', 'בחירת תצוגה')}
          >
            <Ionicons name="menu-outline" size={26} color="#3C4043" />
          </TouchableOpacity>
          <View style={styles.gcHeaderCenter}>
            <Text style={styles.gcScreenTitle} numberOfLines={1}>
              {tHe('admin.calendar.screenTitle', 'יומן')}
            </Text>
          </View>
          <TouchableOpacity onPress={goToToday} style={styles.gcTodayChip} accessibilityLabel={tHe('admin.calendar.today', 'היום')}>
            <Text style={styles.gcTodayChipText}>{tHe('admin.calendar.today', 'היום')}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.gcMonthRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            onPress={() => {
              const d = new Date(selectedDate);
              d.setDate(1);
              d.setMonth(d.getMonth() - 1);
              d.setHours(0, 0, 0, 0);
              setSelectedDate(d);
            }}
            style={styles.gcMonthNav}
            activeOpacity={0.7}
          >
            <ChevronLeft size={20} color="#5F6368" />
          </TouchableOpacity>
          <Text style={styles.gcMonthTitle} numberOfLines={1}>
            {_formatGregorianMonthYear(selectedDate)}
          </Text>
          <TouchableOpacity
            onPress={() => {
              const d = new Date(selectedDate);
              d.setDate(1);
              d.setMonth(d.getMonth() + 1);
              d.setHours(0, 0, 0, 0);
              setSelectedDate(d);
            }}
            style={styles.gcMonthNav}
            activeOpacity={0.7}
          >
            <ChevronRight size={20} color="#5F6368" />
          </TouchableOpacity>
        </View>
      </View>

      {calendarView !== 'week' && calendarView !== 'threeDay' && (
        <DaySelector
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          mode={calendarView === 'month' ? 'month' : 'week'}
          markedDates={markedDates}
        />
      )}

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.text} />
          <Text style={styles.loadingText}>
            {String(i18n.t('admin.appointments.loadingForDate', { lng: 'he', defaultValue: 'טוען תורים עבור {{date}}...', date: selectedDateStr }))}
          </Text>
        </View>
      ) : (
        <>
          {calendarView === 'week' || calendarView === 'threeDay' ? (
            <View style={weekStyles.container}>
              <View style={weekStyles.row}>
                <Animated.ScrollView
                  ref={hoursScrollViewRef}
                  style={[weekStyles.hoursCol, { width: gridDims.timeCol, marginTop: gridDims.hourSize }]}
                  contentContainerStyle={{ paddingBottom: gridDims.padBottom }}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                >
                  {_hourBlocks.map((hourBlock, idx) => {
                    const hourDate = hourBlock.toDate();
                    const h = hourDate.getHours();
                    return (
                      <View key={`wk-hour-${idx}`} style={[weekStyles.hourRow, { height: gridDims.hourSize }]}>
                        <Text style={[weekStyles.hourText, h === 0 && { opacity: 0 }]}>
                          {_formatHebrewTimeLabel(hourDate)}
                        </Text>
                      </View>
                    );
                  })}
                </Animated.ScrollView>

                <View style={[weekStyles.gridOuter, { direction: 'ltr' } as any]}>
                  <Animated.View style={[weekStyles.headerRow, headerStylez]}>
                    {gridDays.map((d) => (
                      <HeaderDay
                        day={d}
                        key={`hdr-${d.formatted}`}
                        columnWidth={gridDims.daySize}
                        headerHeight={gridDims.hourSize}
                        isSelected={d.formatted === selectedDateStr}
                        isToday={d.formatted === _formatLocalYyyyMmDd(new Date())}
                        onPress={() => setSelectedDate(d.date)}
                      />
                    ))}
                  </Animated.View>

                  <Animated.ScrollView
                    bounces={false}
                    onScroll={onScrollY}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: gridDims.padBottom }}
                  >
                    <AnimatedFlashList
                      ref={flashListRef}
                      data={gridDays}
                      horizontal
                      keyExtractor={(item) => item.formatted}
                      estimatedItemSize={gridDims.daySize}
                      snapToInterval={gridDims.daySize}
                      decelerationRate="fast"
                      bounces={false}
                      contentContainerStyle={{ paddingBottom: gridDims.padBottom }}
                      showsHorizontalScrollIndicator={false}
                      renderItem={({ item, index }) => (
                        <WeekDayColumn
                          day={item}
                          index={index}
                          columnWidth={gridDims.daySize}
                          hourRowHeight={gridDims.hourSize}
                          appts={rangeAppointments.get(item.formatted) ?? []}
                          reminders={rangeReminders.get(item.formatted) ?? []}
                          onPressAppointment={openActionsMenu}
                          onPressReminder={openEditReminderModal}
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
          ) : calendarView === 'day' ? (
            <ScrollView
              ref={scrollRef}
              style={[styles.scroll, styles.gcDayScroll]}
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

                {/* Reminders + appointments overlay (reminders sit under bookings) */}
                <View pointerEvents="box-none" style={[styles.overlayContainer, { height: halfHourLabels.length * HALF_HOUR_BLOCK_HEIGHT }]}>
                  {calendarReminders.map((r) => {
                    const aptMinutes = minutesFromMidnight(r.start_time);
                    const dayStartMinutes = minutesFromMidnight(dayStart);
                    const offsetMinutes = aptMinutes - dayStartMinutes;
                    const top = (offsetMinutes / 30) * HALF_HOUR_BLOCK_HEIGHT + HALF_HOUR_BLOCK_HEIGHT / 2;
                    const durationMinutes = r.duration_minutes || 30;
                    const height = (durationMinutes / 30) * HALF_HOUR_BLOCK_HEIGHT;
                    const pal = reminderPalette(r.color_key);
                    const startTime = formatTime(r.start_time);
                    const endTime = formatTime(addMinutes(r.start_time, durationMinutes));
                    return (
                      <PressableScale
                        key={`rm-${r.id}`}
                        onPress={() => openEditReminderModal(r)}
                        accessibilityLabel={tHe('admin.calendarReminder.openEdit', 'עריכת תזכורת')}
                        style={[
                          styles.reminderCard,
                          {
                            top,
                            height: Math.max(height, 44),
                            left: LABELS_WIDTH + 8,
                            right: 8,
                            zIndex: 1,
                            elevation: 1,
                            backgroundColor: pal.bg,
                            borderLeftColor: pal.bar,
                          },
                        ]}
                      >
                        <View style={styles.reminderInner}>
                          <View style={styles.reminderTitleRow}>
                            <StickyNote size={16} color={pal.bar} />
                            <Text numberOfLines={2} style={[styles.reminderTitleText, { color: '#1C1C1E' }]}>
                              {r.title}
                            </Text>
                          </View>
                          <View style={styles.reminderTimePill}>
                            <Text numberOfLines={1} style={styles.reminderTimeText}>
                              {`${startTime} – ${endTime}`}
                            </Text>
                            <Ionicons name="notifications-outline" size={14} color={pal.bar} />
                          </View>
                        </View>
                      </PressableScale>
                    );
                  })}
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
                        accessibilityLabel={tHe('admin.appointments.openActions', 'פתח/י אפשרויות לתור')}
                        style={[
                          styles.appointmentCard,
                          {
                            top,
                            height,
                            left: LABELS_WIDTH + 8,
                            right: 8,
                            zIndex: 2,
                            elevation: 4,
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

                            {/* Title row with icons */}
                            <View style={styles.titleRow}>
                              <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.titleText, styles.titleTextFlex]}>
                                {apt.client_name || 'לקוח'}
                              </Text>
                              <View style={styles.titleIconsRow}>
                                {!!apt.client_phone && (
                                  <TouchableOpacity
                                    onPress={async () => {
                                      openActionsMenu(apt);
                                    }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={styles.phoneIconBtn}
                                  >
                                    <Ionicons name="call" size={14} color="#0A84FF" />
                                  </TouchableOpacity>
                                )}
                                <CheckCircle size={16} color="#34C759" />
                              </View>
                            </View>

                            {/* Service name */}
                            <Text numberOfLines={1} style={styles.serviceNameText}>
                              {apt.service_name || 'שירות'}
                            </Text>

                            {/* Time range row */}
                            <View style={styles.durationRow}>
                              <Text numberOfLines={1} style={styles.durationText}>
                                {`${startTime} - ${endTime}`}
                              </Text>
                              <Ionicons name="time-outline" size={14} color="#8E8E93" />
                            </View>
                          </View>
                        </View>
                      </PressableScale>
                    );
                  })}
                  {nowLineOffsetY != null ? (
                    <View pointerEvents="none" style={[styles.nowLineContainer, { top: nowLineOffsetY }]}>
                      <View style={styles.nowLineSpacer} />
                      <View style={styles.nowLineDot} />
                      <View style={styles.nowLineTrack} />
                    </View>
                  ) : null}
                </View>
              </View>

              {appointments.length === 0 && calendarReminders.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>{tHe('admin.appointments.emptyTitle', 'אין תורים ליום זה')}</Text>
                  <Text style={styles.emptySubtitle}>{tHe('admin.appointments.emptySubtitle', 'בחר/י יום אחר מהסרגל העליון')}</Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.gcAgendaScroll}
              contentContainerStyle={styles.gcAgendaScrollContent}
              keyboardShouldPersistTaps="always"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[GC_BLUE]}
                  tintColor={GC_BLUE}
                  title={t('refreshing', 'Refreshing...')}
                  titleColor={Colors.subtext}
                />
              }
            >
              <View style={styles.agendaSectionHeader}>
                <Text style={styles.agendaSectionKicker} numberOfLines={1}>
                  {(() => {
                    const p = _hebrewHeaderParts(selectedDate);
                    return p.weekday ? `${p.weekday} · ${p.dayNum}` : selectedDateStr;
                  })()}
                </Text>
                <Text style={styles.agendaSectionTitle} numberOfLines={2}>
                  {calendarView === 'month'
                    ? tHe('admin.calendar.monthAgendaHint', 'אירועים ליום הנבחר')
                    : tHe('admin.calendar.scheduleTitle', 'לוח זמנים ליום')}
                </Text>
              </View>
              {agendaRows.length === 0 ? (
                <View style={styles.agendaEmpty}>
                  <Ionicons name="calendar-outline" size={40} color="#DADCE0" />
                  <Text style={styles.agendaEmptyTitle}>{tHe('admin.calendar.agendaEmpty', 'אין אירועים ביום זה')}</Text>
                  <Text style={styles.agendaEmptySub}>{tHe('admin.calendar.agendaEmptySub', 'הוסיפו תור או תזכורת מהכפתור +')}</Text>
                </View>
              ) : (
                agendaRows.map((row) => {
                  if (row.kind === 'appt') {
                    const appt = row.appt;
                    const dur = appt.duration_minutes || 30;
                    return (
                      <TouchableOpacity
                        key={`ag-appt-${appt.id}`}
                        style={styles.agendaCard}
                        onPress={() => openActionsMenu(appt)}
                        activeOpacity={0.88}
                      >
                        <View style={[styles.agendaBar, { backgroundColor: businessColors.primary || GC_BLUE }]} />
                        <View style={styles.agendaCardBody}>
                          <Text style={styles.agendaTime}>
                            {formatTime(appt.slot_time)} – {formatTime(addMinutes(appt.slot_time, dur))}
                          </Text>
                          <Text style={styles.agendaTitle} numberOfLines={2}>
                            {[appt.client_name || tHe('admin.calendar.client', 'לקוח'), appt.service_name].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <Ionicons name="chevron-back" size={20} color="#DADCE0" />
                      </TouchableOpacity>
                    );
                  }
                  const rem = row.rem;
                  const pal = reminderPalette(rem.color_key);
                  const dur = rem.duration_minutes || 30;
                  return (
                    <TouchableOpacity
                      key={`ag-rem-${rem.id}`}
                      style={styles.agendaCard}
                      onPress={() => openEditReminderModal(rem)}
                      activeOpacity={0.88}
                    >
                      <View style={[styles.agendaBar, { backgroundColor: pal.bar }]} />
                      <View style={styles.agendaCardBody}>
                        <Text style={styles.agendaTime}>
                          {formatTime(rem.start_time)} – {formatTime(addMinutes(rem.start_time, dur))}
                        </Text>
                        <Text style={styles.agendaTitle} numberOfLines={2}>
                          {rem.title}
                        </Text>
                        {!!rem.notes ? (
                          <Text style={styles.agendaNotes} numberOfLines={2}>
                            {rem.notes}
                          </Text>
                        ) : null}
                      </View>
                      <StickyNote size={20} color={pal.bar} />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </>
      )}

      <Modal visible={showViewMenu} transparent animationType="fade" onRequestClose={() => setShowViewMenu(false)}>
        <View style={styles.viewMenuRoot}>
          <Pressable style={styles.viewMenuBackdrop} onPress={() => setShowViewMenu(false)} />
          <View style={[styles.viewMenuPanel, isRtl ? { right: 0 } : { left: 0 }]}>
            <Text style={styles.viewMenuBrand}>{tHe('admin.calendar.brand', 'יומן')}</Text>
            <Text style={styles.viewMenuSub}>{tHe('admin.calendar.chooseView', 'בחרו תצוגה')}</Text>
            {viewMenuItems.map((opt) => {
              const active = calendarView === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={0.85}
                  style={[
                    styles.viewMenuRow,
                    { flexDirection: isRtl ? 'row-reverse' : 'row' },
                    active && styles.viewMenuRowActive,
                    active && (isRtl ? styles.viewMenuRowActiveRtl : styles.viewMenuRowActiveLtr),
                  ]}
                  onPress={() => {
                    setCalendarView(opt.id);
                    setShowViewMenu(false);
                  }}
                >
                  <View style={styles.viewMenuIconWrap}>
                    {renderViewMenuIcon(opt.id, active)}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.viewMenuRowLabel, active && styles.viewMenuRowLabelActive]}>{opt.label}</Text>
                    {!!opt.subtitle && (
                      <Text style={[styles.viewMenuRowSub, active && styles.viewMenuRowSubActive]} numberOfLines={1}>{opt.subtitle}</Text>
                    )}
                  </View>
                  {active && (
                    <Ionicons name="checkmark" size={18} color={GC_BLUE} />
                  )}
                </TouchableOpacity>
              );
            })}
            <View style={styles.viewMenuDivider} />
            <View style={styles.viewMenuUserRow}>
              <View style={[styles.viewMenuAvatar, { backgroundColor: businessColors.primary || GC_BLUE }]}>
                <Text style={styles.viewMenuAvatarLetter}>
                  {(user?.name || '?').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.viewMenuUserMeta}>
                <Text style={styles.viewMenuUserName} numberOfLines={1}>
                  {user?.name || tHe('admin.calendar.userFallback', 'משתמש')}
                </Text>
                <Text style={styles.viewMenuUserSub} numberOfLines={1}>
                  {user?.email || user?.phone || ''}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Actions menu modal */}
      <Modal
        visible={showActionsModal}
        transparent
        animationType="fade"
        onRequestClose={closeActionsMenu}
      >
        <View style={styles.actionsOverlay}>
          <View style={styles.actionsSheet}>
            <Text style={styles.actionsTitle}>{tHe('admin.appointments.chooseAction', 'בחר/י פעולה')}</Text>
            {!!actionsAppointment?.client_phone && (
              <PressableScale
                style={styles.actionsOption}
                accessibilityLabel={tHe('admin.appointments.callClient', 'חייג ללקוח')}
                onPress={async () => {
                  const phone = actionsAppointment?.client_phone;
                  closeActionsMenu();
                  if (phone) await startPhoneCall(phone);
                }}
              >
                <View style={[styles.actionsIconCircle, { backgroundColor: '#E8F0FF' }]}>
                  <Ionicons name="call" size={18} color="#0A84FF" />
                </View>
                <Text style={styles.actionsOptionText}>{tHe('admin.appointments.callClient', 'חייג ללקוח')}</Text>
              </PressableScale>
            )}
            <View style={styles.actionsDivider} />
            <PressableScale
              style={styles.actionsOption}
              accessibilityLabel={tHe('admin.appointments.cancelAndFree', 'ביטול ושחרור משבצת')}
              onPress={() => {
                if (actionsAppointment) {
                  askCancelAppointment(actionsAppointment);
                }
                closeActionsMenu();
              }}
            >
              <View style={[styles.actionsIconCircle, { backgroundColor: '#FFECEC' }]}>
                <Ionicons name="close-circle-outline" size={18} color="#FF9500" />
              </View>
              <Text style={[styles.actionsOptionText, { color: '#FF9500' }]}>{tHe('admin.appointments.cancelAndFree', 'ביטול ושחרור משבצת')}</Text>
            </PressableScale>
            <PressableScale
              style={styles.actionsOption}
              accessibilityLabel={tHe('admin.appointments.deleteAppointment', 'מחיקת תור')}
              onPress={() => {
                if (actionsAppointment) {
                  askDeleteAppointment(actionsAppointment);
                }
                closeActionsMenu();
              }}
            >
              <View style={[styles.actionsIconCircle, { backgroundColor: '#FFECEC' }]}>
                <Ionicons name="trash-outline" size={18} color="#FF3B30" />
              </View>
              <Text style={[styles.actionsOptionText, { color: Colors.error }]}>{tHe('admin.appointments.deleteAppointment', 'מחיקת תור')}</Text>
            </PressableScale>
            <PressableScale
              style={styles.actionsCancelButton}
              accessibilityLabel={tHe('close', 'סגור')}
              onPress={closeActionsMenu}
            >
              <Text style={styles.actionsCancelText}>{tHe('close', 'סגור')}</Text>
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
            <Text style={styles.iosAlertTitle}>{tHe('appointments.cancel.title', 'ביטול תור')}</Text>
            <Text style={styles.iosAlertMessage}>
              {tHe('admin.appointments.cancelMessage', 'פעולה זו תפנה את הזמן, תסמן את התור כבוטל ותשחרר את המשבצת להזמנה מחדש.')}
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
                <Text style={styles.iosAlertButtonDefaultText}>{tHe('cancel', 'ביטול')}</Text>
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
                  <Text style={styles.iosAlertButtonDestructiveText}>{tHe('confirm', 'אישור')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteModal(false);
          setAppointmentToDelete(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.iosAlertContainer}>
            <Text style={styles.iosAlertTitle}>{tHe('admin.appointments.deleteTitle', 'מחיקת תור')}</Text>
            <Text style={styles.iosAlertMessage}>
              {tHe('admin.appointments.deleteMessage', 'פעולה זו תמחק את התור לצמיתות. לא ניתן לבטל פעולה זו.')}
            </Text>
            <View style={styles.iosAlertButtonsRow}>
              <TouchableOpacity
                style={styles.iosAlertButton}
                activeOpacity={0.8}
                onPress={() => {
                  setShowDeleteModal(false);
                  setAppointmentToDelete(null);
                }}
                disabled={isDeleting}
              >
                <Text style={styles.iosAlertButtonDefaultText}>{tHe('cancel', 'ביטול')}</Text>
              </TouchableOpacity>
              <View style={styles.iosAlertButtonDivider} />
              <TouchableOpacity
                style={styles.iosAlertButton}
                activeOpacity={0.8}
                onPress={confirmDeleteAppointment}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Text style={styles.iosAlertButtonDestructiveText}>{tHe('delete', 'מחק')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {!!user?.id && !isLoading && (
        <TouchableOpacity
          style={[
            styles.reminderFab,
            { backgroundColor: businessColors.primary || '#1A73E8' },
            isRtl ? { left: 20, right: undefined } : { right: 20, left: undefined },
          ]}
          onPress={openNewReminderModal}
          activeOpacity={0.88}
          accessibilityLabel={tHe('admin.calendarReminder.addFab', 'הוספת תזכורת ליומן')}
        >
          <Plus size={28} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      <Modal visible={showReminderModal} transparent animationType="slide" onRequestClose={closeReminderModal}>
        <KeyboardAvoidingView
          style={styles.reminderModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeReminderModal} />
          <View style={styles.reminderSheet}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.reminderSheetHandle} />
            <Text style={styles.reminderSheetTitle}>
              {editingReminder
                ? tHe('admin.calendarReminder.editTitle', 'עריכת תזכורת')
                : tHe('admin.calendarReminder.newTitle', 'תזכורת ביומן')}
            </Text>
            <Text style={styles.reminderSheetHint}>
              {tHe(
                'admin.calendarReminder.hint',
                'לא חוסם תורים — מוצג לצד התורים לעזרה לארגון היום (כמו באירוע בגוגל קלנדר).'
              )}
            </Text>

            <Text style={styles.reminderFieldLabel}>{tHe('admin.calendarReminder.fieldTitle', 'כותרת')}</Text>
            <TextInput
              value={reminderTitle}
              onChangeText={setReminderTitle}
              placeholder={tHe('admin.calendarReminder.titlePlaceholder', 'למשל: טכנאי מגיע')}
              placeholderTextColor="#AEAEB2"
              style={styles.reminderInput}
            />

            <Text style={styles.reminderFieldLabel}>{tHe('admin.calendarReminder.fieldTime', 'שעה')}</Text>
            {Platform.OS === 'android' ? (
              <TouchableOpacity
                style={styles.reminderTimeButton}
                onPress={() => setShowReminderAndroidTime(true)}
                activeOpacity={0.75}
              >
                <Text style={styles.reminderTimeButtonText}>{_formatHebrewTimeLabel(reminderTimeDate)}</Text>
                <Ionicons name="time-outline" size={20} color="#636366" />
              </TouchableOpacity>
            ) : (
              <View style={styles.reminderTimeButton}>
                <Text style={styles.reminderTimeButtonText}>{_formatHebrewTimeLabel(reminderTimeDate)}</Text>
                <Ionicons name="time-outline" size={20} color="#636366" />
              </View>
            )}
            {Platform.OS === 'ios' && (
              <View style={styles.reminderIosPickerWrap}>
                <DateTimePicker
                  value={reminderTimeDate}
                  mode="time"
                  display="spinner"
                  themeVariant="light"
                  textColor={Colors.text}
                  style={styles.reminderIosPicker}
                  onChange={(_, d) => {
                    if (d) setReminderTimeDate(d);
                  }}
                  locale="he-IL"
                />
              </View>
            )}

            <Text style={styles.reminderFieldLabel}>{tHe('admin.calendarReminder.fieldDuration', 'משך')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reminderDurationRow}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setReminderDuration(m)}
                  style={[
                    styles.reminderDurationChip,
                    reminderDuration === m && {
                      backgroundColor: businessColors.primary || '#1A73E8',
                      borderColor: businessColors.primary || '#1A73E8',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.reminderDurationChipText,
                      reminderDuration === m && styles.reminderDurationChipTextActive,
                    ]}
                  >
                    {`${m} ${tHe('admin.calendarReminder.minShort', 'דק׳')}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.reminderFieldLabel}>{tHe('admin.calendarReminder.fieldColor', 'צבע')}</Text>
            <View style={styles.reminderColorRow}>
              {CALENDAR_REMINDER_COLOR_KEYS.map((k) => {
                const pal = reminderPalette(k);
                const on = reminderColorKey === k;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setReminderColorKey(k)}
                    style={[
                      styles.reminderColorDot,
                      { backgroundColor: pal.bar },
                      on && styles.reminderColorDotSelected,
                    ]}
                  />
                );
              })}
            </View>

            <Text style={styles.reminderFieldLabel}>{tHe('admin.calendarReminder.fieldNotes', 'הערות (אופציונלי)')}</Text>
            <TextInput
              value={reminderNotes}
              onChangeText={setReminderNotes}
              placeholder={tHe('admin.calendarReminder.notesPlaceholder', 'פרטים נוספים…')}
              placeholderTextColor="#AEAEB2"
              style={[styles.reminderInput, styles.reminderNotesInput]}
              multiline
            />

            <TouchableOpacity
              style={[styles.reminderSaveBtn, { backgroundColor: businessColors.primary || '#1A73E8' }]}
              onPress={saveReminder}
              disabled={savingReminder}
            >
              {savingReminder ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.reminderSaveBtnText}>{tHe('save', 'שמירה')}</Text>
              )}
            </TouchableOpacity>

            {editingReminder ? (
              <TouchableOpacity style={styles.reminderDeleteBtn} onPress={confirmDeleteReminder} disabled={deletingReminder}>
                {deletingReminder ? (
                  <ActivityIndicator color="#FF3B30" />
                ) : (
                  <Text style={styles.reminderDeleteBtnText}>{tHe('admin.calendarReminder.delete', 'מחיקת תזכורת')}</Text>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.reminderCancelTextBtn} onPress={closeReminderModal}>
              <Text style={styles.reminderCancelText}>{tHe('cancel', 'ביטול')}</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {Platform.OS === 'android' && showReminderAndroidTime ? (
        <DateTimePicker
          value={reminderTimeDate}
          mode="time"
          display="default"
          onChange={(ev, date) => {
            setShowReminderAndroidTime(false);
            if (ev.type === 'set' && date) setReminderTimeDate(date);
          }}
        />
      ) : null}
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
  gcSafeArea: {
    flex: 1,
    backgroundColor: GC_PAGE_BG,
  },
  gcHeader: {
    backgroundColor: GC_SURFACE,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DADCE0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  gcHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  gcHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  gcIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  gcScreenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#202124',
    writingDirection: 'rtl',
  },
  gcTodayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E8F0FE',
    borderWidth: 1,
    borderColor: '#D2E3FC',
  },
  gcTodayChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: GC_BLUE,
    writingDirection: 'rtl',
  },
  gcMonthRow: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 2,
  },
  gcMonthNav: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gcMonthTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3C4043',
    minWidth: 140,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  gcDayScroll: {
    backgroundColor: GC_PAGE_BG,
  },
  gcAgendaScroll: {
    flex: 1,
    backgroundColor: GC_PAGE_BG,
  },
  gcAgendaScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
  },
  agendaSectionHeader: {
    marginBottom: 14,
  },
  agendaSectionKicker: {
    fontSize: 13,
    fontWeight: '700',
    color: GC_BLUE,
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  agendaSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#202124',
    writingDirection: 'rtl',
  },
  agendaEmpty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  agendaEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  agendaEmptySub: {
    fontSize: 14,
    color: '#80868B',
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingHorizontal: 24,
  },
  agendaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GC_SURFACE,
    borderRadius: 12,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8EAED',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  agendaBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    minHeight: 44,
  },
  agendaCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  agendaTime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  agendaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
    writingDirection: 'rtl',
  },
  agendaNotes: {
    fontSize: 13,
    color: '#80868B',
    writingDirection: 'rtl',
  },
  nowLineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 14,
    marginTop: -7,
    zIndex: 30,
    elevation: 8,
  },
  nowLineSpacer: {
    width: LABELS_WIDTH,
  },
  nowLineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EA4335',
  },
  nowLineTrack: {
    flex: 1,
    height: 2,
    backgroundColor: '#EA4335',
  },
  viewMenuRoot: {
    flex: 1,
  },
  viewMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(32,33,36,0.38)',
  },
  viewMenuPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '86%',
    maxWidth: 300,
    backgroundColor: GC_SURFACE,
    paddingTop: 56,
    paddingHorizontal: 8,
    paddingBottom: 24,
    zIndex: 2,
    elevation: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: -2, height: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {},
    }),
  },
  viewMenuBrand: {
    fontSize: 22,
    fontWeight: '800',
    color: '#202124',
    writingDirection: 'rtl',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  viewMenuSub: {
    fontSize: 13,
    color: '#5F6368',
    writingDirection: 'rtl',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  viewMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginVertical: 2,
    borderRadius: 12,
    gap: 10,
  },
  viewMenuRowActive: {
    backgroundColor: '#E8F0FE',
  },
  viewMenuRowActiveLtr: {
    marginRight: 8,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  viewMenuRowActiveRtl: {
    marginLeft: 8,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  viewMenuIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    flexShrink: 0,
  },
  viewMenuRowLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3C4043',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  viewMenuRowLabelActive: {
    color: GC_BLUE,
    fontWeight: '800',
  },
  viewMenuRowSub: {
    fontSize: 12,
    color: '#9AA0A6',
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 1,
  },
  viewMenuRowSubActive: {
    color: '#4A90D9',
  },
  viewMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DADCE0',
    marginVertical: 16,
    marginHorizontal: 12,
  },
  viewMenuUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  viewMenuAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewMenuAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  viewMenuUserMeta: {
    flex: 1,
    minWidth: 0,
  },
  viewMenuUserName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
    writingDirection: 'rtl',
  },
  viewMenuUserSub: {
    fontSize: 12,
    color: '#5F6368',
    marginTop: 2,
    writingDirection: 'rtl',
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
  titleIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  phoneIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F6368',
    writingDirection: 'rtl',
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
  reminderFab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    bottom: 96,
    right: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 50,
  },
  reminderCard: {
    position: 'absolute',
    borderRadius: 12,
    borderLeftWidth: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  reminderInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  reminderTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reminderTitleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  reminderTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  reminderTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3C3C43',
    writingDirection: 'rtl',
  },
  reminderModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  reminderSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  reminderSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D1D6',
    marginBottom: 12,
  },
  reminderSheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 6,
    writingDirection: 'rtl',
  },
  reminderSheetHint: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
    writingDirection: 'rtl',
  },
  reminderFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#636366',
    marginBottom: 6,
    marginTop: 10,
    writingDirection: 'rtl',
  },
  reminderInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: '#FAFAFA',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  reminderTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FAFAFA',
  },
  reminderTimeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  reminderIosPickerWrap: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  reminderIosPicker: {
    width: '100%',
    height: 180,
  },
  reminderDurationRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  reminderDurationChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  reminderDurationChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  reminderDurationChipTextActive: {
    color: '#FFFFFF',
  },
  reminderColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  reminderColorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reminderColorDotSelected: {
    borderWidth: 3,
    borderColor: '#1C1C1E',
  },
  reminderNotesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  reminderSaveBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reminderSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  reminderDeleteBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reminderDeleteBtnText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '700',
  },
  reminderCancelTextBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  reminderCancelText: {
    color: '#0A84FF',
    fontSize: 16,
    fontWeight: '600',
  },
});

const weekStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GC_PAGE_BG,
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  hoursCol: {
    flexGrow: 0,
    backgroundColor: GC_SURFACE,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E8EAED',
  },
  hourRow: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingRight: 6,
    paddingTop: 4,
  },
  hourText: {
    fontWeight: '700',
    opacity: 0.5,
    fontSize: 11,
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  gridOuter: {
    flex: 1,
    overflow: 'hidden',
    borderLeftColor: '#E8EAED',
    borderLeftWidth: StyleSheet.hairlineWidth,
    backgroundColor: GC_SURFACE,
  },
  headerWeekday: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F6368',
    marginBottom: 2,
  },
  headerDayCircle: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerDayCircleToday: {
    borderWidth: 2,
    borderColor: GC_BLUE,
  },
  headerDayCircleSelected: {
    backgroundColor: GC_BLUE,
    borderWidth: 0,
  },
  headerDayNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
  },
  headerDayNumToday: {
    color: GC_BLUE,
  },
  headerDayNumSelected: {
    color: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: GC_SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
  },
  borderBottom: {
    borderBottomColor: '#E8EAED',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  borderRight: {
    borderRightColor: '#E8EAED',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  weekAptCard: {
    position: 'absolute',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#EEF3FD',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 115, 232, 0.18)',
    flexDirection: 'row',
    ...Platform.select({
      ios: {
        shadowColor: '#1A73E8',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  weekAptAccent: {
    width: 3,
    backgroundColor: GC_BLUE,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    flexShrink: 0,
  },
  weekAptInner: {
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 4,
    gap: 1,
    minWidth: 0,
  },
  weekAptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    minWidth: 0,
  },
  weekAptClient: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1a1a2e',
    writingDirection: 'rtl',
    flex: 1,
    minWidth: 0,
  },
  weekAptService: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3C4043',
    writingDirection: 'rtl',
    opacity: 0.85,
  },
  weekAptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  weekAptTime: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5F6368',
    writingDirection: 'rtl',
  },
  weekReminderCard: {
    position: 'absolute',
    borderRadius: 8,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  weekReminderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    flex: 1,
  },
  weekReminderTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
  },
});


