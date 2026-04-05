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

/** Completed appointment row for issuing a Green Invoice receipt (admin finance). */
export interface CompletedAppointmentReceiptRow {
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
      const businessId = getBusinessId();
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      const { data: appointments, error: apptErr } = await supabase
        .from('appointments')
        .select('id, service_name, service_id, slot_date, status')
        .eq('business_id', businessId)
        .eq('is_available', false)
        .in('status', ['confirmed', 'completed'])
        .gte('slot_date', startDate)
        .lt('slot_date', endDate);

      if (apptErr) {
        console.error('Error fetching appointments for income:', apptErr);
        return { total: 0, breakdown: [] };
      }

      if (!appointments || appointments.length === 0) {
        return { total: 0, breakdown: [] };
      }

      const { data: services, error: svcErr } = await supabase
        .from('services')
        .select('id, name, price')
        .eq('business_id', businessId);

      if (svcErr) {
        console.error('Error fetching services for income:', svcErr);
        return { total: 0, breakdown: [] };
      }

      const serviceMap = new Map<string, { name: string; price: number }>();
      const serviceNameMap = new Map<string, { id: string; price: number }>();
      for (const svc of (services || [])) {
        serviceMap.set(svc.id, { name: svc.name, price: svc.price });
        serviceNameMap.set(svc.name.toLowerCase(), { id: svc.id, price: svc.price });
      }

      const breakdownMap = new Map<string, ServiceIncomeBreakdown>();

      for (const appt of appointments) {
        let price = 0;
        let serviceName = appt.service_name || 'Unknown';
        let serviceId = appt.service_id || null;

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
   * Booked appointments in a month eligible for receipts — same statuses as monthly income (confirmed | completed).
   */
  async listCompletedAppointmentsForReceipts(
    year: number,
    month: number,
  ): Promise<CompletedAppointmentReceiptRow[]> {
    try {
      const businessId = getBusinessId();
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate =
        month === 12
          ? `${year + 1}-01-01`
          : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      /** Same eligibility as getMonthlyIncome: booked slots counted as income (confirmed | completed). */
      const { data: appointments, error: apptErr } = await supabase
        .from('appointments')
        .select(
          'id, service_name, service_id, slot_date, slot_time, client_name, user_id, status',
        )
        .eq('business_id', businessId)
        .eq('is_available', false)
        .in('status', ['confirmed', 'completed'])
        .gte('slot_date', startDate)
        .lt('slot_date', endDate)
        .order('slot_date', { ascending: false })
        .order('slot_time', { ascending: false });

      if (apptErr || !appointments?.length) {
        if (apptErr) {
          console.error('listCompletedAppointmentsForReceipts:', apptErr);
        }
        return [];
      }

      const { data: services, error: svcErr } = await supabase
        .from('services')
        .select('id, name, price')
        .eq('business_id', businessId);

      if (svcErr) {
        console.error('listCompletedAppointmentsForReceipts services:', svcErr);
        return [];
      }

      const serviceMap = new Map<string, { name: string; price: number }>();
      const serviceNameMap = new Map<string, { id: string; price: number }>();
      for (const svc of services || []) {
        serviceMap.set(svc.id, { name: svc.name, price: svc.price });
        serviceNameMap.set(svc.name.toLowerCase(), { id: svc.id, price: svc.price });
      }

      const userIds = [
        ...new Set(
          appointments
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

      const rows: CompletedAppointmentReceiptRow[] = [];

      for (const appt of appointments) {
        let price = 0;
        let serviceName = appt.service_name || 'Unknown';
        const serviceId = appt.service_id || null;

        if (serviceId && serviceMap.has(serviceId)) {
          const svc = serviceMap.get(serviceId)!;
          price = svc.price;
          serviceName = svc.name;
        } else if (serviceName) {
          const match = serviceNameMap.get(serviceName.toLowerCase());
          if (match) {
            price = match.price;
          }
        }

        if (price <= 0) continue;

        const cn = (appt.client_name ?? '').trim();
        const fromUser = appt.user_id ? nameByUserId.get(appt.user_id) : undefined;
        const clientLabel = (cn || fromUser?.trim() || '').trim();

        rows.push({
          id: appt.id,
          slot_date: appt.slot_date,
          slot_time: appt.slot_time,
          service_name: serviceName,
          client_label: clientLabel,
          price,
        });
      }

      return rows;
    } catch (e) {
      console.error('listCompletedAppointmentsForReceipts:', e);
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
