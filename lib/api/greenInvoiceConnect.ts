import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, getBusinessId } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useGreenInvoiceDevModeStore } from '@/stores/greenInvoiceDevModeStore';

type FnResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

function parsePayload(data: unknown): FnResponse {
  if (data && typeof data === 'object') return data as FnResponse;
  return {};
}

function getCallerContext(): { businessId: string; callerUserId: string } | null {
  const callerUserId = useAuthStore.getState().user?.id?.trim();
  const businessId = getBusinessId()?.trim();
  if (!callerUserId || !businessId) return null;
  return { businessId, callerUserId };
}

async function invokeGreeninvoice(body: Record<string, unknown>): Promise<FnResponse> {
  const ctx = getCallerContext();
  if (!ctx) {
    return { ok: false, error: 'invalid_session' };
  }

  const useSandbox = useGreenInvoiceDevModeStore.getState().useSandboxApi;
  const { data, error } = await supabase.functions.invoke('greeninvoice-connect', {
    body: {
      ...body,
      business_id: ctx.businessId,
      caller_user_id: ctx.callerUserId,
      use_sandbox: useSandbox,
    },
  });

  let payload = parsePayload(data);

  if (error instanceof FunctionsHttpError && error.context) {
    const status = error.context.status;
    try {
      const txt = (await error.context.text()).trim();
      if (txt.startsWith('{')) {
        const j = JSON.parse(txt) as unknown;
        if (j && typeof j === 'object' && !Array.isArray(j)) {
          payload = { ...payload, ...(j as FnResponse) };
        }
      }
    } catch {
      /* ignore */
    }
    if (status === 404) {
      return { ok: false, error: 'edge_function_not_deployed' };
    }
  }

  if (error && payload.ok === undefined && payload.error === undefined) {
    const hint =
      error instanceof FunctionsHttpError ? error.message : (error as Error)?.message ?? String(error);
    return { ok: false, error: 'invoke_network', message: hint.trim() || undefined };
  }

  return payload;
}

export const greenInvoiceConnectApi = {
  async verify(params: { apiKeyId: string; apiSecret: string }): Promise<{ ok: true } | { ok: false; error: string; message?: string }> {
    const payload = await invokeGreeninvoice({
      action: 'verify',
      api_key_id: params.apiKeyId.trim(),
      api_secret: params.apiSecret.trim(),
    });
    if (payload.ok) return { ok: true };
    return {
      ok: false,
      error: payload.error ?? 'unknown',
      message: payload.message,
    };
  },

  async connect(params: { apiKeyId: string; apiSecret: string }): Promise<{ ok: true } | { ok: false; error: string; message?: string }> {
    const payload = await invokeGreeninvoice({
      action: 'connect',
      api_key_id: params.apiKeyId.trim(),
      api_secret: params.apiSecret.trim(),
    });
    if (payload.ok) return { ok: true };
    return {
      ok: false,
      error: payload.error ?? 'unknown',
      message: payload.message,
    };
  },

  async disconnect(): Promise<{ ok: true } | { ok: false; error: string }> {
    const payload = await invokeGreeninvoice({ action: 'disconnect' });
    if (payload.ok) return { ok: true };
    return { ok: false, error: payload.error ?? 'unknown' };
  },
};
