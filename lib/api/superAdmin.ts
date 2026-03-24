import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { decode } from 'base64-arraybuffer';

const SA_P = process.env.EXPO_PUBLIC_SA_P || '';
const SA_K = process.env.EXPO_PUBLIC_SA_K || '';

const serviceRoleKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const adminSupabase = serviceRoleKey && supabaseUrl
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

export interface BusinessOverview {
  id: string;
  display_name: string | null;
  address: string | null;
  phone: string | null;
  primary_color: string | null;
  created_at: string;
  clientCount: number;
  adminCount: number;
  adminPhone: string | null;
  adminPassword: string | null;
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
        .select('business_id, user_type, phone, password_hash')
        .in('business_id', businessIds);

      if (usersError) {
        console.error('Error fetching user counts:', usersError);
      }

      const countMap: Record<string, { clients: number; admins: number; adminPhone: string | null; adminPassword: string | null }> = {};
      for (const u of users || []) {
        if (!countMap[u.business_id]) countMap[u.business_id] = { clients: 0, admins: 0, adminPhone: null, adminPassword: null };
        if (u.user_type === 'client') {
          countMap[u.business_id].clients++;
        } else if (u.user_type === 'admin') {
          countMap[u.business_id].admins++;
          if (!countMap[u.business_id].adminPhone) {
            countMap[u.business_id].adminPhone = u.phone || null;
            const hash = u.password_hash || '';
            countMap[u.business_id].adminPassword = hash === 'default_hash' ? '123456' : hash.startsWith('hash_') ? hash.slice(5) : null;
          }
        }
      }

