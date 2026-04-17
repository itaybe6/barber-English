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
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
} from 'react-native-reanimated';
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
import { usePrimaryContrast } from '@/src/theme/ThemeProvider';
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
  useAmPm = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wheelRef = useRef<ScrollView | null>(null);
  const [tempValue, setTempValue] = useState<string>(value);
  const [openTick, setOpenTick] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setOpenTick((t) => t + 1);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onValueChange(tempValue);
    setIsOpen(false);
  };

  const dropdownBackgroundColor = isBreakTime 
    ? 'rgba(255, 149, 0, 0.1)' 
    : 'rgba(0, 122, 255, 0.1)';
    
  const dropdownBorderColor = isBreakTime 
    ? 'rgba(255, 149, 0, 0.3)' 
    : 'rgba(0, 122, 255, 0.3)';
    
  const selectedColor = isBreakTime ? Colors.warning : primaryColor;
  const displayTextColor = isBreakTime ? Colors.warning : Colors.text;

  return (
    <View style={[styles.timePickerContainer, { zIndex: isOpen ? 10000 : 1 }]}> 
      <Text style={[styles.timePickerLabel, isBreakTime && styles.timePickerLabelSmall]}>{label}</Text>
      
      {/* Dropdown Button */}
      <TouchableOpacity
        style={[
          styles.dropdownButton,
          isBreakTime && styles.dropdownButtonSmall,
          isOpen && styles.dropdownButtonOpen,
          { 
            backgroundColor: dropdownBackgroundColor,
            borderColor: dropdownBorderColor 
          }
        ]}
        onPress={() => { setTempValue(value); setIsOpen(true); }}
        activeOpacity={0.8}
      >
        <Text numberOfLines={1} ellipsizeMode="clip" style={[
          styles.dropdownButtonText,
          isBreakTime && styles.dropdownButtonTextSmall,
          { color: displayTextColor, flex: 1, textAlign: 'center', fontSize: isBreakTime ? undefined : 12 }
        ]}> 
          {formatDisplayTime(value, useAmPm)}
        </Text>
        <Ionicons 
          name={isOpen ? "chevron-up" : "chevron-down"} 
          size={16} 
          color={displayTextColor} 
        />
      </TouchableOpacity>

      {/* Bottom Sheet Modal with iOS-like wheels */}
      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)} />
        <View style={[styles.bottomSheet, { backgroundColor: Colors.card }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setIsOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirm} style={[styles.confirmButton, { backgroundColor: primaryColor }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="checkmark" size={20} color={'#FFFFFF'} />
              </TouchableOpacity>
            </View>
          </View>
          <WheelPicker 
            options={options} 
            value={tempValue} 
            onChange={setTempValue} 
            accentColor={selectedColor} 
            useAmPm={useAmPm}
            openKey={`${openTick}-${tempValue}`}
          />
        </View>
      </Modal>
    </View>
  );
};

export default function BusinessHoursScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { colors: businessColors } = useBusinessColors();
  const { onPrimary } = usePrimaryContrast();
  const primary = businessColors.primary;

  /** Solid on-track + contrasting thumb — translucent track + thumb both “primary” can fail to repaint on Android after async load. */
  const hoursSwitchPalette = useMemo(
    () => ({
      trackOff: Colors.border,
      trackOn: businessColors.primary,
      thumbOn: onPrimary,
      thumbOff: Colors.card,
    }),
    [businessColors.primary, onPrimary],
  );

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
      setUseBreaks(loadedBreaks.length > 0);
      setTempBreaks(loadedBreaks);
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
        activeOpacity={0.9}
        onPress={() => { if (!isEditing) { handleEditDay(dayOfWeek); } }}
        disabled={isEditing}
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
              trackColor={{ false: hoursSwitchPalette.trackOff, true: hoursSwitchPalette.trackOn }}
              thumbColor={isActive ? hoursSwitchPalette.thumbOn : hoursSwitchPalette.thumbOff}
              ios_backgroundColor={hoursSwitchPalette.trackOff}
              style={styles.switch}
            />
          </Animated.View>
        </Animated.View>

        {isEditing && (
          <Animated.View style={styles.editContainer} layout={_layout} entering={_entering} exiting={_exiting}>
            {/* Work Hours Section */}
            <Animated.View layout={_layout} style={styles.workHoursSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="briefcase-outline" size={16} color={businessColors.primary} />
                <Text style={[styles.sectionTitle, { color: businessColors.primary }]}>{t('admin.hours.workHours')}</Text>
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{t('admin.hours.showBreaksQuestion')}</Text>
                <Switch
                  value={useBreaks}
                  onValueChange={setUseBreaks}
                  trackColor={{ false: hoursSwitchPalette.trackOff, true: hoursSwitchPalette.trackOn }}
                  thumbColor={useBreaks ? hoursSwitchPalette.thumbOn : hoursSwitchPalette.thumbOff}
                  ios_backgroundColor={hoursSwitchPalette.trackOff}
                />
              </View>
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
                  <Ionicons name="arrow-forward" size={16} color={Colors.secondaryText} />
                </View>

                <View style={styles.timeColumn}>
                  <TimePicker
                    value={tempEndTime}
                    onValueChange={(v) => {
                      // Ensure end > start
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
            </Animated.View>

            {/* Multiple Breaks Section */}
            {useBreaks && (
              <Animated.View layout={_layout} style={styles.breakHoursSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="cafe-outline" size={16} color={Colors.warning} />
                  <Text style={[styles.sectionTitle, { color: Colors.warning }]}>{t('admin.hours.breaks')}</Text>
                </View>
                <Animated.View layout={_layout} style={{ gap: 12 }}>
                  {tempBreaks.map((b, idx) => (
                    <Animated.View key={b.id} layout={_layout} entering={_entering} exiting={_fadeExit} style={styles.breakItemRow}>
                      <View style={styles.breakItemHeader}>
                        <TouchableOpacity
                          onPress={() => setTempBreaks(prev => prev.filter(x => x.id !== b.id))}
                          style={styles.breakDeleteButton}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="close" size={14} color={Colors.danger} />
                        </TouchableOpacity>
                        <View style={styles.breakNumberRow}>
                          <Text style={styles.breakNumber}>{t('admin.hours.breakNumber', { num: idx + 1 })}</Text>
                          <Ionicons name="cafe" size={13} color={Colors.warning} />
                        </View>
                      </View>
                      <View style={styles.timeRow}>
                        <View style={styles.timeColumn}>
                          <TimePicker
                            value={b.start_time}
                            onValueChange={(v) => {
                              setTempBreaks(prev => prev.map(x => x.id === b.id ? { ...x, start_time: v } : x));
                            }}
                            label={t('admin.hours.start')}
                            options={startTimeOptions}
                            isBreakTime
                            primaryColor={businessColors.primary}
                            useAmPm={useAmPm}
                          />
                        </View>
                        <View style={styles.timeSeparator}>
                          <Ionicons name="arrow-back" size={16} color={Colors.secondaryText} />
                        </View>
                        <View style={styles.timeColumn}>
                          <TimePicker
                            value={b.end_time}
                            onValueChange={(v) => {
                              setTempBreaks(prev => prev.map(x => x.id === b.id ? { ...x, end_time: v } : x));
                            }}
                            label={t('admin.hours.end')}
                            options={endTimeOptions}
                            isBreakTime
                            primaryColor={businessColors.primary}
                            useAmPm={useAmPm}
                          />
                        </View>
                      </View>
                      {idx < tempBreaks.length - 1 && <View style={styles.breakDivider} />}
                    </Animated.View>
                  ))}
                  <TouchableOpacity
                    onPress={() => setTempBreaks(prev => ([...prev, makeBreakWindow()]))}
                    style={styles.addBreakButton}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={Colors.warning} />
                    <Text style={styles.addBreakText}>{t('admin.hours.addBreak')}</Text>
                  </TouchableOpacity>
                </Animated.View>
              </Animated.View>
            )}

            {/* Day Summary */}
            <Animated.View layout={_layout} style={styles.daySummary}>
              <View style={styles.summaryHeader}>
                <Ionicons name="calendar-outline" size={14} color={Colors.success} />
                <Text style={styles.summaryTitle}>{t('admin.hours.daySummary')}</Text>
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryText}>{t('admin.hours.workPrefix')}: <Text style={styles.ltrText}>{formatRangeLtrDisplay(tempStartTime, tempEndTime, useAmPm)}</Text></Text>
                {useBreaks && tempBreaks.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    {tempBreaks.map((b, i) => (
                      <Text key={b.id} style={styles.summaryBreak}>
                        {tempBreaks.length > 1
                          ? t('admin.hours.summaryBreakNumbered', { num: i + 1 })
                          : t('admin.hours.summaryBreakSingle')}
                        <Text style={styles.ltrText}>{formatRangeLtrDisplay(b.start_time, b.end_time, useAmPm)}</Text>
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </Animated.View>

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEditingDay(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: businessColors.primary, shadowColor: businessColors.primary }]}
                onPress={handleSaveDay}
                activeOpacity={0.7}
              >
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
              onScrollBeginDrag={() => {
                if (isBreakPickerOpen) setIsBreakPickerOpen(false);
              }}
            >
          {hoursSegment === 'fixedBreaks' && (
            <View style={styles.breakSectionWrap}>
              <View style={styles.breakGroupedCard}>
                <View style={styles.breakGroupedHeader}>
                  <Text style={styles.breakGroupedTitle}>{t('admin.hours.breakMinutes')}</Text>
                  <Ionicons name="timer-outline" size={18} color={businessColors.primary} />
                </View>
                <TouchableOpacity
                  style={[styles.breakGroupedControl, isBreakPickerOpen && styles.breakGroupedControlOpen]}
                  onPress={() => {
                    if (!isSavingGlobalBreak) setIsBreakPickerOpen((o) => !o);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.breakControlValue}>
                    {globalBreakMinutes} {t('admin.hours.min')}
                  </Text>
                  <View style={styles.breakControlAffordance}>
                    {isSavingGlobalBreak ? (
                      <ActivityIndicator size="small" color={businessColors.primary} />
                    ) : (
                      <Ionicons
                        name={isBreakPickerOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Colors.secondaryText}
                      />
                    )}
                  </View>
                </TouchableOpacity>

                {isBreakPickerOpen && (
                  <Animated.View
                    entering={FadeIn.duration(220)}
                    exiting={FadeOut.duration(160)}
                    style={styles.breakDropdownPanel}
                  >
                    {GLOBAL_BREAK_MINUTES_VALUES.map((m, index) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.breakDropdownRow,
                          index < GLOBAL_BREAK_MINUTES_VALUES.length - 1 && styles.breakDropdownRowBorder,
                          globalBreakMinutes === m && { backgroundColor: `${businessColors.primary}18` },
                        ]}
                        onPress={() => saveGlobalBreakMinutes(m)}
                        disabled={isSavingGlobalBreak}
                        activeOpacity={0.65}
                      >
                        <Text
                          style={[
                            styles.breakDropdownRowText,
                            globalBreakMinutes === m && { color: businessColors.primary, fontWeight: '700' },
                          ]}
                        >
                          {m} {t('admin.hours.min')}
                        </Text>
                        {globalBreakMinutes === m ? (
                          <Ionicons name="checkmark-circle" size={22} color={businessColors.primary} />
                        ) : (
                          <View style={styles.breakDropdownRowSpacer} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </Animated.View>
                )}
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
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 24,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E5EA',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(60, 60, 67, 0.2)',
  },
  confirmButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
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
    gap: 12,
    justifyContent: 'flex-start',
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    color: Colors.secondaryText,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  saveButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: Colors.card,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: -0.2,
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
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  breakGroupedCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.08)',
  },
  breakGroupedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 12,
    width: '100%',
    direction: 'rtl',
  },
  breakGroupedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
    textAlign: 'right',
    flexShrink: 1,
    writingDirection: 'rtl',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
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
  // Work Hours Section
  workHoursSection: {
    backgroundColor: 'rgba(0, 122, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.1)',
    overflow: 'visible',
  },
  breakHoursSection: {
    backgroundColor: 'rgba(255, 149, 0, 0.04)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.1)',
    overflow: 'visible',
  },
  breakItemRow: {
    paddingVertical: 10,
  },
  breakDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    marginTop: 12,
  },
  breakDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,59,48,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.25)'
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  breakItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  breakNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  addBreakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.2)',
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
    paddingTop: 24,
    width: 28,
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
    backgroundColor: 'rgba(52, 199, 89, 0.05)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.1)',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  summaryContent: {
    gap: 4,
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