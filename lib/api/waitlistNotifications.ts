import { supabase, getBusinessId } from '@/lib/supabase';
import { AvailableTimeSlot } from '@/lib/supabase';
import i18n from '@/src/config/i18n';
import { formatTime12Hour } from '@/lib/utils/timeFormat';

const GENERAL_SERVICE = 'General service';

// Helper: convert HH:MM[:SS] to minutes from midnight
const toMinutes = (time: string) => {
  const parts = String(time).split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
};

/** Morning / afternoon / evening buckets used by the waitlist client (half-open intervals). */
const timePeriodToRange = (period: 'morning' | 'afternoon' | 'evening' | 'any'): { startMin: number; endMin: number } => {
  if (period === 'morning') return { startMin: 7 * 60, endMin: 12 * 60 };
  if (period === 'afternoon') return { startMin: 12 * 60, endMin: 16 * 60 };
  if (period === 'evening') return { startMin: 16 * 60, endMin: 20 * 60 };
  return { startMin: 7 * 60, endMin: 20 * 60 };
};

/** True if the freed slot start time falls inside the waitlist entry's preferred window (minute-accurate). */
function cancelSlotMatchesWaitlistPeriod(
  slotTime: string,
  period: 'morning' | 'afternoon' | 'evening' | 'any'
): boolean {
  const m = toMinutes(slotTime);
  if (!Number.isFinite(m)) return false;
  const { startMin, endMin } = timePeriodToRange(period);
  return m >= startMin && m < endMin;
}

const formatDateForNotification = (dateString: string) => {
  const d = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;
  const isHe = (i18n.language || '').toLowerCase().startsWith('he');
  try {
    return d.toLocaleDateString(isHe ? 'he-IL-u-ca-gregory' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return d.toLocaleDateString(isHe ? 'he-IL' : 'en-US');
  }
};

function waitlistServiceMatches(
  entryService: string | null | undefined,
  cancelledService: string | null | undefined
): boolean {
  const e = String(entryService || '').trim();
  const c = String(cancelledService || '').trim();
  if (!e || !c) return false;
  if (e === GENERAL_SERVICE || c === GENERAL_SERVICE) return true;
  return e === c;
}

function serviceLabelForWaitlistNotification(
  entryService: string | null | undefined,
  cancelledService: string | null | undefined
): string {
  const e = String(entryService || '').trim();
  if (e === GENERAL_SERVICE) {
    return i18n.t('waitlist.anyService', 'Any available service');
  }
  return e || String(cancelledService || '').trim() || i18n.t('waitlist.anyService', 'Any available service');
}

function spotOpenedTitleAndContent(
  entry: { client_name: string; service_name: string },
  cancelledAppointment: AvailableTimeSlot
): { title: string; content: string } {
  const date = formatDateForNotification(cancelledAppointment.slot_date);
  const time = formatTime12Hour(String(cancelledAppointment.slot_time || ''));
  const service = serviceLabelForWaitlistNotification(entry.service_name, cancelledAppointment.service_name);
  return {
    title: i18n.t('notifications.waitlistSpotOpenedTitle', 'A spot opened up!'),
    content: i18n.t('notifications.waitlistSpotOpenedBody', {
      name: entry.client_name,
      service,
      date,
      time,
    }),
  };
}

// Helper: compute working windows after subtracting breaks
const computeWorkingWindows = (start: string, end: string, breaks: Array<{ start_time: string; end_time: string }>) => {
  type Window = { start: string; end: string };
  let windows: Window[] = [{ start, end }];
  for (const b of breaks) {
    const next: Window[] = [];
    for (const w of windows) {
      if (b.end_time <= w.start || b.start_time >= w.end) { next.push(w); continue; }
      if (w.start < b.start_time) next.push({ start: w.start, end: b.start_time });
      if (b.end_time < w.end) next.push({ start: b.end_time, end: w.end });
    }
    windows = next.filter(w => w.start < w.end);
  }
  return windows
    .map(w => ({ startMin: toMinutes(w.start), endMin: toMinutes(w.end) }))
    .filter(w => w.startMin < w.endMin)
    .sort((a, b) => a.startMin - b.startMin);
};

// Helper: check overlap between a window and a range
const hasOverlap = (a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }) => {
  return Math.max(a.startMin, b.startMin) < Math.min(a.endMin, b.endMin);
};

