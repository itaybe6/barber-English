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
let _hebrewMonthFmt: Intl.DateTimeFormat | null | undefined;
let _hebrewYearFmt: Intl.DateTimeFormat | null | undefined;
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

function _getHebrewMonthFmt(): Intl.DateTimeFormat | null {
  if (_hebrewMonthFmt === undefined) {
    try {
      _hebrewMonthFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' });
    } catch {
      _hebrewMonthFmt = null;
    }
  }
  return _hebrewMonthFmt;
}

function _getHebrewYearFmt(): Intl.DateTimeFormat | null {
  if (_hebrewYearFmt === undefined) {
    try {
      _hebrewYearFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { year: 'numeric' });
    } catch {
      _hebrewYearFmt = null;
    }
  }
  return _hebrewYearFmt;
}

/** Format a Gregorian date as its Hebrew calendar day string — e.g. "י״ב", "כ״ו" */
export function formatHebrewDay(date: Date): string {
  try {
    return _getHebrewDayFmt()?.format(date) ?? '';
  } catch {
    return '';
  }
}

export type HebrewDateParts = {
  day: number;
  month: string;
  year: number;
};

function normalizeHebrewMonthName(month: string): string {
  return String(month ?? '')
    .replace(/\u200f/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHebrewMonth(month: string, ...candidates: string[]): boolean {
  const normalizedMonth = normalizeHebrewMonthName(month);
  return candidates.some((candidate) => normalizeHebrewMonthName(candidate) === normalizedMonth);
}

function getHebrewDateParts(date: Date): HebrewDateParts | null {
  try {
    const day = parseInt(_getHebrewDayFmt()?.format(date) ?? '', 10);
    const year = parseInt(_getHebrewYearFmt()?.format(date) ?? '', 10);
    const month = _getHebrewMonthFmt()?.format(date) ?? '';
    if (!month || Number.isNaN(day) || Number.isNaN(year)) return null;
    return {
      day,
      month: normalizeHebrewMonthName(month),
      year,
    };
  } catch {
    return null;
  }
}

function isHebrewLeapYear(year: number): boolean {
  return ((7 * year + 1) % 19) < 7;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getRunningHolidayDay(
  date: Date,
  startMonth: string,
  startDay: number,
  durationDays: number
): number | null {
  for (let offset = 0; offset < durationDays; offset++) {
    const probe = addDays(date, -offset);
    const parts = getHebrewDateParts(probe);
    if (parts && isHebrewMonth(parts.month, startMonth) && parts.day === startDay) {
      return offset + 1;
    }
  }
  return null;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type HolidayLabel = {
  he: string;
  en: string;
};

const HOLIDAY_LABELS = {
  erevRoshHashanah: { he: 'ערב ראש השנה', en: 'Rosh Hashanah Eve' },
  roshHashanah: { he: 'ראש השנה', en: 'Rosh Hashanah' },
  tzomGedalia: { he: 'צום גדליה', en: 'Fast of Gedalia' },
  erevYomKippur: { he: 'ערב יום כיפור', en: 'Yom Kippur Eve' },
  yomKippur: { he: 'יום כיפור', en: 'Yom Kippur' },
  erevSukkot: { he: 'ערב סוכות', en: 'Sukkot Eve' },
  sukkot: { he: 'סוכות', en: 'Sukkot' },
  cholHamoedSukkot: { he: 'חוה״מ סוכות', en: 'Sukkot (Chol)' },
  hoshanaRabba: { he: 'הושענא רבה', en: 'Hoshana Rabbah' },
  simchatTorah: { he: 'שמחת תורה', en: 'Simchat Torah' },
  erevHanukkah: { he: 'ערב חנוכה', en: 'Hanukkah Eve' },
  hanukkah: { he: 'חנוכה', en: 'Hanukkah' },
  asaraBTevet: { he: 'עשרה בטבת', en: '10 Tevet' },
  tuBishvat: { he: 'ט״ו בשבט', en: 'Tu BiShvat' },
  taanitEsther: { he: 'תענית אסתר', en: 'Fast of Esther' },
  purim: { he: 'פורים', en: 'Purim' },
  shushanPurim: { he: 'שושן פורים', en: 'Shushan Purim' },
  erevPesach: { he: 'ערב פסח', en: 'Passover Eve' },
  pesach: { he: 'פסח', en: 'Passover' },
  cholHamoedPesach: { he: 'חוה״מ פסח', en: 'Passover (Chol)' },
  seventhOfPesach: { he: 'שביעי של פסח', en: '7th of Passover' },
  yomHashoah: { he: 'יום השואה', en: 'Yom HaShoah' },
  yomHazikaron: { he: 'יום הזיכרון', en: 'Yom HaZikaron' },
  yomHaatzmaut: { he: 'יום העצמאות', en: 'Yom HaAtzmaut' },
  pesachSheni: { he: 'פסח שני', en: 'Pesach Sheni' },
  lagBaomer: { he: 'ל״ג בעומר', en: 'Lag BaOmer' },
  yomYerushalayim: { he: 'יום ירושלים', en: 'Jerusalem Day' },
  erevShavuot: { he: 'ערב שבועות', en: 'Shavuot Eve' },
  shavuot: { he: 'שבועות', en: 'Shavuot' },
  shivaAsarBTammuz: { he: 'י״ז בתמוז', en: '17 Tammuz' },
  tishaBAv: { he: 'תשעה באב', en: "Tisha B'Av" },
  tuBAv: { he: 'ט״ו באב', en: "Tu B'Av" },
} satisfies Record<string, HolidayLabel>;

function pickHolidayLabel(label: HolidayLabel, language: string): string {
  return language.startsWith('he') ? label.he : label.en;
}

export function getIsraeliHolidayLabel(date: Date, language: string): string | null {
  const parts = getHebrewDateParts(date);
  if (!parts) return null;

  const { day, month, year } = parts;
  const weekday = date.getDay();
  const purimMonth = isHebrewLeapYear(year) ? 'אדר ב׳' : 'אדר';

  if (isHebrewMonth(month, 'אלול') && day === 29) {
    return pickHolidayLabel(HOLIDAY_LABELS.erevRoshHashanah, language);
  }

  if (isHebrewMonth(month, 'תשרי')) {
    if (day === 1 || day === 2) return pickHolidayLabel(HOLIDAY_LABELS.roshHashanah, language);
    if ((day === 3 && weekday !== 6) || (day === 4 && weekday === 0)) {
      return pickHolidayLabel(HOLIDAY_LABELS.tzomGedalia, language);
    }
    if (day === 9) return pickHolidayLabel(HOLIDAY_LABELS.erevYomKippur, language);
    if (day === 10) return pickHolidayLabel(HOLIDAY_LABELS.yomKippur, language);
    if (day === 14) return pickHolidayLabel(HOLIDAY_LABELS.erevSukkot, language);
    if (day === 15) return pickHolidayLabel(HOLIDAY_LABELS.sukkot, language);
    if (day >= 16 && day <= 20) return pickHolidayLabel(HOLIDAY_LABELS.cholHamoedSukkot, language);
    if (day === 21) return pickHolidayLabel(HOLIDAY_LABELS.hoshanaRabba, language);
    if (day === 22) return pickHolidayLabel(HOLIDAY_LABELS.simchatTorah, language);
  }

  if (isHebrewMonth(month, 'כסלו') && day === 24) {
    return pickHolidayLabel(HOLIDAY_LABELS.erevHanukkah, language);
  }

  if (getRunningHolidayDay(date, 'כסלו', 25, 8) != null) {
    return pickHolidayLabel(HOLIDAY_LABELS.hanukkah, language);
  }

  if (isHebrewMonth(month, 'טבת') && day === 10) {
    return pickHolidayLabel(HOLIDAY_LABELS.asaraBTevet, language);
  }

  if (isHebrewMonth(month, 'שבט') && day === 15) {
    return pickHolidayLabel(HOLIDAY_LABELS.tuBishvat, language);
  }

  if (isHebrewMonth(month, purimMonth)) {
    if ((day === 13 && weekday !== 6) || (day === 11 && weekday === 4)) {
      return pickHolidayLabel(HOLIDAY_LABELS.taanitEsther, language);
    }
    if (day === 14) return pickHolidayLabel(HOLIDAY_LABELS.purim, language);
    if (day === 15) return pickHolidayLabel(HOLIDAY_LABELS.shushanPurim, language);
  }

  if (isHebrewMonth(month, 'ניסן')) {
    if (day === 14) return pickHolidayLabel(HOLIDAY_LABELS.erevPesach, language);
    if (day === 15) return pickHolidayLabel(HOLIDAY_LABELS.pesach, language);
    if (day >= 16 && day <= 20) return pickHolidayLabel(HOLIDAY_LABELS.cholHamoedPesach, language);
    if (day === 21) return pickHolidayLabel(HOLIDAY_LABELS.seventhOfPesach, language);
    if ((day === 27 && weekday !== 0 && weekday !== 5) || (day === 26 && weekday === 4) || (day === 28 && weekday === 1)) {
      return pickHolidayLabel(HOLIDAY_LABELS.yomHashoah, language);
    }
  }

  if (isHebrewMonth(month, 'אייר')) {
    // Modern Israeli observances shift around Shabbat; keep the observed date, not the fixed Hebrew date.
    if (day === 2 && weekday === 3) return pickHolidayLabel(HOLIDAY_LABELS.yomHazikaron, language);
    if (day === 3 && weekday === 4) return pickHolidayLabel(HOLIDAY_LABELS.yomHaatzmaut, language);
    if (day === 3 && weekday === 3) return pickHolidayLabel(HOLIDAY_LABELS.yomHazikaron, language);
    if (day === 4 && weekday === 4) return pickHolidayLabel(HOLIDAY_LABELS.yomHaatzmaut, language);
    if (day === 5 && weekday === 1) return pickHolidayLabel(HOLIDAY_LABELS.yomHazikaron, language);
    if (day === 6 && weekday === 2) return pickHolidayLabel(HOLIDAY_LABELS.yomHaatzmaut, language);
    if (day === 4 && weekday >= 1 && weekday <= 3) return pickHolidayLabel(HOLIDAY_LABELS.yomHazikaron, language);
    if (day === 5 && weekday >= 2 && weekday <= 4) return pickHolidayLabel(HOLIDAY_LABELS.yomHaatzmaut, language);
    if (day === 14) return pickHolidayLabel(HOLIDAY_LABELS.pesachSheni, language);
    if (day === 18) return pickHolidayLabel(HOLIDAY_LABELS.lagBaomer, language);
    if (day === 28) return pickHolidayLabel(HOLIDAY_LABELS.yomYerushalayim, language);
  }

  if (isHebrewMonth(month, 'סיוון', 'סיון')) {
    if (day === 5) return pickHolidayLabel(HOLIDAY_LABELS.erevShavuot, language);
    if (day === 6) return pickHolidayLabel(HOLIDAY_LABELS.shavuot, language);
  }

  if (isHebrewMonth(month, 'תמוז')) {
    if ((day === 17 && weekday !== 6) || (day === 18 && weekday === 0)) {
      return pickHolidayLabel(HOLIDAY_LABELS.shivaAsarBTammuz, language);
    }
  }

  if (isHebrewMonth(month, 'אב')) {
    if ((day === 9 && weekday !== 6) || (day === 10 && weekday === 0)) {
      return pickHolidayLabel(HOLIDAY_LABELS.tishaBAv, language);
    }
    if (day === 15) return pickHolidayLabel(HOLIDAY_LABELS.tuBAv, language);
  }

  return null;
}

export function buildIsraeliHolidayLabelMap(
  rangeStart: Date,
  rangeEnd: Date,
  language: string
): Record<string, string> {
  const map: Record<string, string> = {};
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());

  while (cursor <= end) {
    const label = getIsraeliHolidayLabel(cursor, language);
    if (label) {
      map[toIsoDate(cursor)] = label;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return map;
}
