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
  branding_client_name: string | null;
  pulseem_user_id: string | null;
  pulseem_from_number: string | null;
  /** Set from DB column — password itself is never loaded in the businesses list */
  pulseemHasPassword: boolean;
  /** מפתח API חדש (Pulseem הגדרות API) — רק דגל, לא הערך */
  pulseemHasApiKey: boolean;
}

const PULSEEM_ASMX = 'https://www.pulseem.co.il/Pulseem/pulseemsendservices.asmx';

function mergeEnvKeyValues(content: string, pairs: Record<string, string>): string {
  const keys = new Set(Object.keys(pairs));
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const used = new Set<string>();
  const out: string[] = [];

  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && keys.has(m[1])) {
      out.push(`${m[1]}=${pairs[m[1]]}`);
      used.add(m[1]);
    } else {
      out.push(line);
    }
  }

  const tail: string[] = [];
  for (const k of keys) {
    if (!used.has(k)) tail.push(`${k}=${pairs[k]}`);
  }
  if (tail.length) {
    const body = out.join('\n').replace(/\s+$/, '');
    const sep = body && !body.endsWith('\n') ? '\n' : '';
    const block = `\n# Pulseem SMS (OTP)\n${tail.join('\n')}\n`;
    return (body ? body + sep : '') + block;
  }
  return out.join('\n');
}

export async function testPulseemConnection(
  userId: string,
  password: string,
): Promise<
  | { readonly ok: true; readonly credits: string }
  | { readonly ok: false; readonly message: string }
> {
  const uid = userId.trim();
  const pw = password.trim();
  if (!uid || !pw) {
    return { ok: false, message: 'יש להזין מזהה משתמש וסיסמה' };
  }
  try {
    const url = `${PULSEEM_ASMX}/GetSMScreditsLeft?userID=${encodeURIComponent(uid)}&password=${encodeURIComponent(pw)}`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `שגיאת רשת (${res.status})` };
    }
    const fault = text.match(/<faultstring[^>]*>([^<]+)</i);
    if (fault) {
      return { ok: false, message: fault[1].trim() };
    }
    const dec = text.match(/<decimal[^>]*>([^<]*)</i);
    if (dec) {
      return { ok: true, credits: dec[1].trim() };
    }
    return { ok: false, message: 'תגובה לא צפויה מפולסים' };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'בדיקת חיבור נכשלה' };
  }
}

