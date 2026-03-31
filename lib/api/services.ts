import { supabase, Service, getBusinessId } from '../supabase';

/**
 * Client booking: which services to show for a selected barber.
 * - Multiple barbers: only rows with worker_id === barberId (no fallback to other workers’ services).
 * - Single barber: same match, plus legacy rows with null worker_id (older data before per-worker services).
 */
export function filterServicesForBookingBarber(
  all: Service[],
  barberId: string | undefined | null,
  adminUserCount: number
): Service[] {
  const list = all || [];
  if (!barberId) return list;
  const multiBarber = adminUserCount > 1;
  const forBarber = list.filter((s) => String(s.worker_id || '') === String(barberId));
  if (!multiBarber) {
    const legacy = list.filter((s) => !s.worker_id);
    const byId = new Map(forBarber.map((s) => [s.id, s]));
    for (const row of legacy) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    return Array.from(byId.values());
  }
  return forBarber;
}

export const servicesApi = {
  // Get all services
  async getAllServices(): Promise<Service[]> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('worker_id', { ascending: true, nullsFirst: false })
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching services:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching services:', error);
      return [];
    }
  },


  // Get service by ID
  async getServiceById(id: string): Promise<Service | null> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('id', id)
        .eq('business_id', businessId)
        .single();

      if (error) {
        console.error('Error fetching service:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching service:', error);
      return null;
    }
  }
};

// service categories removed; using static constants

// Update service details
export async function updateService(
  id: string,
  updates: Partial<Omit<Service, 'id' | 'created_at' | 'updated_at'>>
): Promise<Service | null> {
  try {
    const businessId = getBusinessId();
    
    const { data, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating service:', error);
      return null;
    }

    return data as Service;
  } catch (error) {
    console.error('Error updating service:', error);
    return null;
  }
}

// Create a new service
export async function createService(
  payload: Partial<Omit<Service, 'id' | 'created_at' | 'updated_at'>>
): Promise<Service | null> {
  try {
    const businessId = getBusinessId();
    
    const defaults: Partial<Service> = {
      name: 'שירות חדש',
      price: 0,
      business_id: businessId,
      // avoid FK violation by not setting category unless provided
      is_active: true,
    };

    const insertPayload = { ...defaults, ...payload } as any;

    const { data, error } = await supabase
      .from('services')
      .insert([insertPayload])
      .select('*')
      .single();

    if (error) {
      console.error('Error creating service:', error);
      return null;
    }

    return data as Service;
  } catch (error) {
    console.error('Error creating service:', error);
    return null;
  }
}

/** Persist 0..n-1 order_index for the given service IDs (tenant-scoped). */
export async function updateServicesOrderIndexes(orderedIds: string[]): Promise<boolean> {
  const businessId = getBusinessId();
  try {
    const results = await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from('services').update({ order_index: i }).eq('id', id).eq('business_id', businessId),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('updateServicesOrderIndexes:', failed.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('updateServicesOrderIndexes:', e);
    return false;
  }
}

// Delete a service
export async function deleteService(id: string): Promise<boolean> {
  try {
    const businessId = getBusinessId();
    
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);

    if (error) {
      console.error('Error deleting service:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting service:', error);
    return false;
  }
}