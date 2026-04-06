import type { TimePeriod } from '@/components/TimePeriodSelector';

/** End of each waitlist window in minutes from local midnight — matches `time_period.range.*` copy. */
const END_MORNING = 12 * 60;
const END_AFTERNOON = 16 * 60;
const END_EVENING = 20 * 60;

const ALL_PERIODS: TimePeriod[] = ['morning', 'afternoon', 'evening', 'any'];

function parseLocalYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo, d);
}

function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * For a waitlist date (YYYY-MM-DD, local), returns time periods that still make sense.
 * On a future day — all periods. On today — drops windows whose end time has passed.
 */
export function getSelectableTimePeriodsForDate(ymd: string, now: Date = new Date()): TimePeriod[] {
  const day = parseLocalYmd(ymd);
  if (!day) return [...ALL_PERIODS];

  if (!isSameLocalCalendarDay(day, now)) {
    return [...ALL_PERIODS];
  }

  const mins = now.getHours() * 60 + now.getMinutes();
  const out: TimePeriod[] = [];

  if (mins < END_MORNING) out.push('morning');
  if (mins < END_AFTERNOON) out.push('afternoon');
  if (mins < END_EVENING) out.push('evening');
  /** "Any" only while some same-day availability window can still apply (before end of evening band). */
  if (mins < END_EVENING) out.push('any');

  return out;
}
