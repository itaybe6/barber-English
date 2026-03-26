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

/** Monday-first weeks (same layout as Make It Animated Juventus calendar). */
export function getMonthWeeks(monthObj: MonthEntry): (Date | null)[][] {
  const year = monthObj.date.getFullYear();
  const month = monthObj.date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDayIdx = firstDay.getDay();
  startDayIdx = startDayIdx === 0 ? 6 : startDayIdx - 1;
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

/** Short weekday labels Mon → Sun for header row. */
export function getShortWeekdayNames(locale: string): string[] {
  const loc = locale === 'he' ? 'he-IL' : 'en-US';
  // 2024-01-01 is a Monday
  const base = new Date(2024, 0, 1);
  const names: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(base);
    x.setDate(base.getDate() + i);
    names.push(x.toLocaleString(loc, { weekday: 'short' }));
  }
  return names;
}
