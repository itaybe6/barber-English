import { supabase, getBusinessId } from '@/lib/supabase';
import { AvailableTimeSlot } from '@/lib/supabase';
import { notificationsApi } from './notifications';

// Helper: convert HH:MM[:SS] to minutes
const toMinutes = (time: string) => {
  const parts = String(time).split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
};

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

// Helper: map time period to minute ranges
const timePeriodToRange = (period: 'morning' | 'afternoon' | 'evening' | 'any'): { startMin: number; endMin: number } => {
  if (period === 'morning') return { startMin: 7 * 60, endMin: 12 * 60 };
  if (period === 'afternoon') return { startMin: 12 * 60, endMin: 16 * 60 };
  if (period === 'evening') return { startMin: 16 * 60, endMin: 20 * 60 };
  return { startMin: 7 * 60, endMin: 20 * 60 };
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

    const notifications = matches.map((e: any) => ({
      title: 'שעות חדשות נוספו',
      content: `שלום ${e.client_name}! נוספו שעות פעילות בתאריך ${formatDateForNotification(e.requested_date)} שמתאימות להעדפה שלך עבור ${e.service_name}. ניתן לנסות לקבוע תור עכשיו.`,
      type: 'appointment_reminder' as const,
      recipient_name: e.client_name,
      recipient_phone: e.client_phone,
    }));

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

// Function to check waitlist and notify waiting clients for the same date
export const checkWaitlistAndNotify = async (cancelledAppointment: AvailableTimeSlot) => {
  try {
    
    // Get the time period for the cancelled appointment
    const appointmentTime = new Date(`2000-01-01T${cancelledAppointment.slot_time}`);
    const hour = appointmentTime.getHours();
    
    let timePeriod: 'morning' | 'afternoon' | 'evening' | 'any';
    if (hour >= 7 && hour < 12) {
      timePeriod = 'morning';
    } else if (hour >= 12 && hour < 16) {
      timePeriod = 'afternoon';
    } else if (hour >= 16 && hour < 20) {
      timePeriod = 'evening';
    } else {
      timePeriod = 'any';
    }
    
    
    const businessId = getBusinessId();
    
    // Find waitlist entries for the same date and time period
    // Include both specific time period and 'any' time period
    // Also include entries for the same service regardless of time period
    // Filter by user_id if the cancelled appointment has one (for specific barber)
    let query = supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .eq('requested_date', cancelledAppointment.slot_date)
      .eq('status', 'waiting')
      .or(`time_period.eq.${timePeriod},time_period.eq.any`);

    // Filter by provider (user_id or barber_id) if the cancelled appointment is for a specific provider
    const providerIdForCancellation = (cancelledAppointment as any).barber_id || (cancelledAppointment as any).user_id;
    if (providerIdForCancellation) {
      query = query.eq('user_id', providerIdForCancellation);
    }

    const { data: waitlistEntries, error: waitlistError } = await query.order('created_at', { ascending: true });

    if (waitlistError) {
      console.error('❌ Error fetching waitlist entries:', waitlistError);
      return;
    }

    
    if (!waitlistEntries || waitlistEntries.length === 0) {
      return;
    }

    // Filter entries to avoid duplicates and ensure relevance
    const relevantEntries = waitlistEntries.filter(entry => {
      // Include if same time period or 'any' time period
      const timeMatch = entry.time_period === timePeriod || entry.time_period === 'any';
      // Include if same service
      const serviceMatch = entry.service_name === cancelledAppointment.service_name;
      
      return timeMatch || serviceMatch;
    });



    // Create notifications for waiting clients (skip user lookup; use waitlist entry directly)
    const notifications = [];
    const notifiedEntryIds: string[] = [];
    
    for (const entry of relevantEntries) {
      const notificationTitle = '🎉 A spot opened up!';
      const notificationContent = `Hi ${entry.client_name}! A spot opened up for ${entry.service_name} on ${formatDateForNotification(cancelledAppointment.slot_date)} at ${cancelledAppointment.slot_time}. Book now!`;

      notifications.push({
        title: notificationTitle,
        content: notificationContent,
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
        console.error('❌ Error inserting notifications:', insertError);
        return;
      }


      // Update waitlist entry status to 'contacted' to prevent duplicate notifications
      if (notifiedEntryIds.length > 0) {
        const { error: updateError } = await supabase
          .from('waitlist_entries')
          .update({ status: 'contacted' })
          .in('id', notifiedEntryIds);

        if (updateError) {
          console.error('❌ Error updating waitlist entry status:', updateError);
        } else {
        }
      }
    }

  } catch (error) {
    console.error('❌ Error in checkWaitlistAndNotify:', error);
  }
};

// Function to notify clients waiting for the same service on any future date
export const notifyServiceWaitlistClients = async (cancelledAppointment: AvailableTimeSlot) => {
  try {
    
    const businessId = getBusinessId();
    
    // Find waitlist entries for the same service on any future date
    const today = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .eq('service_name', cancelledAppointment.service_name)
      .eq('status', 'waiting')
      .gte('requested_date', today);

    // Filter by provider (user_id or barber_id) if the cancelled appointment is for a specific provider
    const providerIdForService = (cancelledAppointment as any).barber_id || (cancelledAppointment as any).user_id;
    if (providerIdForService) {
      query = query.eq('user_id', providerIdForService);
    }

    const { data: waitlistEntries, error: waitlistError } = await query
      .order('requested_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (waitlistError) {
      console.error('❌ Error fetching service waitlist entries:', waitlistError);
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
    
    for (const entry of waitlistEntries) {
      const notificationTitle = '🎉 A spot opened up!';
      const notificationContent = `Hi ${entry.client_name}! A spot opened up for ${entry.service_name} on ${formatDateForNotification(cancelledAppointment.slot_date)} at ${cancelledAppointment.slot_time}. Book now!`;

      notifications.push({
        title: notificationTitle,
        content: notificationContent,
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
        console.error('❌ Error inserting service notifications:', insertError);
        return;
      }


      // Update waitlist entry status to 'contacted' to prevent duplicate notifications
      if (notifiedEntryIds.length > 0) {
        const { error: updateError } = await supabase
          .from('waitlist_entries')
          .update({ status: 'contacted' })
          .in('id', notifiedEntryIds);

        if (updateError) {
          console.error('❌ Error updating service waitlist entry status:', updateError);
        } else {
        }
      }
    }

  } catch (error) {
    console.error('❌ Error in notifyServiceWaitlistClients:', error);
  }
};

// Function to notify all waitlist clients for any future date (general availability)
export const notifyAllWaitlistClients = async (cancelledAppointment: AvailableTimeSlot) => {
  try {
    
    const businessId = getBusinessId();
    
    // Find all waitlist entries for any future date
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
    
    for (const entry of waitlistEntries) {
      const notificationTitle = '🎉 A spot opened up!';
      const notificationContent = `Hi ${entry.client_name}! A spot opened up for ${cancelledAppointment.service_name} on ${formatDateForNotification(cancelledAppointment.slot_date)} at ${cancelledAppointment.slot_time}. Book now!`;

      notifications.push({
        title: notificationTitle,
        content: notificationContent,
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

// Helper function to format date for notification
const formatDateForNotification = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}; 