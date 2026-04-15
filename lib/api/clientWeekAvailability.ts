import { supabase, getBusinessId } from '@/lib/supabase';

/**
 * Legacy / mixed rows: provider may appear in `user_id` and/or `barber_id`; global generator
 * leaves both null (`businessHours.generateTimeSlotsForDate` without `userId`).
 * `appointmentBarberSlotOrFilter` is used where a single PostgREST `or()` is still desired.
 */
export function appointmentBarberSlotOrFilter(barberId: string): string {
  const id = String(barberId).trim();
  return `barber_id.eq.${id},user_id.eq.${id}`;
}

/**
 * Counts future available slots (is_available, slot datetime >= now) per calendar date.
 * Used for client home week strip — always scoped by business_id.
 * @param barberId When set: that barber’s slots (`barber_id` / `user_id`) **plus** business-wide
 *   slots where both ids are null (same pool the booking UI uses for global hours).
 *   When null/undefined: all slots in the tenant for those dates.
 */
export async function fetchFutureAvailableSlotCountsByDate(
  dateKeys: string[],
  barberId?: string | null,
): Promise<Record<string, number>> {
  const empty = (): Record<string, number> =>
    Object.fromEntries(dateKeys.map((k) => [k, 0]));

  if (dateKeys.length === 0) return {};

  const businessId = getBusinessId();
  const bid = typeof barberId === 'string' && barberId.trim().length > 0 ? barberId.trim() : null;

  /**
   * Per-barber: scoped rows + global open slots (both ids null), merged by `id`.
   * Avoids PostgREST `.or()` quirks with UUIDs; global pool matches SQL/booking for shops
   * that generate slots without a per-barber `user_id`.
   */
  const base = () =>
    supabase
      .from('appointments')
      .select('id, slot_date, slot_time')
      .eq('business_id', businessId)
      .eq('is_available', true)
      .in('slot_date', dateKeys);

  let data: Array<{ id?: string; slot_date?: string; slot_time?: string }> | null = null;

  if (bid) {
    const [byBarber, byUser, globalOpen] = await Promise.all([
      base().eq('barber_id', bid),
      base().eq('user_id', bid),
      base().is('barber_id', null).is('user_id', null),
    ]);
    if (byBarber.error || byUser.error || globalOpen.error) {
      console.error(
        '[fetchFutureAvailableSlotCountsByDate]',
        byBarber.error || byUser.error || globalOpen.error,
      );
      return empty();
    }
    const merged = new Map<string, { slot_date?: string; slot_time?: string }>();
    for (const row of [
      ...(byBarber.data || []),
      ...(byUser.data || []),
      ...(globalOpen.data || []),
    ]) {
      const id = String((row as { id?: string }).id ?? '').trim();
      if (id) merged.set(id, row as { slot_date?: string; slot_time?: string });
    }
    data = Array.from(merged.values());
  } else {
    const { data: rows, error } = await base();
    if (error) {
      console.error('[fetchFutureAvailableSlotCountsByDate]', error);
      return empty();
    }
    data = rows;
  }

  const counts = empty();
  const now = new Date();

  for (const row of data || []) {
    const ds = String((row as { slot_date?: string }).slot_date ?? '');
    if (!ds || counts[ds] === undefined) continue;
    const ts = String((row as { slot_time?: string }).slot_time ?? '00:00');
    const [hh = '0', mm = '0'] = ts.split(':');
    const slotDt = new Date(
      `${ds}T${String(parseInt(hh, 10) || 0).padStart(2, '0')}:${String(parseInt(mm, 10) || 0).padStart(2, '0')}:00`,
    );
    if (slotDt.getTime() < now.getTime()) continue;
    counts[ds] += 1;
  }

  return counts;
}
