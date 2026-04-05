import { supabase, Design, getBusinessId } from '../supabase';

/** Stable order for client + admin: explicit index first, then newest. */
export function sortDesignsByDisplayOrder(designs: Design[]): Design[] {
  return [...designs].sort((a, b) => {
    const ao = a.display_order;
    const bo = b.display_order;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export const designsApi = {
  // Get all designs
  async getAllDesigns(userId?: string): Promise<Design[]> {
    try {
      const businessId = getBusinessId();
      
      let query = supabase
        .from('designs')
        .select('*')
        .eq('business_id', businessId); // Filter by current business

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching designs:', error);
        return [];
      }

      return sortDesignsByDisplayOrder(data || []);
    } catch (error) {
      console.error('Error fetching designs:', error);
      return [];
    }
  },

  // Get designs for a specific user (barber)
  async getDesignsByUser(userId: string): Promise<Design[]> {
    return this.getAllDesigns(userId);
  },

  // Delete a design by id
  async deleteDesign(id: string): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      
      const { error } = await supabase
        .from('designs')
        .delete()
        .eq('id', id)
        .eq('business_id', businessId); // Ensure we only delete designs from current business

      if (error) {
        console.error('Error deleting design:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error deleting design:', error);
      return false;
    }
  },

  // Create a new design
  async getNextDisplayOrder(): Promise<number> {
    const businessId = getBusinessId();
    const { data, error } = await supabase
      .from('designs')
      .select('display_order')
      .eq('business_id', businessId);
    if (error) {
      console.error('Error reading display_order:', error);
      return 0;
    }
    let max = -1;
    for (const row of data ?? []) {
      const v = row.display_order;
      if (typeof v === 'number' && v > max) max = v;
    }
    return max + 1;
  },

  async createDesign(input: {
    name: string;
    image_url: string;
    image_urls?: string[];
    categories?: string[];
    popularity?: number;
    description?: string;
    price_modifier?: number;
    is_featured?: boolean;
    user_id?: string;
  }): Promise<Design | null> {
    try {
      const businessId = getBusinessId();
      const display_order = await this.getNextDisplayOrder();

      const payload = {
        name: input.name,
        image_url: input.image_url,
        image_urls: input.image_urls && input.image_urls.length > 0 ? input.image_urls : [input.image_url],
        categories: input.categories ?? [],
        popularity: input.popularity ?? 3,
        description: input.description ?? null,
        price_modifier: input.price_modifier ?? 0,
        is_featured: input.is_featured ?? false,
        user_id: input.user_id ?? null,
        business_id: businessId, // Add business_id to the payload
        display_order,
      } as const;

      const { data, error } = await supabase
        .from('designs')
        .insert([payload])
        .select('*')
        .single();

      if (error) {
        console.error('Error creating design:', error);
        return null;
      }

      return data as Design;
    } catch (error) {
      console.error('Error creating design:', error);
      return null;
    }
  },

  // Get designs by category
  async getDesignsByCategory(category: string): Promise<Design[]> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('business_id', businessId) // Filter by current business
        .contains('categories', [category])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching designs:', error);
        return [];
      }

      return sortDesignsByDisplayOrder(data || []);
    } catch (error) {
      console.error('Error fetching designs:', error);
      return [];
    }
  },

  // Get featured designs
  async getFeaturedDesigns(): Promise<Design[]> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('business_id', businessId) // Filter by current business
        .eq('is_featured', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching featured designs:', error);
        return [];
      }

      return sortDesignsByDisplayOrder(data || []);
    } catch (error) {
      console.error('Error fetching featured designs:', error);
      return [];
    }
  },

  // Get design by ID
  async getDesignById(id: string): Promise<Design | null> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('id', id)
        .eq('business_id', businessId) // Ensure we only get designs from current business
        .single();

      if (error) {
        console.error('Error fetching design:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching design:', error);
      return null;
    }
  },

  // Update a design by id
  async updateDesign(id: string, updates: {
    name?: string;
    image_url?: string;
    image_urls?: string[];
    categories?: string[];
    popularity?: number;
    description?: string;
    price_modifier?: number;
    is_featured?: boolean;
    user_id?: string;
    display_order?: number;
  }): Promise<Design | null> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('designs')
        .update(updates)
        .eq('id', id)
        .eq('business_id', businessId) // Ensure we only update designs from current business
        .select()
        .single();

      if (error) {
        console.error('Error updating design:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error updating design:', error);
      return null;
    }
  },

  // Search designs
  async searchDesigns(query: string): Promise<Design[]> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('business_id', businessId) // Filter by current business
        .ilike('name', `%${query}%`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error searching designs:', error);
        return [];
      }

      return sortDesignsByDisplayOrder(data || []);
    } catch (error) {
      console.error('Error searching designs:', error);
      return [];
    }
  },

  /** Persist order for the whole gallery (indices 0..n-1). */
  async applyDesignDisplayOrder(orderedIds: string[]): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from('designs')
          .update({ display_order: i })
          .eq('id', orderedIds[i])
          .eq('business_id', businessId);
        if (error) {
          console.error('Error updating display_order:', error);
          return false;
        }
      }
      return true;
    } catch (e) {
      console.error('applyDesignDisplayOrder:', e);
      return false;
    }
  },
};