import { create } from 'zustand/react';
import { WaitlistEntry, supabase, getBusinessId } from '@/lib/supabase';
import { notificationsApi } from '@/lib/api/notifications';
import i18n from '@/src/config/i18n';

function formatWaitlistAdminNotifyDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const lang = i18n.language || 'en';
  return d.toLocaleDateString(lang.startsWith('he') ? 'he-IL' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export type WaitlistInsertWindow = 'morning' | 'afternoon' | 'evening';

function waitlistTimePeriodLabel(period: WaitlistInsertWindow | 'any'): string {
  const key =
    period === 'morning'
      ? 'time_period.morning'
      : period === 'afternoon'
        ? 'time_period.afternoon'
        : period === 'evening'
          ? 'time_period.evening'
          : 'time_period.any';
  return i18n.t(key);
}

function formatJoinedPeriodLabels(periods: WaitlistInsertWindow[]): string {
  return periods.map((p) => waitlistTimePeriodLabel(p)).join(', ');
}

interface WaitlistStore {
  // State
  clientWaitlistEntries: WaitlistEntry[];
  isLoading: boolean;
  error: string | null;

  // Actions
  addToWaitlist: (
    clientName: string,
    clientPhone: string,
    serviceName: string,
    requestedDate: string,
    timePeriods: WaitlistInsertWindow[],
    userId?: string
  ) => Promise<boolean>;

  getClientWaitlistEntries: (clientPhone: string) => Promise<void>;
  removeFromWaitlist: (entryId: string) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

export const useWaitlistStore = create<WaitlistStore>((set) => ({
  // Initial state
  clientWaitlistEntries: [],
  isLoading: false,
  error: null,

  // Add client to waitlist (one DB row per window; skips windows already registered)
  addToWaitlist: async (
    clientName: string,
    clientPhone: string,
    serviceName: string,
    requestedDate: string,
    timePeriods: WaitlistInsertWindow[],
    userId?: string
  ) => {
    set({ isLoading: true, error: null });

    try {
      const businessId = getBusinessId();

      const normalized = [...new Set(timePeriods)].filter(
        (p): p is WaitlistInsertWindow => p === 'morning' || p === 'afternoon' || p === 'evening'
      );
      if (normalized.length === 0) {
        set({
          error: i18n.t('waitlist.selectAtLeastOneWindow', 'Select at least one time window'),
          isLoading: false,
        });
        return false;
      }

      const { data: existingRows, error: existingErr } = await supabase
        .from('waitlist_entries')
        .select('time_period')
        .eq('client_phone', clientPhone)
        .eq('requested_date', requestedDate)
        .eq('status', 'waiting')
        .eq('business_id', businessId);

      if (existingErr) {
        console.error('Error checking waitlist:', existingErr);
        set({ error: i18n.t('waitlist.addError', 'An error occurred while adding to the waitlist'), isLoading: false });
        return false;
      }

      const existing = new Set(
        (existingRows || []).map((r: { time_period: string }) => r.time_period as WaitlistInsertWindow)
      );
      const toInsert = normalized.filter((p) => !existing.has(p));

      if (toInsert.length === 0) {
        set({
          error: i18n.t(
            'waitlist.alreadyRegisteredWindows',
            'You are already on the waitlist for the selected time windows on this date'
          ),
          isLoading: false,
        });
        return false;
      }

      const rows = toInsert.map((time_period) => ({
        client_name: clientName,
        client_phone: clientPhone,
        service_name: serviceName,
        requested_date: requestedDate,
        time_period,
        user_id: userId,
        business_id: businessId,
      }));

      const { data, error } = await supabase.from('waitlist_entries').insert(rows).select();

      if (error) {
        console.error('Error adding to waitlist:', error);
        set({ error: i18n.t('waitlist.addError', 'An error occurred while adding to the waitlist'), isLoading: false });
        return false;
      }

      if (data?.length) {
        set((state) => ({
          clientWaitlistEntries: [...state.clientWaitlistEntries, ...data],
          isLoading: false,
        }));
        try {
          const tAdmin = i18n.getFixedT('he');
          const displayService =
            serviceName === 'General service'
              ? tAdmin('waitlist.anyService', 'כל שירות פנוי')
              : serviceName;
          const title = tAdmin('admin.notify.waitlistJoinTitle', 'לקוח חדש ברשימת ההמתנה');
          const periodLabel = formatJoinedPeriodLabels(toInsert);
          const content = tAdmin('admin.notify.waitlistJoinBody', {
            clientName,
            clientPhone,
            serviceName: displayService,
            dateFormatted: formatWaitlistAdminNotifyDate(requestedDate),
            periodLabel,
          });
          if (userId) {
            notificationsApi
              .createAdminNotificationForUserId(userId, title, content, 'system')
              .catch(() => {});
          } else {
            notificationsApi.createAdminNotification(title, content, 'system').catch(() => {});
          }
        } catch {}
        return true;
      }

      set({ isLoading: false });
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while adding to the waitlist';
      set({ error: errorMessage, isLoading: false });
      return false;
    }
  },

  // Get client's waitlist entries
  getClientWaitlistEntries: async (clientPhone: string) => {
    set({ isLoading: true, error: null });

    try {
      const businessId = getBusinessId();

      const { data, error } = await supabase
        .from('waitlist_entries')
        .select(
          'id, client_name, client_phone, requested_date, service_name, time_period, status, user_id, business_id, created_at, updated_at'
        )
        .eq('client_phone', clientPhone)
        .eq('business_id', businessId)
        .eq('status', 'waiting')
        .order('requested_date', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        console.error('Error fetching client waitlist entries:', error);
        set({ error: 'An error occurred while loading the waitlist', isLoading: false });
        return;
      }

      set({ clientWaitlistEntries: data || [], isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while loading the waitlist';
      set({ error: errorMessage, isLoading: false });
    }
  },

  // Remove from waitlist
  removeFromWaitlist: async (entryId: string) => {
    set({ isLoading: true, error: null });

    try {
      const businessId = getBusinessId();

      const { error } = await supabase
        .from('waitlist_entries')
        .delete()
        .eq('id', entryId)
        .eq('business_id', businessId);

      if (error) {
        console.error('Error removing from waitlist:', error);
        set({ error: 'An error occurred while removing from the waitlist', isLoading: false });
        return false;
      }

      // Remove from local state
      set((state) => ({
        clientWaitlistEntries: state.clientWaitlistEntries.filter((entry) => entry.id !== entryId),
        isLoading: false,
      }));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while removing from the waitlist';
      set({ error: errorMessage, isLoading: false });
      return false;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Reset store
  reset: () => {
    set({
      clientWaitlistEntries: [],
      isLoading: false,
      error: null,
    });
  },
}));
