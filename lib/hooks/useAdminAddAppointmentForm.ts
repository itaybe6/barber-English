import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { supabase, getBusinessId } from '@/lib/supabase';
import { servicesApi } from '@/lib/api/services';
import type { Service } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

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

export interface AdminBookingSaveSuccessPayload {
  client: { name: string; phone: string };
  service: Service;
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
}

export function useAdminAddAppointmentForm({ initialDateKey, onSaveSuccess, onSuccess }: UseAdminAddAppointmentFormOptions) {
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedClient, setSelectedClient] = useState<{ name: string; phone: string } | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const [clients, setClients] = useState<Array<{ name: string; phone: string }>>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [filteredClients, setFilteredClients] = useState<Array<{ name: string; phone: string }>>([]);

  const appliedInitialDateRef = useRef<string | null>(null);

  const loadClients = useCallback(async () => {
    try {
      const businessId = getBusinessId();
      const { data, error } = await supabase
        .from('users')
        .select('name, phone')
        .eq('user_type', 'client')
        .eq('business_id', businessId)
        .order('name');

      if (error) throw error;

      const validClients = (data || [])
        .filter((client: { phone?: string }) => client.phone && client.phone.trim() !== '')
        .map((client: { name?: string; phone: string }) => ({
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
    async (date: Date, service: Service | null) => {
      if (!service) {
        setAvailableTimes([]);
        return;
      }

      setIsLoadingTimes(true);
      setAvailableTimes([]);

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
          setAvailableTimes([]);
          return;
        }

        const normalize = (s: unknown) => String(s).slice(0, 5);
        const startTime = normalize(businessHours.start_time);
        const endTime = normalize(businessHours.end_time);
        const slotDuration =
          service?.duration_minutes && service.duration_minutes > 0
            ? service.duration_minutes
            : (businessHours.slot_duration_minutes as number) || 60;

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
            .filter((apt: { is_available?: boolean }) => apt.is_available === false)
            .map((apt: { slot_time: string }) => String(apt.slot_time).slice(0, 5))
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
          return (constraintsRows || []).some((c: { start_time: string; end_time: string }) => {
            const s = String(c.start_time).slice(0, 5);
            const e = String(c.end_time).slice(0, 5);
            return s <= slot && slot < e;
          });
        };

        const availableSlots = slots.filter((slot) => !bookedTimes.has(slot)).filter((slot) => !withinConstraint(slot));
        setAvailableTimes(availableSlots);
      } catch (error) {
        console.error('Error loading available times:', error);
        Alert.alert(
          t('error.generic', 'Error'),
          t('settings.recurring.timesLoadFailed', 'Failed to load available times. Please try again.')
        );
      } finally {
        setIsLoadingTimes(false);
      }
    },
    [user?.id, t]
  );

  useEffect(() => {
    if (selectedDate && selectedService) {
      void loadAvailableTimesForDate(selectedDate, selectedService);
    } else {
      setAvailableTimes([]);
    }
  }, [selectedDate, selectedService, loadAvailableTimesForDate]);

  const onPickClient = useCallback((client: { name: string; phone: string }) => {
    setSelectedClient(client);
    setShowClientDropdown(false);
    setClientSearch('');
  }, []);

  const onPickService = useCallback((service: Service) => {
    setSelectedService(service);
    setShowServiceDropdown(false);
  }, []);

  const onPickDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

  const onPickTime = useCallback((time: string) => {
    setSelectedTime(time);
  }, []);

  const submit = useCallback(async () => {
    if (!selectedDate || !selectedClient || !selectedService || !selectedTime) {
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.fillAllRequired', 'Please fill in all required fields'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('error.generic', 'Error'), t('admin.appointmentsAdmin.userNotLogged', 'User not logged in'));
      return;
    }

    const dateString = formatDateToLocalString(selectedDate);
    const businessId = getBusinessId();

    const { data: conflictingAppointments } = await supabase
      .from('appointments')
      .select('id')
      .eq('business_id', businessId)
      .eq('slot_date', dateString)
      .eq('slot_time', `${selectedTime}:00`)
      .eq('user_id', user.id);

    if (conflictingAppointments && conflictingAppointments.length > 0) {
      Alert.alert(
        t('settings.recurring.slotTakenTitle', 'Slot taken'),
        t('settings.recurring.slotTaken', 'The selected time is already booked this week. Please choose another time.')
      );
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
        status: 'confirmed',
        client_name: selectedClient.name,
        client_phone: selectedClient.phone,
        service_name: selectedService.name,
        user_id: user.id,
        barber_id: user.id,
      });

      if (error) throw error;

      if (onSaveSuccess) {
        onSaveSuccess({
          client: { name: selectedClient.name, phone: selectedClient.phone },
          service: selectedService,
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
  }, [selectedDate, selectedClient, selectedService, selectedTime, user?.id, t, onSaveSuccess, onSuccess]);

  return {
    selectedDate,
    setSelectedDate,
    selectedClient,
    setSelectedClient,
    selectedService,
    setSelectedService,
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
    onPickService,
    onPickDate,
    onPickTime,
    submit,
  };
}
