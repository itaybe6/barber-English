import { useState, useEffect, useCallback } from 'react';
import { financeApi } from '@/lib/api/finance';
import type { ServiceIncomeBreakdown } from '@/lib/api/finance';
import type { BusinessExpense } from '@/lib/supabase';
import { useAdminFinanceMonthStore } from '@/stores/adminFinanceMonthStore';

export function useAdminFinanceMonthReport() {
  const year = useAdminFinanceMonthStore((s) => s.year);
  const month = useAdminFinanceMonthStore((s) => s.month);
  const goToPreviousMonth = useAdminFinanceMonthStore((s) => s.goToPreviousMonth);
  const goToNextMonth = useAdminFinanceMonthStore((s) => s.goToNextMonth);

  const [loading, setLoading] = useState(true);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [incomeBreakdown, setIncomeBreakdown] = useState<ServiceIncomeBreakdown[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const report = await financeApi.getMonthlyReport(year, month);
      setTotalIncome(report.totalIncome);
      setTotalExpenses(report.totalExpenses);
      setIncomeBreakdown(report.incomeBreakdown);
      setExpenses(report.expenses);
    } catch (err) {
      console.error('שגיאה בטעינת דוח פיננסי:', err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return {
    year,
    month,
    loading,
    totalIncome,
    totalExpenses,
    incomeBreakdown,
    expenses,
    loadReport,
    goToPreviousMonth,
    goToNextMonth,
  };
}
