import { supabase, Service, getBusinessId } from '../supabase';

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