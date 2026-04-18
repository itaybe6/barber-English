/**
 * Parses admin notification bodies into structured fields for display.
 * Supports Hebrew templates (waitlist, booking, cancel) and English templates.
 */
import { formatTimeFromDate } from '@/lib/utils/timeFormat';

export interface ParsedNotificationFields {
  primary: string;
  name?: string;
  phone?: string;
  service?: string;
  datePretty?: string;
  timePretty?: string;
  /** Waitlist preferred time window(s) */
  periodLabel?: string;
}

export function localeForDates(lang: string): string {
  const l = (lang || 'en').toLowerCase();
  if (l.startsWith('he')) return 'he-IL';
  if (l.startsWith('ar')) return 'ar';
  if (l.startsWith('ru')) return 'ru-RU';
  return 'en-US';
}

function formatIsoDatePretty(isoYmd: string, lang: string): string {
  const parts = isoYmd.split('-');
  if (parts.length !== 3) return isoYmd;
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return isoYmd;
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return isoYmd;
  return dt.toLocaleDateString(localeForDates(lang), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function timeFromHhMm(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const fake = new Date();
  fake.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return formatTimeFromDate(fake);
}

/** Hebrew waitlist admin body */
function tryParseHebrewWaitlist(text: string): ParsedNotificationFields | null {
  const m = text.trim().match(
    /^([\s\S]+?)\s*\((0\d{8,10})\)\s*נוסף\/ה לרשימת ההמתנה לשירות "([^"]+)"\s*·\s*תאריך\s+([\s\S]+?)\s*·\s*חלון מועדף:\s*([\s\S]+?)\.?\s*$/u
  );
  if (!m) return null;
  return {
    primary: '',
    name: m[1].trim(),
    phone: m[2],
    service: m[3],
    datePretty: m[4].trim(),
    periodLabel: m[5].trim(),
  };
}

/** English waitlist admin body */
function tryParseEnglishWaitlist(text: string): ParsedNotificationFields | null {
  const m = text.trim().match(
    /^([\s\S]+?)\s*\((0\d{8,10})\)\s*joined the waitlist for "([^"]+)" on (.+?) · preferred window:\s*(.+)\.?\s*$/i
  );
  if (!m) return null;
  return {
    primary: '',
    name: m[1].trim(),
    phone: m[2],
    service: m[3],
    datePretty: m[4].trim(),
    periodLabel: m[5].trim(),
  };
}

/** Hebrew new appointment (book-appointment.tsx / select-time Hebrew admin template) */
function tryParseHebrewNewAppointment(text: string, lang: string): ParsedNotificationFields | null {
  const trimmed = text.trim();
  const patterns = [
    /^([\s\S]+?)\s*\((0\d{8,10})\)\s*קבע\/ה תור ל־"([^"]+)"\s*בתאריך\s+(\d{4}-\d{2}-\d{2})\s*בשעה\s+(\d{2}:\d{2})(?::\d{2})?/u,
    /^([\s\S]+?)\s*\((0\d{8,10})\)\s*קבע\/ה תור ל"([^"]+)"\s*בתאריך\s+(\d{4}-\d{2}-\d{2})\s*בשעה\s+(\d{2}:\d{2})(?::\d{2})?/u,
  ];
  let m: RegExpMatchArray | null = null;
  for (const re of patterns) {
    m = trimmed.match(re);
    if (m) break;
  }
  if (!m) return null;
  return {
    primary: '',
    name: m[1].trim(),
    phone: m[2],
    service: m[3],
    datePretty: formatIsoDatePretty(m[4], lang),
    timePretty: timeFromHhMm(m[5]),
  };
}

/** Hebrew cancellation */
function tryParseHebrewCancel(text: string, lang: string): ParsedNotificationFields | null {
  const trimmed = text.trim();
  const patterns = [
    /^([\s\S]+?)\s*\((0\d{8,10})\)\s*ביטל\/ה תור ל־"([^"]+)"\s*בתאריך\s+(\d{4}-\d{2}-\d{2})\s*בשעה\s+(\d{2}:\d{2})(?::\d{2})?/u,
    /^([\s\S]+?)\s*\((0\d{8,10})\)\s*ביטל\/ה תור ל"([^"]+)"\s*בתאריך\s+(\d{4}-\d{2}-\d{2})\s*בשעה\s+(\d{2}:\d{2})(?::\d{2})?/u,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) {
      return {
        primary: '',
        name: m[1].trim(),
        phone: m[2],
        service: m[3],
        datePretty: formatIsoDatePretty(m[4], lang),
        timePretty: timeFromHhMm(m[5]),
      };
    }
  }
  return null;
}

/** English time after "at " — 24h HH:MM or 12h with AM/PM (client locale) */
const EN_BOOKING_TIME =
  '(\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*[AP]\\.?M\\.?)?)';

