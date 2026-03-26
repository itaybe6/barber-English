import { supabase } from '@/lib/supabase';
import { getExpoExtra } from '@/lib/getExtra';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { decode } from 'base64-arraybuffer';

function superAdminPhoneDigits(s: string): string {
  return String(s || '').replace(/\D/g, '');
}

function getSuperAdminEnv(): { phone: string; password: string } {
  const extra = getExpoExtra();
  return {
    phone: String(extra.EXPO_PUBLIC_SA_P ?? '').trim(),
    password: String(extra.EXPO_PUBLIC_SA_K ?? ''),
  };
}

/** מפתח Pulseem הראשי — מ-app.config extra (מפוענח מ-PULSEEM_MAIN_API_KEY_B64) */
function getPulseemMainApiKey(): string {
  const extra = getExpoExtra();
  const raw = String(extra.PULSEEM_MAIN_API_KEY ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  return raw;
}

const serviceRoleKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const adminSupabase = serviceRoleKey && supabaseUrl
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

/** Encrypts Pulseem secrets server-side (AES-GCM); DB never stores plaintext for new writes. */
async function invokePulseemCredentialsAdmin<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T | null> {
  if (!serviceRoleKey || !supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[pulseem-admin] Missing EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_URL, or EXPO_PUBLIC_SUPABASE_ANON_KEY',
    );
    return null;
  }
  const base = supabaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/functions/v1/pulseem-admin-credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;
  if (!res.ok) {
    console.error('[pulseem-admin] HTTP', res.status, data);
    return null;
  }
  if (data && typeof data === 'object' && (data as { error?: string }).error === 'unauthorized') {
    return null;
  }
  return data as T;
}

export interface BusinessOverview {
  id: string;
  display_name: string | null;
  address: string | null;
  phone: string | null;
  primary_color: string | null;
  created_at: string;
  clientCount: number;
  adminCount: number;
  /** סה״כ רשומות בטבלת messages (הודעות שידור לדף הבית), לא יתרת SMS */
  broadcastMessageCount: number;
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
const PULSEEM_REST_BASE = 'https://api.pulseem.com/api/v1';
const PULSEEM_UI_API_BASE = 'https://ui-api.pulseem.com/api/v1';

/** Supabase storage `download()` returns a Blob; RN/Hermes often lacks `Blob.prototype.text`. */
async function storageDownloadToUtf8(data: Blob): Promise<string> {
  const b = data as Blob & { text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof b.text === 'function') {
    return b.text();
  }
  if (typeof b.arrayBuffer === 'function') {
    const buf = await b.arrayBuffer();
    return new TextDecoder('utf-8').decode(buf);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read storage blob as text'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsText(b);
  });
}