      return profiles.map((p: any) => ({
        ...p,
        clientCount: countMap[p.id]?.clients || 0,
        adminCount: countMap[p.id]?.admins || 0,
        adminPhone: countMap[p.id]?.adminPhone || null,
        adminPassword: countMap[p.id]?.adminPassword || null,
      }));
    } catch (err) {
      console.error('Error in getAllBusinesses:', err);
      return [];
    }
  },

  async uploadBrandingFile(clientName: string, fileName: string, body: string, contentType: string, isBase64 = false): Promise<string | null> {
    const client = adminSupabase || supabase;
    try {
      const storagePath = `branding/${clientName}/${fileName}`;

      let uploadBody: ArrayBuffer;
      if (isBase64) {
        uploadBody = decode(body.replace(/^data:[^;]+;base64,/, ''));
      } else {
        const bytes = new TextEncoder().encode(body);
        uploadBody = bytes.buffer as ArrayBuffer;
      }

      const { error } = await client.storage
        .from('app_design')
        .upload(storagePath, uploadBody, { contentType, upsert: true });

      if (error) {
        console.error(`Error uploading ${fileName}:`, error);
        return null;
      }

      const { data: urlData } = client.storage.from('app_design').getPublicUrl(storagePath);
      return urlData?.publicUrl || null;
    } catch (err) {
      console.error(`Error uploading branding file ${fileName}:`, err);
      return null;
    }
  },

  async createBusiness(params: {
    businessName: string;
    clientName: string;
    adminName: string;
    adminPhone: string;
    adminPassword: string;
    address?: string;
    primaryColor?: string;
    logoBase64?: string;
    iconBase64?: string;
    splashBase64?: string;
  }): Promise<{ businessId: string; clientName: string } | null> {
    try {
      const businessId = randomUUID();
      const clientName = params.clientName.replace(/[^a-zA-Z0-9]/g, '');
      if (!clientName) {
        console.error('Client name must contain at least one English letter or digit');
        return null;
      }
      const slug = clientName.toLowerCase();
      const color = params.primaryColor || '#000000';

      // 1. Create business profile
      const { error: profileError } = await supabase
        .from('business_profile')
        .insert({
          id: businessId,
          display_name: params.businessName,
          address: params.address || '',
          phone: params.adminPhone,
          primary_color: color,
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

      // 2. Create admin user
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

      // 3. Create default services
      const defaultServices = [
        { name: 'Gel Nails', price: 150, duration_minutes: 60, is_active: true, business_id: businessId },
        { name: 'Gel Removal', price: 50, duration_minutes: 30, is_active: true, business_id: businessId },
        { name: 'Manicure', price: 80, duration_minutes: 45, is_active: true, business_id: businessId },
      ];

      const { error: servicesError } = await supabase.from('services').insert(defaultServices);
      if (servicesError) console.error('Error creating default services (non-fatal):', servicesError);

      // 4. Generate branding config files & upload everything to storage
      const envContent = [
        `# ${params.businessName} Environment Configuration`,
        `EXPO_PUBLIC_SUPABASE_URL=${process.env.EXPO_PUBLIC_SUPABASE_URL || ''}`,
        `EXPO_PUBLIC_SUPABASE_ANON_KEY=${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
        `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=${process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || ''}`,
        `BUSINESS_ID=${businessId}`,
        `CLIENT_NAME=${clientName}`,
        '',
      ].join('\n');

      const appConfigObj = {
        expo: {
          name: params.businessName,
          slug: slug,
          version: '1.0.0',
          orientation: 'portrait',
          icon: `./branding/${clientName}/icon.png`,
          scheme: slug,
          userInterfaceStyle: 'automatic',
          splash: {
            image: `./branding/${clientName}/splash.png`,
            resizeMode: 'contain',
            backgroundColor: '#ffffff',
          },
          ios: {
            buildNumber: '1',
            supportsTablet: true,
            bundleIdentifier: `com.${slug}.app`,
            infoPlist: {
              ITSAppUsesNonExemptEncryption: false,
              CFBundleDevelopmentRegion: 'en',
              CFBundleAllowMixedLocalizations: true,
              NSPhotoLibraryUsageDescription:
                'The app needs access to photos to select and upload images to the gallery or profile.',
              NSPhotoLibraryAddUsageDescription:
                'The app may save photos you\'ve taken to your photo library.',
              NSCameraUsageDescription:
                'The app needs access to the camera to take photos for upload.',
            },
            jsEngine: 'hermes',
          },
          android: {
            package: `com.${slug}.app`,
            versionCode: 1,
            adaptiveIcon: {
              foregroundImage: `./branding/${clientName}/icon.png`,
              backgroundColor: '#ffffff',
            },
            intentFilters: [
              {
                autoVerify: true,
                action: 'VIEW',
                data: { scheme: 'https', host: `${slug}.com` },
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
            supportsRtl: false,
          },
          web: { favicon: `./branding/${clientName}/icon.png` },
          plugins: [
            ['expo-router', { origin: `https://${slug}.com/` }],
            ['expo-notifications', { color: '#ffffff' }],
            'expo-web-browser',
            'expo-font',
            'expo-localization',
          ],
          experiments: { typedRoutes: true },
          locales: { he: './assets/locales/he.json' },
          extra: {
            router: { origin: `https://${slug}.com/` },
            eas: { projectId: '' },
            locale: 'en',
            CLIENT: clientName,
            BUSINESS_ID: businessId,
            logo: `./branding/${clientName}/logo.png`,
            logoWhite: `./branding/${clientName}/logo-white.png`,
          },
        },
      };

      const themeObj = {
        colors: {
          primary: color,
          secondary: color + 'CC',
          accent: '#FF3B30',
          background: '#FFFFFF',
          surface: '#F2F2F7',
          text: '#1C1C1E',
          textSecondary: '#8E8E93',
          border: '#E5E5EA',
          success: '#34C759',
          warning: '#FF9500',
          error: '#FF3B30',
          info: '#007AFF',
        },
        branding: {
          logo: `./branding/${clientName}/logo.png`,
          logoWhite: `./branding/${clientName}/logo-white.png`,
          companyName: params.businessName,
          website: `https://${slug}.com`,
          supportEmail: `support@${slug}.com`,
        },
        fonts: { primary: 'System', secondary: 'System' },
      };

      const uploads: Promise<any>[] = [
        this.uploadBrandingFile(clientName, '.env', envContent, 'text/plain'),
        this.uploadBrandingFile(clientName, 'app.config.json', JSON.stringify(appConfigObj, null, 2), 'application/json'),
        this.uploadBrandingFile(clientName, 'theme.json', JSON.stringify(themeObj, null, 2), 'application/json'),
      ];

      if (params.logoBase64) {
        uploads.push(this.uploadBrandingFile(clientName, 'logo.png', params.logoBase64, 'image/png', true));
      }
      if (params.iconBase64) {
        uploads.push(this.uploadBrandingFile(clientName, 'icon.png', params.iconBase64, 'image/png', true));
      }
      if (params.splashBase64) {
        uploads.push(this.uploadBrandingFile(clientName, 'splash.png', params.splashBase64, 'image/png', true));
      }

      await Promise.allSettled(uploads);

      return { businessId, clientName };
    } catch (err) {
      console.error('Error in createBusiness:', err);
      return null;
    }
  },

  async deleteBusiness(businessId: string): Promise<boolean> {
    const client = adminSupabase || supabase;
    try {
      const tables = [
        'notifications',
        'waitlist_entries',
        'appointments',
        'recurring_appointments',
        'services',
        'business_hours',
        'business_constraints',
        'designs',
        'products',
        'messages',
        'users',
      ];

      for (const table of tables) {
        const { error } = await client.from(table).delete().eq('business_id', businessId);
        if (error) console.error(`Error deleting from ${table}:`, error.message);
      }

      const { error: profileError } = await client.from('business_profile').delete().eq('id', businessId);
      if (profileError) {
        console.error('Error deleting business_profile:', profileError.message);
        return false;
      }

      const { data: brandingFiles } = await client.storage.from('app_design').list(`branding`);
      if (brandingFiles) {
        for (const folder of brandingFiles) {
          const { data: files } = await client.storage.from('app_design').list(`branding/${folder.name}`);
          if (!files) continue;

          const envFile = files.find((f: any) => f.name === '.env');
          if (!envFile) continue;

          const { data: envBlob } = await client.storage.from('app_design').download(`branding/${folder.name}/.env`);
          if (!envBlob) continue;

          const envText = await envBlob.text();
          if (envText.includes(businessId)) {
            const filePaths = files.map((f: any) => `branding/${folder.name}/${f.name}`);
            await client.storage.from('app_design').remove(filePaths);
            console.log(`Deleted storage folder: branding/${folder.name}/`);
            break;
          }
        }
      }

      return true;
    } catch (err) {
      console.error('Error in deleteBusiness:', err);
      return false;
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
