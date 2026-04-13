/**
 * `YYYY-MM-DD` from the device local calendar.
 * Prefer this over `date.toISOString().split('T')[0]` — ISO is UTC and can shift the calendar day.
 */
export function formatDateToYMDLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
