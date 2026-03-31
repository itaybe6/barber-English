import { useState, useEffect, useCallback, useRef } from 'react';
import { financeApi } from '@/lib/api/finance';
import type { ServiceIncomeBreakdown } from '@/lib/api/finance';
import type { BusinessExpense } from '@/lib/supabase';
import { useAdminFinanceMonthStore } from '@/stores/adminFinanceMonthStore';

export function useAdminFinanceMonthReport() {
  const year = useAdminFinanceMonthStore((s) => s.year);
  const month = useAdminFinanceMonthStore((s) => s.month);
  const goToPreviousMonth = useAdminFinanceMonthStore((s) => s.goToPreviousMonth);
  const goToNextMonth = useAdminFinanceMonthStore((s) => s.goToNextMonth);

  /** Full-screen (or shell) loading — עד לטעינה ראשונה בלבד */
  const [loading, setLoading] = useState(true);
  /** טעינה מקומית אחרי שכבר הוצג דוח (למשל החלפת חודש) — בלי להחליף את כל המסך */
  const [reportRefreshing, setReportRefreshing] = useState(false);
  const hasCompletedInitialLoadRef = useRef(false);

  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [incomeBreakdown, setIncomeBreakdown] = useState<ServiceIncomeBreakdown[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);

  const loadReport = useCallback(async () => {
    if (!hasCompletedInitialLoadRef.current) {
      setLoading(true);
    } else {
      setReportRefreshing(true);
    }
    try {
      const report = await financeApi.getMonthlyReport(year, month);
      setTotalIncome(report.totalIncome);
      setTotalExpenses(report.totalExpenses);
      setIncomeBreakdown(report.incomeBreakdown);
      setExpenses(report.expenses);
      hasCompletedInitialLoadRef.current = true;
    } catch (err) {
      console.error('שגיאה בטעינת דוח פיננסי:', err);
    } finally {
      setLoading(false);
      setReportRefreshing(false);
    }
  }, [year, month]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return {
    year,
    month,
    loading,
    reportRefreshing,
    totalIncome,
    totalExpenses,
    incomeBreakdown,
    expenses,
    loadReport,
    goToPreviousMonth,
    goToNextMonth,
  };
}
