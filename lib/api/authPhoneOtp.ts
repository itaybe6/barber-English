import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, getBusinessId } from '@/lib/supabase';

export interface OtpAuthUserPayload {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  user_type: string;
  image_url: string | null;
  client_approved: boolean;
  block: boolean;
}

type FnResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  warning?: string;
  user?: OtpAuthUserPayload;
  profile_setup_token?: string;
};

function parseInvokePayload(data: unknown): FnResponse {
  if (data && typeof data === 'object') return data as FnResponse;
  return {};
}

/** Non-2xx responses set `error` and discard `data`; JSON body is on error.context (Response). */
async function invokeAuthPhoneOtp(body: Record<string, unknown>): Promise<FnResponse> {
  const { data, error } = await supabase.functions.invoke('auth-phone-otp', { body });

  let payload = parseInvokePayload(data);

  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const ct = (error.context.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const j = await error.context.json();
        if (j && typeof j === 'object') {
          payload = { ...payload, ...(j as FnResponse) };
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (error && payload.ok === undefined && payload.error === undefined) {
    return { ok: false, error: 'invoke_network' };
  }

  return payload;
}

export const authPhoneOtpApi = {
  async sendLoginOtp(phone: string): Promise<{ ok: boolean; error?: string; warning?: string }> {
    const businessId = getBusinessId();
    const p = await invokeAuthPhoneOtp({
      action: 'send_login_otp',
      business_id: businessId,
      phone: phone.trim(),
    });
    if (p.ok !== true) {
      return { ok: false, error: p.error || 'send_failed' };
    }
    return { ok: true, ...(p.warning ? { warning: p.warning } : {}) };
  },

  async verifyLoginOtp(
    phone: string,
    code: string,
  ): Promise<{ ok: boolean; user?: OtpAuthUserPayload; error?: string }> {
    const businessId = getBusinessId();
    const p = await invokeAuthPhoneOtp({
      action: 'verify_login_otp',
      business_id: businessId,
      phone: phone.trim(),
      code,
    });
    if (p.ok !== true || !p.user) {
      return { ok: false, error: p.error || 'verify_failed' };
    }
    return { ok: true, user: p.user };
  },

  async sendRegisterOtp(phone: string): Promise<{ ok: boolean; error?: string; warning?: string }> {
    const businessId = getBusinessId();
    const p = await invokeAuthPhoneOtp({
      action: 'send_register_otp',
      business_id: businessId,
      phone: phone.trim(),
    });
    if (p.ok !== true) {
      return { ok: false, error: p.error || 'send_failed' };
    }
    return { ok: true, ...(p.warning ? { warning: p.warning } : {}) };
  },

  async verifyRegisterOtp(params: {
    phone: string;
    code: string;
  }): Promise<{
    ok: boolean;
    user?: OtpAuthUserPayload;
    profileSetupToken?: string;
    error?: string;
  }> {
    const businessId = getBusinessId();
    const p = await invokeAuthPhoneOtp({
      action: 'verify_register_otp',
      business_id: businessId,
      phone: params.phone.trim(),
      code: params.code,
    });
    if (p.ok !== true || !p.user || !p.profile_setup_token) {
      return { ok: false, error: p.error || 'verify_failed' };
    }
    return {
      ok: true,
      user: p.user,
      profileSetupToken: p.profile_setup_token,
    };
  },

  async completeRegisterProfile(params: {
    profileSetupToken: string;
    name: string;
    birthDate?: string | null;
    imageUrl?: string | null;
  }): Promise<{ ok: boolean; user?: OtpAuthUserPayload; error?: string }> {
    const businessId = getBusinessId();
    const p = await invokeAuthPhoneOtp({
      action: 'complete_register_profile',
      business_id: businessId,
      profile_setup_token: params.profileSetupToken.trim(),
      name: params.name.trim(),
      birth_date: params.birthDate?.trim() || '',
      image_url: params.imageUrl?.trim() || '',
    });
    if (p.ok !== true) {
      return { ok: false, error: p.error || 'complete_failed' };
    }
    if (!p.user) {
      return { ok: false, error: 'missing_user_payload' };
    }
    return { ok: true, user: p.user };
  },
};
