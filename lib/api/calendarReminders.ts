import { supabase, getBusinessId, type CalendarReminder } from '@/lib/supabase';

const TABLE = 'calendar_reminders';

export const CALENDAR_REMINDER_COLOR_KEYS = [
  'blue',
  'coral',
  'yellow',
  'green',
  'purple',
  'gray',
] as const;

export type CalendarReminderColorKey = (typeof CALENDAR_REMINDER_COLOR_KEYS)[number];

function normalizeRow(raw: Record<string, unknown>): CalendarReminder {
  const start = String(raw.start_time ?? '').slice(0, 5);
  return {
    id: String(raw.id),
    business_id: String(raw.business_id),
    user_id: String(raw.user_id ?? raw.barber_id ?? ''),
    event_date: String(raw.event_date ?? ''),
    start_time: start || String(raw.start_time ?? ''),
    duration_minutes: Number(raw.duration_minutes ?? 30),
    title: String(raw.title ?? ''),
    notes: (raw.notes as string | null) ?? null,
    color_key: (raw.color_key as string | null) ?? 'blue',
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
  };
}

export async function listCalendarRemindersForDate(
  dateString: string,
  barberId: string
): Promise<CalendarReminder[]> {
  const businessId = getBusinessId();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('business_id', businessId)
    .eq('user_id', barberId)
    .eq('event_date', dateString)
    .order('start_time', { ascending: true });

  if (error) {
    console.warn('[calendarReminders] listCalendarRemindersForDate:', error.message);
    return [];
  }
  return ((data || []) as Record<string, unknown>[]).map(normalizeRow);
}

export async function listCalendarRemindersForRange(
  startDateStr: string,
  endDateStr: string,
  barberId: string
): Promise<CalendarReminder[]> {
  const businessId = getBusinessId();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('business_id', businessId)
    .eq('user_id', barberId)
    .gte('event_date', startDateStr)
    .lte('event_date', endDateStr)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.warn('[calendarReminders] listCalendarRemindersForRange:', error.message);
    return [];
  }
  return ((data || []) as Record<string, unknown>[]).map(normalizeRow);
}

export async function listCalendarReminderDatesInMonth(
  year: number,
  month: number,
  barberId: string
): Promise<string[]> {
  const m = String(month + 1).padStart(2, '0');
  const start = `${year}-${m}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;

  const businessId = getBusinessId();
  const { data, error } = await supabase
    .from(TABLE)
    .select('event_date')
    .eq('business_id', businessId)
    .eq('user_id', barberId)
    .gte('event_date', start)
    .lte('event_date', end);

  if (error) {
    console.warn('[calendarReminders] listCalendarReminderDatesInMonth:', error.message);
    return [];
  }

  const out = new Set<string>();
  (data as { event_date?: string }[] | null)?.forEach((r) => {
    if (r.event_date) out.add(r.event_date);
  });
  return [...out];
}

export type CalendarReminderSaveResult =
  | { ok: true; reminder: CalendarReminder }
  | { ok: false; message: string };

function formatSupabaseError(prefix: string, error: { message?: string; code?: string; details?: string }): string {
  const parts = [error.message, error.details].filter(Boolean).join(' — ');
  const msg = parts || 'Unknown error';
  console.warn(`[calendarReminders] ${prefix}:`, msg, error.code ? `(code ${error.code})` : '');
  return msg;
}

export async function createCalendarReminder(input: {
  barberId: string;
  eventDate: string;
  startTime: string;
  durationMinutes: number;
  title: string;
  notes: string | null;
  colorKey: CalendarReminderColorKey;
}): Promise<CalendarReminderSaveResult> {
  const businessId = getBusinessId();
  const time =
    input.startTime.length === 5 ? `${input.startTime}:00` : input.startTime;

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      business_id: businessId,
      user_id: input.barberId,
      event_date: input.eventDate,
      start_time: time,
      duration_minutes: input.durationMinutes,
      title: input.title,
      notes: input.notes,
      color_key: input.colorKey,
    })
    .select('*')
    .single();

  if (error) {
    return { ok: false, message: formatSupabaseError('createCalendarReminder', error) };
  }
  if (!data) {
    return { ok: false, message: 'No row returned after insert' };
  }
  return { ok: true, reminder: normalizeRow(data as Record<string, unknown>) };
}

export async function updateCalendarReminder(
  id: string,
  patch: {
    event_date: string;
    start_time: string;
    duration_minutes: number;
    title: string;
    notes: string | null;
    color_key: CalendarReminderColorKey;
  }
): Promise<CalendarReminderSaveResult> {
  const businessId = getBusinessId();
  const start =
    patch.start_time.length === 5 ? `${patch.start_time}:00` : patch.start_time;
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      event_date: patch.event_date,
      start_time: start,
      duration_minutes: patch.duration_minutes,
      title: patch.title,
      notes: patch.notes,
      color_key: patch.color_key,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', businessId)
    .select('*')
    .maybeSingle();

  if (error) {
    return { ok: false, message: formatSupabaseError('updateCalendarReminder', error) };
  }
  if (!data) {
    return { ok: false, message: 'No matching row updated (wrong id or business?)' };
  }
  return { ok: true, reminder: normalizeRow(data as Record<string, unknown>) };
}

export async function deleteCalendarReminder(id: string): Promise<boolean> {
  const businessId = getBusinessId();
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('business_id', businessId);
  if (error) {
    console.warn('[calendarReminders] deleteCalendarReminder:', error.message);
    return false;
  }
  return true;
}
