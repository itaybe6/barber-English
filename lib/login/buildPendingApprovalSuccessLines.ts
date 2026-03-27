import type { TFunction } from 'i18next';
import type { SuccessLine } from '@/components/book-appointment/BookingSuccessAnimatedOverlay';

export type PendingApprovalAnimatedVariant = 'register' | 'login';

export function buildPendingApprovalSuccessLines(
  t: TFunction,
  variant: PendingApprovalAnimatedVariant,
  phone: string,
): SuccessLine[] {
  const headline =
    variant === 'register'
      ? String(t('register.pendingApprovalTitle', 'נרשמת בהצלחה'))
      : String(t('login.pendingApprovalTitle', 'ממתין לאישור'));
  const bodyKey =
    variant === 'register' ? 'register.success.pendingApproval' : 'login.awaitingAdminToEnterApp';
  const body = String(t(bodyKey, { phone }));
  const paras = body
    .split(/\n\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const detail: SuccessLine[] = paras.map((p, idx) => ({
    variant: idx === paras.length - 1 ? 'accent' : 'body',
    text: p,
  }));
  return [{ variant: 'headline', text: headline }, ...detail];
}
