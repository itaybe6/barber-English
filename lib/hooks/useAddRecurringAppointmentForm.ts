import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase, getBusinessId } from '@/lib/supabase';
import { servicesApi, filterServicesForBookingBarber } from '@/lib/api/services';
import { recurringAppointmentsApi, type RecurringAppointment } from '@/lib/api/recurringAppointments';
import type { Service } from '@/lib/supabase';
import {
  type AdminClientPick,
  type AdminClientEntryMode,
  totalServicesDurationMinutes,
} from '@/lib/hooks/useAdminAddAppointmentForm';
import { usersApi } from '@/lib/api/users';
import { appointmentBarberSlotOrFilter } from '@/lib/api/clientWeekAvailability';

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

type BusyInterval = { startMin: number; endMin: number };

/** Merges overlapping/adjacent busy ranges so chain-free checks stay fast. */
function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.startMin - b.startMin);
  const out: BusyInterval[] = [];
  let cur = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (n.startMin <= cur.endMin) {
      cur = { startMin: cur.startMin, endMin: Math.max(cur.endMin, n.endMin) };
    } else {
      out.push(cur);
      cur = n;
    }
  }
  out.push(cur);
  return out;
}

/** Same calendar window as `isStartTimeChainAvailable` — never load unbounded `appointments`. */
function recurringBookedAppointmentsDateRange(): { from: string; to: string } {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const to = new Date();
  to.setDate(to.getDate() + 30);
  return { from: from.toISOString().split('T')[0]!, to: to.toISOString().split('T')[0]! };
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function minutesFromHHMM(hhmm: string): number {
  const parts = String(hhmm).slice(0, 5).split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
}

function hhmmFromMinutes(mins: number): string {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function useAddRecurringAppointmentForm(onCreated?: () => void) {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();

  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<AdminClientPick[]>([]);
  const [filteredClients, setFilteredClients] = useState<AdminClientPick[]>([]);
  const [selectedClient, setSelectedClient] = useState<AdminClientPick | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

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

  const [services, setServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServicesState] = useState<Service[]>([]);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const setSelectedServices = useCallback((next: Service[]) => {
    setSelectedServicesState(next);
    setSelectedTime(null);
  }, []);

  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | null>(null);

  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);
  const loadTimesSeqRef = useRef(0);

  const [repeatWeeks, setRepeatWeeks] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  /** `null` while loading; sorted 0–6 indices with active business hours for this barber (or global fallback). */
  const [activeDaysOfWeek, setActiveDaysOfWeek] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setActiveDaysOfWeek(null);
      try {
        const businessId = getBusinessId();
        const uid = user?.id;

        const { data: globalBh } = await supabase
          .from('business_hours')
          .select('day_of_week,start_time,end_time,is_active')
          .eq('business_id', businessId)
          .is('user_id', null);

        let userBh: unknown[] = [];
        if (uid) {
          const { data: ub } = await supabase
            .from('business_hours')
            .select('day_of_week,start_time,end_time,is_active')
            .eq('business_id', businessId)
            .eq('user_id', uid);
          userBh = ub || [];
        }
        if (cancelled) return;

        type BhRow = {
          day_of_week: number;
          start_time?: string | null;
          end_time?: string | null;
          is_active?: boolean | null;
        };
        const u = (userBh || []) as BhRow[];
        const g = (globalBh || []) as BhRow[];
        const normalizeTime = (s: unknown) => String(s ?? '').trim();

        const active: number[] = [];
        for (let dow = 0; dow <= 6; dow++) {
          const uRow = uid ? u.find((r) => r.day_of_week === dow && r.is_active) : undefined;
          const gRow = g.find((r) => r.day_of_week === dow && r.is_active);
          const row = uRow || gRow;
          if (!row) continue;
          const st = normalizeTime(row.start_time);
          const enT = normalizeTime(row.end_time);
          if (!st || !enT) continue;
          if (st.localeCompare(enT) >= 0) continue;
          active.push(dow);
        }
        setActiveDaysOfWeek(active.sort((a, b) => a - b));
      } catch {
        if (!cancelled) setActiveDaysOfWeek([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (activeDaysOfWeek === null) return;
    if (selectedDayOfWeek !== null && !activeDaysOfWeek.includes(selectedDayOfWeek)) {
      setSelectedDayOfWeek(null);
    }
  }, [activeDaysOfWeek, selectedDayOfWeek]);

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

      let recurringPhones = new Set<string>();
      try {
        const { data: recs } = await supabase
          .from('recurring_appointments')
          .select('client_phone')
          .eq('business_id', businessId)
          .eq('admin_id', user?.id);
        recurringPhones = new Set(
          (recs || []).map((r: { client_phone?: string }) => String(r.client_phone || '').trim()).filter(Boolean),
        );
      } catch {
        recurringPhones = new Set();
      }

      const validClients = (data || [])
        .filter((client: { phone?: string }) => client.phone && String(client.phone).trim() !== '')
        .filter((client: { phone?: string }) => !recurringPhones.has(String(client.phone).trim()))
        .map((client: { id?: string; name?: string; phone: string }) => ({
          id: typeof client.id === 'string' ? client.id : undefined,
          name: client.name || t('admin.appointmentsAdmin.client', 'Client'),
          phone: client.phone,
        }));

      setClients(validClients);
      setFilteredClients(validClients);
    } catch {
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.loadClientsFailed', 'Error loading client list'));
    }
  }, [t, user?.id]);

  const loadServices = useCallback(async () => {
    try {
      const all = await servicesApi.getAllServices();
      setServices(filterServicesForBookingBarber(all, user?.id, 1));
    } catch {
      setServices([]);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadClients();
    void loadServices();
  }, [loadClients, loadServices]);

  useEffect(() => {
    const query = clientSearch.trim().toLowerCase();
    if (query === '') {
      setFilteredClients(clients);
    } else {
      setFilteredClients(
        clients.filter(
          (client) => client.name.toLowerCase().includes(query) || client.phone.includes(query),
        ),
      );
    }
  }, [clientSearch, clients]);

  /** True if every service segment from `startHHmm` is free (no recurring start at that clock time; no booked overlap). */
  const isStartTimeChainAvailable = useCallback(
    async (dayOfWeek: number, startHHmm: string, svcs: Service[]): Promise<boolean> => {
      if (svcs.length === 0) return false;
      try {
        const businessId = getBusinessId();

        let recurringQuery = supabase
          .from('recurring_appointments')
          .select('slot_time')
          .eq('business_id', businessId)
          .eq('day_of_week', dayOfWeek);
        try {
          if (user?.id) {
            recurringQuery = recurringQuery.eq('user_id', user.id);
          }
        } catch {
          /* ignore */
        }
        const { data: recurring } = await recurringQuery;
        const recurringStarts = new Set((recurring || []).map((r: { slot_time: string }) => String(r.slot_time).slice(0, 5)));

        const { from: bookedFrom, to: bookedTo } = recurringBookedAppointmentsDateRange();

        let bookedQuery = supabase
          .from('appointments')
          .select('slot_time, slot_date, is_available, duration_minutes')
          .eq('business_id', businessId)
          .eq('is_available', false)
          .gte('slot_date', bookedFrom)
          .lte('slot_date', bookedTo)
          .limit(8000);
        if (user?.id) {
          bookedQuery = bookedQuery.or(`${appointmentBarberSlotOrFilter(user.id)},user_id.is.null`);
        } else {
          bookedQuery = bookedQuery.is('user_id', null);
        }
        const { data: allBooked } = await bookedQuery;

        const bookedOnThisDay = (allBooked || []).filter((apt: { slot_date: string }) => {
          const aptDate = new Date(apt.slot_date + 'T00:00:00');
          return aptDate.getDay() === dayOfWeek;
        });
        const busyIntervals = mergeBusyIntervals(
          bookedOnThisDay.map((apt: { slot_time: string; duration_minutes?: number }) => {
            const parts = String(apt.slot_time).slice(0, 5).split(':');
            const hh = parseInt(parts[0] || '0', 10);
            const mm = parseInt(parts[1] || '0', 10);
            const startMin = hh * 60 + mm;
            const dur =
              typeof apt.duration_minutes === 'number' && apt.duration_minutes > 0 ? apt.duration_minutes : 60;
            return { startMin, endMin: startMin + dur };
          }),
        );

        let offsetM = 0;
        for (let i = 0; i < svcs.length; i++) {
          const svc = svcs[i]!;
          const segStart = addMinutesToHHMM(startHHmm, offsetM).slice(0, 5);
          if (recurringStarts.has(segStart)) return false;
          const [sh = 0, smin = 0] = segStart.split(':').map((x) => parseInt(x, 10));
          const s0 = sh * 60 + smin;
          const dur = svc.duration_minutes && svc.duration_minutes > 0 ? svc.duration_minutes : 60;
          const e0 = s0 + dur;
          for (const b of busyIntervals) {
            if (Math.max(b.startMin, s0) < Math.min(b.endMin, e0)) return false;
          }
          offsetM += dur;
        }
        return true;
      } catch {
        return false;
      }
    },
    [user?.id],
  );

  const loadAvailableTimesForDay = useCallback(
    async (dayOfWeek: number) => {
      const mySeq = ++loadTimesSeqRef.current;
      setIsLoadingTimes(true);
      setAvailableTimes([]);
      try {
        const businessId = getBusinessId();

        let bhRow: Record<string, unknown> | null = null;
        try {
          const { data: bhUser } = await supabase
            .from('business_hours')
            .select('*')
            .eq('business_id', businessId)
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true)
            .eq('user_id', user?.id)
            .maybeSingle();
          if (bhUser) bhRow = bhUser as Record<string, unknown>;
        } catch {
          /* ignore */
        }
        if (!bhRow) {
          const { data: bhGlobal } = await supabase
            .from('business_hours')
            .select('*')
            .eq('business_id', businessId)
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true)
            .is('user_id', null)
            .maybeSingle();
          bhRow = (bhGlobal as Record<string, unknown>) || null;
        }

        if (!bhRow) {
          if (mySeq === loadTimesSeqRef.current) setAvailableTimes([]);
          return;
        }

        const normalize = (s: unknown) => String(s).slice(0, 5);

        type Window = { start: string; end: string };
        const startTime = normalize(bhRow.start_time);
        const endTime = normalize(bhRow.end_time);
        const baseWindows: Window[] = [{ start: startTime, end: endTime }];
        const brks = (bhRow.breaks as Array<{ start_time: string; end_time: string }>) || [];
        const singleBreak =
          bhRow.break_start_time && bhRow.break_end_time
            ? [{ start_time: String(bhRow.break_start_time), end_time: String(bhRow.break_end_time) }]
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

        if (selectedServices.length === 0) {
          if (mySeq === loadTimesSeqRef.current) setAvailableTimes([]);
          return;
        }

        let recurringQuery = supabase
          .from('recurring_appointments')
          .select('slot_time')
          .eq('business_id', businessId)
          .eq('day_of_week', dayOfWeek)
          .limit(2000);
        try {
          if (user?.id) {
            recurringQuery = recurringQuery.eq('user_id', user.id);
          }
        } catch {
          /* ignore */
        }
        const { data: recurring } = await recurringQuery;
        const recurringStarts = new Set(
          (recurring || []).map((r: { slot_time: string }) => String(r.slot_time).slice(0, 5)),
        );

        const { from: bookedFrom, to: bookedTo } = recurringBookedAppointmentsDateRange();
        let bookedQuery = supabase
          .from('appointments')
          .select('slot_time, slot_date, is_available, duration_minutes')
          .eq('business_id', businessId)
          .eq('is_available', false)
          .gte('slot_date', bookedFrom)
          .lte('slot_date', bookedTo)
          .limit(8000);
        if (user?.id) {
          bookedQuery = bookedQuery.or(`${appointmentBarberSlotOrFilter(user.id)},user_id.is.null`);
        } else {
          bookedQuery = bookedQuery.is('user_id', null);
        }
        const { data: allBooked } = await bookedQuery;

        const bookedOnThisDay = (allBooked || []).filter((apt: { slot_date: string }) => {
          const aptDate = new Date(apt.slot_date + 'T00:00:00');
          return aptDate.getDay() === dayOfWeek;
        });
        const busyIntervals = mergeBusyIntervals(
          bookedOnThisDay.map((apt: { slot_time: string; duration_minutes?: number }) => {
            const parts = String(apt.slot_time).slice(0, 5).split(':');
            const hh = parseInt(parts[0] || '0', 10);
            const mm = parseInt(parts[1] || '0', 10);
            const startMin = hh * 60 + mm;
            const durM =
              typeof apt.duration_minutes === 'number' && apt.duration_minutes > 0 ? apt.duration_minutes : 60;
            return { startMin, endMin: startMin + durM };
          }),
        );

        const slotFallback =
          (bhRow.slot_duration_minutes as number) && (bhRow.slot_duration_minutes as number) > 0
            ? (bhRow.slot_duration_minutes as number)
            : 60;
        const totalVisitMin = totalServicesDurationMinutes(selectedServices) || slotFallback;

        const chainFreeAt = (startHHmm: string): boolean => {
          let offsetM = 0;
          for (let i = 0; i < selectedServices.length; i++) {
            const svc = selectedServices[i]!;
            const segStart = addMinutesToHHMM(startHHmm, offsetM).slice(0, 5);
            if (recurringStarts.has(segStart)) return false;
            const [sh = 0, smin = 0] = segStart.split(':').map((x) => parseInt(x, 10));
            const s0 = sh * 60 + smin;
            const segDur = svc.duration_minutes && svc.duration_minutes > 0 ? svc.duration_minutes : 60;
            const e0 = s0 + segDur;
            for (const b of busyIntervals) {
              if (Math.max(b.startMin, s0) < Math.min(b.endMin, e0)) return false;
            }
            offsetM += segDur;
          }
          return true;
        };

        /** Same stepping idea as admin `loadAvailableTimesForDate`: walk minutes, yield so RN can paint. */
        const normalizedWindows = windows
          .map((w) => ({
            startMin: minutesFromHHMM(w.start as string),
            endMin: minutesFromHHMM(w.end as string),
          }))
          .filter((w) => w.startMin < w.endMin)
          .sort((a, b) => a.startMin - b.startMin);

        const filtered: string[] = [];
        const YIELD_EVERY = 80;
        let slotWalkGuard = 0;
        let sinceYield = 0;
        walk: for (const w of normalizedWindows) {
          let tMin = w.startMin;
          while (tMin + totalVisitMin <= w.endMin) {
            slotWalkGuard += 1;
            if (slotWalkGuard > 20000) {
              console.warn('[recurring] slot walk exceeded guard — stopping');
              break walk;
            }
            sinceYield += 1;
            if (sinceYield >= YIELD_EVERY) {
              sinceYield = 0;
              await yieldToUi();
              if (mySeq !== loadTimesSeqRef.current) return;
            }
            const startStr = hhmmFromMinutes(tMin);
            if (chainFreeAt(startStr)) filtered.push(startStr);
            tMin += totalVisitMin;
          }
        }

        if (mySeq === loadTimesSeqRef.current) {
          setAvailableTimes(filtered);
          setSelectedTime((prev) => (prev && !filtered.includes(prev) ? null : prev));
        }
      } catch {
        if (mySeq === loadTimesSeqRef.current) {
          setAvailableTimes([]);
          Alert.alert(t('error.generic', 'Error'), t('settings.recurring.timesLoadFailed'));
        }
      } finally {
        if (mySeq === loadTimesSeqRef.current) setIsLoadingTimes(false);
      }
    },
    [user?.id, selectedServices, t],
  );

  const selectedServicesKey = useMemo(
    () => selectedServices.map((s) => String((s as { id?: unknown }).id ?? '')).join(','),
    [selectedServices],
  );

  const loadAvailableTimesNow = useCallback(() => {
    if (selectedDayOfWeek !== null && Number.isInteger(selectedDayOfWeek) && selectedServices.length > 0) {
      void loadAvailableTimesForDay(selectedDayOfWeek);
    } else {
      setAvailableTimes([]);
      setIsLoadingTimes(false);
    }
  }, [selectedDayOfWeek, selectedServices.length, selectedServicesKey, loadAvailableTimesForDay]);

  useEffect(() => {
    setSelectedTime(null);
    setAvailableTimes([]);
  }, [selectedDayOfWeek, selectedServicesKey]);

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
        t('admin.appointmentsAdmin.newClientFieldsInvalid', 'Please enter full name and a valid phone number.'),
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
              'This phone number is already registered. Choose an existing client or use a different number.',
            ),
          );
        } else if (res.code === 'validation') {
          Alert.alert(
            t('error.generic', 'Error'),
            t('admin.appointmentsAdmin.newClientFieldsInvalid', 'Please enter full name and a valid phone number.'),
          );
        } else {
          Alert.alert(
            t('error.generic', 'Error'),
            t('admin.appointmentsAdmin.newClientCreateFailed', 'Could not create the client. Please try again.'),
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

  const submit = useCallback(async () => {
    if (
      !selectedClient ||
      selectedDayOfWeek === null ||
      !selectedTime ||
      selectedServices.length === 0 ||
      repeatWeeks == null ||
      repeatWeeks < 1
    ) {
      Alert.alert(t('error.generic', 'Error'), t('settings.recurring.fillAll'));
      return;
    }
    const stillAvailable = await isStartTimeChainAvailable(selectedDayOfWeek, selectedTime, selectedServices);
    if (!stillAvailable) {
      Alert.alert(t('settings.recurring.slotTakenTitle'), t('settings.recurring.slotTaken'));
      return;
    }
    setIsSubmitting(true);
    const createdIds: string[] = [];
    try {
      let tCursor = selectedTime.slice(0, 5);
      for (let i = 0; i < selectedServices.length; i++) {
        const svc = selectedServices[i]!;
        const recurringData: Omit<RecurringAppointment, 'id' | 'created_at' | 'updated_at'> = {
          client_name: selectedClient.name || t('commonEx.client', 'Client'),
          client_phone: selectedClient.phone,
          day_of_week: selectedDayOfWeek,
          slot_time: tCursor,
          service_name: svc.name,
          service_id: svc.id,
          repeat_interval: repeatWeeks,
          business_id: getBusinessId(),
          admin_id: user?.id ?? null,
          client_id: selectedClient.id ?? null,
        };
        const created = await recurringAppointmentsApi.create(recurringData);
        if (!created) {
          for (const id of createdIds) {
            await recurringAppointmentsApi.delete(id);
          }
          Alert.alert(t('error.generic', 'Error'), t('settings.recurring.createFailed'));
          return;
        }
        createdIds.push(created.id);
        const dur = svc.duration_minutes && svc.duration_minutes > 0 ? svc.duration_minutes : 60;
        tCursor = addMinutesToHHMM(tCursor, dur);
      }
      Alert.alert(t('success.generic', 'Success'), t('settings.recurring.createSuccess'), [
        { text: t('ok', 'OK'), onPress: () => onCreated?.() },
      ]);
    } catch {
      for (const id of createdIds) {
        await recurringAppointmentsApi.delete(id);
      }
      Alert.alert(t('error.generic', 'Error'), t('settings.recurring.createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedClient,
    selectedDayOfWeek,
    selectedTime,
    selectedServices,
    repeatWeeks,
    user?.id,
    isStartTimeChainAvailable,
    t,
    onCreated,
  ]);

  const onPickTime = useCallback(
    async (timeStr: string) => {
      if (selectedDayOfWeek === null) return;
      const ok = await isStartTimeChainAvailable(selectedDayOfWeek, timeStr, selectedServices);
      if (!ok) {
        Alert.alert(t('settings.recurring.slotTakenTitle'), t('settings.recurring.slotTaken'));
        return;
      }
      setSelectedTime(timeStr);
    },
    [selectedDayOfWeek, selectedServices, isStartTimeChainAvailable, t],
  );

  const reset = useCallback(() => {
    setClientSearch('');
    setSelectedClient(null);
    setSelectedDayOfWeek(null);
    setSelectedTime(null);
    setSelectedServicesState([]);
    setRepeatWeeks(null);
    setShowClientDropdown(false);
    setShowServiceDropdown(false);
    setAvailableTimes([]);
    setClientEntryModeState('existing');
    setNewClientFullName('');
    setNewClientPhone('');
    setIsFinalizingClientStep(false);
    setFilteredClients(clients);
  }, [clients]);

  /** Synthetic date for summary chip (weekday only — next occurrence of that weekday). */
  const summaryDateForChips = useMemo((): Date | null => {
    if (selectedDayOfWeek === null) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cur = today.getDay();
    const add = (selectedDayOfWeek - cur + 7) % 7;
    const d = new Date(today);
    d.setDate(today.getDate() + add);
    return d;
  }, [selectedDayOfWeek]);

  return {
    clientSearch,
    setClientSearch,
    filteredClients,
    selectedClient,
    setSelectedClient,
    showClientDropdown,
    setShowClientDropdown,
    onPickClient,
    clientEntryMode,
    applyClientEntryMode,
    newClientFullName,
    setNewClientFullName,
    newClientPhone,
    setNewClientPhone,
    finalizeClientStepIfNeeded,
    isFinalizingClientStep,
    services,
    selectedServices,
    setSelectedServices,
    showServiceDropdown,
    setShowServiceDropdown,
    selectedDayOfWeek,
    setSelectedDayOfWeek,
    selectedTime,
    setSelectedTime,
    availableTimes,
    isLoadingTimes,
    repeatWeeks,
    setRepeatWeeks,
    isSubmitting,
    submit,
    onPickTime,
    reset,
    loadAvailableTimesNow,
    summaryDateForChips,
    activeDaysOfWeek,
  };
}
