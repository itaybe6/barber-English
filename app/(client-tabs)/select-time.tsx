import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, Linking, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Calendar from 'expo-calendar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { supabase, getBusinessId } from '@/lib/supabase';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi } from '@/lib/api/notifications';
import { formatTime12Hour } from '@/lib/utils/timeFormat';

export default function SelectTimeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { colors } = useBusinessColors();
  const styles = createStyles(colors);
  const params = useLocalSearchParams<{
    serviceName?: string;
    durationMinutes?: string;
    price?: string;
    selectedDate?: string;
    serviceId?: string;
    barberId?: string;
    breakMinutes?: string;
  }>();

  const serviceName = params.serviceName || '';
  const durationMinutes = useMemo(() => {
    const n = Number(params.durationMinutes);
    return Number.isFinite(n) && n > 0 ? n : 60;
  }, [params.durationMinutes]);
  const selectedDate = params.selectedDate || '';

  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [checkingSameDay, setCheckingSameDay] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [existingAppointment, setExistingAppointment] = useState<any | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [globalBreakMinutes, setGlobalBreakMinutes] = useState<number>(0);

  // Load per-barber break (minutes): use param as initial hint, always fetch latest for the selected barber
  useEffect(() => {
    const loadBreak = async () => {
      try {
        // 1) Seed from navigation param, if present
        if (typeof params.breakMinutes !== 'undefined') {
          const hinted = Number(params.breakMinutes);
          if (Number.isFinite(hinted)) {
            const clamped = Math.max(0, Math.min(180, hinted));
            setGlobalBreakMinutes((prev) => (prev !== clamped ? clamped : prev));
          }
        }
        // 2) Always fetch authoritative value per barber and update if differs
        const barberId = params.barberId as string | undefined;
        // Only override from server when a specific barber is provided.
        // If no barberId, keep the seeded value from params.breakMinutes.
        if (barberId) {
          const minutes = await businessProfileApi.getBreakMinutesForUser(barberId);
          const br = Math.max(0, Math.min(180, Number(minutes ?? 0)));
          setGlobalBreakMinutes((prev) => (prev !== br ? br : prev));
        }
      } catch {}
    };
    loadBreak();
  }, [params.barberId, params.breakMinutes]);

  const reloadTimes = async () => {
    if (!selectedDate) return;
    setLoading(true);
    let isStaleLocal = false;
    try {
      // fetch existing appointments for that date
      const businessId = getBusinessId();
      let slotsQuery = supabase
        .from('appointments')
        .select('*')
        .eq('slot_date', selectedDate)
        .eq('business_id', businessId);
      if (params.barberId) {
        const barber = params.barberId as string;
        // Include legacy rows that used barber_id instead of user_id
        slotsQuery = slotsQuery.or(`user_id.eq.${barber},barber_id.eq.${barber}`);
      } else {
        slotsQuery = slotsQuery.is('user_id', null);
      }
      const { data: slots } = await slotsQuery.order('slot_time');

      // Build busy intervals from booked appointments (respecting their duration)
      type Busy = { startMin: number; endMin: number };
      const toMinutes = (time: string) => {
        const [h, m] = String(time).split(':');
        return (parseInt(h || '0', 10) * 60) + parseInt(m || '0', 10);
      };
      const busyIntervals: Busy[] = (slots || [])
        .filter(s => s.is_available === false)
        .map(s => {
          const startMin = toMinutes(String(s.slot_time));
          const dur = typeof (s as any).duration_minutes === 'number' ? (s as any).duration_minutes : 60;
          return { startMin, endMin: startMin + dur } as Busy;
        })
        .sort((a, b) => a.startMin - b.startMin);

      // business hours for that date's day-of-week
      const dt = new Date(selectedDate);
      const dow = dt.getDay();
      let bhQuery = supabase
        .from('business_hours')
        .select('*')
        .eq('day_of_week', dow)
        .eq('is_active', true)
        .eq('business_id', businessId);
      if (params.barberId) {
        bhQuery = bhQuery.eq('user_id', params.barberId as string);
      } else {
        bhQuery = bhQuery.is('user_id', null);
      }
      const { data: bhRow } = await bhQuery.maybeSingle();

      const toHHMM = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      const windowsBase = bhRow
        ? [{ start: bhRow.start_time as string, end: bhRow.end_time as string }]
        : [{ start: '09:00', end: '17:00' }];
      const brks: Array<{ start_time: string; end_time: string }> = (bhRow as any)?.breaks || [];
      const singleBreak = (bhRow && (bhRow as any).break_start_time && (bhRow as any).break_end_time)
        ? [{ start_time: (bhRow as any).break_start_time, end_time: (bhRow as any).break_end_time }]
        : [];
      const allBreaks = [...brks, ...singleBreak];
      let windows = windowsBase as Array<{ start: string; end: string }>;
      for (const b of allBreaks) {
        const next: Array<{ start: string; end: string }> = [];
        for (const w of windows) {
          if (b.end_time <= w.start || b.start_time >= w.end) { next.push(w); continue; }
          if (w.start < b.start_time) next.push({ start: w.start, end: b.start_time });
          if (b.end_time < w.end) next.push({ start: b.end_time, end: w.end });
        }
        windows = next.filter(w => w.start < w.end);
      }

      // Subtract date-specific constraints
      let constraintsQuery = supabase
        .from('business_constraints')
        .select('start_time, end_time')
        .eq('date', selectedDate)
        .eq('business_id', businessId)
        .order('start_time');
      if (params.barberId) {
        constraintsQuery = constraintsQuery.or(`user_id.is.null,user_id.eq.${params.barberId}`);
      } else {
        constraintsQuery = constraintsQuery.is('user_id', null);
      }
      const { data: constraintsRows } = await constraintsQuery;

      let windowsAfterConstraints = windows as Array<{ start: string; end: string }>;
      for (const c of (constraintsRows || []) as Array<{ start_time: string; end_time: string }>) {
        const next: Array<{ start: string; end: string }> = [];
        for (const w of windowsAfterConstraints) {
          if (c.end_time <= w.start || c.start_time >= w.end) { next.push(w); continue; }
          if (w.start < c.start_time) next.push({ start: w.start, end: c.start_time });
          if (c.end_time < w.end) next.push({ start: c.end_time, end: w.end });
        }
        windowsAfterConstraints = next.filter(w => w.start < w.end);
      }

      const normalized = windowsAfterConstraints
        .map(w => ({ startMin: toMinutes(w.start), endMin: toMinutes(w.end) }))
        .filter(w => w.startMin < w.endMin)
        .sort((a, b) => a.startMin - b.startMin);

      const times: string[] = [];
      const overlapsBusy = (startMin: number, endMin: number) => {
        return busyIntervals.some(b => Math.max(b.startMin, startMin) < Math.min(b.endMin, endMin));
      };
      const findPrevBusyEnd = (startMin: number) => {
        let prevEnd = -1;
        for (const b of busyIntervals) {
          if (b.endMin <= startMin && b.endMin > prevEnd) prevEnd = b.endMin;
        }
        return prevEnd; // -1 if none
      };
      const findNextBusyStart = (startMin: number) => {
        let nextStart = Number.POSITIVE_INFINITY;
        for (const b of busyIntervals) {
          if (b.startMin >= startMin && b.startMin < nextStart) nextStart = b.startMin;
        }
        return Number.isFinite(nextStart) ? nextStart : -1;
      };

      for (const w of normalized) {
        let tMin = w.startMin;
        while (tMin + durationMinutes <= w.endMin) {
          // Enforce break after the previous busy interval
          const prevEnd = findPrevBusyEnd(tMin);
          if (prevEnd >= 0) {
            const requiredStart = prevEnd + globalBreakMinutes;
            if (tMin < requiredStart) {
              tMin = requiredStart;
              continue;
            }
          }

          const endMin = tMin + durationMinutes;
          // Skip if overlaps an existing busy slot; jump to end of overlap to make progress
          if (overlapsBusy(tMin, endMin)) {
            const overlapped = busyIntervals.find(b => Math.max(b.startMin, tMin) < Math.min(b.endMin, endMin));
            if (overlapped) {
              tMin = overlapped.endMin;
              continue;
            }
          }

          // Enforce break before the next busy interval starts
          const nextStart = findNextBusyStart(tMin);
          if (nextStart >= 0 && (endMin + globalBreakMinutes) > nextStart) {
            tMin = nextStart + globalBreakMinutes;
            continue;
          }

          // Candidate is valid
          const tStr = toHHMM(tMin);
          times.push(tStr);
          tMin += durationMinutes;
        }
      }

      // filter past times if today
      const now = new Date();
      const isToday = new Date(selectedDate).toDateString() === now.toDateString();
      const filtered = isToday
        ? times.filter(t => {
            const [hh, mm] = t.split(':').map(n => parseInt(n, 10));
            const dt2 = new Date(selectedDate);
            dt2.setHours(hh, mm, 0, 0);
            return dt2.getTime() >= now.getTime();
          })
        : times;

      if (!isStaleLocal) setAvailableTimes(filtered);
    } catch (e) {
      setAvailableTimes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadTimes();
  }, [selectedDate, durationMinutes, globalBreakMinutes]);

  useFocusEffect(
    React.useCallback(() => {
      reloadTimes();
      return () => {};
    }, [selectedDate, durationMinutes])
  );

  const footerBottom = Math.max(insets.bottom, 16) + 80;
  const canBook = !!selectedTime && !booking;

  // Build phone variants (0XXXXXXXXX <-> +972XXXXXXXXX)
  const buildPhoneVariants = (phoneRaw: string) => {
    const variants = new Set<string>();
    const onlyDigits = phoneRaw.replace(/[^+\d]/g, '');
    if (onlyDigits) {
      variants.add(onlyDigits);
      if (onlyDigits.startsWith('0')) variants.add(`+972${onlyDigits.slice(1)}`);
      if (onlyDigits.startsWith('+972')) {
        const rest = onlyDigits.slice(4);
        if (rest && !rest.startsWith('0')) variants.add(`0${rest}`);
      }
    }
    return Array.from(variants);
  };

  // Find same-day existing appointment for this user
  const findSameDayAppointment = async (): Promise<any | null> => {
    try {
      const businessId = getBusinessId();
      const phone = (user?.phone || '').trim();
      const name = (user?.name || '').trim();
      const variants = buildPhoneVariants(phone);
      if (variants.length > 0) {
        const { data, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('slot_date', selectedDate)
          .eq('is_available', false)
          .eq('business_id', businessId)
          .in('client_phone', variants)
          .order('slot_time');
        if (error) return null;
        return (data && data.length > 0) ? data[0] : null;
      }
      if (name) {
        const { data, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('slot_date', selectedDate)
          .eq('is_available', false)
          .eq('business_id', businessId)
          .ilike('client_name', `%${name}%`)
          .order('slot_time');
        if (error) return null;
        return (data && data.length > 0) ? data[0] : null;
      }
      return null;
    } catch {
      return null;
    }
  };

  const cancelExistingAppointment = async (appointmentId: string) => {
    const businessId = getBusinessId();
    const { error } = await supabase
      .from('appointments')
      .update({
        is_available: true,
        client_name: null,
        client_phone: null,
        service_name: 'Available Slot', // Set to default value instead of null
      })
      .eq('id', appointmentId)
      .eq('business_id', businessId);
    return !error;
  };

  const handleBook = async () => {
    if (!selectedTime) return;
    try {
      setBooking(true);
      const businessId = getBusinessId();
      const serviceId = params.serviceId;
      const barberId = params.barberId;
      
      
      // Try update existing free slot at date+time
      const updateData = {
        is_available: false,
        client_name: user?.name || 'לקוח',
        client_phone: user?.phone || '',
        service_name: serviceName,
        duration_minutes: durationMinutes,
        business_id: businessId,
        service_id: serviceId || null,
        barber_id: barberId || null,
        user_id: user?.id || null,
      };
      
      
      const { data: updated, error: updateError } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('slot_date', selectedDate)
        .eq('slot_time', selectedTime)
        .eq('business_id', businessId)
        .eq('is_available', true)
        .select()
        .maybeSingle();


      let success = updated;
      if (!updateError && !updated) {
        // Ensure no conflicting row exists
        const { data: existing } = await supabase
          .from('appointments')
          .select('id')
          .eq('slot_date', selectedDate)
          .eq('slot_time', selectedTime)
          .eq('business_id', businessId);
        if (!existing || existing.length === 0) {
          const insertData = {
            slot_date: selectedDate,
            slot_time: selectedTime,
            is_available: false,
            client_name: user?.name || 'לקוח',
            client_phone: user?.phone || '',
            service_name: serviceName,
            duration_minutes: durationMinutes,
            business_id: businessId,
            service_id: serviceId || null,
            barber_id: barberId || null,
            user_id: user?.id || null,
          };
          
          
          const { data: inserted, error: insertError } = await supabase
            .from('appointments')
            .insert([insertData])
            .select()
            .single();
            
          
          success = inserted;
        }
      }

      if (success) {
        const header = `Your appointment for\n"${serviceName}"`;
        setSuccessMessage(header);
        setShowSuccessModal(true);
        try {
          const title = 'New appointment booked';
          const content = `${user?.name || 'Client'} (${user?.phone || ''}) booked an appointment for "${serviceName}" on ${selectedDate} at ${formatTime12Hour(selectedTime)}`;
          const assignedAdminId = params.barberId as string | undefined;
          if (assignedAdminId) {
            notificationsApi.createAdminNotificationForUserId(assignedAdminId, title, content, 'system').catch(() => {});
          } else {
            notificationsApi.createAdminNotification(title, content, 'system').catch(() => {});
          }
        } catch {}
        // Navigate safely without relying on multiple back actions
        // ניווט יקרה לאחר אישור חלון ההצלחה
      } else {
        Alert.alert('Error', 'Failed to book appointment. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to book appointment. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  const onPressBook = async () => {
    if (!selectedTime) return;
    setCheckingSameDay(true);
    try {
      const existing = await findSameDayAppointment();
      if (existing) {
        setExistingAppointment(existing);
        setShowReplaceModal(true);
        return;
      }
      await handleBook();
    } finally {
      setCheckingSameDay(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={{ width: 22 }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.title}>Book Appointment</Text>
            <Text style={styles.headerSubtitle}>Select service, day and time</Text>
          </View>
          <View style={{ width: 22 }} />
        </View>
      </View>

      <View style={styles.contentWrapper}>
        <ScrollView contentContainerStyle={{ paddingBottom: footerBottom + 80 }}>
          <View style={styles.sectionHeaderRow}>
            <TouchableOpacity
              onPress={() => router.replace({ pathname: '/(client-tabs)/book-appointment' as any, params: { goto: 'dates', serviceName, selectedDate } as any } as any)}
              style={styles.backCircle}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={18} color="#000000" />
            </TouchableOpacity>
            <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Select Time</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={styles.timesList}>
            {loading ? (
              <View style={styles.loadingContainer}><Text style={styles.loadingText}>Loading available times...</Text></View>
            ) : availableTimes.length > 0 ? (
              availableTimes.map((t) => {
                const isSel = selectedTime === t;
                return (
                  <TouchableOpacity key={t} style={[styles.timePill, isSel && styles.timePillSelected]} onPress={() => setSelectedTime(isSel ? null : t)} activeOpacity={0.7}>
                    <View style={styles.timePillContent}>
                      <View style={styles.timePillLeftSection}>
                        <Text style={[styles.timePillLabel, isSel && styles.timePillLabelSelected]}>{formatTime12Hour(t)}</Text>
                        <View style={[styles.timePillTag, isSel && styles.timePillTagSelected]}>
                          <Text style={[styles.timePillTagText, isSel && styles.timePillTagTextSelected]}>Available</Text>
                        </View>
                      </View>
                      <View style={styles.timePillRightSection}>
                        {isSel && (
                          <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.loadingContainer}><Text style={styles.loadingText}>No available times for this day</Text></View>
            )}
          </View>
        </ScrollView>
      </View>

      <View style={[styles.footer, { bottom: Math.max(insets.bottom, 16) + 80 }]}>
        <TouchableOpacity
          style={[styles.bookBtn, (!canBook || checkingSameDay) && styles.bookBtnDisabled]}
          disabled={!canBook || checkingSameDay}
          onPress={onPressBook}
        >
          <Text style={styles.bookBtnText}>{booking ? 'Booking appointment...' : (checkingSameDay ? 'Checking existing appointment...' : `Book Appointment - $${params.price || 0}`)}</Text>
        </TouchableOpacity>
      </View>

      {existingAppointment && showReplaceModal && (
        <Modal
          visible={showReplaceModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowReplaceModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>You have an existing appointment</Text>
              <Text style={styles.modalMessage} numberOfLines={0} allowFontScaling={false}>
                You have an existing appointment on {existingAppointment?.slot_date ? new Date(existingAppointment.slot_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'unknown date'} at {existingAppointment?.slot_time ? formatTime12Hour(existingAppointment.slot_time) : 'unknown time'} for {existingAppointment?.service_name || 'unknown service'}.
                {'\n'}
                {'\n'}
                Would you like to replace the existing appointment with the new one at {selectedTime ? formatTime12Hour(selectedTime) : 'unknown time'} or book an additional appointment?
              </Text>
              <View style={[styles.modalButtons, styles.modalButtonsStacked]}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, styles.modalButtonCancel]}
                  onPress={() => setShowReplaceModal(false)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, styles.modalButtonReplace]}
                  onPress={async () => {
                    setShowReplaceModal(false);
                    if (existingAppointment?.id) {
                      const ok = await cancelExistingAppointment(existingAppointment.id);
                      if (!ok) {
                        Alert.alert('Error', 'Failed to cancel existing appointment');
                        return;
                      }
                    }
                    await handleBook();
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalButtonText}>Replace Appointment</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, styles.modalButtonBookAdditional]}
                  onPress={async () => {
                    setShowReplaceModal(false);
                    await handleBook();
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalButtonText}>Book Additional</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {showSuccessModal && (
        <Modal
          visible={showSuccessModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <View style={styles.modalOverlay}>
            <BlurView style={StyleSheet.absoluteFill} intensity={24} tint="dark" />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Appointment Booked</Text>
              <View style={styles.appointmentChips}>
                {selectedDate ? (
                  <View style={styles.chip}>
                    <Ionicons name="calendar" size={14} color={colors.primary} style={styles.chipIcon} />
                    <Text style={styles.chipText}>{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                  </View>
                ) : null}
                {selectedTime ? (
                  <View style={styles.chip}>
                    <Ionicons name="time-outline" size={14} color={colors.primary} style={styles.chipIcon} />
                    <Text style={styles.chipText}>{formatTime12Hour(selectedTime)}</Text>
                  </View>
                ) : null}
                {serviceName ? (
                  <View style={styles.chip}>
                    <Ionicons name="pricetag" size={14} color={colors.primary} style={styles.chipIcon} />
                    <Text style={styles.chipText}>{serviceName}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.modalButtons, styles.modalButtonsStacked]}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, styles.modalButtonSecondary]}
                  onPress={async () => {
                    try {
                      const duration = durationMinutes;
                      const timeStr = selectedTime || '00:00';
                      const start = new Date(`${selectedDate}T${timeStr}:00`);
                      const end = new Date(start.getTime() + duration * 60000);

                      const perm = await Calendar.requestCalendarPermissionsAsync();
                      if (perm.status !== 'granted') {
                        Alert.alert('נדרש אישור', 'נדרש אישור גישה ליומן כדי להוסיף אירוע.');
                        return;
                      }

                      let calendarId: string | undefined;
                      if (Platform.OS === 'ios') {
                        const defCal = await Calendar.getDefaultCalendarAsync();
                        calendarId = defCal?.id;
                      } else {
                        const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
                        calendarId = cals.find((c: any) => (c.allowsModifications || c.accessLevel === Calendar.CalendarAccessLevel.OWNER))?.id || cals[0]?.id;
                      }

                      if (!calendarId) {
                        Alert.alert('שגיאה', 'לא נמצא יומן שניתן לכתוב אליו.');
                        return;
                      }

                      await Calendar.createEventAsync(calendarId, {
                        title: serviceName || 'Appointment',
                        startDate: start,
                        endDate: end,
                        notes: 'Booked via the app',
                      });

                      Alert.alert('נוסף', 'האירוע נוסף ליומן שלך.');
                    } catch (e) {
                      Alert.alert('שגיאה', 'לא ניתן להוסיף את האירוע ליומן.');
                    }
                  }}
                  activeOpacity={0.9}
                >
                  <View style={styles.modalButtonRow}>
                    <Ionicons name="calendar-outline" size={20} color="#000000" style={styles.modalButtonIcon} />
                    <Text style={styles.modalButtonSecondaryText}>Add to Calendar</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, styles.modalButtonPrimary]}
                  onPress={() => {
                    setShowSuccessModal(false);
                    try {
                      (router as any).replace?.('/(client-tabs)/appointments');
                    } catch {
                      (router as any).push?.('/(client-tabs)/appointments');
                    }
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalButtonText}>Got it</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 104,
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(142,142,147,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.3,
    writingDirection: 'ltr',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 0,
    textAlign: 'center',
    letterSpacing: -0.3,
    writingDirection: 'ltr',
  },
  sectionTitleCentered: {
    textAlign: 'center',
  },
  timesList: {
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F2F2F7',
    minHeight: 60,
  },
  timePillSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0F8FF',
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
  },
  timePillLabel: {
    fontSize: 18,
    color: '#1C1C1E',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  timePillLabelSelected: {
    color: colors.primary,
  },
  timePillContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timePillLeftSection: {
    flex: 1,
  },
  timePillRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  timePillTag: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  timePillTagSelected: {
    backgroundColor: '#E3F2FD',
  },
  timePillTagText: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  timePillTagTextSelected: {
    color: colors.primary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '88%',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  bookBtnDisabled: {
    backgroundColor: '#8E8E93',
    shadowOpacity: 0,
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.2,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  // Apple-like modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    width: '86%',
    maxWidth: 440,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.4,
    writingDirection: 'ltr',
  },
  modalMessage: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 24,
    letterSpacing: -0.2,
    fontWeight: '500',
    writingDirection: 'ltr',
  },
  scheduleBlock: {
    width: '100%',
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  scheduleLine: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 6,
  },
  scheduleDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  scheduleTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  // Stacked layout for long labels on small screens
  modalButtonsStacked: {
    flexDirection: 'column',
    gap: 12,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  modalButtonStacked: {
    width: '100%',
    flex: 0,
    minHeight: 50,
  },
  modalButtonCancel: {
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  modalButtonReplace: {
    backgroundColor: '#FF9500',
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  modalButtonCalendar: {
    backgroundColor: '#4285F4',
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  modalButtonPrimary: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modalButtonSecondary: {
    backgroundColor: 'rgba(0,122,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,122,255,0.12)',
  },
  modalButtonBookAdditional: {
    backgroundColor: '#34C759',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
    writingDirection: 'ltr',
  },
  modalButtonSecondaryText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
    writingDirection: 'ltr',
  },
  modalButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonIcon: {
    marginRight: 8,
  },
  modalIconWrapper: {
    alignItems: 'center',
    marginBottom: 8,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  infoSection: {
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(118,118,128,0.08)',
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoIcon: {
    marginRight: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  infoLabel: {
    color: '#3A3A3C',
    fontWeight: '600',
  },
  // Chips for success modal (date, time, service)
  appointmentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  modalButtonCancelText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
    writingDirection: 'ltr',
  },
});


