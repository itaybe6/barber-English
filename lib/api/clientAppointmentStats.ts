import { supabase, getBusinessId } from '@/lib/supabase';

export interface ClientAppointmentStats {
  /** Booked slots linked to the client; excludes cancelled */
  totalAppointments: number;
  /**
   * Mean of monthly spend across calendar months that had at least one
   * confirmed/completed appointment (same price rules as finance income).
   */
  avgMonthlySpend: number | null;
}

function buildServiceMaps(services: { id: string; name: string; price: number }[]) {
  const serviceMap = new Map<string, { name: string; price: number }>();
  const serviceNameMap = new Map<string, { id: string; price: number }>();
  for (const svc of services) {
    serviceMap.set(svc.id, { name: svc.name, price: Number(svc.price) || 0 });
    serviceNameMap.set(svc.name.toLowerCase(), { id: svc.id, price: Number(svc.price) || 0 });
  }
  return { serviceMap, serviceNameMap };
}

function resolveAppointmentPrice(
  appt: { service_id?: string | null; service_name?: string | null },
  serviceMap: Map<string, { name: string; price: number }>,
  serviceNameMap: Map<string, { id: string; price: number }>
): number {
  const serviceId = appt.service_id || null;
  const serviceName = appt.service_name || '';
  if (serviceId && serviceMap.has(serviceId)) {
    return serviceMap.get(serviceId)!.price;
  }
  if (serviceName) {
    const match = serviceNameMap.get(serviceName.toLowerCase());
    if (match) return match.price;
  }
  return 0;
}

export const clientAppointmentStatsApi = {
  async getStatsForClientIds(clientIds: string[]): Promise<Record<string, ClientAppointmentStats>> {
    const init = (): Record<string, ClientAppointmentStats> => {
      const o: Record<string, ClientAppointmentStats> = {};
      for (const id of clientIds) {
        o[id] = { totalAppointments: 0, avgMonthlySpend: null };
      }
      return o;
    };

    if (clientIds.length === 0) return {};

    const businessId = getBusinessId();

    const [apptRes, svcRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('user_id, service_id, service_name, slot_date, status')
        .eq('business_id', businessId)
        .eq('is_available', false)
        .in('user_id', clientIds),
      supabase.from('services').select('id, name, price').eq('business_id', businessId),
    ]);

    const out = init();

    if (apptRes.error) {
      console.error('[clientAppointmentStats] appointments:', apptRes.error);
      return out;
    }
    if (svcRes.error) {
      console.error('[clientAppointmentStats] services:', svcRes.error);
      return out;
    }

    const { serviceMap, serviceNameMap } = buildServiceMaps(svcRes.data || []);

    const byUser: Record<string, { total: number; monthSpend: Map<string, number> }> = {};
    for (const id of clientIds) {
      byUser[id] = { total: 0, monthSpend: new Map() };
    }

    for (const row of apptRes.data || []) {
      const uid = row.user_id as string | null;
      if (!uid || !byUser[uid]) continue;

      if (row.status !== 'cancelled') {
        byUser[uid].total += 1;
      }

      if (row.status === 'confirmed' || row.status === 'completed') {
        const price = resolveAppointmentPrice(row, serviceMap, serviceNameMap);
        if (price <= 0) continue;
        const monthKey = (row.slot_date || '').slice(0, 7);
        if (monthKey.length !== 7) continue;
        const m = byUser[uid].monthSpend;
        m.set(monthKey, (m.get(monthKey) || 0) + price);
      }
    }

    for (const id of clientIds) {
      const { total, monthSpend } = byUser[id];
      const monthTotals = Array.from(monthSpend.values());
      out[id] = {
        totalAppointments: total,
        avgMonthlySpend:
          monthTotals.length > 0
            ? monthTotals.reduce((a, b) => a + b, 0) / monthTotals.length
            : null,
      };
    }

    return out;
  },
};