export const superAdminApi = {
  verifySuperAdmin(phone: string, password: string): boolean {
    return !!SA_P && !!SA_K && phone === SA_P && password === SA_K;
  },

  async getAllBusinesses(): Promise<BusinessOverview[]> {
    try {
      const { data: profiles, error } = await supabase
        .from('business_profile')
        .select(
          'id, display_name, address, phone, primary_color, created_at, branding_client_name, pulseem_user_id, pulseem_from_number, pulseem_has_password, pulseem_has_api_key',
        )
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
        id: p.id,
        display_name: p.display_name,
        address: p.address,
        phone: p.phone,
        primary_color: p.primary_color,
        created_at: p.created_at,
        branding_client_name: p.branding_client_name ?? null,
        pulseem_user_id: p.pulseem_user_id ?? null,
        pulseem_from_number: p.pulseem_from_number ?? null,
        pulseemHasPassword: !!p.pulseem_has_password,
        pulseemHasApiKey: !!p.pulseem_has_api_key,
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

  async downloadBrandingFileText(clientName: string, fileName: string): Promise<string | null> {
    const client = adminSupabase || supabase;
    try {
      const storagePath = `branding/${clientName}/${fileName}`;
      const { data, error } = await client.storage.from('app_design').download(storagePath);
      if (error || !data) {
        return null;
      }
      return await data.text();
    } catch (err) {
      console.error(`Error downloading branding file ${fileName}:`, err);
      return null;
    }
  },

  async resolveBrandingClientName(businessId: string, hint: string | null): Promise<string | null> {
    const h = hint?.trim();
    if (h) return h;
    const st = adminSupabase || supabase;
    const { data: folders, error } = await st.storage.from('app_design').list('branding');
    if (error || !folders?.length) return null;
    for (const folder of folders) {
      if (folder.name.includes('.')) continue;
      const text = await this.downloadBrandingFileText(folder.name, '.env');
      if (!text) continue;
      const m = text.match(/^\s*BUSINESS_ID\s*=\s*(\S+)/m);
      if (m && m[1] === businessId) return folder.name;
    }
    return null;
  },

  async getPulseemEditorState(businessId: string): Promise<{
    userId: string;
    fromNumber: string;
    hasPassword: boolean;
  } | null> {
    const { data, error } = await supabase
      .from('business_profile')
      .select('pulseem_user_id, pulseem_from_number, pulseem_has_password')
      .eq('id', businessId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      userId: (data as any).pulseem_user_id?.trim() || '',
      fromNumber: (data as any).pulseem_from_number?.trim() || '',
      hasPassword: !!(data as any).pulseem_has_password,
    };
  },

  async testPulseemForBusiness(
    businessId: string,
    userId: string,
    passwordOverride: string,
  ): Promise<
    | { readonly ok: true; readonly credits: string }
    | { readonly ok: false; readonly message: string }
  > {
    let password = passwordOverride.trim();
    if (!password) {
      const { data } = await supabase
        .from('business_profile')
        .select('pulseem_password')
        .eq('id', businessId)
        .maybeSingle();
      password = ((data as any)?.pulseem_password as string | undefined)?.trim() || '';
    }
    return testPulseemConnection(userId, password);
  },

  async savePulseemCredentials(
    businessId: string,
    fields: { userId: string; password: string; fromNumber: string },
  ): Promise<{ ok: boolean; errorMessage?: string; envSynced: boolean }> {
    const uid = fields.userId.trim();
    const fromNum = fields.fromNumber.trim();
    if (!uid) {
      return { ok: false, errorMessage: 'חסר מזהה משתמש פולסים', envSynced: false };
    }
    if (!fromNum) {
      return { ok: false, errorMessage: 'חסר מספר שולח (מאיזה מספר נשלח ה-SMS)', envSynced: false };
    }

    const { data: row, error: fetchErr } = await supabase
      .from('business_profile')
      .select('pulseem_password, branding_client_name, pulseem_api_key')
      .eq('id', businessId)
      .maybeSingle();

    if (fetchErr || !row) {
      return { ok: false, errorMessage: 'לא נמצא עסק', envSynced: false };
    }

    const existingPass = ((row as any).pulseem_password as string | undefined)?.trim() || '';
    const newPass = fields.password.trim();
    const finalPassword = newPass || existingPass;
    if (!finalPassword) {
      return { ok: false, errorMessage: 'נדרשת סיסמת API (או השאר ריק אם כבר נשמרה)', envSynced: false };
    }

    const clientName = await this.resolveBrandingClientName(businessId, (row as any).branding_client_name);

    const { error: updErr } = await supabase
      .from('business_profile')
      .update({
        pulseem_user_id: uid,
        pulseem_password: finalPassword,
        pulseem_from_number: fromNum,
        pulseem_has_password: true,
        ...(clientName ? { branding_client_name: clientName } : {}),
      })
      .eq('id', businessId);

    if (updErr) {
      console.error('savePulseemCredentials update:', updErr);
      return { ok: false, errorMessage: 'שמירה למסד נכשלה', envSynced: false };
    }

    if (!clientName) {
      return {
        ok: true,
        envSynced: false,
      };
    }

    let envText = await this.downloadBrandingFileText(clientName, '.env');
    if (!envText) {
      envText = [
        `# Synced from Super Admin — ${clientName}`,
        `EXPO_PUBLIC_SUPABASE_URL=${process.env.EXPO_PUBLIC_SUPABASE_URL || ''}`,
        `EXPO_PUBLIC_SUPABASE_ANON_KEY=${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
        `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=${process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || ''}`,
        `BUSINESS_ID=${businessId}`,
        `CLIENT_NAME=${clientName}`,
        '',
      ].join('\n');
    }

    const apiKeyStored = ((row as any).pulseem_api_key as string | undefined)?.trim() || '';
    const mergePairs: Record<string, string> = {
      PULSEEM_USER_ID: uid,
      PULSEEM_PASSWORD: finalPassword,
      PULSEEM_FROM_NUMBER: fromNum,
    };
    if (apiKeyStored) {
      mergePairs.PULSEEM_API_KEY = apiKeyStored;
    }
    const merged = mergeEnvKeyValues(envText, mergePairs);

    const uploaded = await this.uploadBrandingFile(clientName, '.env', merged, 'text/plain');
    return { ok: true, envSynced: !!uploaded };
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
    /** מפתח API מעמוד «הגדרות API» בפולסים (חשבון משנה) */
    pulseemApiKey?: string;
    /** מספר/שם שולח SMS מאושר בפולסים */
    pulseemFromNumber?: string;
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
      const pulseApiKey = params.pulseemApiKey?.trim() || '';
      const pulseFrom = params.pulseemFromNumber?.trim() || '';

      // 1. Create business profile
      const { error: profileError } = await supabase
        .from('business_profile')
        .insert({
          id: businessId,
          display_name: params.businessName,
          address: params.address || '',
          phone: params.adminPhone,
          primary_color: color,
          branding_client_name: clientName,
          home_hero_images: [],
          break_by_user: {},
          booking_open_days_by_user: {},
          min_cancellation_hours: 24,
          booking_open_days: 7,
          ...(pulseApiKey ? { pulseem_api_key: pulseApiKey, pulseem_has_api_key: true } : {}),
          ...(pulseFrom ? { pulseem_from_number: pulseFrom } : {}),
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
      const envPulseLines: string[] = [
        '',
        '# Pulseem — מפתח מ«הגדרות API» (חשבון משנה), ל-Edge / אינטגרציות',
      ];
      if (pulseApiKey) {
        envPulseLines.push(`PULSEEM_API_KEY=${pulseApiKey}`);
      } else {
        envPulseLines.push('# PULSEEM_API_KEY=');
      }
      if (pulseFrom) {
        envPulseLines.push(`PULSEEM_FROM_NUMBER=${pulseFrom}`);
      } else {
        envPulseLines.push('# PULSEEM_FROM_NUMBER=');
      }
      envPulseLines.push(
        '',
        '# Pulseem — Web Service ישן (אופציונלי)',
        '# PULSEEM_USER_ID=',
        '# PULSEEM_PASSWORD=',
        '',
      );

      const envContent = [
        `# ${params.businessName} Environment Configuration`,
        `EXPO_PUBLIC_SUPABASE_URL=${process.env.EXPO_PUBLIC_SUPABASE_URL || ''}`,
        `EXPO_PUBLIC_SUPABASE_ANON_KEY=${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
        `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=${process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || ''}`,
        `BUSINESS_ID=${businessId}`,
        `CLIENT_NAME=${clientName}`,
        ...envPulseLines,
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
