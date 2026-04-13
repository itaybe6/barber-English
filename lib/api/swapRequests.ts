import { supabase, getBusinessId } from '../supabase';
import type { SwapRequest, Appointment } from '../supabase';
import { notificationsApi } from './notifications';
import { businessProfileApi, isClientSwapEnabled } from './businessProfile';
import i18n from '@/src/config/i18n';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { formatDateToYMDLocal } from '@/lib/utils/localDate';

function swapNotifDateLocale(): string {
  const lng = String(i18n.language || 'en').toLowerCase();
  if (lng.startsWith('he')) return 'he-IL';
  if (lng.startsWith('ar')) return 'ar';
  if (lng.startsWith('ru')) return 'ru-RU';
  return 'en-US';
}

function formatSwapNotifDate(isoDate: string): string {
  const d = String(isoDate || '').split('T')[0];
  const parts = d.split('-').map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return d;
  const [y, m, day] = parts;
  return new Date(y, m - 1, day).toLocaleDateString(swapNotifDateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatSwapNotifTime(time: string | undefined): string {
  return formatTime12Hour(String(time ?? '').trim());
}

async function assertClientSwapAllowed(): Promise<boolean> {
  const profile = await businessProfileApi.getProfile();
  return isClientSwapEnabled(profile);
}

export const swapRequestsApi = {
  async createSwapRequest(params: {
    appointmentId: string;
    requesterPhone: string;
    requesterName?: string;
    originalDate: string;
    originalTime: string;
    originalServiceName?: string;
    originalDurationMinutes: number;
    originalBarberId?: string;
    preferredDates: string[];
    preferredTimeFrom: string;
    preferredTimeTo: string;
  }): Promise<SwapRequest | null> {
    try {
      if (!(await assertClientSwapAllowed())) {
        return null;
      }
      const businessId = getBusinessId();

      // Cancel any existing active swap request for this appointment
      await supabase
        .from('swap_requests')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('business_id', businessId)
        .eq('appointment_id', params.appointmentId)
        .eq('status', 'active');

      const { data, error } = await supabase
        .from('swap_requests')
        .insert({
          business_id: businessId,
          appointment_id: params.appointmentId,
          requester_phone: params.requesterPhone,
          requester_name: params.requesterName || null,
          original_date: params.originalDate,
          original_time: params.originalTime,
          original_service_name: params.originalServiceName || null,
          original_duration_minutes: params.originalDurationMinutes,
          original_barber_id: params.originalBarberId || null,
          preferred_dates: params.preferredDates,
          preferred_time_from: params.preferredTimeFrom,
          preferred_time_to: params.preferredTimeTo,
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating swap request:', error);
        return null;
      }
      return data as SwapRequest;
    } catch (error) {
      console.error('Error in createSwapRequest:', error);
      return null;
    }
  },

  async getActiveSwapRequests(): Promise<SwapRequest[]> {
    try {
      const businessId = getBusinessId();
      const today = formatDateToYMDLocal(new Date());

      const { data, error } = await supabase
        .from('swap_requests')
        .select('*')
        .eq('business_id', businessId)
        .eq('status', 'active')
        .gte('original_date', today)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching swap requests:', error);
        return [];
      }
      return (data || []) as SwapRequest[];
    } catch (error) {
      console.error('Error in getActiveSwapRequests:', error);
      return [];
    }
  },

  async getUserSwapRequests(userPhone: string): Promise<SwapRequest[]> {
    try {
      const businessId = getBusinessId();

      const { data, error } = await supabase
        .from('swap_requests')
        .select('*')
        .eq('business_id', businessId)
        .eq('requester_phone', userPhone)
        .in('status', ['active', 'matched'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user swap requests:', error);
        return [];
      }
      return (data || []) as SwapRequest[];
    } catch (error) {
      console.error('Error in getUserSwapRequests:', error);
      return [];
    }
  },

  async cancelSwapRequest(requestId: string): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      const { error } = await supabase
        .from('swap_requests')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('business_id', businessId);

      if (error) {
        console.error('Error cancelling swap request:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error in cancelSwapRequest:', error);
      return false;
    }
  },

  /**
   * Find swap opportunities relevant to the current user.
   * A swap is relevant when:
   * 1. Another user created an active swap request
   * 2. Current user has an appointment on one of the preferred dates
   * 3. Current user's appointment time falls within the preferred time range
   * 4. Same barber (so the calendar stays consistent)
   * 5. Same duration (so slot sizes match)
   */
  async findSwapOpportunities(
    userPhone: string,
    userAppointments: Appointment[]
  ): Promise<Array<{ swapRequest: SwapRequest; myAppointment: Appointment }>> {
    try {
      if (!(await assertClientSwapAllowed())) {
        return [];
      }
      const businessId = getBusinessId();
      const allRequests = await this.getActiveSwapRequests();
      const opportunities: Array<{ swapRequest: SwapRequest; myAppointment: Appointment }> = [];

      /** Requester's booked slot (authoritative barber + duration vs row snapshot). */
      const requesterAptIds = [...new Set(allRequests.map((r) => r.appointment_id).filter(Boolean))] as string[];
      const requesterAptById = new Map<string, { duration_minutes: number | null; barber_id: string | null }>();
      if (requesterAptIds.length > 0) {
        const { data: reqApts, error: reqAptErr } = await supabase
          .from('appointments')
          .select('id, duration_minutes, barber_id')
          .eq('business_id', businessId)
          .in('id', requesterAptIds);
        if (!reqAptErr) {
          for (const row of reqApts || []) {
            requesterAptById.set(String(row.id), {
              duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
              barber_id: row.barber_id != null ? String(row.barber_id) : null,
            });
          }
        }
      }

      for (const req of allRequests) {
        if (req.requester_phone === userPhone) continue;

        const reqAptMeta = requesterAptById.get(req.appointment_id);
        const requesterDuration =
          reqAptMeta?.duration_minutes ?? req.original_duration_minutes ?? 60;
        const requesterBarberId = reqAptMeta?.barber_id ?? req.original_barber_id ?? '';

        for (const apt of userAppointments) {
          if (!apt.slot_date || !apt.slot_time) continue;
          if (apt.is_available) continue;

          const isOnPreferredDate = req.preferred_dates.includes(apt.slot_date);
          if (!isOnPreferredDate) continue;

          const aptTimeMinutes = timeToMinutes(apt.slot_time);
          const fromMinutes = timeToMinutes(req.preferred_time_from);
          const toMinutes = timeToMinutes(req.preferred_time_to);
          if (aptTimeMinutes < fromMinutes || aptTimeMinutes > toMinutes) continue;

          const sameBarberId = (requesterBarberId || '') === (apt.barber_id || '');
          if (!sameBarberId) continue;

          const myDuration = apt.duration_minutes ?? 60;
          if (requesterDuration !== myDuration) continue;

          opportunities.push({ swapRequest: req, myAppointment: apt });
        }
      }

      return opportunities;
    } catch (error) {
      console.error('Error finding swap opportunities:', error);
      return [];
    }
  },

  /**
   * Execute the swap: update both appointments and notify both users.
   */
  async executeSwap(
    swapRequest: SwapRequest,
    myAppointment: Appointment
  ): Promise<boolean> {
    try {
      if (!(await assertClientSwapAllowed())) {
        return false;
      }
      const businessId = getBusinessId();

      // Fetch the requester's appointment (the one they want to swap away)
      const { data: requesterApt, error: fetchErr } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', swapRequest.appointment_id)
        .eq('business_id', businessId)
        .single();

      if (fetchErr || !requesterApt) {
        console.error('Could not fetch requester appointment:', fetchErr);
        return false;
      }

      // Swap the client data between the two appointments
      const { error: err1 } = await supabase
        .from('appointments')
        .update({
          client_name: myAppointment.client_name,
          client_phone: myAppointment.client_phone,
          service_name: myAppointment.service_name,
          service_id: myAppointment.service_id || null,
          user_id: myAppointment.user_id || null,
          duration_minutes: myAppointment.duration_minutes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requesterApt.id)
        .eq('business_id', businessId);

      if (err1) {
        console.error('Error updating requester appointment:', err1);
        return false;
      }

      const { error: err2 } = await supabase
        .from('appointments')
        .update({
          client_name: requesterApt.client_name,
          client_phone: requesterApt.client_phone,
          service_name: requesterApt.service_name,
          service_id: requesterApt.service_id || null,
          user_id: requesterApt.user_id || null,
          duration_minutes: requesterApt.duration_minutes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', myAppointment.id)
        .eq('business_id', businessId);

      if (err2) {
        console.error('Error updating my appointment:', err2);
        return false;
      }

      // Mark swap request as completed
      await supabase
        .from('swap_requests')
        .update({
          status: 'completed',
          matched_appointment_id: myAppointment.id,
          matched_user_phone: myAppointment.client_phone || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', swapRequest.id)
        .eq('business_id', businessId);

      const notifTitle = i18n.t('swap.notification.title', 'תור הוחלף');

      // Requester: from their old slot → to the acceptor's slot
      const requesterNotifContent = i18n.t('swap.notification.body', {
        fromDate: formatSwapNotifDate(swapRequest.original_date),
        fromTime: formatSwapNotifTime(swapRequest.original_time),
        toDate: formatSwapNotifDate(myAppointment.slot_date),
        toTime: formatSwapNotifTime(myAppointment.slot_time),
      });

      await notificationsApi.createNotification({
        title: notifTitle,
        content: requesterNotifContent,
        type: 'system',
        recipient_name: swapRequest.requester_name || '',
        recipient_phone: swapRequest.requester_phone,
        business_id: businessId,
      }).catch(() => {});

      // Acceptor: from their old slot → to the requester's slot
      const acceptorNotifContent = i18n.t('swap.notification.body', {
        fromDate: formatSwapNotifDate(myAppointment.slot_date),
        fromTime: formatSwapNotifTime(myAppointment.slot_time),
        toDate: formatSwapNotifDate(swapRequest.original_date),
        toTime: formatSwapNotifTime(swapRequest.original_time),
      });

      await notificationsApi.createNotification({
        title: notifTitle,
        content: acceptorNotifContent,
        type: 'system',
        recipient_name: myAppointment.client_name || '',
        recipient_phone: myAppointment.client_phone || '',
        business_id: businessId,
      }).catch(() => {});

      return true;
    } catch (error) {
      console.error('Error executing swap:', error);
      return false;
    }
  },
};

function timeToMinutes(time: string): number {
  const [hh = '0', mm = '0'] = time.split(':');
  return parseInt(hh, 10) * 60 + parseInt(mm, 10);
}
