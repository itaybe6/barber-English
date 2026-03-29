import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type FnResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

function parsePayload(data: unknown): FnResponse {
  if (data && typeof data === 'object') return data as FnResponse;
  return {};
}

async function invokeGreeninvoice(body: Record<string, unknown>): Promise<FnResponse> {
  const { data, error } = await supabase.functions.invoke('greeninvoice-connect', { body });

  let payload = parsePayload(data);

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

export const greenInvoiceConnectApi = {
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
