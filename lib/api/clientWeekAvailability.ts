import { supabase, getBusinessId } from '@/lib/supabase';

/**
 * Counts future available slots (is_available, slot datetime >= now) per calendar date.
 * Used for client home week strip — always scoped by business_id.
 * @param barberId When set, only slots for that barber; when null/undefined, all barbers in the tenant.
 */
export async function fetchFutureAvailableSlotCountsByDate(
  dateKeys: string[],
  barberId?: string | null,
): Promise<Record<string, number>> {
  const empty = (): Record<string, number> =>
    Object.fromEntries(dateKeys.map((k) => [k, 0]));

  if (dateKeys.length === 0) return {};

  const businessId = getBusinessId();
  let query = supabase
    .from('appointments')
    .select('slot_date, slot_time')
    .eq('business_id', businessId)
    .eq('is_available', true)
    .in('slot_date', dateKeys);

  const bid = typeof barberId === 'string' && barberId.trim().length > 0 ? barberId.trim() : null;
  if (bid) {
    query = query.eq('barber_id', bid);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[fetchFutureAvailableSlotCountsByDate]', error);
    return empty();
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
