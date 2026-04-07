import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, getBusinessId } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useGreenInvoiceDevModeStore } from '@/stores/greenInvoiceDevModeStore';

type FnOk = {
  ok: true;
  issued_count: number;
  email_sent: boolean;
  receipt_errors?: string[];
  expense_attachments?: number;
};

type FnErr = {
  ok?: false;
  error?: string;
  message?: string;
  details?: string[];
  issued_count?: number;
};

function parsePayload(data: unknown): FnOk | FnErr {
  if (data && typeof data === 'object') return data as FnOk | FnErr;
  return {};
}

export const financeAccountantPackageApi = {
  async sendMonthlyPackage(params: {
    year: number;
    month: number;
    appointmentIds: string[];
  }): Promise<
    | { ok: true; issuedCount: number; emailSent: boolean; receiptErrors?: string[]; expenseAttachments?: number }
    | { ok: false; error: string; message?: string; details?: string[] }
  > {
    const userId = useAuthStore.getState().user?.id?.trim();
    const businessId = getBusinessId()?.trim();
    if (!userId || !businessId) {
      return { ok: false, error: 'invalid_session' };
    }
    const useSandbox = useGreenInvoiceDevModeStore.getState().useSandboxApi;
    /** אין Supabase Auth session באפליקציה (כניסה דרך users + Zustand) — הפונקציה מאמתת caller_user_id בשרת כמו greeninvoice-issue-receipt */
    const { data, error } = await supabase.functions.invoke('finance-accountant-package', {
      body: {
        business_id: businessId,
        caller_user_id: userId,
        year: params.year,
        month: params.month,
        appointment_ids: params.appointmentIds,
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
            payload = { ...payload, ...(j as FnErr) };
          }
        }
      } catch {
        /* ignore */
      }
      if (status === 404) {
        return { ok: false, error: 'edge_function_not_deployed' };
      }
      if (status === 401) {
        return {
          ok: false,
          error: 'unauthorized',
          message: 'אימות נכשל (401). נסו להתחבר מחדש או לעדכן את האפליקציה.',
        };
      }
    }

    if (error && (payload as FnErr).ok === undefined && (payload as FnErr).error === undefined) {
      const hint =
        error instanceof FunctionsHttpError ? error.message : (error as Error)?.message ?? String(error);
      return { ok: false, error: 'invoke_network', message: hint.trim() || undefined };
    }

    if ((payload as FnOk).ok === true) {
      const p = payload as FnOk;
      return {
        ok: true,
        issuedCount: p.issued_count,
        emailSent: !!p.email_sent,
        receiptErrors: p.receipt_errors,
        expenseAttachments: p.expense_attachments,
      };
    }

    const e = payload as FnErr;
    return {
      ok: false,
      error: e.error ?? 'unknown',
      message: e.message,
      details: e.details,
    };
  },
};
