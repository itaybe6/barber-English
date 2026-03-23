import { supabase } from '@/lib/supabase';
import { randomUUID } from 'expo-crypto';

const SA_P = process.env.EXPO_PUBLIC_SA_P || '';
const SA_K = process.env.EXPO_PUBLIC_SA_K || '';

export interface BusinessOverview {
  id: string;
  display_name: string | null;
  address: string | null;
  phone: string | null;
  primary_color: string | null;
  created_at: string;
  clientCount: number;
  adminCount: number;
}

export const superAdminApi = {
  verifySuperAdmin(phone: string, password: string): boolean {
    return !!SA_P && !!SA_K && phone === SA_P && password === SA_K;
  },

  async getAllBusinesses(): Promise<BusinessOverview[]> {
    try {
      const { data: profiles, error } = await supabase
        .from('business_profile')
        .select('id, display_name, address, phone, primary_color, created_at')
        .order('created_at', { ascending: false });

      if (error || !profiles) {
        console.error('Error fetching all businesses:', error);
        return [];
      }

      const businessIds = profiles.map((p: any) => p.id);
      if (businessIds.length === 0) return [];

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('business_id, user_type')
        .in('business_id', businessIds);

      if (usersError) {
        console.error('Error fetching user counts:', usersError);
      }

      const countMap: Record<string, { clients: number; admins: number }> = {};
      for (const u of users || []) {
        if (!countMap[u.business_id]) countMap[u.business_id] = { clients: 0, admins: 0 };
        if (u.user_type === 'client') countMap[u.business_id].clients++;
        else if (u.user_type === 'admin') countMap[u.business_id].admins++;
      }

      return profiles.map((p: any) => ({
        ...p,
        clientCount: countMap[p.id]?.clients || 0,
        adminCount: countMap[p.id]?.admins || 0,
      }));
    } catch (err) {
      console.error('Error in getAllBusinesses:', err);
      return [];
    }
  },

  async uploadBrandingImage(businessName: string, fileName: string, uri: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const ext = fileName.split('.').pop() || 'png';
      const storagePath = `branding/${businessName}/${fileName}`;

      const { error } = await supabase.storage
        .from('app_design')
        .upload(storagePath, blob, { contentType: `image/${ext}`, upsert: true });

      if (error) {
        console.error(`Error uploading ${fileName}:`, error);
        return null;
      }

      const { data: urlData } = supabase.storage.from('app_design').getPublicUrl(storagePath);
      return urlData?.publicUrl || null;
    } catch (err) {
      console.error(`Error uploading branding image ${fileName}:`, err);
      return null;
    }
  },

  async createBusiness(params: {
    businessName: string;
    adminName: string;
    adminPhone: string;
    adminPassword: string;
    address?: string;
    primaryColor?: string;
    logoUri?: string;
    iconUri?: string;
    splashUri?: string;
  }): Promise<{ businessId: string } | null> {
    try {
      const businessId = randomUUID();
      const safeName = params.businessName.replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '_');

      const { error: profileError } = await supabase
        .from('business_profile')
        .insert({
          id: businessId,
          display_name: params.businessName,
          address: params.address || '',
          phone: params.adminPhone,
          primary_color: params.primaryColor || '#000000',
          home_hero_images: [],
          break_by_user: {},
          booking_open_days_by_user: {},
          min_cancellation_hours: 24,
          booking_open_days: 7,
        });

      if (profileError) {
        console.error('Error creating business profile:', profileError);
        return null;
      }

      const hashedPassword = params.adminPassword === '123456'
        ? 'default_hash'
        : `hash_${params.adminPassword}`;

      const { error: userError } = await supabase
        .from('users')
        .insert({
          name: params.adminName,
          phone: params.adminPhone,
          user_type: 'admin',
          business_id: businessId,
          password_hash: hashedPassword,
        });

      if (userError) {
        console.error('Error creating admin user:', userError);
        await supabase.from('business_profile').delete().eq('id', businessId);
        return null;
      }

      const defaultServices = [
        { name: 'Gel Nails', price: 150, duration_minutes: 60, is_active: true, business_id: businessId },
        { name: 'Gel Removal', price: 50, duration_minutes: 30, is_active: true, business_id: businessId },
        { name: 'Manicure', price: 80, duration_minutes: 45, is_active: true, business_id: businessId },
      ];

      const { error: servicesError } = await supabase
        .from('services')
        .insert(defaultServices);

      if (servicesError) {
        console.error('Error creating default services (non-fatal):', servicesError);
      }

      // Upload branding images (non-blocking)
      const uploads: Promise<void>[] = [];
      if (params.logoUri) {
        uploads.push(this.uploadBrandingImage(safeName, 'logo.png', params.logoUri).then(() => {}));
      }
      if (params.iconUri) {
        uploads.push(this.uploadBrandingImage(safeName, 'icon.png', params.iconUri).then(() => {}));
      }
      if (params.splashUri) {
        uploads.push(this.uploadBrandingImage(safeName, 'splash.png', params.splashUri).then(() => {}));
      }
      if (uploads.length > 0) {
        await Promise.allSettled(uploads);
      }

      return { businessId };
    } catch (err) {
      console.error('Error in createBusiness:', err);
      return null;
    }
  },

  async getBusinessDetails(businessId: string) {
    try {
      const [profileRes, usersRes, servicesRes] = await Promise.all([
        supabase.from('business_profile').select('*').eq('id', businessId).single(),
        supabase.from('users').select('id, name, phone, user_type, created_at').eq('business_id', businessId).order('created_at'),
        supabase.from('services').select('id, name, price, is_active').eq('business_id', businessId).order('name'),
      ]);

      return {
        profile: profileRes.data,
        users: usersRes.data || [],
        services: servicesRes.data || [],
      };
    } catch (err) {
      console.error('Error in getBusinessDetails:', err);
      return null;
    }
  },
};
