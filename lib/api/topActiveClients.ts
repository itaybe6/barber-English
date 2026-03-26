import { supabase, getBusinessId } from '@/lib/supabase';

export interface TopActiveClientRow {
  userId: string;
  name: string;
  imageUrl: string | null;
  /** Non-cancelled booked appointments (same rule as client appointment totals). */
  visitCount: number;
}

/**
 * Clients with the most booked appointments for this business (excludes cancelled).
 */
export const topActiveClientsApi = {
  async getTopClients(limit = 7): Promise<TopActiveClientRow[]> {
    const businessId = getBusinessId();
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));

    const { data: rows, error } = await supabase
      .from('appointments')
      .select('user_id, status')
      .eq('business_id', businessId)
      .eq('is_available', false)
      .not('user_id', 'is', null);

    if (error) {
      console.error('[topActiveClients] appointments:', error);
      return [];
    }

    const counts = new Map<string, number>();
    for (const row of rows || []) {
      const uid = row.user_id as string;
      if (!uid) continue;
      if (row.status === 'cancelled') continue;
      counts.set(uid, (counts.get(uid) || 0) + 1);
    }

    const sortedIds = Array.from(counts.entries())
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, safeLimit)
      .map(([id]) => id);

    if (sortedIds.length === 0) return [];

    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, name, image_url')
      .eq('business_id', businessId)
      .eq('user_type', 'client')
      .in('id', sortedIds);

    if (usersErr) {
      console.error('[topActiveClients] users:', usersErr);
      return [];
    }

    const byId = new Map((users || []).map((u) => [u.id as string, u]));

    return sortedIds
      .map((id) => {
        const u = byId.get(id);
        return {
          userId: id,
          name: (u?.name as string) || '',
          imageUrl: (u?.image_url as string) || null,
          visitCount: counts.get(id) || 0,
        };
      })
      .filter((r) => r.visitCount > 0);
  },
};