/** Public Storage URL → bucket + object path (for batch remove). */
function storageRefFromPublicUrl(url: string): { bucket: string; path: string } | null {
  const s = String(url || '').trim();
  if (!s) return null;
  const marker = '/storage/v1/object/public/';
  const i = s.indexOf(marker);
  if (i === -1) return null;
  const rest = s.slice(i + marker.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  let objectPath = rest.slice(slash + 1);
  const q = objectPath.indexOf('?');
  if (q !== -1) objectPath = objectPath.slice(0, q);
  if (!objectPath) return null;
  try {
    objectPath = decodeURIComponent(objectPath);
  } catch {
    /* keep raw */
  }
  return { bucket, path: objectPath };
}

function addStorageUrlToMap(map: Map<string, Set<string>>, url: string | null | undefined) {
  const ref = storageRefFromPublicUrl(url ?? '');
  if (!ref) return;
  let set = map.get(ref.bucket);
  if (!set) {
    set = new Set();
    map.set(ref.bucket, set);
  }
  set.add(ref.path);
}

function addStorageUrlsFromList(map: Map<string, Set<string>>, urls: unknown) {
  if (!Array.isArray(urls)) return;
  for (const u of urls) {
    if (typeof u === 'string') addStorageUrlToMap(map, u);
  }
}

async function removeStorageRefsInBatches(client: SupabaseClient, byBucket: Map<string, Set<string>>) {
  const BATCH = 100;
  for (const [bucket, set] of byBucket) {
    const paths = [...set];
    for (let i = 0; i < paths.length; i += BATCH) {
      const chunk = paths.slice(i, i + BATCH);
      const { error } = await client.storage.from(bucket).remove(chunk);
      if (error) console.error(`Storage remove ${bucket}:`, error.message);
    }
  }
}

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

export interface PulseemSubAccountResult {
  loginUserName: string;
  loginPassword: string;
  /** API key for the direct/REST account (directAccountPassword from Pulseem response) */
  directApiKey: string;
  directSmsCredits: number;
}

/**
 * Creates a Pulseem sub-account with DirectSmsCredits via the REST API.
 * Requires the main account's API key (PULSEEM_MAIN_API_KEY in .env → app.config extra).
 */
export async function createPulseemSubAccount(params: {
  mainApiKey: string;
  subAccountName: string;
  /** אימייל לחשבון (Pulseem דורש בשדה AccountEmail; עד 50 תווים) */
  accountEmail: string;
  loginUserName: string;
  loginPassword: string;
  directSmsCredits?: number;
}): Promise<PulseemSubAccountResult | { error: string }> {
  const credits = params.directSmsCredits ?? 20;
  const accountEmail = params.accountEmail.trim().slice(0, 50);
  const mainApiKey = (params.mainApiKey.trim() || getPulseemMainApiKey()).replace(/^\uFEFF/, '').trim();
  console.log('[createPulseemSubAccount] key length=', mainApiKey.length, 'first3=', mainApiKey.slice(0, 3));
  if (!mainApiKey) {
    return { error: 'חסר מפתח Pulseem ראשי (PULSEEM_MAIN_API_KEY_B64 ב-.env)' };
  }
  try {
    const payload = {
      SubAccountName: params.subAccountName.slice(0, 50),
      AccountEmail: accountEmail,
      LoginUserName: params.loginUserName.slice(0, 50),
      LoginPassword: params.loginPassword.slice(0, 50),
      SmsCredits: 0,
      EmailCredits: 0,
      DirectEmailCredits: 0,
      DirectSmsCredits: credits,
    };
    const url = `${PULSEEM_REST_BASE}/AccountsApi/AddNewSubaccountAndDirectAcount`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        APIKEY: mainApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log('[createPulseemSubAccount] status=', res.status, 'body=', text);

    if (!res.ok) {
      return { error: `Pulseem HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    let json: any = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }

    const status = json?.status ?? json?.Status ?? '';
    const errMsg = json?.errorMessage ?? json?.ErrorMessage ?? null;
    if (status && String(status).toLowerCase() !== 'success') {
      return {
        error: `Pulseem: ${status}${errMsg ? ` — ${errMsg}` : ''}`,
      };
    }
    if (errMsg) {
      return { error: String(errMsg) };
    }

    const directApiKey: string =
      json?.directAccountPassword ??
      json?.DirectAccountPassword ??
      json?.apiKey ??
      json?.ApiKey ??
      params.loginPassword;

    const ctr = json?.creditTransferModelResult ?? json?.CreditTransferModelResult;
    const ds = ctr?.directSms ?? ctr?.DirectSms;
    const transferredCredits = ds?.credits ?? ds?.Credits;

    return {
      loginUserName: params.loginUserName,
      loginPassword: params.loginPassword,
      directApiKey,
      directSmsCredits: transferredCredits ?? credits,
    };
  } catch (e: any) {
    return { error: e?.message || 'createPulseemSubAccount failed' };
  }
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
    const { phone: saPhone, password: saPass } = getSuperAdminEnv();
    if (!saPhone || !saPass) return false;
    return superAdminPhoneDigits(phone) === superAdminPhoneDigits(saPhone) && password === saPass;
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

      const messageCountByBusiness: Record<string, number> = {};
      for (const id of businessIds) messageCountByBusiness[id] = 0;

      const PAGE = 1000;
      for (let offset = 0; offset < 500_000; offset += PAGE) {
        const { data: batch, error: messagesError } = await supabase
          .from('messages')
          .select('business_id')
          .in('business_id', businessIds)
          .range(offset, offset + PAGE - 1);
        if (messagesError) {
          console.error('Error fetching message counts:', messagesError);
          break;
        }
        if (!batch?.length) break;
        for (const row of batch) {
          const bid = (row as { business_id?: string }).business_id;
          if (bid && messageCountByBusiness[bid] !== undefined) {
            messageCountByBusiness[bid]++;
          }
        }
        if (batch.length < PAGE) break;
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
        broadcastMessageCount: messageCountByBusiness[p.id] ?? 0,
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
      return await storageDownloadToUtf8(data);
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
    const result = await invokePulseemCredentialsAdmin<{
      ok: boolean;
      credits?: string;
      message?: string;
    }>({
      action: 'test_connection',
      businessId,
      userId: userId.trim(),
      password: passwordOverride.trim(),
    });
    if (!result) {
      return {
        ok: false,
        message:
          'בדיקה נכשלה — ודא פריסת pulseem-admin-credentials, מפתח הצפנה ב-Edge, ומפתח שירות באפליקציה',
      };
    }
    if (result.ok && typeof result.credits === 'string') {
      return { ok: true, credits: result.credits };
    }
    return { ok: false, message: result.message || 'בדיקה נכשלה' };
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

    const edge = await invokePulseemCredentialsAdmin<{
      ok?: boolean;
      errorMessage?: string;
      envPlaintext?: Record<string, string>;
    }>({
      action: 'save_credentials',
      businessId,
      userId: uid,
      password: fields.password.trim(),
      fromNumber: fromNum,
    });

    if (!edge) {
      return {
        ok: false,
        errorMessage:
          'שמירה נכשלה — ודא פריסת pulseem-admin-credentials, PULSEEM_FIELD_ENCRYPTION_KEY ב-Supabase Secrets, ומפתחות URL/Anon/Service באפליקציה',
        envSynced: false,
      };
    }
    if (!edge.ok) {
      return { ok: false, errorMessage: edge.errorMessage || 'שמירה נכשלה', envSynced: false };
    }

    const { data: hintRow } = await supabase
      .from('business_profile')
      .select('branding_client_name')
      .eq('id', businessId)
      .maybeSingle();
    const clientName = await this.resolveBrandingClientName(
      businessId,
      ((hintRow as any)?.branding_client_name as string | undefined) ?? null,
    );

    if (clientName) {
      const db = adminSupabase || supabase;
      await db
        .from('business_profile')
        .update({ branding_client_name: clientName })
        .eq('id', businessId);
    }

    if (!clientName || !edge.envPlaintext) {
      return { ok: true, envSynced: false };
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

    const merged = mergeEnvKeyValues(envText, edge.envPlaintext);
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
    /** מפתח API מעמוד «הגדרות API» בפולסים (חשבון משנה) — אם סופק ידנית */
    pulseemApiKey?: string;
    /** מספר/שם שולח SMS מאושר בפולסים */
    pulseemFromNumber?: string;
    /** מזהה משתמש Web Service (pulseemsendservices) */
    pulseemWsUserId?: string;
    /** סיסמת Web Service פולסים */
    pulseemWsPassword?: string;
    /** סיסמה ידנית לתת-חשבון Pulseem החדש — אם ריק תיווצר אקראית */
    pulseemSubPassword?: string;
  }): Promise<{ businessId: string; clientName: string; pulseemCreated?: boolean; pulseemError?: string } | null> {
    try {
      const businessId = randomUUID();
      const clientName = params.clientName.replace(/[^a-zA-Z0-9]/g, '');
      if (!clientName) {
        console.error('Client name must contain at least one English letter or digit');
        return null;
      }
      const slug = clientName.toLowerCase();
      const color = params.primaryColor || '#000000';

      const mainPulseemApiKey = getPulseemMainApiKey();
      console.log('[createBusiness] pulseemMainApiKey length=', mainPulseemApiKey.length, 'empty?', !mainPulseemApiKey);
      let pulseApiKey = params.pulseemApiKey?.trim() || '';
      // Never default From to clientName — Pulseem often allows only numeric senders for new sub-accounts.
      let pulseFrom = params.pulseemFromNumber?.trim() || '';
      let pulseWsUser = params.pulseemWsUserId?.trim() || '';
      let pulseWsPass = params.pulseemWsPassword?.trim() || '';
      let pulseemCreated = false;
      let pulseemError: string | undefined;

      if (mainPulseemApiKey && !pulseApiKey) {
        const subUser = `${slug}sms`.slice(0, 20);
        const subPass = params.pulseemSubPassword?.trim() ||
          Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
        const accountEmail = `${slug}-pulseem@noreply.local`.slice(0, 50);
        const subResult = await createPulseemSubAccount({
          mainApiKey: mainPulseemApiKey,
          subAccountName: params.businessName.slice(0, 50),
          accountEmail,
          loginUserName: subUser,
          loginPassword: subPass,
          directSmsCredits: 20,
        });

        if ('error' in subResult) {
          console.warn('[createBusiness] Pulseem sub-account creation failed (non-fatal):', subResult.error);
          pulseemError = subResult.error;
        } else {
          pulseApiKey = subResult.directApiKey;
          pulseWsUser = subResult.loginUserName;
          pulseWsPass = subResult.loginPassword;
          pulseemCreated = true;
          console.log('[createBusiness] Pulseem sub-account created:', subResult.loginUserName, 'credits:', subResult.directSmsCredits);
        }
      }

      let insertPulseApiKey = pulseApiKey;
      let insertPulsePass = pulseWsPass;
      if (pulseApiKey || pulseWsPass) {
        const enc = await invokePulseemCredentialsAdmin<{
          pulseem_api_key?: string;
          pulseem_password?: string;
        }>({
          action: 'encrypt_for_insert',
          ...(pulseApiKey ? { pulseem_api_key: pulseApiKey } : {}),
          ...(pulseWsPass ? { pulseem_password: pulseWsPass } : {}),
        });
        if (!enc) {
          console.error(
            '[createBusiness] encrypt_for_insert failed — deploy pulseem-admin-credentials and set PULSEEM_FIELD_ENCRYPTION_KEY (same value on auth-phone-otp)',
          );
          return null;
        }
        if (pulseApiKey) {
          if (!enc.pulseem_api_key) {
            console.error('[createBusiness] encrypted api key missing');
            return null;
          }
          insertPulseApiKey = enc.pulseem_api_key;
        }
        if (pulseWsPass) {
          if (!enc.pulseem_password) {
            console.error('[createBusiness] encrypted pulseem password missing');
            return null;
          }
          insertPulsePass = enc.pulseem_password;
        }
      }

      // 1. Create business profile (Edge Functions read Pulseem from here — not from local branding/.env)
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
          ...(insertPulseApiKey
            ? { pulseem_api_key: insertPulseApiKey, pulseem_has_api_key: true }
            : {}),
          ...(pulseFrom ? { pulseem_from_number: pulseFrom } : {}),
          ...(pulseWsUser ? { pulseem_user_id: pulseWsUser } : {}),
          ...(insertPulsePass
            ? { pulseem_password: insertPulsePass, pulseem_has_password: true }
            : {}),
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
        { name: 'שירות 1', price: 150, duration_minutes: 60, is_active: true, business_id: businessId },
        { name: 'שירות 2', price: 50, duration_minutes: 30, is_active: true, business_id: businessId },
        { name: 'שירות 3', price: 80, duration_minutes: 45, is_active: true, business_id: businessId },
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
      envPulseLines.push('', '# Pulseem — Web Service (שליחת SMS / OTP ב-Edge)', '');
      if (pulseWsUser) {
        envPulseLines.push(`PULSEEM_USER_ID=${pulseWsUser}`);
      } else {
        envPulseLines.push('# PULSEEM_USER_ID=');
      }
      if (pulseWsPass) {
        envPulseLines.push(`PULSEEM_PASSWORD=${pulseWsPass}`);
      } else {
        envPulseLines.push('# PULSEEM_PASSWORD=');
      }
      envPulseLines.push('');

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

      return { businessId, clientName, pulseemCreated, pulseemError };
    } catch (err) {
      console.error('Error in createBusiness:', err);
      return null;
    }
  },

  async deleteBusiness(businessId: string): Promise<boolean> {
    const client = adminSupabase || supabase;
    try {
      const { data: profilePeek } = await client
        .from('business_profile')
        .select('branding_client_name, home_hero_images')
        .eq('id', businessId)
        .maybeSingle();
      const brandingFolder = ((profilePeek as any)?.branding_client_name as string | undefined)?.trim() || null;

      const storagePathsByBucket = new Map<string, Set<string>>();
      addStorageUrlsFromList(storagePathsByBucket, (profilePeek as any)?.home_hero_images);

      const [designsRes, usersRes, servicesRes, productsRes] = await Promise.all([
        client.from('designs').select('image_url, image_urls').eq('business_id', businessId),
        client.from('users').select('image_url').eq('business_id', businessId),
        client.from('services').select('image_url').eq('business_id', businessId),
        client.from('products').select('image_url').eq('business_id', businessId),
      ]);

      const expensesRes = await client.from('business_expenses').select('receipt_url').eq('business_id', businessId);
      if (expensesRes.error) {
        console.warn('deleteBusiness: business_expenses fetch skipped:', expensesRes.error.message);
      }

      for (const row of designsRes.data || []) {
        addStorageUrlToMap(storagePathsByBucket, (row as { image_url?: string }).image_url);
        addStorageUrlsFromList(storagePathsByBucket, (row as { image_urls?: string[] }).image_urls);
      }
      for (const row of usersRes.data || []) {
        addStorageUrlToMap(storagePathsByBucket, (row as { image_url?: string | null }).image_url);
      }
      for (const row of servicesRes.data || []) {
        addStorageUrlToMap(storagePathsByBucket, (row as { image_url?: string | null }).image_url);
      }
      for (const row of productsRes.data || []) {
        addStorageUrlToMap(storagePathsByBucket, (row as { image_url?: string | null }).image_url);
      }
      if (!expensesRes.error) {
        for (const row of expensesRes.data || []) {
          addStorageUrlToMap(storagePathsByBucket, (row as { receipt_url?: string | null }).receipt_url);
        }
      }

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
        'business_expenses',
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

      const removeStoragePrefix = async (prefix: string) => {
        const { data: files, error: listErr } = await client.storage.from('app_design').list(prefix);
        if (listErr) {
          console.error(`Error listing storage ${prefix}:`, listErr.message);
          return;
        }
        if (!files?.length) return;
        const paths = files.map((f: { name: string }) => `${prefix}/${f.name}`);
        const { error: remErr } = await client.storage.from('app_design').remove(paths);
        if (remErr) console.error(`Error removing storage ${prefix}:`, remErr.message);
        else console.log(`Deleted storage: ${prefix}/`);
      };

      if (brandingFolder) {
        await removeStoragePrefix(`branding/${brandingFolder}`);
      } else {
        const { data: brandingFiles } = await client.storage.from('app_design').list(`branding`);
        if (brandingFiles) {
          for (const folder of brandingFiles) {
            const { data: files } = await client.storage.from('app_design').list(`branding/${folder.name}`);
            if (!files) continue;

            const envFile = files.find((f: { name: string }) => f.name === '.env');
            if (!envFile) continue;

            const { data: envBlob } = await client.storage.from('app_design').download(`branding/${folder.name}/.env`);
            if (!envBlob) continue;

            const envText = await storageDownloadToUtf8(envBlob);
            if (envText.includes(businessId)) {
              const filePaths = files.map((f: { name: string }) => `branding/${folder.name}/${f.name}`);
              await client.storage.from('app_design').remove(filePaths);
              console.log(`Deleted storage folder: branding/${folder.name}/`);
              break;
            }
          }
        }
      }

      await removeStorageRefsInBatches(client, storagePathsByBucket);

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
