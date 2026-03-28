import { supabase, getBusinessId } from '@/lib/supabase';
import type { BusinessConstraint } from '@/lib/supabase';

function constraintTimeToMinutes(t: string | undefined | null): number {
  if (!t) return 0;
  const parts = String(t).split(':');
  const hh = parseInt(parts[0] || '0', 10);
  const mm = parseInt(parts[1] || '0', 10);
  return hh * 60 + mm;
}

function minutesToHHMM(total: number): string {
  const clamped = Math.max(0, Math.min(total, 24 * 60 - 1));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * One card per logical block: merges overlapping or back-to-back windows that share the same reason.
 * Handles duplicate DB rows and pairs like business-wide + barber rows for the same slot.
 */
export function mergeConstraintsForDisplay(rows: BusinessConstraint[]): BusinessConstraint[] {
  if (!rows?.length) return [];

  const normReason = (r: BusinessConstraint) => (r.reason ?? '').trim();
  const byReason = new Map<string, BusinessConstraint[]>();
  for (const r of rows) {
    const k = normReason(r);
    const arr = byReason.get(k) ?? [];
    arr.push(r);
    byReason.set(k, arr);
  }

  const out: BusinessConstraint[] = [];

  for (const [, group] of byReason) {
    const sorted = [...group].sort(
      (a, b) => constraintTimeToMinutes(a.start_time) - constraintTimeToMinutes(b.start_time)
    );

    let segStart = constraintTimeToMinutes(sorted[0]!.start_time);
    let segEnd = constraintTimeToMinutes(sorted[0]!.end_time);
    if (segEnd <= segStart) segEnd = segStart + 1;
    const ids: string[] = [sorted[0]!.id];
    let template: BusinessConstraint = sorted[0]!;

    const flushSegment = () => {
      out.push({
        ...template,
        id: [...new Set(ids)].sort().join('|'),
        start_time: minutesToHHMM(segStart),
        end_time: minutesToHHMM(segEnd),
        reason: template.reason,
      });
    };

    for (let i = 1; i < sorted.length; i++) {
      const r = sorted[i]!;
      let s = constraintTimeToMinutes(r.start_time);
      let e = constraintTimeToMinutes(r.end_time);
      if (e <= s) e = s + 1;
      if (s <= segEnd + 1) {
        segEnd = Math.max(segEnd, e);
        ids.push(r.id);
      } else {
        flushSegment();
        segStart = s;
        segEnd = e;
        ids.length = 0;
        ids.push(r.id);
        template = r;
      }
    }
    flushSegment();
  }

  return out.sort((a, b) => constraintTimeToMinutes(a.start_time) - constraintTimeToMinutes(b.start_time));
}

export const businessConstraintsApi = {
  async getConstraintsForDate(date: string): Promise<BusinessConstraint[]> {
    const businessId = getBusinessId();
    
    const { data, error } = await supabase
      .from('business_constraints')
      .select('*')
      .eq('business_id', businessId)
      .eq('date', date)
      .order('start_time');
    if (error) throw error;
    return (data || []) as BusinessConstraint[];
  },

  async getConstraintsInRange(startDate: string, endDate: string): Promise<BusinessConstraint[]> {
    const businessId = getBusinessId();
    
    const { data, error } = await supabase
      .from('business_constraints')
      .select('*')
      .eq('business_id', businessId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('start_time');
    if (error) throw error;
    return (data || []) as BusinessConstraint[];
  },

  /**
   * Constraints that apply to a specific barber: business-wide (`user_id` null) or owned by that barber.
   * Matches client booking logic in select-time / book-appointment.
   */
  async getConstraintsForBarberInRange(
    startDate: string,
    endDate: string,
    barberId: string | null | undefined
  ): Promise<BusinessConstraint[]> {
    const businessId = getBusinessId();
    let query = supabase
      .from('business_constraints')
      .select('*')
      .eq('business_id', businessId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('start_time');

    if (barberId) {
      query = query.or(`user_id.is.null,user_id.eq.${barberId}`);
    } else {
      query = query.is('user_id', null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as BusinessConstraint[];
  },

  async createConstraints(entries: Array<Omit<BusinessConstraint, 'id' | 'created_at' | 'updated_at'>>, userId?: string | null): Promise<number> {
    if (!entries || entries.length === 0) return 0;
    const businessId = getBusinessId();
    
    const entriesWithBusinessId = entries.map(entry => ({ ...entry, business_id: businessId, user_id: userId || null }));
    
    const { data, error } = await supabase
      .from('business_constraints')
      .insert(entriesWithBusinessId)
      .select('id');
    if (error) throw error;
    return (data?.length || 0);
  },

  async deleteConstraint(id: string): Promise<boolean> {
    const businessId = getBusinessId();
    
    const { error } = await supabase
      .from('business_constraints')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);
    return !error;
  },
};


