import { supabase, getBusinessId, type Appointment } from '@/lib/supabase';
import { appointmentBarberSlotOrFilter } from '@/lib/api/clientWeekAvailability';

export type BookingDayRow = { fullDate: Date };

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getAvailableSlotsForDate(date: string, barberId?: string | null): Promise<Appointment[]> {
  const businessId = getBusinessId();
  let query = supabase
    .from('appointments')
    .select(
      'id, slot_date, slot_time, is_available, client_name, client_phone, service_name, barber_id, status, business_id, user_id, service_id, duration_minutes'
    )
    .eq('slot_date', date)
    .eq('business_id', businessId);

  if (barberId) {
    query = query.or(appointmentBarberSlotOrFilter(barberId));
  }

  const { data, error } = await query.order('slot_time');
  if (error) throw error;
  return (data || []) as Appointment[];
}

/**
 * Per-day count of bookable slot starts (same rules as client `book-appointment` prefetch).
 * Used by admin add-appointment day picker for parity with client calendar colors.
 */
export async function prefetchBookingDayAvailabilityMap(params: {
  days: BookingDayRow[];
  barberId?: string | null;
  serviceDurationMinutes: number;
  globalBreakMinutes: number;
}): Promise<Record<string, number>> {
  const { days, barberId, serviceDurationMinutes, globalBreakMinutes } = params;
  const toMinutes = (time: string) => {
    const [h, m] = String(time).split(':');
    return (parseInt(h || '0', 10) * 60) + parseInt(m || '0', 10);
  };

  const checks = await Promise.all(
    days.map(async (d) => {
      const dateStr = toLocalDateStr(d.fullDate);
      const slots = await getAvailableSlotsForDate(dateStr, barberId);
      const busyIntervals: { startMin: number; endMin: number }[] = (() => {
        const slotToMin = (time: string) => {
          const parts = String(time).split(':');
          const h = parseInt(parts[0] || '0', 10);
          const m = parseInt(parts[1] || '0', 10);
          return h * 60 + m;
        };
        return (slots || [])
          .filter((s) => s.is_available === false)
          .map((s) => {
            const startMin = slotToMin(String(s.slot_time));
            const dur = typeof (s as { duration_minutes?: number }).duration_minutes === 'number'
              ? (s as { duration_minutes: number }).duration_minutes
              : 60;
            return { startMin, endMin: startMin + dur };
          })
          .sort((a, b) => a.startMin - b.startMin);
      })();

      const dow = d.fullDate.getDay();
      const businessId = getBusinessId();

      const BH_SEL =
        'id, day_of_week, start_time, end_time, break_start_time, break_end_time, is_active, slot_duration_minutes, breaks, user_id, business_id';
      let bhQuery = supabase
        .from('business_hours')
        .select(BH_SEL)
        .eq('day_of_week', dow)
        .eq('is_active', true)
        .eq('business_id', businessId);

      if (barberId) {
        bhQuery = bhQuery.eq('user_id', barberId);
      } else {
        bhQuery = bhQuery.is('user_id', null);
      }

      let { data: bhRow } = await bhQuery.maybeSingle();
      if (!bhRow && barberId) {
        const { data: globalBh } = await supabase
          .from('business_hours')
          .select(BH_SEL)
          .eq('day_of_week', dow)
          .eq('is_active', true)
          .eq('business_id', businessId)
          .is('user_id', null)
          .maybeSingle();
        bhRow = globalBh;
      }
      if (!bhRow) return [dateStr, -1] as const;

      type Window = { start: string; end: string };
      const base: Window[] = [{ start: String(bhRow.start_time), end: String(bhRow.end_time) }];
      const brks: Array<{ start_time: string; end_time: string }> = (bhRow as { breaks?: typeof brks }).breaks || [];
      const singleBreak =
        bhRow.break_start_time && bhRow.break_end_time
          ? [{ start_time: String(bhRow.break_start_time), end_time: String(bhRow.break_end_time) }]
          : [];
      const allBreaks = [...brks, ...singleBreak];
      let windows: Window[] = base;
      for (const b of allBreaks) {
        const next: Window[] = [];
        for (const w of windows) {
          if (b.end_time <= w.start || b.start_time >= w.end) {
            next.push(w);
            continue;
          }
          if (w.start < b.start_time) next.push({ start: w.start, end: b.start_time });
          if (b.end_time < w.end) next.push({ start: b.end_time, end: w.end });
        }
        windows = next.filter((w) => w.start < w.end);
      }
      try {
        let constraintsQuery = supabase
          .from('business_constraints')
          .select('start_time, end_time')
          .eq('date', dateStr)
          .eq('business_id', businessId)
          .order('start_time');
        if (barberId) {
          constraintsQuery = constraintsQuery.or(`user_id.is.null,user_id.eq.${barberId}`);
        } else {
          constraintsQuery = constraintsQuery.is('user_id', null);
        }
        const { data: constraintsRows } = await constraintsQuery;
        for (const c of (constraintsRows || []) as Array<{ start_time: string; end_time: string }>) {
          const next: Window[] = [];
          for (const w of windows) {
            if (c.end_time <= w.start || c.start_time >= w.end) {
              next.push(w);
              continue;
            }
            if (w.start < c.start_time) next.push({ start: w.start, end: c.start_time });
            if (c.end_time < w.end) next.push({ start: c.end_time, end: w.end });
          }
          windows = next.filter((w) => w.start < w.end);
        }
      } catch {
        /* non-fatal */
      }

      try {
        const g = globalThis as unknown as { __bh_windows__?: Record<string, unknown> };
        g.__bh_windows__ = g.__bh_windows__ || {};
        const cacheKey = `${barberId || 'global'}:${dateStr}`;
        g.__bh_windows__[cacheKey] = windows;
      } catch {
        /* optional cache */
      }

      const normalized = windows
        .map((w) => ({ startMin: toMinutes(w.start), endMin: toMinutes(w.end) }))
        .filter((w) => w.startMin < w.endMin)
        .sort((a, b) => a.startMin - b.startMin);
      const serviceDuration = serviceDurationMinutes > 0 ? serviceDurationMinutes : 60;
      let availableCount = 0;
      const now = new Date();
      const isSameDay = d.fullDate.toDateString() === now.toDateString();
      const findPrevBusyEnd = (startMin: number) => {
        let prevEnd = -1;
        for (const b of busyIntervals) {
          if (b.endMin <= startMin && b.endMin > prevEnd) prevEnd = b.endMin;
        }
        return prevEnd;
      };
      const findNextBusyStart = (startMin: number) => {
        let nextStart = Number.POSITIVE_INFINITY;
        for (const b of busyIntervals) {
          if (b.startMin >= startMin && b.startMin < nextStart) nextStart = b.startMin;
        }
        return Number.isFinite(nextStart) ? nextStart : -1;
      };
      for (const w of normalized) {
        let tMin = w.startMin;
        while (tMin + serviceDuration <= w.endMin) {
          const prevEnd = findPrevBusyEnd(tMin);
          if (prevEnd >= 0) {
            const requiredStart = prevEnd + globalBreakMinutes;
            if (tMin < requiredStart) {
              tMin = requiredStart;
              continue;
            }
          }
          const hh = Math.floor(tMin / 60);
          const mm = tMin % 60;
          const dtCandidate = new Date(d.fullDate);
          dtCandidate.setHours(hh, mm, 0, 0);
          const isFutureOrNotToday = !isSameDay || dtCandidate.getTime() >= now.getTime();
          const overlaps = busyIntervals.some(
            (b) => Math.max(b.startMin, tMin) < Math.min(b.endMin, tMin + serviceDuration)
          );
          const endMin = tMin + serviceDuration;
          const nextStart = findNextBusyStart(tMin);
          const violatesNextBreak = nextStart >= 0 && endMin + globalBreakMinutes > nextStart;
          if (isFutureOrNotToday && !overlaps && !violatesNextBreak) availableCount += 1;
          tMin += serviceDuration;
        }
      }
      return [dateStr, availableCount] as const;
    })
  );

  const map: Record<string, number> = {};
  checks.forEach(([ds, cnt]) => {
    map[ds] = cnt;
  });
  return map;
}
