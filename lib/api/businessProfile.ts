import { supabase, getBusinessId } from '@/lib/supabase';
import type { BusinessProfile } from '@/lib/supabase';

export const businessProfileApi = {
  async getProfile(): Promise<BusinessProfile | null> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('business_profile')
        .select('*')
        .eq('id', businessId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching business profile:', error);
        return null;
      }

      // If no profile found, create a default one
      if (!data) {
        const defaultProfile = await this.createDefaultProfile(businessId);
        return defaultProfile;
      }

      return (data as BusinessProfile) || null;
    } catch (err) {
      console.error('Error in getProfile:', err);
      return null;
    }
  },

  async createDefaultProfile(businessId: string): Promise<BusinessProfile | null> {
    try {
      const defaultData = {
        id: businessId,
        display_name: 'My Business',
        address: 'Tel Aviv, Israel',
        phone: '050-1234567', // Default phone number
        instagram_url: null,
        facebook_url: null,
        tiktok_url: null,
        break_minutes: 0,
      };

      const { data, error } = await supabase
        .from('business_profile')
        .insert([defaultData])
        .select('*')
        .single();

      if (error) {
        console.error('❌ [businessProfile] Error creating default profile:', error);
        return null;
      }

      return data as BusinessProfile;
    } catch (err) {
      console.error('❌ [businessProfile] Error in createDefaultProfile:', err);
      return null;
    }
  },

  async upsertProfile(updates: Partial<BusinessProfile>): Promise<BusinessProfile | null> {
    try {
      const businessId = getBusinessId();
      const existing = await this.getProfile();
      
      if (existing?.id) {
        const { data, error } = await supabase
          .from('business_profile')
          .update({
            display_name: updates.display_name,
            description: (updates as any).description,
            address: updates.address,
            instagram_url: updates.instagram_url,
            facebook_url: updates.facebook_url,
            tiktok_url: (updates as any).tiktok_url,
            break: (updates as any).break,
          })
          .eq('id', businessId)
          .select('*')
          .single();

        if (error) {
          console.error('Error updating business profile:', error);
          return null;
        }
        return data as BusinessProfile;
      }

      const { data, error } = await supabase
        .from('business_profile')
        .insert({
          id: businessId, // Use the current business_id
          display_name: updates.display_name,
          description: (updates as any).description,
          address: updates.address,
          instagram_url: updates.instagram_url,
          facebook_url: updates.facebook_url,
          tiktok_url: (updates as any).tiktok_url,
          break: (updates as any).break,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creating business profile:', error);
        return null;
      }
      return data as BusinessProfile;
    } catch (err) {
      console.error('Error in upsertProfile:', err);
      return null;
    }
  },
};



