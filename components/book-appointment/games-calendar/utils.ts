export type MonthEntry = { label: string; date: Date };

/** How many month steps after the current month to include (12 → 13 pages: current … +12). */
export const CALENDAR_FORWARD_MONTH_STEPS = 12;

/**
 * Pager months: first day of current month through the same calendar month `monthsAhead` steps later.
 * Independent of booking window — days outside the bookable range stay disabled in the grid.
 */
export function buildForwardMonthsFromNow(monthsAhead: number, locale: string): MonthEntry[] {
  const loc = locale === 'he' ? 'he-IL' : 'en-US';
  const now = new Date();
  const months: MonthEntry[] = [];
  for (let i = 0; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = d.toLocaleString(loc, {
      month: 'long',
      year: 'numeric',
    });
    months.push({ label, date: new Date(d.getFullYear(), d.getMonth(), 1) });
  }
  return months;
}

/** Past + future months around today (inclusive). E.g. 12,12 → 25 months. */
export function buildMonthRange(monthsBack: number, monthsForward: number, locale: string): MonthEntry[] {
  const loc = locale === 'he' ? 'he-IL' : 'en-US';
  const now = new Date();
  const months: MonthEntry[] = [];
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const total = monthsBack + monthsForward + 1;
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const label = d.toLocaleString(loc, {
      month: 'long',
      year: 'numeric',
    });
    months.push({ label, date: new Date(d.getFullYear(), d.getMonth(), 1) });
  }
  return months;
}

/**
 * Sunday-first weeks: each row is [Sun, Mon, …, Sat] (chronological).
 * `Days` reverses each row and uses `direction: 'ltr'` on the row so columns are
 * ש…א left→right even when the app is RTL (avoids double mirroring).
 */
export function getMonthWeeks(monthObj: MonthEntry): (Date | null)[][] {
  const year = monthObj.date.getFullYear();
  const month = monthObj.date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayIdx = firstDay.getDay(); // 0 = Sunday … 6 = Saturday
  const daysInMonth = lastDay.getDate();
  const dates: Date[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    dates.push(new Date(year, month, i));
  }
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(startDayIdx).fill(null);
  dates.forEach((date) => {
    week.push(date);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  });
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/**
 * Short weekday labels for one header row, left → right = Saturday … Sunday
 * (matches reversed grid: ש ו ה ד ג ב א in Hebrew).
 */
export function getShortWeekdayNames(locale: string): string[] {
  const loc = locale === 'he' ? 'he-IL' : 'en-US';
  const saturday = new Date(2024, 0, 6); // 2024-01-06 is Saturday
  const names: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(saturday);
    x.setDate(saturday.getDate() - i);
    names.push(x.toLocaleString(loc, { weekday: 'short' }));
  }
  return names;
}

/**
 * Hebrew weekday letters left → right = ש׳ (שבת) … א׳ (ראשון)
 * so reading the row right-to-left gives א ב ג ד ה ו ש.
 */
export function getSingleLetterHebrewWeekdays(): string[] {
  return ['ש', 'ו', 'ה', 'ד', 'ג', 'ב', 'א'];
}

// Memoized Hebrew-calendar day formatter (lazy-init, null if unsupported)
let _hebrewDayFmt: Intl.DateTimeFormat | null | undefined;
function _getHebrewDayFmt(): Intl.DateTimeFormat | null {
  if (_hebrewDayFmt === undefined) {
    try {
      _hebrewDayFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric' });
    } catch {
      _hebrewDayFmt = null;
    }
  }
  return _hebrewDayFmt;
}

/** Format a Gregorian date as its Hebrew calendar day string — e.g. "י״ב", "כ״ו" */
export function formatHebrewDay(date: Date): string {
  try {
    return _getHebrewDayFmt()?.format(date) ?? '';
  } catch {
    return '';
  }
}