// Notify waitlist clients when business hours update may open new availability
export const notifyWaitlistOnBusinessHoursUpdate = async (
  dayOfWeek: number,
  updated: { start_time: string; end_time: string; breaks?: Array<{ start_time: string; end_time: string }>; is_active?: boolean }
) => {
  try {
    if (updated.is_active === false) {
      // Closed day, nothing to notify
      return;
    }

    const windows = computeWorkingWindows(
      updated.start_time,
      updated.end_time,
      (updated.breaks || [])
    );

    if (windows.length === 0) {
      return;
    }

    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];

    const businessId = getBusinessId();
    
    // Fetch future waitlist entries still waiting
    // Note: For business hours updates, we typically notify all barbers' waitlists
    // since business hours affect the entire salon, not just one barber
    const { data: entries, error } = await supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'waiting')
      .gte('requested_date', todayIso)
      .order('requested_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching waitlist entries for BH update:', error);
      return;
    }

    const matches = (entries || []).filter((e: any) => {
      const reqDate = new Date(e.requested_date);
      if (reqDate.getDay() !== dayOfWeek) return false;
      const periodRange = timePeriodToRange(e.time_period);
      return windows.some(w => hasOverlap(w, periodRange));
    });

    if (matches.length === 0) return;

    const notifications = matches.map((e: any) => {
      const date = formatDateForNotification(e.requested_date);
      const service = serviceLabelForWaitlistNotification(e.service_name, e.service_name);
      return {
        title: i18n.t('notifications.waitlistBusinessHoursTitle', 'New hours added'),
        content: i18n.t('notifications.waitlistBusinessHoursBody', {
          name: e.client_name,
          date,
          service,
        }),
        type: 'appointment_reminder' as const,
        recipient_name: e.client_name,
        recipient_phone: e.client_phone,
        business_id: businessId,
      };
    });

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error('❌ Error inserting BH update notifications:', insertError);
      return;
    }

    // Mark entries as contacted to avoid duplicate alerts
    const ids = matches.map((e: any) => e.id);
    if (ids.length > 0) {
      const { error: updErr } = await supabase
        .from('waitlist_entries')
        .update({ status: 'contacted' })
        .in('id', ids);
      if (updErr) {
        console.error('❌ Error updating waitlist status after BH notifications:', updErr);
      }
    }
  } catch (err) {
    console.error('❌ Error in notifyWaitlistOnBusinessHoursUpdate:', err);
  }
};

