import { supabase, getBusinessId } from '@/lib/supabase';
import type { BusinessConstraint } from '@/lib/supabase';

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


