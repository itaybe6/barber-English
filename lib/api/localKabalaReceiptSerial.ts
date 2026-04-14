import { supabase } from '@/lib/supabase';

export type AllocateKabalaSerialParams = {
  businessId: string;
  callerUserId: string;
};

/**
 * Atomically allocates the next receipt serial for a business.
 * Uses explicit caller id — app auth is custom (phone/password on `users`), not Supabase Auth JWT,
 * so `auth.uid()` is never set for PostgREST.
 */
export async function allocateNextLocalKabalaReceiptSerial(
  params: AllocateKabalaSerialParams,
): Promise<{ ok: true; serial: number } | { ok: false; messageHe: string }> {
  const businessId = params.businessId.trim();
  const callerUserId = params.callerUserId.trim();
  if (!businessId || !callerUserId) {
    return { ok: false, messageHe: 'חסר מזהה עסק או משתמש. התחברו מחדש לאפליקציה.' };
  }

  const { data, error } = await supabase.rpc('next_local_kabala_receipt_serial', {
    p_business_id: businessId,
    p_caller_user_id: callerUserId,
  });

  if (error) {
    const msg = `${String(error.message ?? '')} ${String((error as { details?: string }).details ?? '')} ${String((error as { hint?: string }).hint ?? '')}`;
    if (__DEV__) {
      console.warn('[localKabalaReceiptSerial] rpc error', error.code, error.message, (error as { details?: string }).details);
    }
    if (msg.includes('next_local_kabala_forbidden')) {
      return { ok: false, messageHe: 'אין הרשאה להפיק קבלה (נדרש משתמש admin לעסק זה).' };
    }
    if (msg.includes('next_local_kabala_missing_args')) {
      return { ok: false, messageHe: 'חסרים פרמטרים לשרת. נסו להתחבר מחדש.' };
    }
    if (msg.includes('next_local_kabala_business_not_found')) {
      return {
        ok: false,
        messageHe: 'לא נמצא business_profile למספר העסק. ודאו ש־business_id תקין.',
      };
    }
    if (/function public\.next_local_kabala_receipt_serial/i.test(msg) || /does not exist/i.test(msg)) {
      return {
        ok: false,
        messageHe:
          'חסרה בבסיס הנתונים גרסה מעודכנת של הפונקציה לקבלת מספר קבלה.\n\n' +
          'הריצו את המיגרציה:\n' +
          '20260415103000_next_local_kabala_receipt_serial_explicit_caller.sql\n\n' +
          'או: supabase db push',
      };
    }
    return {
      ok: false,
      messageHe: `לא ניתן היה לקבל מספר קבלה מהשרת: ${String(error.message ?? 'שגיאה לא ידועה')}`,
    };
  }

  const n = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(n) || n < 1) {
    if (__DEV__) {
      console.warn('[localKabalaReceiptSerial] unexpected rpc data', data);
    }
    return { ok: false, messageHe: 'תשובה לא תקינה מהשרת בעת הקצאת מספר קבלה.' };
  }
  return { ok: true, serial: Math.floor(n) };
}