// Same calendar day as the freed slot; exact time must fall in the waitlist row's morning/afternoon/evening window (minutes).
export const checkWaitlistAndNotify = async (cancelledAppointment: AvailableTimeSlot) => {
  try {
    const businessId = getBusinessId();
    const slotTime = String(cancelledAppointment.slot_time || '');

    let query = supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .eq('requested_date', cancelledAppointment.slot_date)
      .eq('status', 'waiting');

    const providerIdForCancellation = (cancelledAppointment as any).barber_id || (cancelledAppointment as any).user_id;
    if (providerIdForCancellation) {
      query = query.eq('user_id', providerIdForCancellation);
    }

    const { data: waitlistEntries, error: waitlistError } = await query.order('created_at', { ascending: true });

    if (waitlistError) {
      console.error('❌ Error fetching waitlist entries:', waitlistError);
      return;
    }

    if (!waitlistEntries?.length) {
      return;
    }

    const relevantEntries = waitlistEntries.filter((entry) => {
      const p = entry.time_period;
      if (p !== 'morning' && p !== 'afternoon' && p !== 'evening' && p !== 'any') return false;
      if (!waitlistServiceMatches(entry.service_name, cancelledAppointment.service_name)) return false;
      return cancelSlotMatchesWaitlistPeriod(slotTime, p);
    });

    const notifications = [];
    const notifiedEntryIds: string[] = [];

    for (const entry of relevantEntries) {
      const { title, content } = spotOpenedTitleAndContent(entry, cancelledAppointment);
      notifications.push({
        title,
        content,
        type: 'appointment_reminder' as const,
        recipient_name: entry.client_name,
        recipient_phone: entry.client_phone,
        business_id: businessId,
      });
      notifiedEntryIds.push(entry.id);
    }

    if (notifications.length > 0) {
      const { error: insertError } = await supabase.from('notifications').insert(notifications);

      if (insertError) {
        console.error('❌ Error inserting notifications:', insertError);
        return;
      }

      if (notifiedEntryIds.length > 0) {
        const { error: updateError } = await supabase
          .from('waitlist_entries')
          .update({ status: 'contacted' })
          .in('id', notifiedEntryIds);

        if (updateError) {
          console.error('❌ Error updating waitlist entry status:', updateError);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in checkWaitlistAndNotify:', error);
  }
};

/** @deprecated Use only {@link checkWaitlistAndNotify}; kept so existing call sites keep working without duplicate logic. */
export const notifyServiceWaitlistClients = checkWaitlistAndNotify;

// Function to notify all waitlist clients for any future date (general availability)
export const notifyAllWaitlistClients = async (cancelledAppointment: AvailableTimeSlot) => {
  try {
    
    const businessId = getBusinessId();
    
    // Find all waitlist entries for any future date and matching time period
    const today = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'waiting')
      .gte('requested_date', today);

    // Filter by provider (user_id or barber_id) if the cancelled appointment is for a specific provider
    const providerIdForAll = (cancelledAppointment as any).barber_id || (cancelledAppointment as any).user_id;
    if (providerIdForAll) {
      query = query.eq('user_id', providerIdForAll);
    }

    const { data: waitlistEntries, error: waitlistError } = await query
      .order('requested_date', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(50); // Limit to prevent spam

    if (waitlistError) {
      console.error('❌ Error fetching all waitlist entries:', waitlistError);
      return;
    }

    
    if (!waitlistEntries || waitlistEntries.length === 0) {
      return;
    }

    // Log found entries for debugging
    waitlistEntries.forEach((entry, index) => {
    });

    // Create notifications for waiting clients (skip user lookup; use waitlist entry directly)
    const notifications = [];
    const notifiedEntryIds: string[] = [];
    
    const slotTime = String(cancelledAppointment.slot_time || '');

    for (const entry of waitlistEntries) {
      if (entry.requested_date !== cancelledAppointment.slot_date) continue;
      const p = entry.time_period;
      if (p !== 'morning' && p !== 'afternoon' && p !== 'evening' && p !== 'any') continue;
      if (!waitlistServiceMatches(entry.service_name, cancelledAppointment.service_name)) continue;
      if (!cancelSlotMatchesWaitlistPeriod(slotTime, p)) continue;

      const { title, content } = spotOpenedTitleAndContent(entry, cancelledAppointment);

      notifications.push({
        title,
        content,
        type: 'appointment_reminder' as const,
        recipient_name: entry.client_name,
        recipient_phone: entry.client_phone,
        business_id: businessId,
      });

      notifiedEntryIds.push(entry.id);
    }


    // Insert notifications into database
    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (insertError) {
        console.error('❌ Error inserting general notifications:', insertError);
        return;
      }


      // Update waitlist entry status to 'contacted' to prevent duplicate notifications
      if (notifiedEntryIds.length > 0) {
        const { error: updateError } = await supabase
          .from('waitlist_entries')
          .update({ status: 'contacted' })
          .in('id', notifiedEntryIds);

        if (updateError) {
          console.error('❌ Error updating general waitlist entry status:', updateError);
        } else {
        }
      }
    }

  } catch (error) {
    console.error('❌ Error in notifyAllWaitlistClients:', error);
  }
};