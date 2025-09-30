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
        image_on_page_1: null,
        image_on_page_2: null,
        image_on_page_3: null,
        login_img: null,
        break_by_user: {},
        min_cancellation_hours: 24, // Default 24 hours
        primary_color: '#000000', // Default black color
        booking_open_days: 7,
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
        image_on_page_1: (updates as any).image_on_page_1,
        image_on_page_2: (updates as any).image_on_page_2,
        image_on_page_3: (updates as any).image_on_page_3,
        login_img: (updates as any).login_img,
        break_by_user: (updates as any).break_by_user,
        reminder_minutes_by_user: (updates as any).reminder_minutes_by_user,
        min_cancellation_hours: updates.min_cancellation_hours,
        primary_color: updates.primary_color,
            booking_open_days: (updates as any).booking_open_days,
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
          image_on_page_1: (updates as any).image_on_page_1,
          image_on_page_2: (updates as any).image_on_page_2,
          image_on_page_3: (updates as any).image_on_page_3,
          login_img: (updates as any).login_img,
          break_by_user: (updates as any).break_by_user,
          reminder_minutes_by_user: (updates as any).reminder_minutes_by_user,
          min_cancellation_hours: updates.min_cancellation_hours,
          primary_color: updates.primary_color || '#000000',
          booking_open_days: (updates as any).booking_open_days ?? 7,
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
  
  async getBreakMinutesForUser(userId?: string | null): Promise<number> {
    try {
      const businessId = getBusinessId();
      if (userId) {
        const { data, error } = await supabase.rpc('get_break_minutes_for_user', {
          p_business_id: businessId,
          p_user_id: userId,
        });
        if (error) {
          console.error('Error fetching per-user break minutes (RPC):', error);
          // fallback to profile read
        } else if (typeof data === 'number') {
          return Math.max(0, Math.min(180, data));
        }
      }

      // Fallback: read profile and extract from JSON
      const profile = await this.getProfile();
      const minutes = (profile as any)?.break_by_user && userId
        ? Number((profile as any).break_by_user?.[userId] ?? 0)
        : 0;
      return Math.max(0, Math.min(180, minutes));
    } catch (e) {
      console.error('Error in getBreakMinutesForUser:', e);
      return 0;
    }
  },

  async setBreakMinutesForUser(userId: string, minutes: number): Promise<void> {
    const clamped = Math.max(0, Math.min(180, Math.floor(Number(minutes) || 0)));
    const businessId = getBusinessId();
    try {
      // Prefer server-side JSON merge via RPC for concurrency safety
      const { error } = await supabase.rpc('set_break_minutes_for_user', {
        p_business_id: businessId,
        p_user_id: userId,
        p_minutes: clamped,
      });
      if (error) {
        console.error('Error setting per-user break minutes (RPC):', error);
        // Fallback: read-modify-write
        const profile = await this.getProfile();
        const currentMap = ((profile as any)?.break_by_user ?? {}) as Record<string, number>;
        const nextMap = { ...currentMap, [userId]: clamped };
        await supabase
          .from('business_profile')
          .update({ break_by_user: nextMap as any })
          .eq('id', businessId);
      }
    } catch (e) {
      console.error('Error in setBreakMinutesForUser:', e);
      throw e;
    }
  },
  
  async getReminderMinutesForUser(userId?: string | null): Promise<number | null> {
    try {
      const businessId = getBusinessId();
      if (userId) {
        const { data, error } = await supabase.rpc('get_reminder_minutes_for_user', {
          p_business_id: businessId,
          p_user_id: userId,
        });
        if (!error && (data === null || typeof data === 'number')) {
          return data as number | null;
        }
      }
      const profile = await this.getProfile();
      const val = (profile as any)?.reminder_minutes_by_user && userId
        ? ((profile as any).reminder_minutes_by_user?.[userId] ?? null)
        : null;
      return (val === null || typeof val === 'undefined') ? null : Number(val);
    } catch (e) {
      console.error('Error in getReminderMinutesForUser:', e);
      return null;
    }
  },

  async setReminderMinutesForUser(userId: string, minutes: number | null): Promise<void> {
    const clamped = (minutes === null || typeof minutes === 'undefined')
      ? null
      : Math.max(0, Math.min(1440, Math.floor(Number(minutes) || 0)));
    const businessId = getBusinessId();
    try {
      const { error } = await supabase.rpc('set_reminder_minutes_for_user', {
        p_business_id: businessId,
        p_user_id: userId,
        p_minutes: clamped as any,
      });
      if (error) {
        console.error('Error setting per-user reminder minutes (RPC):', error);
        // Fallback read-modify-write
        const profile = await this.getProfile();
        const currentMap = ((profile as any)?.reminder_minutes_by_user ?? {}) as Record<string, number | null>;
        const nextMap = { ...currentMap, [userId]: clamped };
        await supabase
          .from('business_profile')
          .update({ reminder_minutes_by_user: nextMap as any })
          .eq('id', businessId);
      }
    } catch (e) {
      console.error('Error in setReminderMinutesForUser:', e);
      throw e;
    }
  },
};



