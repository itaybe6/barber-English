import { supabase, getBusinessId } from '@/lib/supabase';
import type { BusinessExpense, ExpenseCategory } from '@/lib/supabase';

function guessMimeFromUri(uriOrName: string): string {
  const ext = uriOrName.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export const expensesApi = {
  async uploadReceipt(asset: { uri: string; base64?: string | null; mimeType?: string | null }): Promise<string | null> {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.uri);
      let fileBody: Uint8Array;
      if (asset.base64) {
        const clean = asset.base64.replace(/^data:[^;]+;base64,/, '');
        const bytes = new Uint8Array(atob(clean).split('').map((c) => c.charCodeAt(0)));
        fileBody = bytes;
      } else {
        const response = await fetch(asset.uri, { cache: 'no-store' });
        const arrayBuffer = await response.arrayBuffer();
        fileBody = new Uint8Array(arrayBuffer);
        contentType = response.headers.get('content-type') || contentType;
      }
      const ext = (contentType.split('/')[1] || 'jpg').toLowerCase().split(';')[0];
      const filePath = `expense-receipts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('designs').upload(filePath, fileBody as any, { contentType, upsert: false });
      if (error) {
        console.error('Error uploading receipt:', error);
        return null;
      }
      const { data } = supabase.storage.from('designs').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (err) {
      console.error('Error in uploadReceipt:', err);
      return null;
    }
  },

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
    receipt_url?: string | null;
  }): Promise<BusinessExpense | null> {
    try {
      const businessId = getBusinessId();
      const insertData: Record<string, unknown> = {
        business_id: businessId,
        amount: expense.amount,
        description: expense.description || null,
        category: expense.category,
        expense_date: expense.expense_date,
      };
      if (expense.receipt_url != null) {
        insertData.receipt_url = expense.receipt_url;
      }
      const { data, error } = await supabase
        .from('business_expenses')
        .insert(insertData)
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
