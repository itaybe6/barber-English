/** Compact date for waitlist success subhead — explicit “יום ב', 6.4.2026” (comma after weekday, no odd Intl gaps). */
export function formatWaitlistSuccessSubheadDate(dateStr: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = d.toLocaleDateString(locale, { weekday: 'short' }).trim();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${weekday}, ${day}.${month}.${year}`;
}
