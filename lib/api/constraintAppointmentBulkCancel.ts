import { supabase, getBusinessId } from '@/lib/supabase';
import type { Appointment } from '@/lib/supabase';
import { checkWaitlistAndNotify } from '@/lib/api/waitlistNotifications';
import { notificationsApi } from '@/lib/api/notifications';

/**
 * Cancels booked appointments (frees slots) and notifies each client (DB row → Edge push + SMS when eligible).
 * Used when an admin confirms a constraint that overlaps existing bookings.
 */
export async function cancelBookedAppointmentsDueToConstraint(
  appointments: Appointment[],
  buildNotification: (apt: Appointment) => { title: string; content: string },
): Promise<{ ok: boolean; cancelledCount: number; error?: string }> {
  const businessId = getBusinessId();
  let cancelledCount = 0;

  for (const apt of appointments) {
    try {
      const { data: updated, error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          is_available: true,
          client_name: null,
          client_phone: null,
          service_name: 'Available Slot',
          client_reminder_sent_at: null,
          admin_reminder_sent_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', apt.id)
        .eq('business_id', businessId)
        .eq('is_available', false)
        .select('id, status')
        .maybeSingle();

      if (error || !updated || updated.status !== 'cancelled') {
        return {
          ok: false,
          cancelledCount,
          error: error?.message ?? 'cancel_failed',
        };
      }

      cancelledCount += 1;

      try {
        await checkWaitlistAndNotify(apt as Parameters<typeof checkWaitlistAndNotify>[0]);
      } catch {
        /* non-fatal */
      }

      const phone = String(apt.client_phone || '').trim();
      if (phone) {
        const { title, content } = buildNotification(apt);
        await notificationsApi.createNotification({
          title,
          content,
          type: 'general',
          recipient_name: (apt.client_name || '').trim() || 'לקוח',
          recipient_phone: phone,
          business_id: businessId,
          appointment_id: apt.id,
          ...(apt.client_user_id ? { user_id: apt.client_user_id } : {}),
        });
      }
    } catch (e) {
      return {
        ok: false,
        cancelledCount,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return { ok: true, cancelledCount };
}
