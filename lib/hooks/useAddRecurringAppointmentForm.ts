import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase, getBusinessId } from '@/lib/supabase';
import { servicesApi } from '@/lib/api/services';
import { recurringAppointmentsApi, type RecurringAppointment } from '@/lib/api/recurringAppointments';
import type { Service } from '@/lib/supabase';

export interface RecurringFormClient {
  id?: string;
  name: string;
  phone: string;
}

export function useAddRecurringAppointmentForm(onCreated?: () => void) {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<RecurringFormClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<RecurringFormClient | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | null>(null);

  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);

  const [repeatWeeks, setRepeatWeeks] = useState(1);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchClients = useCallback(
    async (q: string) => {
      setClientSearch(q);
      const query = (q || '').trim();
      const businessId = getBusinessId();

      let builder = supabase
        .from('users')
        .select('id, name, phone')
        .eq('user_type', 'client')
        .eq('business_id', businessId)
        .order('name');
      if (query.length > 0) {
        builder = builder.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
      }
      const { data, error } = await builder;
      if (error) {
        setClientResults([]);
        return;
      }
      const { data: recs } = await supabase
        .from('recurring_appointments')
        .select('client_phone')
        .eq('business_id', businessId)
        .eq('admin_id', user?.id);
      const recurringPhones = new Set(
        (recs || []).map((r: { client_phone?: string }) => String(r.client_phone || '').trim()).filter(Boolean),
      );

      const filtered = (data || [])
        .filter((u: { phone?: string }) => u.phone && String(u.phone).trim() !== '')
        .filter((u: { phone?: string }) => !recurringPhones.has(String(u.phone).trim()));

      setClientResults(filtered as RecurringFormClient[]);
    },
    [user?.id],
  );

  const isTimeAvailable = useCallback(
    async (dayOfWeek: number, timeHHmm: string): Promise<boolean> => {
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
        const recurringTimes = new Set((recurring || []).map((r: { slot_time: string }) => String(r.slot_time).slice(0, 5)));
        if (recurringTimes.has(timeHHmm)) return false;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        let bookedQuery = supabase
          .from('appointments')
          .select('slot_time, slot_date, is_available')
          .eq('business_id', businessId)
          .eq('is_available', false)
          .gte('slot_date', thirtyDaysAgo.toISOString().split('T')[0])
          .lte('slot_date', thirtyDaysFromNow.toISOString().split('T')[0])
          .limit(1000);
        if (user?.id) {
          bookedQuery = bookedQuery.or(`user_id.eq.${user.id},user_id.is.null`);
        } else {
          bookedQuery = bookedQuery.is('user_id', null);
        }
        const { data: allBooked } = await bookedQuery;

        const bookedOnThisDay = (allBooked || []).filter((apt: { slot_date: string }) => {
          const aptDate = new Date(apt.slot_date + 'T00:00:00');
          return aptDate.getDay() === dayOfWeek;
        });
        const bookedTimes = new Set(bookedOnThisDay.map((s: { slot_time: string }) => String(s.slot_time).slice(0, 5)));
        if (bookedTimes.has(timeHHmm)) return false;

        return true;
      } catch {
        return false;
      }
    },
    [user?.id],
  );

  const loadAvailableTimesForDay = useCallback(
    async (dayOfWeek: number) => {
      setIsLoadingTimes(true);
      setAvailableTimes([]);
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout loading times')), 10000),
        );

        const loadPromise = (async () => {
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
            setAvailableTimes([]);
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

          const dur: number =
            selectedService?.duration_minutes && selectedService.duration_minutes > 0
              ? selectedService.duration_minutes
              : (bhRow.slot_duration_minutes as number) && (bhRow.slot_duration_minutes as number) > 0
                ? (bhRow.slot_duration_minutes as number)
                : 60;

          const addMinutes = (hhmm: string, minutes: number): string => {
            const [h, m] = hhmm.split(':').map((x: string) => parseInt(x, 10));
            const total = h * 60 + m + minutes;
            const hh = Math.floor(total / 60) % 24;
            const mm = total % 60;
            return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
          };

          const compareTimes = (a: string, b: string) => a.localeCompare(b);
          const baseTimes: string[] = [];
          for (const w of windows) {
            let tt = w.start as string;
            while (compareTimes(addMinutes(tt, dur), w.end) <= 0) {
              baseTimes.push(tt.slice(0, 5));
              tt = addMinutes(tt, dur);
            }
          }

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
          const recurringTimes = new Set((recurring || []).map((r: { slot_time: string }) => String(r.slot_time).slice(0, 5)));

          let bookedQuery = supabase
            .from('appointments')
            .select('slot_time, slot_date, is_available')
            .eq('business_id', businessId)
            .eq('is_available', false);
          if (user?.id) {
            bookedQuery = bookedQuery.or(`user_id.eq.${user.id},user_id.is.null`);
          } else {
            bookedQuery = bookedQuery.is('user_id', null);
          }
          const { data: allBooked } = await bookedQuery;

          const bookedOnThisDay = (allBooked || []).filter((apt: { slot_date: string }) => {
            const aptDate = new Date(apt.slot_date + 'T00:00:00');
            return aptDate.getDay() === dayOfWeek;
          });
          const bookedTimes = new Set(bookedOnThisDay.map((s: { slot_time: string }) => String(s.slot_time).slice(0, 5)));

          const filtered = baseTimes.filter((tm) => !recurringTimes.has(tm) && !bookedTimes.has(tm));
          setAvailableTimes(filtered);
          setSelectedTime((prev) => (prev && !filtered.includes(prev) ? null : prev));
        })();

        await Promise.race([loadPromise, timeoutPromise]);
      } catch {
        setAvailableTimes([]);
        Alert.alert(t('error.generic', 'Error'), t('settings.recurring.timesLoadFailed'));
      } finally {
        setIsLoadingTimes(false);
      }
    },
    [user?.id, selectedService, t],
  );

  useEffect(() => {
    setClientSearch('');
    setSelectedClient(null);
    setSelectedDayOfWeek(null);
    setSelectedTime(null);
    setSelectedService(null);
    setRepeatWeeks(1);
    setShowClientDropdown(false);
    setShowServiceDropdown(false);
    void searchClients('');
    void (async () => {
      try {
        const all = await servicesApi.getAllServices();
        const mine = (all || []).filter((s) => String(s.worker_id || '') === String(user?.id || ''));
        setServices(mine);
      } catch {
        setServices([]);
      }
    })();
  }, [user?.id, searchClients]);

  useEffect(() => {
    if (selectedDayOfWeek !== null && Number.isInteger(selectedDayOfWeek)) {
      void loadAvailableTimesForDay(selectedDayOfWeek);
    } else {
      setAvailableTimes([]);
      setSelectedTime(null);
    }
  }, [selectedDayOfWeek, selectedService?.id, loadAvailableTimesForDay]);

  const submit = useCallback(async () => {
    if (!selectedClient || selectedDayOfWeek === null || !selectedTime || !selectedService) {
      Alert.alert(t('error.generic', 'Error'), t('settings.recurring.fillAll'));
      return;
    }
    const stillAvailable = await isTimeAvailable(selectedDayOfWeek, selectedTime);
    if (!stillAvailable) {
      Alert.alert(t('settings.recurring.slotTakenTitle'), t('settings.recurring.slotTaken'));
      return;
    }
    setIsSubmitting(true);
    try {
      const recurringData: Omit<RecurringAppointment, 'id' | 'created_at' | 'updated_at'> = {
        client_name: selectedClient.name || t('commonEx.client', 'Client'),
        client_phone: selectedClient.phone,
        day_of_week: selectedDayOfWeek,
        slot_time: selectedTime,
        service_name: selectedService.name,
        service_id: selectedService.id,
        repeat_interval: repeatWeeks,
        business_id: getBusinessId(),
        admin_id: user?.id ?? null,
        client_id: selectedClient.id ?? null,
      };
      const created = await recurringAppointmentsApi.create(recurringData);
      if (created) {
        Alert.alert(t('success.generic', 'Success'), t('settings.recurring.createSuccess'), [
          { text: t('ok', 'OK'), onPress: () => onCreated?.() },
        ]);
      } else {
        Alert.alert(t('error.generic', 'Error'), t('settings.recurring.createFailed'));
      }
    } catch {
      Alert.alert(t('error.generic', 'Error'), t('settings.recurring.createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedClient, selectedDayOfWeek, selectedTime, selectedService, repeatWeeks, user?.id, isTimeAvailable, t, onCreated]);

  const onPickTime = useCallback(
    async (timeStr: string) => {
      if (selectedDayOfWeek === null) return;
      const ok = await isTimeAvailable(selectedDayOfWeek, timeStr);
      if (!ok) {
        Alert.alert(t('settings.recurring.slotTakenTitle'), t('settings.recurring.slotTaken'));
        return;
      }
      setSelectedTime(timeStr);
    },
    [selectedDayOfWeek, isTimeAvailable, t],
  );

  return {
    clientSearch,
    setClientSearch,
    clientResults,
    selectedClient,
    setSelectedClient,
    showClientDropdown,
    setShowClientDropdown,
    searchClients,
    services,
    selectedService,
    setSelectedService,
    showServiceDropdown,
    setShowServiceDropdown,
    selectedDayOfWeek,
    setSelectedDayOfWeek,
    selectedTime,
    availableTimes,
    isLoadingTimes,
    repeatWeeks,
    setRepeatWeeks,
    isSubmitting,
    submit,
    onPickTime,
  };
}