/** English booking (select-time admin template) */
function tryParseEnglishBooked(text: string, lang: string): ParsedNotificationFields | null {
  const re = new RegExp(
    `^([\\s\\S]+?)\\s*\\((0\\d{8,10})\\)\\s*booked an appointment for "([^"]+)" on (\\d{4}-\\d{2}-\\d{2}) at ${EN_BOOKING_TIME}`,
    'i',
  );
  const m = text.trim().match(re);
  if (!m) return null;
  return {
    primary: '',
    name: m[1].trim(),
    phone: m[2],
    service: m[3],
    datePretty: formatIsoDatePretty(m[4], lang),
    timePretty: timeFromHhMm(stripAmPmFromTimeToken(m[5])),
  };
}

/** English cancellation */
function tryParseEnglishCancel(text: string, lang: string): ParsedNotificationFields | null {
  const re = new RegExp(
    `^([\\s\\S]+?)\\s*\\((0\\d{8,10})\\)\\s*canceled an appointment for "([^"]+)" on (\\d{4}-\\d{2}-\\d{2}) at ${EN_BOOKING_TIME}`,
    'i',
  );
  const m = text.trim().match(re);
  if (!m) return null;
  return {
    primary: '',
    name: m[1].trim(),
    phone: m[2],
    service: m[3],
    datePretty: formatIsoDatePretty(m[4], lang),
    timePretty: timeFromHhMm(stripAmPmFromTimeToken(m[5])),
  };
}

function stripAmPmFromTimeToken(s: string): string {
  return String(s || '')
    .replace(/\s*(?:AM|PM)\b\.?/gi, '')
    .trim();
}

/** Admin appointment reminder: "Reminder: Name · Service · date time" (edge function legacy) */
function tryParseEnglishAdminReminderBullet(text: string): ParsedNotificationFields | null {
  const m = text
    .trim()
    .match(/^Reminder:\s*(.+?)\s*·\s*(.+?)\s*·\s*(.+)$/is);
  if (!m) return null;
  return {
    primary: '',
    name: m[1].trim(),
    service: m[2].trim(),
    datePretty: m[3].trim(),
  };
}

/** Hebrew admin reminder from appointment-reminders */
function tryParseHebrewAdminReminderBullet(text: string): ParsedNotificationFields | null {
  const m = text
    .trim()
    .match(/^תזכורת:\s*(.+?)\s*·\s*(.+?)\s*·\s*(.+)$/u);
  if (!m) return null;
  return {
    primary: '',
    name: m[1].trim(),
    service: m[2].trim(),
    datePretty: m[3].trim(),
  };
}

function genericParseNotificationContent(title: string, content: string, lang: string): ParsedNotificationFields {
  try {
    let text = content || '';
    if (title) {
      const safeTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(safeTitle, 'g'), '').trim();
    }

    let name: string | undefined;
    let phone: string | undefined;
    const namePhoneMatch = text.match(/^([\s\S]+?)\s*\((0\d{8,10})\)/u);
    if (namePhoneMatch) {
      name = namePhoneMatch[1].trim().replace(/\s+/g, ' ');
      phone = namePhoneMatch[2];
      text = text.replace(namePhoneMatch[0], '').trim();
    } else {
      const phoneMatch = text.match(/\((0\d{8,10})\)/);
      if (phoneMatch) {
        phone = phoneMatch[1];
        text = text.replace(phoneMatch[0], '').trim();
      }
    }

    const serviceMatch = text.match(/"([^"]+)"/);
    const service = serviceMatch ? serviceMatch[1] : undefined;
    if (serviceMatch) text = text.replace(serviceMatch[0], service || '').trim();

    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    const timeMatch = text.match(/(\d{2}:\d{2})(?::\d{2})?/);
    let datePretty: string | undefined;
    let timePretty: string | undefined;
    if (dateMatch) {
      datePretty = formatIsoDatePretty(dateMatch[1], lang);
      text = text.replace(dateMatch[1], '').trim();
    }
    if (timeMatch) {
      timePretty = timeFromHhMm(timeMatch[1]);
      text = text.replace(timeMatch[0], '').trim();
    }

    text = text.replace(/\s{2,}/g, ' ').trim();

    return { primary: text, name, phone, service, datePretty, timePretty };
  } catch {
    return { primary: content || '' };
  }
}

export function parseNotificationContent(title: string, content: string, lang: string): ParsedNotificationFields {
  const raw = (content || '').trim();
  return (
    tryParseHebrewWaitlist(raw) ||
    tryParseEnglishWaitlist(raw) ||
    tryParseHebrewAdminReminderBullet(raw) ||
    tryParseEnglishAdminReminderBullet(raw) ||
    tryParseHebrewNewAppointment(raw, lang) ||
    tryParseHebrewCancel(raw, lang) ||
    tryParseEnglishBooked(raw, lang) ||
    tryParseEnglishCancel(raw, lang) ||
    genericParseNotificationContent(title, content, lang)
  );
}
