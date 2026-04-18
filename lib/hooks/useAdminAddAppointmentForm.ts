import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { supabase, getBusinessId } from '@/lib/supabase';
import { appointmentBarberSlotOrFilter } from '@/lib/api/clientWeekAvailability';
import { servicesApi } from '@/lib/api/services';
import { usersApi } from '@/lib/api/users';
import type { Service } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export type AdminClientPick = { id?: string; name: string; phone: string };
export type AdminClientEntryMode = 'existing' | 'new';

export function formatDateToLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Calendar `YYYY-MM-DD` must not use `new Date(str)` — that is UTC midnight and shifts the local calendar day in many timezones. */
export function parseDateKeyToLocalDate(key: string): Date | null {
  const s = key.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = parseInt(s.slice(0, 4), 10);
  const mo = parseInt(s.slice(5, 7), 10);
  const d = parseInt(s.slice(8, 10), 10);
  const next = new Date(y, mo - 1, d);
  next.setHours(0, 0, 0, 0);
  if (next.getFullYear() !== y || next.getMonth() !== mo - 1 || next.getDate() !== d) return null;
  return next;
}

export function formatTimeToAMPM(time24: string): string {
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minutes} ${ampm}`;
}

/** `HH:MM` 24-hour display (Israel / EU style). Accepts `HH:MM` or `HH:MM:SS`. */
export function formatTime24Hour(time24: string): string {
  const parts = String(time24 || '00:00').trim().split(':');
  const hRaw = parseInt(parts[0] || '0', 10);
  const mRaw = parseInt(parts[1] || '0', 10);
  const h = Number.isFinite(hRaw) ? Math.min(23, Math.max(0, hRaw)) : 0;
  const m = Number.isFinite(mRaw) ? Math.min(59, Math.max(0, mRaw)) : 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Time chips and summaries: 24h for Hebrew / Arabic / Russian (common in IL),
 * 12h AM/PM for English.
 */
export function formatBookingTimeLabel(time24: string, lang: string | undefined | null): string {
  const l = (lang ?? 'he').toLowerCase();
  if (l.startsWith('he') || l.startsWith('iw') || l.startsWith('ar') || l.startsWith('ru')) {
    return formatTime24Hour(time24);
  }
  return formatTimeToAMPM(time24);
}

function triggerMediumHaptic() {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    /* optional */
  }
}

function addMinutesToHHMM(timeHHMM: string, addMinutes: number): string {
  const parts = String(timeHHMM || '00:00').trim().split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  let total = h * 60 + m + addMinutes;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function totalServicesDurationMinutes(svcs: Service[]): number {
  if (!svcs.length) return 60;
  return svcs.reduce(
    (acc, s) => acc + (s.duration_minutes && s.duration_minutes > 0 ? s.duration_minutes : 60),
    0,
  );
}

export interface AdminBookingSaveSuccessPayload {
  client: { name: string; phone: string; id?: string };
  /** First service (calendar / legacy consumers). */
  service: Service;
  /** Full list when several services are booked in one visit. */
  services?: Service[];
  date: Date;
  /** `HH:MM` */
  time: string;
}

export interface UseAdminAddAppointmentFormOptions {
  /** `YYYY-MM-DD` from route params */
  initialDateKey?: string | null;
  /** When set, a successful insert calls this instead of the default success `Alert` (e.g. animated overlay). */
  onSaveSuccess?: (payload: AdminBookingSaveSuccessPayload) => void;
  /** Called after the user acknowledges success (Alert OK, or overlay dismiss). */
  onSuccess?: () => void;
  /** Fixed break between appointments (minutes) — same as client `book-appointment` slot walk. */
  globalBreakMinutes?: number;
}

export function useAdminAddAppointmentForm({
  initialDateKey,
  onSaveSuccess,
  onSuccess,
  globalBreakMinutes = 0,
}: UseAdminAddAppointmentFormOptions) {
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedClient, setSelectedClient] = useState<AdminClientPick | null>(null);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const [clients, setClients] = useState<AdminClientPick[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [filteredClients, setFilteredClients] = useState<AdminClientPick[]>([]);

  const [clientEntryMode, setClientEntryModeState] = useState<AdminClientEntryMode>('existing');

  const applyClientEntryMode = useCallback((mode: AdminClientEntryMode) => {
    setClientEntryModeState(mode);
    setSelectedClient(null);
    if (mode === 'existing') {
      setNewClientFullName('');
      setNewClientPhone('');
    } else {
      setClientSearch('');
      setShowClientDropdown(false);
    }
  }, []);
  const [newClientFullName, setNewClientFullName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [isFinalizingClientStep, setIsFinalizingClientStep] = useState(false);

  const appliedInitialDateRef = useRef<string | null>(null);
  const loadTimesSeqRef = useRef(0);

  const loadClients = useCallback(async () => {
    try {
      const businessId = getBusinessId();
      const { data, error } = await supabase
        .from('users')
        .select('id, name, phone')
        .eq('user_type', 'client')
        .eq('business_id', businessId)
        .order('name');

      if (error) throw error;

      const validClients = (data || [])
        .filter((client: { phone?: string }) => client.phone && client.phone.trim() !== '')
        .map((client: { id?: string; name?: string; phone: string }) => ({
          id: typeof client.id === 'string' ? client.id : undefined,
          name: client.name || t('admin.appointmentsAdmin.client', 'Client'),
          phone: client.phone,
        }));

      setClients(validClients);
      setFilteredClients(validClients);
    } catch (error) {
      console.error('Error loading clients:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.loadClientsFailed', 'Error loading client list'));
    }
  }, [t]);

  const loadServices = useCallback(async () => {
    try {
      const data = await servicesApi.getAllServices();
      setServices(data);
    } catch (error) {
      console.error('Error loading services:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.loadServicesFailed', 'Error loading services list'));
    }
  }, [t]);

  useEffect(() => {
    void loadClients();
    void loadServices();
  }, [loadClients, loadServices]);

  useEffect(() => {
    const key = initialDateKey?.trim() ?? '';
    if (!key) return;
    if (appliedInitialDateRef.current === key) return;
    const next = parseDateKeyToLocalDate(key);
    if (!next) return;
    appliedInitialDateRef.current = key;
    setSelectedDate(next);
    setSelectedTime(null);
  }, [initialDateKey]);

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

  const loadAvailableTimesForDate = useCallback(
    async (date: Date, svcs: Service[]) => {
      if (svcs.length === 0) {
        setAvailableTimes([]);
        setIsLoadingTimes(false);
        return;
      }

      const mySeq = ++loadTimesSeqRef.current;
      setIsLoadingTimes(true);
      setAvailableTimes([]);

      const toMinutes = (time: string) => {
        const parts = String(time).split(':');
        const h = parseInt(parts[0] || '0', 10);
        const m = parseInt(parts[1] || '0', 10);
        return h * 60 + m;
      };
      const toHHMM = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      try {
        const dateString = formatDateToLocalString(date);
        const dayOfWeek = date.getDay();
        const businessId = getBusinessId();

        let businessHours: Record<string, unknown> | null = null;
        try {
          const { data: bhUser } = await supabase
            .from('business_hours')
            .select('*')
            .eq('business_id', businessId)
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true)
            .eq('user_id', user?.id)
            .maybeSingle();
          if (bhUser) businessHours = bhUser as Record<string, unknown>;
        } catch {
          /* keep null */
        }
        if (!businessHours) {
          const { data: bhGlobal } = await supabase
            .from('business_hours')
            .select('*')
            .eq('business_id', businessId)
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true)
            .is('user_id', null)
            .maybeSingle();
          businessHours = (bhGlobal as Record<string, unknown>) || null;
        }

        if (!businessHours) {
          if (mySeq === loadTimesSeqRef.current) {
            setAvailableTimes([]);
          }
          return;
        }

        if (!user?.id) {
          if (mySeq === loadTimesSeqRef.current) {
            setAvailableTimes([]);
          }
          return;
        }

        const normalize = (s: unknown) => String(s).slice(0, 5);
        const startTime = normalize(businessHours.start_time);
        const endTime = normalize(businessHours.end_time);
        const totalDur = totalServicesDurationMinutes(svcs);
        const serviceDuration = Math.max(
          1,
          Number.isFinite(totalDur) && totalDur > 0
            ? totalDur
            : Math.max(1, Number(businessHours.slot_duration_minutes) || 60),
        );
        const breakM = Math.max(0, Math.min(180, Number(globalBreakMinutes) || 0));

        type Window = { start: string; end: string };
        const baseWindows: Window[] = [{ start: startTime, end: endTime }];
        const brks = (businessHours.breaks as Array<{ start_time: string; end_time: string }>) || [];
        const singleBreak =
          businessHours.break_start_time && businessHours.break_end_time
            ? [
                {
                  start_time: String(businessHours.break_start_time),
                  end_time: String(businessHours.break_end_time),
                },
              ]
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

        let windows = subtractBreaks(baseWindows, allBreaks);

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
        for (const c of constraintsRows || []) {
          const s = normalize((c as { start_time: string }).start_time);
          const e = normalize((c as { end_time: string }).end_time);
          const next: Window[] = [];
          for (const w of windows) {
            if (e <= w.start || s >= w.end) {
              next.push(w);
              continue;
            }
            if (w.start < s) next.push({ start: w.start, end: s });
            if (e < w.end) next.push({ start: e, end: w.end });
          }
          windows = next.filter((w) => w.start < w.end);
        }

        const { data: existingAppointments } = await supabase
          .from('appointments')
          .select('slot_time, is_available, duration_minutes')
          .eq('business_id', businessId)
          .eq('slot_date', dateString)
          .or(appointmentBarberSlotOrFilter(user.id));

        type Busy = { startMin: number; endMin: number };
        const busyIntervals: Busy[] = (existingAppointments || [])
          .filter((apt: { is_available?: boolean }) => apt.is_available === false)
          .map((apt: { slot_time: string; duration_minutes?: number }) => {
            const startMin = toMinutes(String(apt.slot_time));
            const dur =
              typeof apt.duration_minutes === 'number' && apt.duration_minutes > 0
                ? apt.duration_minutes
                : 60;
            return { startMin, endMin: startMin + dur };
          })
          .sort((a, b) => a.startMin - b.startMin);

        const normalizedWindows = windows
          .map((w) => ({ startMin: toMinutes(w.start), endMin: toMinutes(w.end) }))
          .filter((w) => w.startMin < w.endMin)
          .sort((a, b) => a.startMin - b.startMin);

        const overlapsBusy = (startMin: number, endMin: number) =>
          busyIntervals.some((b) => Math.max(b.startMin, startMin) < Math.min(b.endMin, endMin));

        const findPrevBusyEnd = (startMin: number) => {
          let prevEnd = -1;
          for (const b of busyIntervals) {
            if (b.endMin <= startMin && b.endMin > prevEnd) prevEnd = b.endMin;
          }
          return prevEnd;
        };

        const findNextBusyStart = (startMin: number) => {
          let nextStart = Number.POSITIVE_INFINITY;
          for (const b of busyIntervals) {
            if (b.startMin >= startMin && b.startMin < nextStart) nextStart = b.startMin;
          }
          return Number.isFinite(nextStart) ? nextStart : -1;
        };

        const times: string[] = [];
        let guard = 0;
        walk: for (const w of normalizedWindows) {
          let tMin = w.startMin;
          while (tMin + serviceDuration <= w.endMin) {
            guard += 1;
            if (guard > 20000) {
              console.warn('[admin] bookable slot walk exceeded guard — stopping');
              break walk;
            }
            const prevEnd = findPrevBusyEnd(tMin);
            if (prevEnd >= 0) {
              const requiredStart = prevEnd + breakM;
              if (tMin < requiredStart) {
                tMin = requiredStart;
                continue;
              }
            }

            const endMin = tMin + serviceDuration;
            if (overlapsBusy(tMin, endMin)) {
              const overlapped = busyIntervals.find(
                (b) => Math.max(b.startMin, tMin) < Math.min(b.endMin, endMin),
              );
              if (overlapped) {
                tMin = overlapped.endMin;
                continue;
              }
            }

            const nextStart = findNextBusyStart(tMin);
            if (nextStart >= 0 && endMin + breakM > nextStart) {
              tMin = nextStart + breakM;
              continue;
            }

            times.push(toHHMM(tMin));
            tMin += serviceDuration;
          }
        }

        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const filtered = isToday
          ? times.filter((slot) => {
              const [hh, mm] = slot.split(':').map((x) => parseInt(x, 10));
              const dt = new Date(date);
              dt.setHours(hh, mm, 0, 0);
              return dt.getTime() >= now.getTime();
            })
          : times;

        if (mySeq === loadTimesSeqRef.current) {
          setAvailableTimes(filtered);
        }
      } catch (error) {
        console.error('Error loading available times:', error);
        if (mySeq === loadTimesSeqRef.current) {
          Alert.alert(
            t('error.generic', 'Error'),
            t('settings.recurring.timesLoadFailed', 'Failed to load available times. Please try again.'),
          );
        }
      } finally {
        if (mySeq === loadTimesSeqRef.current) {
          setIsLoadingTimes(false);
        }
      }
    },
    [user?.id, t, globalBreakMinutes],
  );

  const selectedServicesKey = selectedServices.map((s) => String((s as { id?: unknown }).id ?? '')).join(',');

  /**
   * Explicit trigger – called by the screen when the user advances to step 4.
   * We intentionally do NOT auto-load on date/service change because doing so
   * causes state updates (re-renders) on step 3 that block the JS thread and
   * make the Continue button feel unresponsive when many slots are available.
   */
  const loadAvailableTimesNow = useCallback((dateOverride?: Date) => {
    const dateToUse = dateOverride ?? selectedDate;
    if (dateToUse && selectedServices.length > 0) {
      void loadAvailableTimesForDate(dateToUse, selectedServices);
    } else {
      setAvailableTimes([]);
      setIsLoadingTimes(false);
    }
  // selectedServices is stable by the time we call this (step 3→4 transition)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedServicesKey, loadAvailableTimesForDate]);

  const onPickClient = useCallback((client: AdminClientPick) => {
    setSelectedClient(client);
    setShowClientDropdown(false);
    setClientSearch('');
  }, []);

  const finalizeClientStepIfNeeded = useCallback(async (): Promise<boolean> => {
    if (clientEntryMode === 'existing') {
      return !!selectedClient;
    }
    const name = newClientFullName.trim();
    const phone = newClientPhone.trim();
    const digits = phone.replace(/\D/g, '');
    if (name.length < 2 || digits.length < 9) {
      Alert.alert(
        t('error.generic', 'Error'),
        t('admin.appointmentsAdmin.newClientFieldsInvalid', 'Please enter full name and a valid phone number.')
      );
      return false;
    }
    if (selectedClient?.id && selectedClient.name === name && selectedClient.phone === phone) {
      return true;
    }
    setIsFinalizingClientStep(true);
    try {
      const res = await usersApi.createClientForAdminBooking({ name, phone });
      if (!res.ok) {
        if (res.code === 'duplicate_phone') {
          Alert.alert(
            t('error.generic', 'Error'),
            t(
              'admin.appointmentsAdmin.newClientDuplicate',
              'This phone number is already registered. Choose an existing client or use a different number.'
            )
          );
        } else if (res.code === 'validation') {
          Alert.alert(
            t('error.generic', 'Error'),
            t('admin.appointmentsAdmin.newClientFieldsInvalid', 'Please enter full name and a valid phone number.')
          );
        } else {
          Alert.alert(
            t('error.generic', 'Error'),
            t('admin.appointmentsAdmin.newClientCreateFailed', 'Could not create the client. Please try again.')
          );
        }
        return false;
      }
      setSelectedClient({
        id: res.user.id,
        name: res.user.name,
        phone: res.user.phone,
      });
      void loadClients();
      return true;
    } finally {
      setIsFinalizingClientStep(false);
    }
  }, [clientEntryMode, selectedClient, newClientFullName, newClientPhone, t, loadClients]);

  const onPickDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

  const onPickTime = useCallback((time: string) => {
    setSelectedTime(time);
  }, []);

  const reset = useCallback(() => {
    appliedInitialDateRef.current = null;
    setSelectedClient(null);
    setSelectedServices([]);
    setSelectedTime(null);
    setSelectedDate(null);
    setClientSearch('');
    setShowClientDropdown(false);
    setShowServiceDropdown(false);
    setAvailableTimes([]);
    setFilteredClients(clients);
    setClientEntryModeState('existing');
    setNewClientFullName('');
    setNewClientPhone('');
    setIsFinalizingClientStep(false);
    setIsLoadingTimes(false);
  }, [clients]);

  const submit = useCallback(async () => {
    if (!selectedDate || !selectedClient || selectedServices.length === 0 || !selectedTime) {
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.fillAllRequired', 'Please fill in all required fields'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.userNotLogged', 'User not logged in'));
      return;
    }

    const dateString = formatDateToLocalString(selectedDate);
    const businessId = getBusinessId();
    const timeStart = String(selectedTime).slice(0, 5);

    let cursorTime = timeStart;
    for (const svc of selectedServices) {
      const { data: conflictingAppointments } = await supabase
        .from('appointments')
        .select('id')
        .eq('business_id', businessId)
        .eq('slot_date', dateString)
        .eq('slot_time', `${cursorTime}:00`)
        .eq('user_id', user.id);

      if (conflictingAppointments && conflictingAppointments.length > 0) {
        Alert.alert(
          t('settings.recurring.slotTakenTitle', 'Slot taken'),
          t('settings.recurring.slotTaken', 'The selected time is already booked this week. Please choose another time.')
        );
        return;
      }
      const dur = svc.duration_minutes && svc.duration_minutes > 0 ? svc.duration_minutes : 60;
      cursorTime = addMinutesToHHMM(cursorTime, dur);
    }

    setIsSubmitting(true);
    triggerMediumHaptic();

    try {
      let insertTime = timeStart;
      for (const svc of selectedServices) {
        const insertRow: Record<string, unknown> = {
          business_id: businessId,
          slot_date: dateString,
          slot_time: `${insertTime}:00`,
          is_available: false,
          status: 'confirmed',
          client_name: selectedClient.name,
          client_phone: selectedClient.phone,
          service_name: svc.name,
          user_id: user.id,
          barber_id: user.id,
        };
        if (selectedClient.id) {
          insertRow.client_user_id = selectedClient.id;
        }
        const sid = (svc as { id?: string }).id;
        if (sid) insertRow.service_id = sid;

        const { error } = await supabase.from('appointments').insert(insertRow);
        if (error) throw error;

        const dur = svc.duration_minutes && svc.duration_minutes > 0 ? svc.duration_minutes : 60;
        insertTime = addMinutesToHHMM(insertTime, dur);
      }

      const primary = selectedServices[0]!;

      if (onSaveSuccess) {
        onSaveSuccess({
          client: {
            name: selectedClient.name,
            phone: selectedClient.phone,
            ...(selectedClient.id ? { id: selectedClient.id } : {}),
          },
          service: primary,
          services: selectedServices.length > 1 ? selectedServices : undefined,
          date: selectedDate,
          time: selectedTime,
        });
      } else {
        Alert.alert(t('success.generic', 'Success'), t('admin.appointmentsAdmin.scheduled', 'Appointment scheduled successfully'), [
          {
            text: t('ok', 'OK'),
            onPress: () => {
              onSuccess?.();
            },
          },
        ]);
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.scheduleFailed', 'Error scheduling appointment'));
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedDate, selectedClient, selectedServices, selectedTime, user?.id, t, onSaveSuccess, onSuccess]);

  return {
    selectedDate,
    setSelectedDate,
    selectedClient,
    setSelectedClient,
    selectedServices,
    setSelectedServices,
    selectedTime,
    setSelectedTime,
    showClientDropdown,
    setShowClientDropdown,
    showServiceDropdown,
    setShowServiceDropdown,
    clients,
    services,
    filteredClients,
    clientSearch,
    setClientSearch,
    availableTimes,
    isLoadingTimes,
    isSubmitting,
    onPickClient,
    onPickDate,
    onPickTime,
    submit,
    reset,
    clientEntryMode,
    applyClientEntryMode,
    newClientFullName,
    setNewClientFullName,
    newClientPhone,
    setNewClientPhone,
    finalizeClientStepIfNeeded,
    isFinalizingClientStep,
    loadAvailableTimesNow,
  };
}
