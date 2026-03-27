import type { User } from '@/constants/auth';

function clientRole(user: unknown): string | undefined {
  const u = user as User | null | undefined;
  const r = u?.type ?? (u as { user_type?: string })?.user_type;
  return typeof r === 'string' ? r.trim().toLowerCase() : undefined;
}

export function isClientUser(user: unknown): boolean {
  return clientRole(user) === 'client';
}

/** Client explicitly marked not approved (waiting for admin). Undefined/true = can book. */
export function isClientAwaitingApproval(user: unknown): boolean {
  if (!isClientUser(user)) return false;
  return (user as { client_approved?: boolean }).client_approved === false;
}

/**
 * Block app session when the business requires client approval and this client row is not approved yet.
 * Admins / other roles are never blocked here.
 */
export function shouldDenyClientSession(
  businessRequiresClientApproval: boolean,
  user: { user_type?: string; type?: string; client_approved?: boolean },
): boolean {
  if (!businessRequiresClientApproval) return false;
  const role = String((user as { type?: string }).type ?? user.user_type ?? '').trim().toLowerCase();
  if (role !== 'client') return false;
  return user.client_approved === false;
}
