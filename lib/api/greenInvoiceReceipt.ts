import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, getBusinessId } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type FnResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  sandbox?: boolean;
  document?: {
    id?: string | null;
    number?: string | number | null;
    url?: unknown;
  };
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

/** Green Invoice often returns `url` as `{ he, en, origin }`. */
export function pickGreenInvoiceDocumentUrl(url: unknown): string | null {
  if (typeof url === 'string' && url.startsWith('http')) return url;
  if (!url || typeof url !== 'object') return null;
  const o = url as Record<string, unknown>;
  for (const k of ['he', 'origin', 'en'] as const) {
    const v = o[k];
    if (typeof v === 'string' && v.startsWith('http')) return v;
  }
  return null;
}

async function invoke(body: Record<string, unknown>): Promise<FnResponse> {
  const ctx = getCallerContext();
  if (!ctx) {
    return { ok: false, error: 'invalid_session' };
  }

  const { data, error } = await supabase.functions.invoke('greeninvoice-issue-receipt', {
    body: {
      ...body,
      business_id: ctx.businessId,
      caller_user_id: ctx.callerUserId,
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

export const greenInvoiceReceiptApi = {
  async issueForAppointment(appointmentId: string): Promise<
    | { ok: true; sandbox: boolean; documentId: string | null; documentNumber: string | null; viewUrl: string | null }
    | { ok: false; error: string; message?: string }
  > {
    const id = appointmentId.trim();
    if (!id) {
      return { ok: false, error: 'missing_appointment_id' };
    }

    const payload = await invoke({ appointment_id: id });
    if (payload.ok && payload.document) {
      const viewUrl = pickGreenInvoiceDocumentUrl(payload.document.url);
      const num = payload.document.number;
      return {
        ok: true,
        sandbox: !!payload.sandbox,
        documentId: payload.document.id != null ? String(payload.document.id) : null,
        documentNumber: num != null ? String(num) : null,
        viewUrl,
      };
    }
    return {
      ok: false,
      error: payload.error ?? 'unknown',
      message: payload.message,
    };
  },
};
