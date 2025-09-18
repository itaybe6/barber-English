import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, Pressable, TextInput, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { businessConstraintsApi } from '@/lib/api/businessConstraints';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';

// English locale + LTR for react-native-calendars
LocaleConfig.locales['en'] = {
  monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthNamesShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  dayNames: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  dayNamesShort: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  today: 'Today'
};
LocaleConfig.defaultLocale = 'en';

type ConstraintDraft = {
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  reason?: string | null;
};

interface BusinessConstraintsModalProps {
  visible: boolean;
  onClose: () => void;
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

export default function BusinessConstraintsModal({ visible, onClose }: BusinessConstraintsModalProps) {
  const insets = useSafeAreaInsets();
  const { colors: businessColors } = useBusinessColors();
  const { user } = useAuthStore();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [selectedDates, setSelectedDates] = useState<string[]>([toISODate(today)]);
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
  const [isExistingModalOpen, setIsExistingModalOpen] = useState<boolean>(false);
  const [isReasonModalOpen, setIsReasonModalOpen] = useState<boolean>(false);
  const [tempReason, setTempReason] = useState<string>('');

  const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: '2-digit', day: '2-digit' });
  const next14 = useMemo(() => Array.from({ length: 14 }).map((_, i) => addDays(today, i)), [today]);
  const formatDatePretty = (iso: string) => {
    try {
      const dt = new Date(iso);
      const weekday = dt.toLocaleDateString('en-US', { weekday: 'long' });
      const day = String(dt.getDate()).padStart(2, '0');
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const year = dt.getFullYear();
      return `${weekday}, ${month}/${day}/${year}`;
    } catch { return iso; }
  };

  const formatTime12Hour = (time24: string) => {
    try {
      const [hours, minutes] = time24.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch {
      return time24;
    }
  };

  const formatTime24Hour = (time12: string) => {
    try {
      const [time, period] = time12.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let hours24 = hours;
      if (period === 'AM' && hours === 12) {
        hours24 = 0;
      } else if (period === 'PM' && hours !== 12) {
        hours24 = hours + 12;
      }
      return `${String(hours24).padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } catch {
      return time12;
    }
  };

  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      try {
        const start = toISODate(today);
        const end = toISODate(addDays(today, 365));
        const rows = await businessConstraintsApi.getConstraintsInRange(start, end);
        setExisting((rows || []).filter((r: any) => (r.date as string) >= start) as any);
      } catch {}
    };
    load();
  }, [visible, today]);

  const toggleDate = (iso: string) => {
    setSelectedDates((prev) => prev.includes(iso) ? prev.filter(x => x !== iso) : [...prev, iso]);
  };

  const save = async () => {
    try {
      setIsSaving(true);
      let entries: ConstraintDraft[] = [];
      const normReason = reason?.trim() || null;
      if (mode === 'hours') {
        if (!singleDateISO) {
          Alert.alert('Error', 'Please select a date');
          return;
        }
        if (startTime >= endTime) {
          Alert.alert('Error', 'End time must be after start time');
          return;
        }
        entries = [{ date: singleDateISO, start_time: formatTime24Hour(startTime), end_time: formatTime24Hour(endTime), reason: normReason }];
      } else if (mode === 'single-day') {
        if (!singleDateISO) {
          Alert.alert('Error', 'Please select a date');
          return;
        }
        entries = [{ date: singleDateISO, start_time: '00:00', end_time: '23:59', reason: normReason }];
      } else {
        // multi-days via date range
        if (!rangeStartISO || !rangeEndISO) {
          Alert.alert('Error', 'Please select a date range');
          return;
        }
        const start = new Date(rangeStartISO);
        const end = new Date(rangeEndISO);
        if (start > end) {
          Alert.alert('Error', 'Invalid date range');
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
      await businessConstraintsApi.createConstraints(entries as any, (user as any)?.id || null);
      const start = toISODate(today);
      const end = toISODate(addDays(today, 365));
      const rows = await businessConstraintsApi.getConstraintsInRange(start, end);
      setExisting((rows || []).filter((r: any) => (r.date as string) >= start) as any);
      Alert.alert('Saved', 'Constraints saved successfully');
    } catch (e) {
      Alert.alert('Error', 'Failed to save constraints');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const ok = await businessConstraintsApi.deleteConstraint(id);
      if (ok) {
        setExisting((prev) => prev.filter(x => x.id !== id));
      }
    } catch {}
  };

  // time options (hourly) in 12-hour format
  const timeOptions = Array.from({ length: 24 }, (_, h) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const hours12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hours12}:00 ${period}`;
  });

  const WheelPicker: React.FC<{ options: string[]; value: string; onChange: (v: string) => void; primaryColor?: string }> = ({ options, value, onChange, primaryColor = businessColors.primary }) => {
    const listRef = useRef<ScrollView | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, options.findIndex(o => o === value)));
    useEffect(() => {
      const idx = Math.max(0, options.findIndex(o => o === value));
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
    return (
      <View style={styles.wheelContainer}>
        <View style={{ position: 'absolute', left: 16, right: 16, top: (220/2 - 22), height: 44, borderRadius: 12, borderWidth: 1, borderColor: primaryColor, backgroundColor: 'rgba(0,0,0,0.03)' }} />
        <ScrollView
          ref={(ref) => { (listRef as any).current = ref; }}
          showsVerticalScrollIndicator={false}
          snapToInterval={44}
          decelerationRate="fast"
          onMomentumScrollEnd={handleMomentumEnd}
        >
          <View style={{ height: (220/2 - 22) }} />
          {options.map((opt, i) => {
            const active = i === selectedIndex;
            return (
            <View key={opt} style={styles.wheelItem}>
              <Text style={[styles.wheelText, active && { color: primaryColor }]}>{opt}</Text>
            </View>
            );
          })}
          <View style={{ height: (220/2 - 22) }} />
        </ScrollView>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['left','right']}>
        <View style={[styles.header, { paddingTop: Math.max(16, insets.top + 8) }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}><Ionicons name="close" size={20} color={'#000'} /></TouchableOpacity>
          <Text style={styles.headerTitle}>Work constraints</Text>
          <TouchableOpacity onPress={() => setIsExistingModalOpen(true)} style={[styles.headerAction, { backgroundColor: businessColors.primary, borderWidth: 0 }]} activeOpacity={0.9}>
            <View style={styles.headerActionInner}>
              <Ionicons name="create-outline" size={20} color={'#FFFFFF'} />
            </View>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top + 56}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 + 16 }} keyboardShouldPersistTaps="handled">
          {/* Mode selector */}
          <View style={styles.segmentedCard}>
            <View style={styles.segmented}>
              <TouchableOpacity onPress={() => setMode('hours')} style={[styles.segment, mode === 'hours' && { backgroundColor: `${businessColors.primary}15`, borderColor: `${businessColors.primary}30` }]} activeOpacity={0.9}>
                <Text style={[styles.segmentText, mode === 'hours' && { color: businessColors.primary }]}>Hours</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('single-day')} style={[styles.segment, mode === 'single-day' && { backgroundColor: `${businessColors.primary}15`, borderColor: `${businessColors.primary}30` }]} activeOpacity={0.9}>
                <Text style={[styles.segmentText, mode === 'single-day' && { color: businessColors.primary }]}>Single day</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('multi-days')} style={[styles.segment, mode === 'multi-days' && { backgroundColor: `${businessColors.primary}15`, borderColor: `${businessColors.primary}30` }]} activeOpacity={0.9}>
                <Text style={[styles.segmentText, mode === 'multi-days' && { color: businessColors.primary }]}>Multiple days</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Hours mode: pick single date + time range */}
          {mode === 'hours' && (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Pick a date</Text>
                <View style={styles.calendarCard}>
                                  <RNCalendar
                  current={singleDateISO}
                  minDate={toISODate(today)}
                  onDayPress={(d: any) => setSingleDateISO(d.dateString)}
                  markedDates={{ [singleDateISO]: { selected: true, selectedColor: businessColors.primary } }}
                  enableSwipeMonths
                  hideDayNames={false}
                  firstDay={0}
                  style={{ direction: 'ltr' }}
                  theme={{
                    textDayFontSize: 14,
                    textMonthFontSize: 16,
                    arrowColor: businessColors.primary,
                    selectedDayBackgroundColor: businessColors.primary,
                    todayTextColor: businessColors.primary,
                    'stylesheet.calendar.header': {
                      week: {
                        flexDirection: 'row',
                        justifyContent: 'space-around'
                      },
                      dayHeader: {
                        textAlign: 'center',
                        color: '#6B7280',
                        fontSize: 12,
                        fontWeight: '600'
                      }
                    },
                    'stylesheet.day.basic': {
                      base: {
                        width: 32,
                        height: 32,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }
                    },
                    'stylesheet.calendar.main': {
                      week: {
                        marginTop: 7,
                        marginBottom: 7,
                        flexDirection: 'row',
                        justifyContent: 'space-around'
                      }
                    }
                  } as any}
                />
                </View>
              </View>
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.sectionTitle}>Closed hours</Text>
                  <TouchableOpacity onPress={() => { setTempStartHour(startTime); setTempEndHour(endTime); setIsHoursModalOpen(true); }} style={[styles.smallIconBtn, { backgroundColor: businessColors.primary }]} activeOpacity={0.9}>
                    <Ionicons name="add" size={18} color={'#FFFFFF'} />
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
                  <View style={styles.timeChip}>
                    <Ionicons name="time-outline" size={14} color={'#1C1C1E'} />
                    <Text style={styles.timeChipText}>{startTime}–{endTime}</Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* Single full day: pick one date */}
          {mode === 'single-day' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Pick a date (closed all day)</Text>
              <View style={styles.calendarCard}>
                <RNCalendar
                  current={singleDateISO}
                  minDate={toISODate(today)}
                  onDayPress={(d: any) => setSingleDateISO(d.dateString)}
                  markedDates={{ [singleDateISO]: { selected: true, selectedColor: businessColors.primary } }}
                  enableSwipeMonths
                  hideDayNames={false}
                  firstDay={0}
                  style={{ direction: 'ltr' }}
                  theme={{
                    textDayFontSize: 14,
                    textMonthFontSize: 16,
                    arrowColor: businessColors.primary,
                    selectedDayBackgroundColor: businessColors.primary,
                    todayTextColor: businessColors.primary,
                    'stylesheet.calendar.header': {
                      week: {
                        flexDirection: 'row',
                        justifyContent: 'space-around'
                      },
                      dayHeader: {
                        textAlign: 'center',
                        color: '#6B7280',
                        fontSize: 12,
                        fontWeight: '600'
                      }
                    },
                    'stylesheet.day.basic': {
                      base: {
                        width: 32,
                        height: 32,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }
                    },
                    'stylesheet.calendar.main': {
                      week: {
                        marginTop: 7,
                        marginBottom: 7,
                        flexDirection: 'row',
                        justifyContent: 'space-around'
                      }
                    }
                  } as any}
                />
              </View>
            </View>
          )}

          {/* Multi-days: date range selection */}
          {mode === 'multi-days' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Pick a date range (closed all day)</Text>
              <View style={styles.calendarCard}>
                <RNCalendar
                  current={rangeStartISO || toISODate(today)}
                  minDate={toISODate(today)}
                  markingType={'period'}
                  markedDates={((): any => {
                    const marks: any = {};
                    if (rangeStartISO) {
                      marks[rangeStartISO] = { startingDay: true, color: businessColors.primary, textColor: '#FFFFFF' };
                    }
                    if (rangeStartISO && rangeEndISO) {
                      // Build all days between
                      const s = new Date(rangeStartISO);
                      const e = new Date(rangeEndISO);
                      const cur = new Date(s);
                      while (cur <= e) {
                        const iso = toISODate(cur);
                        marks[iso] = marks[iso] || { color: 'rgba(0,0,0,0.25)', textColor: '#1C1C1E' };
                        cur.setDate(cur.getDate() + 1);
                      }
                      marks[rangeStartISO] = { startingDay: true, color: businessColors.primary, textColor: '#FFFFFF' };
                      marks[rangeEndISO] = { endingDay: true, color: businessColors.primary, textColor: '#FFFFFF' };
                    }
                    return marks;
                  })()}
                  onDayPress={(d: any) => {
                    const sel = d.dateString as string;
                    if (!rangeStartISO || (rangeStartISO && rangeEndISO)) {
                      setRangeStartISO(sel);
                      setRangeEndISO(null);
                    } else if (!rangeEndISO) {
                      if (sel >= rangeStartISO) setRangeEndISO(sel); else { setRangeStartISO(sel); setRangeEndISO(null); }
                    }
                  }}
                  enableSwipeMonths
                  hideDayNames={false}
                  firstDay={0}
                  style={{ direction: 'ltr' }}
                  theme={{
                    textDayFontSize: 14,
                    textMonthFontSize: 16,
                    arrowColor: businessColors.primary,
                    selectedDayBackgroundColor: businessColors.primary,
                    todayTextColor: businessColors.primary,
                    'stylesheet.calendar.header': {
                      week: {
                        flexDirection: 'row',
                        justifyContent: 'space-around'
                      },
                      dayHeader: {
                        textAlign: 'center',
                        color: '#6B7280',
                        fontSize: 12,
                        fontWeight: '600'
                      }
                    },
                    'stylesheet.day.basic': {
                      base: {
                        width: 32,
                        height: 32,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }
                    },
                    'stylesheet.calendar.main': {
                      week: {
                        marginTop: 7,
                        marginBottom: 7,
                        flexDirection: 'row',
                        justifyContent: 'space-around'
                      }
                    }
                  } as any}
                />
              </View>
              {rangeStartISO && rangeEndISO && (
                <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
                  <Text style={{ color: '#6B7280', fontWeight: '600' }}>
                    Selected range: <Text style={{ writingDirection: 'ltr' }}>{formatISOToMMDDYYYY(rangeStartISO)} — {formatISOToMMDDYYYY(rangeEndISO)}</Text>
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Reason (optional)</Text>
              <TouchableOpacity
                onPress={() => { setTempReason(reason); setIsReasonModalOpen(true); }}
                style={[styles.smallIconBtn, { backgroundColor: businessColors.primary }]}
                activeOpacity={0.9}
              >
                <Ionicons name="add" size={18} color={'#FFFFFF'} />
              </TouchableOpacity>
            </View>
            {!!reason && (
              <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
                <View style={[styles.reasonChip, { backgroundColor: `${businessColors.primary}15`, borderColor: `${businessColors.primary}30` }]}>
                  <Text style={[styles.reasonChipText, { color: businessColors.primary }]}>{reason}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 8 }}>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: businessColors.primary, shadowColor: businessColors.primary }, isSaving && { opacity: 0.6 }]} onPress={save} disabled={isSaving}>
              <Text style={styles.primaryBtnText}>{isSaving ? 'Saving...' : 'Save constraints'}</Text>
            </TouchableOpacity>
          </View>

          
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Existing constraints popup */}
      <Modal visible={isExistingModalOpen} animationType="slide" onRequestClose={() => setIsExistingModalOpen(false)}>
        <SafeAreaView style={styles.container} edges={['left','right']}>
          <View style={[styles.header, { paddingTop: Math.max(16, insets.top + 8) }]}>
            <TouchableOpacity onPress={() => setIsExistingModalOpen(false)} style={styles.headerBtn}><Ionicons name="close" size={20} color={'#000'} /></TouchableOpacity>
            <Text style={styles.headerTitle}>Upcoming constraints</Text>
            <View style={styles.headerBtn} />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Upcoming constraints</Text>
              <View style={styles.sectionUnderline} />
              <View style={{ gap: 14 }}>
                {existing.length === 0 ? (
                  <Text style={styles.emptyText}>No upcoming constraints</Text>
                ) : (
                  (() => {
                    const groups = (existing || []).reduce((m: Record<string, any[]>, c: any) => {
                      const key = (c.reason || '').trim() || 'No reason';
                      (m[key] = m[key] || []).push(c);
                      return m;
                    }, {} as Record<string, any[]>);
                    return Object.entries(groups).map(([reasonKey, rows]) => {
                      const dates = Array.from(new Set(rows.map((r: any) => r.date as string))).sort();
                      const first = dates[0];
                      const last = dates[dates.length - 1];
                      return (
                        <View key={reasonKey} style={{ gap: 8 }}>
                          {/* Group header: reason and dates */}
                          <View style={{ alignItems: 'flex-start' }}>
                            <Text style={styles.sectionValueText}>{reasonKey}</Text>
                            {dates.length > 1 ? (
                              <Text style={[styles.sectionValueText, { marginTop: 6 }]}>
                                <Text style={{ writingDirection: 'ltr' }}>{formatISOToMMDDYYYY(first)} — {formatISOToMMDDYYYY(last)}</Text>
                              </Text>
                            ) : (
                              <Text style={[styles.sectionValueText, { marginTop: 6 }]}>{formatDatePretty(first)}</Text>
                            )}
                          </View>
                          {/* Group items */}
                          <View style={{ gap: 8 }}>
                            {rows
                              .sort((a: any, b: any) => (a.date as string).localeCompare(b.date as string) || String(a.start_time).localeCompare(String(b.start_time)))
                              .map((c: any) => {
                                const start = String(c.start_time).slice(0,5);
                                const end = String(c.end_time).slice(0,5);
                                const isFullDay = start === '00:00' && end === '23:59';
                                return (
                                  <View key={c.id} style={styles.constraintCard}>
                                    <View style={{ alignItems: 'flex-start' }}>
                                      <Text style={styles.sectionMiniTitle}>{formatDatePretty(c.date)}</Text>
                                      <View style={{ marginTop: 8 }}>
                                        <View style={styles.timeChip}>
                                          <Ionicons name="time-outline" size={14} color={'#1C1C1E'} />
                                          <Text style={styles.timeChipText}>{isFullDay ? 'All day' : `${formatTime12Hour(start)}–${formatTime12Hour(end)}`}</Text>
                                        </View>
                                      </View>
                                    </View>
                                    <TouchableOpacity onPress={() => remove(c.id)} style={[styles.deleteBtn, { alignSelf: 'flex-start' }]}>
                                      <Ionicons name="trash" size={16} color={'#FFFFFF'} />
                                    </TouchableOpacity>
                                  </View>
                                );
                              })}
                          </View>
                        </View>
                      );
                    });
                  })()
                )}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Hours modal */}
      <Modal visible={isHoursModalOpen} transparent animationType="fade" onRequestClose={() => setIsHoursModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsHoursModalOpen(false)} />
        <View style={styles.centerModal}>
          <View style={styles.centerSheet}>
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Choose closed hours</Text>
              <TouchableOpacity onPress={() => { setStartTime(tempStartHour); setEndTime(tempEndHour); setIsHoursModalOpen(false); }} style={[styles.confirmBtn, { backgroundColor: businessColors.primary }]}>
                <Ionicons name="checkmark" size={18} color={'#FFFFFF'} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Start</Text>
              <WheelPicker options={timeOptions} value={tempStartHour} onChange={setTempStartHour} primaryColor={businessColors.primary} />
              <View style={{ height: 12 }} />
              <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>End</Text>
              <WheelPicker options={timeOptions} value={tempEndHour} onChange={setTempEndHour} primaryColor={businessColors.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Reason modal */}
      <Modal visible={isReasonModalOpen} transparent animationType="fade" onRequestClose={() => setIsReasonModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsReasonModalOpen(false)} />
        <View style={styles.centerModal}>
          <View style={styles.centerSheet}>
            <View style={styles.sheetHeaderRow}>
              <TouchableOpacity onPress={() => { setReason(tempReason.trim()); setIsReasonModalOpen(false); }} style={[styles.confirmBtn, { backgroundColor: businessColors.primary }]}>
                <Ionicons name="checkmark" size={18} color={'#FFFFFF'} />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>Enter reason</Text>
            </View>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
              <View style={styles.inputWrapper}>
                <TextInput
                  value={tempReason}
                  onChangeText={setTempReason}
                  placeholder="e.g., vacation, errands, temporary closure"
                  placeholderTextColor={'#8E8E93'}
                  style={styles.input}
                  textAlign="left"
                  multiline
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIconCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  headerAction: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#000000', borderRadius: 999, backgroundColor: '#FFFFFF' },
  headerActionInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerActionText: { color: '#000000', fontWeight: '800' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  sectionTitle: { fontSize: 16, fontWeight: '700', textAlign: 'left', marginBottom: 12, color: '#1C1C1E' },
  sectionUnderline: { alignSelf: 'flex-start', width: '35%', height: 1, backgroundColor: '#E5E5EA', marginTop: -6, marginBottom: 10 },
  card: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4, padding: 16 },
  calendarCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E5EA' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#F2F2F7', borderWidth: 1, borderColor: '#E5E5EA' },
  dayChipActive: { backgroundColor: 'rgba(0,122,255,0.12)', borderColor: 'rgba(0,122,255,0.35)' },
  dayChipText: { fontWeight: '700', color: '#1C1C1E' },
  dayChipTextActive: { color: '#007AFF' },
  timeRow: { flexDirection: 'row', gap: 12 },
  dropdownBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5EA' },
  dropdownBtnText: { fontWeight: '700', color: '#1C1C1E' },
  dropdownValue: { fontWeight: '800', color: '#007AFF' },
  inputWrapper: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA', paddingHorizontal: 12, paddingVertical: 10 },
  input: { fontSize: 15, color: '#000' },
  primaryBtn: { paddingVertical: 14, borderRadius: 16, alignItems: 'center', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800' },
  emptyText: { color: '#8E8E93', textAlign: 'left' },
  constraintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 16, padding: 12, backgroundColor: '#FFFFFF' },
  constraintCard: { borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 16, padding: 12, backgroundColor: '#FFFFFF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  constraintText: { color: '#1C1C1E', fontWeight: '700' },
  constraintSub: { color: '#6B7280', fontWeight: '600', marginTop: 2 },
  sectionMiniTitle: { fontSize: 13, fontWeight: '800', color: '#6B7280' },
  sectionValueText: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  deleteBtn: { backgroundColor: '#FF3B30', borderRadius: 12, padding: 8 },
  secondaryBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.08)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)', paddingVertical: 10, borderRadius: 12 },
  secondaryBtnText: { color: '#000000', fontWeight: '800' },
  // Bottom sheet + wheel
  modalOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  bottomSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#F2F2F7', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8, paddingBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 24 },
  sheetHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(60,60,67,0.2)' },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  confirmBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  wheelContainer: { height: 220, overflow: 'hidden', paddingHorizontal: 16 },
  wheelItem: { height: 44, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontSize: 20, fontWeight: '600', color: '#1C1C1E' },
  wheelTextActive: { color: '#007AFF' },
  // Segmented control
  segmented: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 4, flexDirection: 'row', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  segmentedCard: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: '#F2F2F7', borderWidth: 1, borderColor: '#E5E5EA', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  segmentText: { fontWeight: '700', color: '#6B7280' },
  segmentTextActive: { color: '#1C1C1E' },
  // Pretty constraint list
  constraintIconWrap: { marginLeft: 8 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' },
  constraintContent: { flex: 1, alignItems: 'flex-start' },
  constraintTitle: { fontSize: 15, fontWeight: '800', color: '#1C1C1E' },
  constraintMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  constraintMetaCol: { alignItems: 'flex-start', gap: 8, marginTop: 6 },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F2F2F7', borderWidth: 1, borderColor: '#E5E5EA', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  timeChipText: { color: '#1C1C1E', fontWeight: '700' },
  reasonChip: { backgroundColor: 'rgba(0,122,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,122,255,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  reasonChipText: { color: '#007AFF', fontWeight: '800' },
  smallIconBtn: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  centerModal: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerSheet: { width: '90%', backgroundColor: '#F2F2F7', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
});


