import { supabase, getBusinessId } from '@/lib/supabase';
import type { Appointment } from '@/lib/supabase';

function hhmm(t: string | null | undefined): string {
  return String(t || '').trim().slice(0, 5);
}

function timeToMinutes(t: string): number {
  const p = hhmm(t).split(':');
  const h = parseInt(p[0] || '0', 10);
  const m = parseInt(p[1] || '0', 10);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/**
 * Constraint [lo, hi) in minutes from midnight (hi exclusive), same day.
 * All-day (00:00–23:59…) → [0, 24*60).
 */
function constraintHalfOpenWindow(startTime: string, endTime: string): { lo: number; hi: number } {
  const lo = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);
  const fullDay = lo <= 0 && endM >= 23 * 60 + 45;
  const hi = fullDay ? 24 * 60 : endM;
  return { lo, hi };
}

function appointmentHalfOpen(apt: Pick<Appointment, 'slot_time' | 'duration_minutes'>): { lo: number; hi: number } {
  const lo = timeToMinutes(apt.slot_time);
  const dur = apt.duration_minutes && apt.duration_minutes > 0 ? apt.duration_minutes : 30;
  return { lo, hi: lo + dur };
}

function intervalsOverlapHalfOpen(
  a: { lo: number; hi: number },
  b: { lo: number; hi: number }
): boolean {
  return a.lo < b.hi && a.hi > b.lo;
}

export type ConstraintTimeWindow = { date: string; start_time: string; end_time: string };

/**
 * Booked slots for this barber on these dates that overlap any of the proposed constraint windows.
 */
export async function findBookedAppointmentsOverlappingConstraintWindows(
  barberId: string,
  windows: ConstraintTimeWindow[]
): Promise<Appointment[]> {
  if (!barberId || !windows.length) return [];

  const businessId = getBusinessId();
  const dates = [...new Set(windows.map((w) => w.date))];

  const { data, error } = await supabase
    .from('appointments')
    .select('id, slot_date, slot_time, duration_minutes, client_name, status, is_available, barber_id')
    .eq('business_id', businessId)
    .eq('barber_id', barberId)
    .eq('is_available', false)
    .neq('status', 'cancelled')
    .in('slot_date', dates);

  if (error) throw error;

  const rows = (data || []) as Appointment[];
  const seen = new Set<string>();
  const conflicts: Appointment[] = [];

  for (const apt of rows) {
    const date = apt.slot_date;
    const aptIv = appointmentHalfOpen(apt);
    for (const w of windows) {
      if (w.date !== date) continue;
      const cIv = constraintHalfOpenWindow(w.start_time, w.end_time);
      if (intervalsOverlapHalfOpen(aptIv, cIv)) {
        if (!seen.has(apt.id)) {
          seen.add(apt.id);
          conflicts.push(apt);
        }
        break;
      }
    }
  }

  return conflicts;
}
