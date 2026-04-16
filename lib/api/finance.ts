import { supabase, getBusinessId } from '@/lib/supabase';
import type { BusinessExpense } from '@/lib/supabase';
import { expensesApi } from './expenses';

export interface ServiceIncomeBreakdown {
  service_id: string | null;
  service_name: string;
  price: number;
  count: number;
  total: number;
}

/** Completed booked appointment with resolved price (admin finance / analytics). */
export interface CompletedAppointmentIncomeRow {
  id: string;
  slot_date: string;
  slot_time: string;
  service_name: string;
  client_label: string;
  price: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  incomeBreakdown: ServiceIncomeBreakdown[];
  expenses: BusinessExpense[];
  expensesByCategory: Record<string, number>;
}

/** Sunday–Saturday weeks overlapping the calendar month (Asia/Jerusalem-style week start). */
export interface WeekIncomeSlice {
  /** Inclusive YYYY-MM-DD */
  rangeStart: string;
  /** Inclusive YYYY-MM-DD */
  rangeEnd: string;
  /** Short Hebrew label, e.g. "6–12 באפריל" */
  label: string;
  total: number;
  appointmentCount: number;
}

const MONTH_NAMES_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, day || 1);
}

/** Start of Sunday-based week containing `d` (local calendar). */
function startOfSundayWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  return x;
}

function buildWeekRangesInMonth(year: number, month: number): { start: Date; end: Date }[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  let wStart = startOfSundayWeek(first);
  const ranges: { start: Date; end: Date }[] = [];
  while (wStart <= last) {
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 6);
    const clipStart = wStart < first ? new Date(first) : new Date(wStart);
    const clipEnd = wEnd > last ? new Date(last) : new Date(wEnd);
    if (clipStart <= clipEnd) {
      ranges.push({ start: clipStart, end: clipEnd });
    }
    wStart.setDate(wStart.getDate() + 7);
  }
  return ranges;
}

function weekLabelHe(rangeStart: Date, rangeEnd: Date, monthIndex0: number): string {
  const mon = MONTH_NAMES_HE[monthIndex0] ?? '';
  const a = rangeStart.getDate();
  const b = rangeEnd.getDate();
  if (a === b) return `${a} ב${mon}`;
  return `${a}–${b} ב${mon}`;
}

interface InternalApptRow {
  id: string;
  slot_date: string;
  slot_time: string;
  service_name: string;
  service_id: string | null;
  client_name?: string | null;
  user_id?: string | null;
  status: string;
  price: number;
}

async function fetchMonthBookedRowsWithPrices(
  year: number,
  month: number,
): Promise<InternalApptRow[]> {
  const businessId = getBusinessId();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const { data: appointments, error: apptErr } = await supabase
    .from('appointments')
    .select(
      'id, service_name, service_id, slot_date, slot_time, client_name, user_id, status',
    )
    .eq('business_id', businessId)
    .eq('is_available', false)
    .in('status', ['confirmed', 'completed'])
    .gte('slot_date', startDate)
    .lt('slot_date', endDate);

  if (apptErr || !appointments?.length) {
    if (apptErr) {
      console.error('fetchMonthBookedRowsWithPrices appointments:', apptErr);
    }
    return [];
  }

  const { data: services, error: svcErr } = await supabase
    .from('services')
    .select('id, name, price')
    .eq('business_id', businessId);

  if (svcErr) {
    console.error('fetchMonthBookedRowsWithPrices services:', svcErr);
    return [];
  }

  const serviceMap = new Map<string, { name: string; price: number }>();
  const serviceNameMap = new Map<string, { id: string; price: number }>();
  for (const svc of services || []) {
    serviceMap.set(svc.id, { name: svc.name, price: svc.price });
    serviceNameMap.set(svc.name.toLowerCase(), { id: svc.id, price: svc.price });
  }

  const rows: InternalApptRow[] = [];
  for (const appt of appointments) {
    let price = 0;
    let serviceName = appt.service_name || 'Unknown';
    let serviceId = (appt.service_id as string | null) || null;

    if (serviceId && serviceMap.has(serviceId)) {
      const svc = serviceMap.get(serviceId)!;
      price = svc.price;
      serviceName = svc.name;
    } else if (serviceName) {
      const match = serviceNameMap.get(serviceName.toLowerCase());
      if (match) {
        price = match.price;
        serviceId = match.id;
      }
    }

    rows.push({
      id: appt.id,
      slot_date: appt.slot_date,
      slot_time: appt.slot_time,
      service_name: serviceName,
      service_id: serviceId,
      client_name: appt.client_name,
      user_id: appt.user_id,
      status: appt.status,
      price,
    });
  }
  return rows;
}

