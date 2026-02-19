import { create } from 'zustand/react';
import { WaitlistEntry, supabase, getBusinessId } from '@/lib/supabase';
import { notificationsApi } from '@/lib/api/notifications';

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
    timePeriod: 'morning' | 'afternoon' | 'evening' | 'any',
    userId?: string
  ) => Promise<boolean>;
  
  getClientWaitlistEntries: (clientPhone: string) => Promise<void>;
  removeFromWaitlist: (entryId: string) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

export const useWaitlistStore = create<WaitlistStore>((set, get) => ({
  // Initial state
  clientWaitlistEntries: [],
  isLoading: false,
  error: null,

  // Add client to waitlist
  addToWaitlist: async (
    clientName: string,
    clientPhone: string,
    serviceName: string,
    requestedDate: string,
    timePeriod: 'morning' | 'afternoon' | 'evening' | 'any',
    userId?: string
  ) => {
    set({ isLoading: true, error: null });
    
    try {
      const businessId = getBusinessId();
      
      // Check if client is already on waitlist for this date
      const { data: existingEntry } = await supabase
        .from('waitlist_entries')
        .select('*')
        .eq('client_phone', clientPhone)
        .eq('requested_date', requestedDate)
        .eq('status', 'waiting')
        .eq('business_id', businessId)
        .single();

      if (existingEntry) {
        set({ error: 'You are already on the waitlist for this date', isLoading: false });
        return false;
      }

      const { data, error } = await supabase
        .from('waitlist_entries')
        .insert({
          client_name: clientName,
          client_phone: clientPhone,
          service_name: serviceName,
          requested_date: requestedDate,
          time_period: timePeriod,
          user_id: userId,
          business_id: businessId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding to waitlist:', error);
        set({ error: 'An error occurred while adding to the waitlist', isLoading: false });
        return false;
      }

      if (data) {
        // Add to local state
        set(state => ({
          clientWaitlistEntries: [...state.clientWaitlistEntries, data],
          isLoading: false,
        }));
        try {
          const periodLabel: Record<'morning' | 'afternoon' | 'evening' | 'any', string> = {
            morning: 'Morning',
            afternoon: 'Afternoon',
            evening: 'Evening',
            any: 'Any time',
          };
          const title = 'New client joined the waitlist';
          const content = `${clientName} (${clientPhone}) joined the waitlist for "${serviceName}" on ${requestedDate} for ${periodLabel[timePeriod]} period.`;
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
        .select('*')
        .eq('client_phone', clientPhone)
        .eq('business_id', businessId)
        .order('requested_date', { ascending: true })
        .order('created_at', { ascending: true });

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
      set(state => ({
        clientWaitlistEntries: state.clientWaitlistEntries.filter(entry => entry.id !== entryId),
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