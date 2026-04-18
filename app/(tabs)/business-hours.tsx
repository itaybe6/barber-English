import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  InteractionManager,
  Platform,
  I18nManager,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { businessHoursApi } from '@/lib/api/businessHours';
import { notifyWaitlistOnBusinessHoursUpdate } from '@/lib/api/waitlistNotifications';
import { BusinessHours } from '@/lib/supabase';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { readableOnHex } from '@/lib/utils/readableOnHex';
import { SettingsScreenTabs } from '@/components/settings/SettingsScreenTabs';

// Modern Apple-like Colors
const Colors = {
  background: '#F2F2F7',
  card: '#FFFFFF',
  primary: '#007AFF',
  accent: '#000000',
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  text: '#1C1C1E',
  secondaryText: '#8E8E93',
  tertiaryText: '#C7C7CC',
  border: '#E5E5EA',
  separator: 'rgba(60, 60, 67, 0.36)',
};

/**
 * iOS-style UISwitch: neutral track when off, Apple system green when on, white thumb.
 * Distinct false/true track colors avoid Android Switch paint glitches when value hydrates from async load.
 */
const IOS_STYLE_SWITCH_PALETTE = {
  trackOff: '#E5E5EA',
  trackOn: '#34C759',
  thumbOn: '#FFFFFF',
  thumbOffAndroid: '#FFFFFF' as const,
} as const;

type BreakWindow = { id: string; start_time: string; end_time: string };

const makeBreakWindow = (start_time = '12:00', end_time = '13:00', id?: string): BreakWindow => ({
  id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  start_time,
  end_time,
});

const _layout = LinearTransition.springify();
const _entering = FadeInDown.springify();
const _exiting = FadeOutDown.springify();
const _fadeExit = FadeOut.springify();
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const GLOBAL_BREAK_MINUTES_VALUES = [0, 5, 10, 15, 20, 25, 30] as const;

type HoursScreenSegment = 'workingHours' | 'fixedBreaks';

// Format time string to HH:MM (strip seconds if present)
const formatHHMM = (time?: string | null): string => {
  if (!time) return '';
  const parts = String(time).split(':');
  if (parts.length >= 2) {
    const hh = parts[0]?.padStart(2, '0') ?? '';
    const mm = parts[1]?.padStart(2, '0') ?? '';
    return `${hh}:${mm}`;
  }
  return String(time);
};

// Format 24h time string (HH:MM or HH:MM:SS) to 12h American format, e.g. 13:00 -> 1:00 PM
const formatAMPM = (time?: string | null): string => {
  if (!time) return '';
  const parts = String(time).split(':');
  if (parts.length >= 2) {
    const hours24 = Number(parts[0]);
    const minutes = (parts[1] ?? '00').padStart(2, '0');
    if (Number.isNaN(hours24)) return formatHHMM(time);
    const isPM = hours24 >= 12;
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
  }
  return String(time);
};

// Choose display format based on flag
const formatDisplayTime = (time?: string | null, useAmPm?: boolean): string => {
  return useAmPm ? formatAMPM(time) : formatHHMM(time);
};

// Ensure HH:MM range displayed left-to-right with smaller time first
const formatRangeLtr = (a?: string | null, b?: string | null): string => {
  if (!a || !b) return '';
  const A = formatHHMM(a);
  const B = formatHHMM(b);
  const first = A.localeCompare(B) <= 0 ? A : B;
  const second = A.localeCompare(B) <= 0 ? B : A;
  const LRM = '\u200E'; // Left-to-right mark to enforce visual order in RTL
  return `${LRM}${first}${LRM} - ${LRM}${second}${LRM}`;
};

// Respect AM/PM display while preserving order
const formatRangeLtrDisplay = (a?: string | null, b?: string | null, useAmPm?: boolean): string => {
  if (!a || !b) return '';
  const A = formatHHMM(a);
  const B = formatHHMM(b);
  const firstRaw = A.localeCompare(B) <= 0 ? a : b;
  const secondRaw = A.localeCompare(B) <= 0 ? b : a;
  const first = formatDisplayTime(firstRaw, useAmPm);
  const second = formatDisplayTime(secondRaw, useAmPm);
  const LRM = '\u200E';
  return `${LRM}${first}${LRM} - ${LRM}${second}${LRM}`;
};

// Build HH:MM options for every 10 minutes across the day
const generateTenMinuteOptions = (): string[] => {
  return Array.from({ length: 24 * 6 }, (_, i) => {
    const hours = Math.floor(i / 6).toString().padStart(2, '0');
    const minutes = ((i % 6) * 10).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  });
};

// Modern dropdown time picker component
interface TimePickerProps {
  value: string;
  onValueChange: (time: string) => void;
  label: string;
  options: string[];
  isBreakTime?: boolean;
}