export const financeApi = {
  /**
   * Calculates monthly income by joining appointments with services.
   * Only counts booked appointments (is_available = false) with status confirmed/completed.
   */
  async getMonthlyIncome(year: number, month: number): Promise<{
    total: number;
    breakdown: ServiceIncomeBreakdown[];
  }> {
    try {
      const rows = await fetchMonthBookedRowsWithPrices(year, month);
      if (rows.length === 0) {
        return { total: 0, breakdown: [] };
      }

      const breakdownMap = new Map<string, ServiceIncomeBreakdown>();

      for (const appt of rows) {
        const price = appt.price;
        const serviceName = appt.service_name;
        const serviceId = appt.service_id;
        const key = serviceId || serviceName;
        const existing = breakdownMap.get(key);
        if (existing) {
          existing.count += 1;
          existing.total += price;
        } else {
          breakdownMap.set(key, {
            service_id: serviceId,
            service_name: serviceName,
            price,
            count: 1,
            total: price,
          });
        }
      }

      const breakdown = Array.from(breakdownMap.values()).sort((a, b) => b.total - a.total);
      const total = breakdown.reduce((sum, item) => sum + item.total, 0);

      return { total, breakdown };
    } catch (err) {
      console.error('Error in getMonthlyIncome:', err);
      return { total: 0, breakdown: [] };
    }
  },

  /**
   * Income from completed/confirmed bookings grouped by Sunday-based week overlapping the month.
   */
  async getWeeklyIncomeSlices(year: number, month: number): Promise<WeekIncomeSlice[]> {
    try {
      const rows = await fetchMonthBookedRowsWithPrices(year, month);
      const ranges = buildWeekRangesInMonth(year, month);
      if (ranges.length === 0) return [];

      const slices: WeekIncomeSlice[] = ranges.map(({ start, end }) => ({
        rangeStart: ymdFromLocalDate(start),
        rangeEnd: ymdFromLocalDate(end),
        label: weekLabelHe(start, end, month - 1),
        total: 0,
        appointmentCount: 0,
      }));

      for (const appt of rows) {
        const d = parseYmdLocal(appt.slot_date);
        for (let i = 0; i < ranges.length; i++) {
          const { start, end } = ranges[i];
          if (d >= start && d <= end) {
            slices[i].total += appt.price;
            slices[i].appointmentCount += 1;
            break;
          }
        }
      }

      return slices;
    } catch (e) {
      console.error('getWeeklyIncomeSlices:', e);
      return [];
    }
  },

  /**
   * Booked appointments in a month (confirmed | completed) with resolved service price.
   */
  async listCompletedAppointmentsForMonth(
    year: number,
    month: number,
  ): Promise<CompletedAppointmentIncomeRow[]> {
    try {
      const businessId = getBusinessId();
      const rows = await fetchMonthBookedRowsWithPrices(year, month);

      const userIds = [
        ...new Set(
          rows
            .map((a) => a.user_id)
            .filter((id): id is string => !!id && String(id).trim().length > 0),
        ),
      ];

      const nameByUserId = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .eq('business_id', businessId)
          .in('id', userIds);
        for (const u of users || []) {
          nameByUserId.set(u.id, u.name);
        }
      }

      const out: CompletedAppointmentIncomeRow[] = [];
      for (const appt of rows) {
        if (appt.price <= 0) continue;
        const cn = (appt.client_name ?? '').trim();
        const fromUser = appt.user_id ? nameByUserId.get(appt.user_id) : undefined;
        const clientLabel = (cn || fromUser?.trim() || '').trim();
        out.push({
          id: appt.id,
          slot_date: appt.slot_date,
          slot_time: appt.slot_time,
          service_name: appt.service_name,
          client_label: clientLabel,
          price: appt.price,
        });
      }

      out.sort((a, b) => {
        if (a.slot_date !== b.slot_date) return a.slot_date < b.slot_date ? 1 : -1;
        return a.slot_time < b.slot_time ? 1 : -1;
      });

      return out;
    } catch (e) {
      console.error('listCompletedAppointmentsForMonth:', e);
      return [];
    }
  },

  async getMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
    const [income, expenses] = await Promise.all([
      this.getMonthlyIncome(year, month),
      expensesApi.getExpensesByMonth(year, month),
    ]);

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const expensesByCategory: Record<string, number> = {};
    for (const expense of expenses) {
      const cat = expense.category || 'other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(expense.amount);
    }

    return {
      year,
      month,
      totalIncome: income.total,
      totalExpenses,
      netProfit: income.total - totalExpenses,
      incomeBreakdown: income.breakdown,
      expenses,
      expensesByCategory,
    };
  },
};
