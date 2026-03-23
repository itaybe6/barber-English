import { supabase, getBusinessId } from '@/lib/supabase';
import type { BusinessExpense, ExpenseCategory } from '@/lib/supabase';

export const expensesApi = {
  async getExpensesByMonth(year: number, month: number): Promise<BusinessExpense[]> {
    try {
      const businessId = getBusinessId();
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      const { data, error } = await supabase
        .from('business_expenses')
        .select('*')
        .eq('business_id', businessId)
        .gte('expense_date', startDate)
        .lt('expense_date', endDate)
        .order('expense_date', { ascending: false });

      if (error) {
        console.error('Error fetching expenses:', error);
        return [];
      }
      return (data as BusinessExpense[]) || [];
    } catch (err) {
      console.error('Error in getExpensesByMonth:', err);
      return [];
    }
  },

  async createExpense(expense: {
    amount: number;
    description?: string;
    category: ExpenseCategory;
    expense_date: string;
  }): Promise<BusinessExpense | null> {
    try {
      const businessId = getBusinessId();
      const { data, error } = await supabase
        .from('business_expenses')
        .insert({
          business_id: businessId,
          amount: expense.amount,
          description: expense.description || null,
          category: expense.category,
          expense_date: expense.expense_date,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creating expense:', error);
        return null;
      }
      return data as BusinessExpense;
    } catch (err) {
      console.error('Error in createExpense:', err);
      return null;
    }
  },

  async deleteExpense(id: string): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      const { error } = await supabase
        .from('business_expenses')
        .delete()
        .eq('id', id)
        .eq('business_id', businessId);

      if (error) {
        console.error('Error deleting expense:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error in deleteExpense:', err);
      return false;
    }
  },

  async getMonthlyExpenseTotal(year: number, month: number): Promise<number> {
    const expenses = await this.getExpensesByMonth(year, month);
    return expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  },
};