const TimePicker: React.FC<TimePickerProps & { primaryColor?: string; useAmPm?: boolean }> = ({
  value,
  onValueChange,
  label,
  options,
  isBreakTime = false,
  primaryColor = Colors.primary,
  useAmPm = false,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [tempValue, setTempValue] = useState<string>(value);
  const [openTick, setOpenTick] = useState<number>(0);
  const tempValueRef = useRef(value);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  const openSheet = () => {
    tempValueRef.current = value;
    setTempValue(value);
    setOpenTick((n) => n + 1);
    setModalVisible(true);
    translateY.value = withSpring(0, { damping: 24, stiffness: 260, mass: 0.9 });
    backdropOpacity.value = withTiming(1, { duration: 260 });
  };

  const animateClose = (onDone: () => void) => {
    translateY.value = withSpring(600, { damping: 24, stiffness: 260, mass: 0.9 });
    backdropOpacity.value = withTiming(0, { duration: 220 }, () => {
      runOnJS(onDone)();
    });
  };

  const handleClose = () => {
    animateClose(() => setModalVisible(false));
  };

  const handleConfirm = () => {
    const val = tempValueRef.current;
    animateClose(() => {
      setModalVisible(false);
      onValueChangeRef.current(val);
    });
  };

  const handleTempChange = (v: string) => {
    tempValueRef.current = v;
    setTempValue(v);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const dropdownBackgroundColor = isBreakTime
    ? 'rgba(255, 149, 0, 0.1)'
    : 'rgba(0, 122, 255, 0.1)';
  const dropdownBorderColor = isBreakTime
    ? 'rgba(255, 149, 0, 0.3)'
    : 'rgba(0, 122, 255, 0.3)';
  const selectedColor = isBreakTime ? Colors.warning : primaryColor;
  const displayTextColor = isBreakTime ? Colors.warning : Colors.text;

  const gradientColors: [string, string] = isBreakTime
    ? ['#FF9500', '#FF6B00']
    : [primaryColor, primaryColor + 'CC'];

  return (
    <View style={[styles.timePickerContainer, { zIndex: modalVisible ? 10000 : 1 }]}>
      <Text style={[styles.timePickerLabel, isBreakTime && styles.timePickerLabelSmall]}>{label}</Text>

      <TouchableOpacity
        style={[
          styles.dropdownButton,
          isBreakTime && styles.dropdownButtonSmall,
          modalVisible && styles.dropdownButtonOpen,
          { backgroundColor: dropdownBackgroundColor, borderColor: dropdownBorderColor },
        ]}
        onPress={openSheet}
        activeOpacity={0.8}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="clip"
          style={[
            styles.dropdownButtonText,
            isBreakTime && styles.dropdownButtonTextSmall,
            { color: displayTextColor, flex: 1, textAlign: 'center', fontSize: isBreakTime ? undefined : 12 },
          ]}
        >
          {formatDisplayTime(value, useAmPm)}
        </Text>
        <Ionicons
          name={modalVisible ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={displayTextColor}
        />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        {/* Dimmed backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.modalOverlay, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        {/* Bottom sheet */}
        <Animated.View style={[styles.bottomSheet, sheetStyle]}>
          {/* Drag handle */}
          <View style={styles.sheetHandle} />

          {/* Header — title only, centered */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
          </View>

          {/* Wheel */}
          <WheelPicker
            options={options}
            value={tempValue}
            onChange={handleTempChange}
            accentColor={selectedColor}
            useAmPm={useAmPm}
            openKey={`${openTick}-${tempValue}`}
          />

          {/* Confirm button */}
          <View style={[styles.sheetConfirmRow, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity
              onPress={handleConfirm}
              activeOpacity={0.88}
              style={styles.sheetConfirmTouchable}
            >
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sheetConfirmGradient}
              >
                <Ionicons name="checkmark" size={20} color="#FFFFFF" style={{ marginEnd: 8 }} />
                <Text style={styles.sheetConfirmText}>{t('confirm')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
};

export default function BusinessHoursScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { colors: businessColors } = useBusinessColors();
  const primary = businessColors.primary;

  const hoursPageBg = Colors.background;
  const hoursOnGrayFg = readableOnHex(hoursPageBg);

  const hoursScreenTabs = useMemo(
    () => [
      { id: 'fixedBreaks' as const, label: t('admin.hours.tabFixedBreaks') },
      { id: 'workingHours' as const, label: t('admin.hours.tabWorkingHours') },
    ],
    [t],
  );

  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Using multiple breaks; segments removed
  // Global break between appointments (minutes)
  const [globalBreakMinutes, setGlobalBreakMinutes] = useState<number>(0);
  const [isSavingGlobalBreak, setIsSavingGlobalBreak] = useState<boolean>(false);
  const [isBreakPickerOpen, setIsBreakPickerOpen] = useState<boolean>(false);
  const [hoursSegment, setHoursSegment] = useState<HoursScreenSegment>('workingHours');
  const isHebrewOrRtl = (i18n?.language?.toLowerCase?.().startsWith('he') ?? false) || (i18n?.dir?.() === 'rtl');
  const useAmPm = user?.user_type === 'admin' && !isHebrewOrRtl;

  const getDayName = (dayOfWeek: number) => {
    const dayNames = [
      t('day.sunday'),
      t('day.monday'),
      t('day.tuesday'),
      t('day.wednesday'),
      t('day.thursday'),
      t('day.friday'),
      t('day.saturday'),
    ];
    return dayNames[dayOfWeek] || '';
  };

  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [tempStartTime, setTempStartTime] = useState('09:00');
  const [tempEndTime, setTempEndTime] = useState('17:00');
  const [tempSlotDuration, setTempSlotDuration] = useState<string>('60');
  const [useBreaks, setUseBreaks] = useState<boolean>(false);
  const [tempBreaks, setTempBreaks] = useState<BreakWindow[]>([]);

  // Original (saved) values — used to detect unsaved changes
  const [origStartTime, setOrigStartTime] = useState('09:00');
  const [origEndTime, setOrigEndTime] = useState('17:00');
  const [origUseBreaks, setOrigUseBreaks] = useState(false);
  const [origBreaks, setOrigBreaks] = useState<Array<{ start_time: string; end_time: string }>>([]);

  const isDirty = useMemo(() => {
    if (tempStartTime !== origStartTime) return true;
    if (tempEndTime !== origEndTime) return true;
    if (useBreaks !== origUseBreaks) return true;
    const cur = useBreaks ? tempBreaks.map(b => ({ start_time: b.start_time, end_time: b.end_time })) : [];
    const orig = origUseBreaks ? origBreaks : [];
    if (cur.length !== orig.length) return true;
    for (let i = 0; i < cur.length; i++) {
      if (cur[i].start_time !== orig[i].start_time || cur[i].end_time !== orig[i].end_time) return true;
    }
    return false;
  }, [tempStartTime, tempEndTime, useBreaks, tempBreaks, origStartTime, origEndTime, origUseBreaks, origBreaks]);

  // Ensure End Time is always after Start Time while editing
  useEffect(() => {
    if (editingDay !== null) {
      if (!(tempEndTime > tempStartTime)) {
        const options = generateTenMinuteOptions();
        const next = options.find(t => t > tempStartTime) || '23:50';
        setTempEndTime(next);
      }
    }
  }, [tempStartTime, editingDay]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [hoursData, profile, perUserBreak] = await Promise.all([
          // If user is admin (barber), get their specific hours, otherwise get general hours
          user?.user_type === 'admin' && user?.id 
            ? businessHoursApi.getBusinessHoursByUser(user.id)
            : businessHoursApi.getAllBusinessHours().then(data => data.filter(h => !h.user_id)),
          businessProfileApi.getProfile(),
          user?.user_type === 'admin' && user?.id ? businessProfileApi.getBreakMinutesForUser(user.id) : Promise.resolve(0),
        ]);
        
        setBusinessHours(hoursData);
        // Prefer per-barber setting; fallback to 0 if none
        setGlobalBreakMinutes(Math.max(0, Math.min(180, Number(perUserBreak ?? 0))));
      } catch (err) {
        setError(t('admin.hours.loadFailed'));
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user?.id, user?.user_type]);

  useEffect(() => {
    setIsBreakPickerOpen(false);
  }, [hoursSegment]);

  const saveGlobalBreakMinutes = useCallback(
    async (m: number) => {
      const clamped = Math.max(0, Math.min(180, m));
      if (clamped === globalBreakMinutes) {
        setIsBreakPickerOpen(false);
        return;
      }
      try {
        setIsSavingGlobalBreak(true);
        if (user?.user_type === 'admin' && user?.id) {
          await businessProfileApi.setBreakMinutesForUser(user.id, clamped);
        }
        setGlobalBreakMinutes(clamped);
        setIsBreakPickerOpen(false);
      } catch (e) {
        Alert.alert(t('error.generic'), t('admin.hours.saveBreakFailed'));
      } finally {
        setIsSavingGlobalBreak(false);
      }
    },
    [user?.id, user?.user_type, t, globalBreakMinutes]
  );

  const handleDayToggle = async (dayOfWeek: number, isActive: boolean) => {
    try {
      const updated = await businessHoursApi.updateBusinessHours(
        dayOfWeek, 
        { is_active: isActive }, 
        user?.user_type === 'admin' ? user?.id : undefined
      );
      setBusinessHours(prev => {
        const index = prev.findIndex(h => h.day_of_week === dayOfWeek);
        if (index >= 0) {
          const next = prev.slice();
          next[index] = updated ? (updated as any) : { ...next[index], is_active: isActive };
          return next;
        }
        return updated ? [...prev, updated as any] : prev;
      });
    } catch (err) {
      setError(t('admin.hours.updateFailed'));
      console.error(err);
    }
  };

  const handleEditDay = (dayOfWeek: number) => {
    const dayHours = businessHours.find(h => h.day_of_week === dayOfWeek);
    if (dayHours) {
      setTempStartTime(formatHHMM(dayHours.start_time));
      setTempEndTime(formatHHMM(dayHours.end_time));
      setTempSlotDuration(String(dayHours.slot_duration_minutes || 60));
      const loadedBreaksRaw = ((dayHours as any).breaks || []) as Array<{ start_time: string; end_time: string }>;
      let loadedBreaks = loadedBreaksRaw.map((b, i) => {
        const s = formatHHMM(b.start_time);
        const e = formatHHMM(b.end_time);
        return makeBreakWindow(s, e, `${s}-${e}-${i}`);
      });
      // Old rows may only have legacy columns; fold into tempBreaks so edit UI matches DB
      if (
        loadedBreaks.length === 0 &&
        dayHours.break_start_time &&
        dayHours.break_end_time
      ) {
        const s = formatHHMM(dayHours.break_start_time);
        const e = formatHHMM(dayHours.break_end_time);
        loadedBreaks = [makeBreakWindow(s, e, `legacy-${s}-${e}`)];
      }
      const hasBreaks = loadedBreaks.length > 0;
      setUseBreaks(hasBreaks);
      setTempBreaks(loadedBreaks);
      // Store originals for dirty-check
      setOrigStartTime(formatHHMM(dayHours.start_time));
      setOrigEndTime(formatHHMM(dayHours.end_time));
      setOrigUseBreaks(hasBreaks);
      setOrigBreaks(loadedBreaks.map(b => ({ start_time: b.start_time, end_time: b.end_time })));
      setEditingDay(dayOfWeek);
    }
  };

  const handleSaveDay = async () => {
    if (editingDay !== null) {
      {
        if (tempStartTime >= tempEndTime) {
          Alert.alert(t('error.generic'), t('admin.hours.endAfterStart'));
          return;
        }
        // validate breaks only when at least one break window exists
        const allBreaks = useBreaks && tempBreaks.length > 0 ? tempBreaks.slice() : [];
        for (const b of allBreaks) {
          if (!(tempStartTime < b.start_time && b.start_time < b.end_time && b.end_time <= tempEndTime)) {
            Alert.alert(t('error.generic'), t('admin.hours.breaksInvalid'));
            return;
          }
        }
        const sortedBreaks = allBreaks.sort((a, b) => a.start_time.localeCompare(b.start_time));
        for (let i = 1; i < sortedBreaks.length; i++) {
          if (!(sortedBreaks[i - 1].end_time <= sortedBreaks[i].start_time)) {
            Alert.alert(t('error.generic'), t('admin.hours.noOverlapBreaks'));
            return;
          }
        }
      }

      try {
        // Breaks only when toggle on and user added ≥1 window; always clear legacy DB columns
        const breaksPayload =
          useBreaks && tempBreaks.length > 0
            ? tempBreaks.map(({ start_time, end_time }) => ({ start_time, end_time }))
            : [];
        const legacyCleared = { break_start_time: null, break_end_time: null };

        await businessHoursApi.updateBusinessHours(editingDay, {
          start_time: tempStartTime,
          end_time: tempEndTime,
          ...legacyCleared,
          breaks: breaksPayload,
        }, user?.user_type === 'admin' ? user?.id : undefined);
        setBusinessHours(prev => prev.map(h => 
          h.day_of_week === editingDay ? { 
            ...h, 
            start_time: tempStartTime, 
            end_time: tempEndTime, 
            ...legacyCleared,
            breaks: breaksPayload,
          } : h
        ));
        // Notify waitlist clients that match the updated working windows for this day
        try {
          await notifyWaitlistOnBusinessHoursUpdate(editingDay, {
            start_time: tempStartTime,
            end_time: tempEndTime,
            breaks: breaksPayload,
            is_active: true,
          });
        } catch {}

        setEditingDay(null);
      } catch (err) {
        setError(t('admin.hours.saveDayFailed'));
        console.error(err);
      }
    }
  };

  const renderDayCard = (dayOfWeek: number) => {
    const dayHours = businessHours.find(h => h.day_of_week === dayOfWeek);
    const isEditing = editingDay === dayOfWeek;
    const isActive = dayHours?.is_active ?? false;

    // Unified time options for all pickers (every 10 minutes)
    const allTenMinuteOptions = generateTenMinuteOptions();
    const startTimeOptions = allTenMinuteOptions;
    // End time must be strictly after the selected start time
    const endTimeOptions = allTenMinuteOptions.filter(t => t > tempStartTime);

    return (
      <AnimatedTouchableOpacity
        layout={_layout}
        key={dayOfWeek}
        style={[styles.dayCard, isActive && styles.dayCardActive]}
        activeOpacity={isEditing && isDirty ? 1 : 0.9}
        onPress={() => {
          if (!isEditing) {
            handleEditDay(dayOfWeek);
          } else if (!isDirty) {
            setEditingDay(null);
          }
        }}
        disabled={false}
      >
        <Animated.View layout={_layout} style={styles.dayHeader}>
          <Animated.View layout={_layout} style={styles.dayInfo}>
            {/* Day name + status pill on same row */}
            <View style={styles.dayNameRow}>
              <Text style={styles.dayName}>{getDayName(dayOfWeek)}</Text>
              <View style={[styles.statusPill, isActive ? styles.statusPillOpen : styles.statusPillClosed]}>
                <View style={[styles.statusDot, { backgroundColor: isActive ? Colors.success : Colors.tertiaryText }]} />
                <Text style={[styles.statusText, { color: isActive ? Colors.success : Colors.secondaryText }]}>
                  {isActive ? t('admin.hours.open') : t('admin.hours.closed')}
                </Text>
              </View>
            </View>

            {/* Time summary (active, not editing) */}
            {isActive && !isEditing && (
              <View>
                <View style={styles.timeContainer}>
                  <Ionicons name="time-outline" size={14} color={Colors.secondaryText} />
                  <Text style={styles.dayTime}>
                    <Text style={styles.ltrText}>{formatRangeLtrDisplay(dayHours.start_time, dayHours.end_time, useAmPm)}</Text>
                  </Text>
                </View>
                {(() => {
                  const dayBreaks = (((dayHours as any).breaks || []) as Array<{ start_time: string; end_time: string }>);
                  if (dayBreaks.length > 0) {
                    return (
                      <View style={{ marginTop: 4, gap: 2 }}>
                        {dayBreaks.map((b, i) => (
                          <View key={`${b.start_time}-${b.end_time}-${i}`} style={styles.timeContainer}>
                            <Ionicons name="cafe-outline" size={13} color={Colors.tertiaryText} />
                            <Text style={[styles.dayTime, { color: Colors.tertiaryText, fontSize: 13 }]}>
                              {dayBreaks.length > 1
                                ? t('admin.hours.breakListNumbered', { num: i + 1 })
                                : t('admin.hours.breakListSingle')}
                              <Text style={styles.ltrText}>{formatRangeLtrDisplay(b.start_time, b.end_time, useAmPm)}</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  }
                  if (dayHours.break_start_time && dayHours.break_end_time) {
                    return (
                      <View style={[styles.timeContainer, { marginTop: 4 }]}>
                        <Ionicons name="cafe-outline" size={13} color={Colors.tertiaryText} />
                        <Text style={[styles.dayTime, { color: Colors.tertiaryText, fontSize: 13 }]}>
                          {t('admin.hours.breakListSingle')}
                          <Text style={styles.ltrText}>{formatRangeLtrDisplay(dayHours.break_start_time, dayHours.break_end_time, useAmPm)}</Text>
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })()}
              </View>
            )}
          </Animated.View>

          <Animated.View layout={_layout} style={styles.dayControls}>
            <Switch
              value={isActive}
              onValueChange={(value) => handleDayToggle(dayOfWeek, value)}
              trackColor={{ false: IOS_STYLE_SWITCH_PALETTE.trackOff, true: IOS_STYLE_SWITCH_PALETTE.trackOn }}
              thumbColor={
                isActive
                  ? IOS_STYLE_SWITCH_PALETTE.thumbOn
                  : Platform.OS === 'android'
                    ? IOS_STYLE_SWITCH_PALETTE.thumbOffAndroid
                    : undefined
              }
              ios_backgroundColor={IOS_STYLE_SWITCH_PALETTE.trackOff}
              style={styles.switch}
            />
          </Animated.View>
        </Animated.View>

        {isEditing && (
          <Animated.View style={styles.editContainer} layout={_layout} entering={_entering} exiting={_exiting}>

            {/* ── Work Hours Card ── */}
            <Animated.View layout={_layout} style={styles.workHoursSection}>
              {/* Accent bar */}
              <View style={[styles.sectionAccentBar, { backgroundColor: businessColors.primary }]} />
              <View style={styles.sectionInner}>
                {/* Header */}
                <View style={styles.sectionHeader}>
                  <Ionicons name="briefcase-outline" size={15} color={businessColors.primary} />
                  <Text style={[styles.sectionTitle, { color: businessColors.primary }]}>{t('admin.hours.workHours')}</Text>
                </View>

                {/* Breaks toggle row */}
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>{t('admin.hours.showBreaksQuestion')}</Text>
                  <Switch
                    value={useBreaks}
                    onValueChange={setUseBreaks}
                    trackColor={{ false: IOS_STYLE_SWITCH_PALETTE.trackOff, true: IOS_STYLE_SWITCH_PALETTE.trackOn }}
                    thumbColor={
                      useBreaks
                        ? IOS_STYLE_SWITCH_PALETTE.thumbOn
                        : Platform.OS === 'android'
                          ? IOS_STYLE_SWITCH_PALETTE.thumbOffAndroid
                          : undefined
                    }
                    ios_backgroundColor={IOS_STYLE_SWITCH_PALETTE.trackOff}
                  />
                </View>

                {/* Time pickers */}
                <View style={styles.timeRow}>
                  <View style={styles.timeColumn}>
                    <TimePicker
                      value={tempStartTime}
                      onValueChange={setTempStartTime}
                      label={t('admin.hours.startTime')}
                      options={startTimeOptions}
                      isBreakTime={false}
                      primaryColor={businessColors.primary}
                      useAmPm={useAmPm}
                    />
                  </View>
                  <View style={styles.timeSeparator}>
                    <Ionicons name="arrow-forward" size={16} color={Colors.tertiaryText} />
                  </View>
                  <View style={styles.timeColumn}>
                    <TimePicker
                      value={tempEndTime}
                      onValueChange={(v) => {
                        if (v <= tempStartTime) {
                          const options = generateTenMinuteOptions();
                          const next = options.find(t => t > tempStartTime) || v;
                          setTempEndTime(next);
                        } else {
                          setTempEndTime(v);
                        }
                      }}
                      label={t('admin.hours.endTime')}
                      options={endTimeOptions}
                      isBreakTime={false}
                      primaryColor={businessColors.primary}
                      useAmPm={useAmPm}
                    />
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* ── Breaks Card ── */}
            {useBreaks && (
              <Animated.View layout={_layout} style={styles.breakHoursSection}>
                <View style={[styles.sectionAccentBar, { backgroundColor: Colors.warning }]} />
                <View style={styles.sectionInner}>
                  {/* Header */}
                  <View style={styles.sectionHeader}>
                    <Ionicons name="cafe-outline" size={15} color={Colors.warning} />
                    <Text style={[styles.sectionTitle, { color: Colors.warning }]}>{t('admin.hours.breaks')}</Text>
                  </View>

                  <Animated.View layout={_layout} style={{ gap: 0 }}>
                    {tempBreaks.map((b, idx) => (
                      <Animated.View key={b.id} layout={_layout} entering={_entering} exiting={_fadeExit}>
                        {idx > 0 && <View style={styles.breakDivider} />}
                        <View style={styles.breakItemRow}>
                          {/* Break label + delete */}
                          <View style={styles.breakItemHeader}>
                            <TouchableOpacity
                              onPress={() => setTempBreaks(prev => prev.filter(x => x.id !== b.id))}
                              style={styles.breakDeleteButton}
                              activeOpacity={0.75}
                            >
                              <Ionicons name="close" size={13} color={Colors.danger} />
                            </TouchableOpacity>
                            <View style={styles.breakNumberRow}>
                              <Text style={styles.breakNumber}>{t('admin.hours.breakNumber', { num: idx + 1 })}</Text>
                              <Ionicons name="cafe" size={13} color={Colors.warning} />
                            </View>
                          </View>
                          {/* Time pickers */}
                          <View style={styles.timeRow}>
                            <View style={styles.timeColumn}>
                              <TimePicker
                                value={b.start_time}
                                onValueChange={(v) => setTempBreaks(prev => prev.map(x => x.id === b.id ? { ...x, start_time: v } : x))}
                                label={t('admin.hours.start')}
                                options={startTimeOptions}
                                isBreakTime
                                primaryColor={businessColors.primary}
                                useAmPm={useAmPm}
                              />
                            </View>
                            <View style={styles.timeSeparator}>
                              <Ionicons name="arrow-back" size={16} color={Colors.tertiaryText} />
                            </View>
                            <View style={styles.timeColumn}>
                              <TimePicker
                                value={b.end_time}
                                onValueChange={(v) => setTempBreaks(prev => prev.map(x => x.id === b.id ? { ...x, end_time: v } : x))}
                                label={t('admin.hours.end')}
                                options={endTimeOptions}
                                isBreakTime
                                primaryColor={businessColors.primary}
                                useAmPm={useAmPm}
                              />
                            </View>
                          </View>
                        </View>
                      </Animated.View>
                    ))}

                    {/* Add break button */}
                    <TouchableOpacity
                      onPress={() => setTempBreaks(prev => ([...prev, makeBreakWindow()]))}
                      style={styles.addBreakButton}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="add-circle" size={18} color={Colors.warning} />
                      <Text style={styles.addBreakText}>{t('admin.hours.addBreak')}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </Animated.View>
            )}

            {/* ── Day Summary ── */}
            <Animated.View layout={_layout} style={styles.daySummary}>
              <View style={styles.summaryHeader}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.summaryTitle}>{t('admin.hours.daySummary')}</Text>
              </View>
              <View style={styles.summaryContent}>
                {/* Work row */}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLtrValue}>
                    <Text style={styles.ltrText}>{formatRangeLtrDisplay(tempStartTime, tempEndTime, useAmPm)}</Text>
                  </Text>
                  <View style={styles.summaryRowLabel}>
                    <Ionicons name="time-outline" size={13} color={Colors.secondaryText} />
                    <Text style={styles.summaryRowLabelText}>{t('admin.hours.workPrefix')}</Text>
                  </View>
                </View>
                {/* Break rows */}
                {useBreaks && tempBreaks.map((b, i) => (
                  <View key={b.id} style={styles.summaryRow}>
                    <Text style={styles.summaryLtrBreakValue}>
                      <Text style={styles.ltrText}>{formatRangeLtrDisplay(b.start_time, b.end_time, useAmPm)}</Text>
                    </Text>
                    <View style={styles.summaryRowLabel}>
                      <Ionicons name="cafe-outline" size={13} color={Colors.tertiaryText} />
                      <Text style={styles.summaryRowBreakText}>
                        {tempBreaks.length > 1
                          ? t('admin.hours.summaryBreakNumbered', { num: i + 1 })
                          : t('admin.hours.summaryBreakSingle')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* ── Action Buttons ── */}
            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.cancelButton, !isDirty && styles.buttonDisabled]}
                onPress={() => setEditingDay(null)}
                activeOpacity={isDirty ? 0.7 : 1}
                disabled={!isDirty}
              >
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: businessColors.primary, shadowColor: businessColors.primary },
                  !isDirty && styles.buttonDisabled,
                ]}
                onPress={handleSaveDay}
                activeOpacity={isDirty ? 0.7 : 1}
                disabled={!isDirty}
              >
                <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginEnd: 6 }} />
                <Text style={styles.saveButtonText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </AnimatedTouchableOpacity>
    );
  };

  const renderHoursPageTabs = () => (
    <View style={[styles.hoursTabsBar, { paddingTop: insets.top + 6 }]}>
      <SettingsScreenTabs
        tabs={hoursScreenTabs}
        activeId={hoursSegment}
        onSelect={(id) => setHoursSegment(id as HoursScreenSegment)}
        accentColor={primary}
        centerRow
      />
    </View>
  );

  const renderHoursScrollBackdrop = () => (
    <View
      style={[StyleSheet.absoluteFillObject, { backgroundColor: hoursPageBg }]}
      pointerEvents="none"
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView edges={['left', 'right']} style={[styles.screenRoot, { backgroundColor: hoursPageBg }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.hoursScreenBody}>
          <View style={styles.hoursScrollSurface}>
            {renderHoursScrollBackdrop()}
            <View style={styles.hoursPageBelowHeader}>
              {renderHoursPageTabs()}
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={businessColors.primary} />
                <Text style={[styles.loadingText, { color: hoursOnGrayFg, opacity: 0.85 }]}>
                  {t('admin.hours.loading')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.screenRoot, { backgroundColor: hoursPageBg }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.hoursScreenBody}>
        <View style={styles.hoursScrollSurface}>
          {renderHoursScrollBackdrop()}
          <View style={styles.hoursPageBelowHeader}>
            {renderHoursPageTabs()}
            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              onScrollBeginDrag={() => {}}
            >
          {hoursSegment === 'fixedBreaks' && (
            <View style={styles.breakSectionWrap}>
              <View style={styles.breakGroupedCard}>
                {/* Accent bar */}
                <View style={[styles.sectionAccentBar, { backgroundColor: businessColors.primary }]} />
                <View style={styles.breakGroupedInner}>
                  {/* Header */}
                  <View style={styles.breakGroupedHeader}>
                    <Ionicons name="timer-outline" size={16} color={businessColors.primary} />
                    <Text style={[styles.breakGroupedTitle, { color: businessColors.primary }]}>
                      {t('admin.hours.breakMinutes')}
                    </Text>
                  </View>

                  {/* Large current value display */}
                  <View style={styles.breakValueDisplay}>
                    {isSavingGlobalBreak ? (
                      <ActivityIndicator size="small" color={businessColors.primary} style={{ marginVertical: 6 }} />
                    ) : (
                      <View style={[styles.breakValueBadge, { backgroundColor: `${businessColors.primary}12` }]}>
                        <Text style={[styles.breakValueNumber, { color: businessColors.primary }]}>
                          {globalBreakMinutes === 0
                            ? t('admin.hours.breakNone')
                            : globalBreakMinutes}
                        </Text>
                        {globalBreakMinutes > 0 && (
                          <Text style={[styles.breakValueUnit, { color: businessColors.primary }]}>
                            {' '}{t('admin.hours.min')}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Chips row */}
                  <View style={styles.breakChipsRow}>
                    {GLOBAL_BREAK_MINUTES_VALUES.map((m) => {
                      const isSelected = globalBreakMinutes === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[
                            styles.breakChip,
                            isSelected && {
                              backgroundColor: businessColors.primary,
                              borderColor: businessColors.primary,
                            },
                          ]}
                          onPress={() => saveGlobalBreakMinutes(m)}
                          disabled={isSavingGlobalBreak}
                          activeOpacity={0.72}
                        >
                          <Text style={[styles.breakChipText, isSelected && styles.breakChipTextSelected]}>
                            {m === 0 ? t('admin.hours.breakNone') : `${m}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Hint */}
                  <Text style={styles.breakHintText}>{t('admin.hours.breakHint')}</Text>
                </View>
              </View>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="warning-outline" size={20} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {hoursSegment === 'workingHours' && (
            <View style={styles.daysContainer}>
              {[0, 1, 2, 3, 4, 5, 6].map(renderDayCard)}
            </View>
          )}

          <View style={styles.footerSpacing} />
            </ScrollView>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Simple iOS-like wheel picker (single column)
const WheelPicker: React.FC<{ options: string[]; value: string; onChange: (v: string) => void; accentColor?: string; useAmPm?: boolean; openKey?: string }> = ({ options, value, onChange, accentColor = Colors.primary, useAmPm = false, openKey }) => {
  const listRef = useRef<ScrollView | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, options.findIndex(o => o === value)));

  useEffect(() => {
    const idx = Math.max(0, options.findIndex(o => o === value));
    setSelectedIndex(idx);
    const doScroll = (animated: boolean) => {
      listRef.current?.scrollTo({ y: idx * 44, animated });
    };
    // Try immediate frame (after mount/prop change)
    const rafId = requestAnimationFrame(() => doScroll(false));
    // Ensure after animations/interactions (modal open animation)
    const interactionHandle = InteractionManager.runAfterInteractions(() => doScroll(false));
    // Fallback small timeout for slower devices
    const timerId = setTimeout(() => doScroll(false), 80);
    return () => {
      cancelAnimationFrame(rafId);
      // @ts-ignore - cancel may not exist on web
      interactionHandle?.cancel?.();
      clearTimeout(timerId);
    };
  }, [value, options, openKey]);

  const handleMomentumEnd = (e: any) => {
    const offsetY = e.nativeEvent.contentOffset.y as number;
    const idx = Math.round(offsetY / 44);
    const clamped = Math.min(options.length - 1, Math.max(0, idx));
    setSelectedIndex(clamped);
    onChange(options[clamped]);
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ y: clamped * 44, animated: true });
    });
  };

  return (
    <View style={styles.wheelContainer}>
      <View style={{ position: 'absolute', left: 16, right: 16, top: (220/2 - 22), height: 44, borderRadius: 12, borderWidth: 1, borderColor: accentColor, backgroundColor: 'rgba(0,0,0,0.03)' }} />
      <ScrollView
        key={openKey || value}
        ref={(ref) => { listRef.current = ref; }}
        showsVerticalScrollIndicator={false}
        snapToInterval={44}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        contentOffset={{ x: 0, y: Math.max(0, options.findIndex(o => o === value)) * 44 }}
        onLayout={() => {
          const idx = Math.max(0, options.findIndex(o => o === value));
          listRef.current?.scrollTo({ y: idx * 44, animated: false });
        }}
        onContentSizeChange={() => {
          const idx = Math.max(0, options.findIndex(o => o === value));
          listRef.current?.scrollTo({ y: idx * 44, animated: false });
        }}
      >
        <View style={{ height: (220/2 - 22) }} />
        {options.map((opt, i) => {
          const active = i === selectedIndex;
          return (
            <View key={opt} style={styles.wheelItem}>
              <Text style={[styles.wheelText, active && { color: accentColor }]}>{formatDisplayTime(opt, useAmPm)}</Text>
            </View>
          );
        })}
        <View style={{ height: (220/2 - 22) }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: Colors.card,
  },
  hoursScreenBody: {
    flex: 1,
  },
  hoursScrollSurface: {
    flex: 1,
    position: 'relative',
  },
  hoursPageBelowHeader: {
    flex: 1,
  },
  hoursTabsBar: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.12)',
    paddingBottom: 2,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
    }),
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingTop: 18,
    paddingBottom: 100,
    flexGrow: 1,
  },
  descriptionContainer: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  descriptionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.7,
  },
  description: {
    fontSize: 16,
    color: Colors.secondaryText,
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: -0.2,
    maxWidth: 320,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'transparent',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.secondaryText,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 24,
    marginBottom: 24,
    gap: 12,
  },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
    letterSpacing: -0.1,
  },
  daysContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  dayCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.12)',
    overflow: 'visible',
  },
  dayCardActive: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayInfo: {
    flex: 1,
    alignItems: 'flex-start',
  },
  dayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  dayName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 4,
  },
  statusPillOpen: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
  },
  statusPillClosed: {
    backgroundColor: 'rgba(142, 142, 147, 0.1)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayTime: {
    fontSize: 15,
    color: Colors.secondaryText,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  ltrText: {
    writingDirection: 'ltr',
    textAlign: 'left',
    includeFontPadding: false,
  },
  closedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayClosedText: {
    fontSize: 15,
    color: Colors.secondaryText,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  dayControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.2)',
  },
  switch: {
    transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }],
  },
  editContainer: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    overflow: 'visible',
  },
  editSection: {
    gap: 20,
    marginBottom: 24,
    overflow: 'visible',
  },
  timePickerContainer: {
    gap: 8,
    position: 'relative',
    zIndex: 1000,
  },
  timePickerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'left',
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  timePickerLabelSmall: {
    fontSize: 14,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 50,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownButtonSmall: {
    paddingVertical: 10,
    minHeight: 44,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
  },
  dropdownButtonOpen: {
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  dropdownButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  dropdownButtonTextSmall: {
    fontSize: 12,
  },
  dropdownOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
    zIndex: 9999,
  },
  optionsScroll: {
    maxHeight: 200,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  optionItemSmall: {
    paddingVertical: 10,
  },
  optionItemSelected: {
    borderBottomColor: 'transparent',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  optionTextSmall: {
    fontSize: 13,
  },
  optionTextSelected: {
    color: Colors.card,
    fontWeight: '600',
  },
  // Modal bottom sheet styles
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 32,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(60, 60, 67, 0.18)',
    marginBottom: 12,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.12)',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  sheetConfirmRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetConfirmTouchable: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  sheetConfirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 18,
  },
  sheetConfirmText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sheetList: {
    maxHeight: 320,
  },
  wheelContainer: {
    height: 220,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  wheelItem: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  wheelTextActive: {
    color: Colors.primary,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  sheetOptionSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  sheetOptionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
  },
  sheetOptionTextSelected: {
    color: Colors.accent,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.secondaryText,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: Colors.card,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  generateButton: {
    marginHorizontal: 24,
    marginTop: 40,
    backgroundColor: Colors.success,
    borderRadius: 20,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  generateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 12,
  },
  generateButtonText: {
    color: Colors.card,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  footerSpacing: {
    height: 40,
  },
  breakSectionWrap: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  breakGroupedCard: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  breakGroupedInner: {
    flex: 1,
    padding: 20,
  },
  breakGroupedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  breakGroupedTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  breakValueDisplay: {
    alignItems: 'center',
    marginBottom: 20,
  },
  breakValueBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 18,
  },
  breakValueNumber: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  breakValueUnit: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  breakChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
  },
  breakChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(60,60,67,0.15)',
    backgroundColor: Colors.background,
  },
  breakChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.secondaryText,
    letterSpacing: -0.2,
  },
  breakChipTextSelected: {
    color: '#FFFFFF',
  },
  breakHintText: {
    fontSize: 12,
    color: Colors.tertiaryText,
    textAlign: 'center',
    letterSpacing: -0.1,
    lineHeight: 17,
  },
  breakGroupedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.1)',
  },
  breakGroupedControlOpen: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  breakDropdownPanel: {
    marginTop: -StyleSheet.hairlineWidth,
    backgroundColor: Colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
    borderColor: 'rgba(60, 60, 67, 0.1)',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
  },
  breakDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  breakDropdownRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.1)',
  },
  breakDropdownRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  breakDropdownRowSpacer: {
    width: 22,
    height: 22,
  },
  breakControlValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  breakControlAffordance: {
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Section Cards ──
  workHoursSection: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  breakHoursSection: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionAccentBar: {
    width: 4,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    alignSelf: 'stretch',
  },
  sectionInner: {
    flex: 1,
    padding: 18,
    overflow: 'visible',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 7,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  breakItemRow: {
    paddingVertical: 14,
  },
  breakDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60,60,67,0.12)',
    marginHorizontal: 4,
  },
  breakDeleteButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,59,48,0.08)',
  },
  breakItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  breakNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.secondaryText,
    letterSpacing: -0.1,
  },
  addBreakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,149,0,0.35)',
    backgroundColor: 'rgba(255,149,0,0.04)',
  },
  addBreakText: {
    color: Colors.warning,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: -0.2,
  },
  optionalLabel: {
    fontSize: 14,
    color: Colors.secondaryText,
    fontWeight: '500',
    marginRight: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    overflow: 'visible',
  },
  timeColumn: {
    flex: 1,
    overflow: 'visible',
    minWidth: 0,
  },
  timeSeparator: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 32,
    width: 24,
  },
  timeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'left',
    marginBottom: 12,
    letterSpacing: -0.2,
  },

  daySummary: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.1)',
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  summaryContent: {
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryRowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryRowLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.secondaryText,
    letterSpacing: -0.1,
  },
  summaryRowBreakText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.tertiaryText,
    letterSpacing: -0.1,
  },
  summaryLtrValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  summaryLtrBreakValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.secondaryText,
    letterSpacing: 0.2,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.secondaryText,
    textAlign: 'left',
    letterSpacing: -0.1,
  },
  summaryBreak: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.secondaryText,
    textAlign: 'left',
    letterSpacing: -0.1,
  },
  breakTimeLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'left',
    letterSpacing: -0.3,
    marginTop: 20,
  },
});