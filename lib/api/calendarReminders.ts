import { supabase, getBusinessId, type CalendarReminder } from '@/lib/supabase';

export type { CalendarReminder };

export const CALENDAR_REMINDER_COLOR_KEYS = ['blue', 'coral', 'yellow', 'green', 'purple', 'gray'] as const;
export type CalendarReminderColorKey = (typeof CALENDAR_REMINDER_COLOR_KEYS)[number];

function isMissingTableError(err: { message?: string; code?: string } | null): boolean {
  const msg = String(err?.message || '');
  return msg.includes('calendar_reminders') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

export async function listCalendarRemindersForDate(dateStr: string, barberId: string): Promise<CalendarReminder[]> {
  const businessId = getBusinessId();
  const { data, error } = await supabase
    .from('calendar_reminders')
    .select('*')
    .eq('business_id', businessId)
    .eq('barber_id', barberId)
    .eq('event_date', dateStr)
    .order('start_time', { ascending: true });

  if (error) {
    if (!isMissingTableError(error)) console.warn('[calendarReminders] listForDate:', error.message);
    return [];
  }
  return (data as CalendarReminder[]) || [];
}

export async function listCalendarRemindersForRange(
  startDateStr: string,
  endDateStr: string,
  barberId: string
): Promise<CalendarReminder[]> {
  const businessId = getBusinessId();
  const { data, error } = await supabase
    .from('calendar_reminders')
    .select('*')
    .eq('business_id', businessId)
    .eq('barber_id', barberId)
    .gte('event_date', startDateStr)
    .lte('event_date', endDateStr)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    if (!isMissingTableError(error)) console.warn('[calendarReminders] listForRange:', error.message);
    return [];
  }
  return (data as CalendarReminder[]) || [];
}

export async function createCalendarReminder(input: {
  barberId: string;
  eventDate: string;
  startTime: string;
  durationMinutes: number;
  title: string;
  notes?: string | null;
  colorKey?: CalendarReminderColorKey | null;
}): Promise<CalendarReminder | null> {
  const businessId = getBusinessId();
  const row = {
    business_id: businessId,
    barber_id: input.barberId,
    event_date: input.eventDate,
    start_time: input.startTime,
    duration_minutes: input.durationMinutes,
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    color_key: input.colorKey || 'blue',
  };
  const { data, error } = await supabase.from('calendar_reminders').insert(row).select('*').single();
  if (error) {
    console.error('[calendarReminders] create:', error.message);
    return null;
  }
  return data as CalendarReminder;
}

export async function updateCalendarReminder(
  id: string,
  patch: Partial<{
    event_date: string;
    start_time: string;
    duration_minutes: number;
    title: string;
    notes: string | null;
    color_key: string | null;
  }>
): Promise<boolean> {
  const businessId = getBusinessId();
  const { error } = await supabase.from('calendar_reminders').update(patch).eq('id', id).eq('business_id', businessId);
  if (error) {
    console.error('[calendarReminders] update:', error.message);
    return false;
  }
  return true;
}

export async function deleteCalendarReminder(id: string): Promise<boolean> {
  const businessId = getBusinessId();
  const { error } = await supabase.from('calendar_reminders').delete().eq('id', id).eq('business_id', businessId);
  if (error) {
    console.error('[calendarReminders] delete:', error.message);
    return false;
  }
  return true;
}

export async function listCalendarReminderDatesInMonth(
  year: number,
  monthIndex0: number,
  barberId: string
): Promise<Set<string>> {
  const businessId = getBusinessId();
  const first = new Date(year, monthIndex0, 1);
  const next = new Date(year, monthIndex0 + 1, 1);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };
  const start = fmt(first);
  const end = new Date(next);
  end.setDate(end.getDate() - 1);
  const endStr = fmt(end);

  const { data, error } = await supabase
    .from('calendar_reminders')
    .select('event_date')
    .eq('business_id', businessId)
    .eq('barber_id', barberId)
    .gte('event_date', start)
    .lte('event_date', endStr);

  if (error) {
    if (!isMissingTableError(error)) console.warn('[calendarReminders] listDatesInMonth:', error.message);
    return new Set();
  }
  return new Set((data as { event_date: string }[] | null)?.map((r) => r.event_date) || []);
}
