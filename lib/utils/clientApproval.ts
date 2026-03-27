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
