import { supabase, getBusinessId } from '@/lib/supabase';
import type { BusinessProfile } from '@/lib/supabase';

/** True when swapping is allowed for clients; missing column / null treated as enabled. */
export function isClientSwapEnabled(profile: BusinessProfile | null | undefined): boolean {
  return profile?.client_swap_enabled !== false;
}

/** True when new clients must be approved by admin before booking; missing column treated as required. */
export function isClientApprovalRequired(profile: BusinessProfile | null | undefined): boolean {
  return profile?.require_client_approval !== false;
}

/** True only when the business explicitly allows multi-service booking (single service otherwise). */
export function isMultiServiceBookingAllowed(profile: BusinessProfile | null | undefined): boolean {
  return profile?.allow_multi_service_booking === true;
}

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

  /**
   * True when `userPhone` matches `business_profile.phone` for the current tenant.
   * Same rule as "Add employee" in settings — identifies the business owner account.
   */
  async isUserPhoneMatchingBusinessOwner(userPhone: string | null | undefined): Promise<boolean> {
    const normalizedUser = String(userPhone ?? '').trim();
    if (!normalizedUser) return false;
    const profile = await this.getProfile();
    const businessPhone = String(profile?.phone ?? '').trim();
    return businessPhone !== '' && normalizedUser === businessPhone;
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
        home_hero_images: [],
        break_by_user: {},
        booking_open_days_by_user: {},
        reminder_minutes_by_user: {},
        min_cancellation_hours: 24, // Default 24 hours
        primary_color: '#000000', // Default black color
        booking_open_days: 7,
        client_swap_enabled: true,
        require_client_approval: true,
        home_fixed_message_enabled: false,
        home_fixed_message: null,
        allow_multi_service_booking: false,
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
        home_hero_images: (updates as any).home_hero_images,
        break_by_user: (updates as any).break_by_user,
        booking_open_days_by_user: (updates as any).booking_open_days_by_user,
        reminder_minutes_by_user: (updates as any).reminder_minutes_by_user,
        client_reminder_minutes: (updates as any).client_reminder_minutes,
        min_cancellation_hours: updates.min_cancellation_hours,
        primary_color: updates.primary_color,
            booking_open_days: (updates as any).booking_open_days,
            business_number: (updates as any).business_number,
            accountant_email: (updates as any).accountant_email,
            accountant_report_day_of_month: (updates as any).accountant_report_day_of_month,
            accountant_report_time: (updates as any).accountant_report_time,
            client_swap_enabled: (updates as any).client_swap_enabled,
            require_client_approval: (updates as any).require_client_approval,
            home_fixed_message_enabled: (updates as any).home_fixed_message_enabled,
            home_fixed_message: (updates as any).home_fixed_message,
            allow_multi_service_booking: (updates as any).allow_multi_service_booking,
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
          id: businessId,
          display_name: updates.display_name,
          description: (updates as any).description,
          address: updates.address,
          instagram_url: updates.instagram_url,
          facebook_url: updates.facebook_url,
          tiktok_url: (updates as any).tiktok_url,
          home_hero_images: (updates as any).home_hero_images,
          break_by_user: (updates as any).break_by_user,
          booking_open_days_by_user: (updates as any).booking_open_days_by_user ?? {},
          reminder_minutes_by_user: (updates as any).reminder_minutes_by_user,
          client_reminder_minutes: (updates as any).client_reminder_minutes,
          min_cancellation_hours: updates.min_cancellation_hours,
          primary_color: updates.primary_color || '#000000',
          booking_open_days: (updates as any).booking_open_days ?? 7,
          business_number: (updates as any).business_number,
          accountant_email: (updates as any).accountant_email,
          accountant_report_day_of_month: (updates as any).accountant_report_day_of_month,
          accountant_report_time: (updates as any).accountant_report_time,
          client_swap_enabled: (updates as any).client_swap_enabled ?? true,
          require_client_approval: (updates as any).require_client_approval ?? true,
          home_fixed_message_enabled: (updates as any).home_fixed_message_enabled ?? false,
          home_fixed_message: (updates as any).home_fixed_message ?? null,
          allow_multi_service_booking: (updates as any).allow_multi_service_booking ?? false,
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

  /**
   * Client home fixed banner: toggle and/or message text.
   * When `message` is omitted, the stored text is left unchanged (e.g. turn off without clearing draft in DB).
   */
  async updateHomeLogoUrl(home_logo_url: string | null): Promise<BusinessProfile | null> {
    try {
      const businessId = getBusinessId();
      const { data, error } = await supabase
        .from('business_profile')
        .update({ home_logo_url })
        .eq('id', businessId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating home logo URL:', error);
        return null;
      }
      return (data as BusinessProfile) || null;
    } catch (e) {
      console.error('Error in updateHomeLogoUrl:', e);
      return null;
    }
  },

  async updateHomeFixedMessage(opts: {
    enabled: boolean;
    message?: string | null;
  }): Promise<BusinessProfile | null> {
    try {
      const businessId = getBusinessId();
      const payload: Record<string, unknown> = {
        home_fixed_message_enabled: opts.enabled,
      };
      if (opts.message !== undefined) {
        payload.home_fixed_message = opts.message;
      }
      const { data, error } = await supabase
        .from('business_profile')
        .update(payload as any)
        .eq('id', businessId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating home fixed message:', error);
        return null;
      }
      return (data as BusinessProfile) || null;
    } catch (e) {
      console.error('Error in updateHomeFixedMessage:', e);
      return null;
    }
  },

  /** Updates only `allow_multi_service_booking` (client booking multi-select). */
  async setAllowMultiServiceBooking(allow: boolean): Promise<BusinessProfile | null> {
    try {
      const businessId = getBusinessId();
      const { data, error } = await supabase
        .from('business_profile')
        .update({ allow_multi_service_booking: allow })
        .eq('id', businessId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating allow_multi_service_booking:', error);
        return null;
      }
      return (data as BusinessProfile) || null;
    } catch (e) {
      console.error('Error in setAllowMultiServiceBooking:', e);
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

  /** Business-wide client reminder (minutes before appointment). Owner-only in settings UI. */
  async getClientReminderMinutes(): Promise<number | null> {
    try {
      const profile = await this.getProfile();
      const val = (profile as any)?.client_reminder_minutes;
      if (val === null || typeof val === 'undefined') return null;
      const n = Number(val);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (e) {
      console.error('Error in getClientReminderMinutes:', e);
      return null;
    }
  },

  async setClientReminderMinutes(minutes: number | null): Promise<void> {
    const clamped =
      minutes === null || typeof minutes === 'undefined' || Number(minutes) <= 0
        ? null
        : Math.max(1, Math.min(1440, Math.floor(Number(minutes) || 0)));
    const businessId = getBusinessId();
    const { error } = await supabase
      .from('business_profile')
      .update({ client_reminder_minutes: clamped })
      .eq('id', businessId);
    if (error) {
      console.error('Error setting client reminder minutes:', error);
      throw error;
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
  
  /**
   * Widest booking horizon among all per-barber overrides and the legacy global default.
   * Use for client home / appointment lists that aggregate across barbers.
   */
  async getMaxBookingOpenDaysAcrossBusiness(): Promise<number> {
    try {
      const profile = await this.getProfile();
      if (!profile) return 7;
      const globalDefault = Math.max(
        0,
        Math.min(60, Number((profile as any).booking_open_days ?? 7)),
      );
      const byUser = ((profile as any).booking_open_days_by_user ?? {}) as Record<string, number>;
      const values = Object.values(byUser).map((v) =>
        Math.max(0, Math.min(60, Number(v))),
      );
      if (values.length === 0) return globalDefault;
      return Math.max(globalDefault, ...values);
    } catch (e) {
      console.error('Error in getMaxBookingOpenDaysAcrossBusiness:', e);
      return 7;
    }
  },

  async getBookingOpenDaysForUser(userId?: string | null): Promise<number> {
    try {
      const businessId = getBusinessId();
      if (userId) {
        const { data, error } = await supabase.rpc('get_booking_open_days_for_user', {
          p_business_id: businessId,
          p_user_id: userId,
        });
        if (!error && typeof data === 'number') {
          return Math.max(0, Math.min(60, data));
        }
      }
      // Fallback: read profile and extract from JSON or use default
      const profile = await this.getProfile();
      const days = (profile as any)?.booking_open_days_by_user && userId
        ? Number((profile as any).booking_open_days_by_user?.[userId] ?? (profile as any)?.booking_open_days ?? 7)
        : Number((profile as any)?.booking_open_days ?? 7);
      return Math.max(0, Math.min(60, days));
    } catch (e) {
      console.error('Error in getBookingOpenDaysForUser:', e);
      return 7;
    }
  },

  async setBookingOpenDaysForUser(userId: string, days: number): Promise<void> {
    const n = Math.floor(Number(days));
    const clamped = !Number.isFinite(n)
      ? 7
      : Math.max(0, Math.min(60, n));
    const businessId = getBusinessId();
    try {
      const { error } = await supabase.rpc('set_booking_open_days_for_user', {
        p_business_id: businessId,
        p_user_id: userId,
        p_days: clamped,
      });
      if (error) {
        console.error('Error setting per-user booking_open_days (RPC):', error);
        // Fallback: read-modify-write
        const profile = await this.getProfile();
        const currentMap = ((profile as any)?.booking_open_days_by_user ?? {}) as Record<string, number>;
        const nextMap = { ...currentMap, [userId]: clamped };
        await supabase
          .from('business_profile')
          .update({ booking_open_days_by_user: nextMap as any })
          .eq('id', businessId);
      }
    } catch (e) {
      console.error('Error in setBookingOpenDaysForUser:', e);
      throw e;
    }
  },
};



