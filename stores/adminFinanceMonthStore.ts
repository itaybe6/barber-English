import { create } from 'zustand/react';

const now = new Date();

interface AdminFinanceMonthState {
  year: number;
  month: number;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
}

/** Shared month navigation for admin finance + monthly report screen (same tab area). */
export const useAdminFinanceMonthStore = create<AdminFinanceMonthState>((set, get) => ({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  goToPreviousMonth: () => {
    const { year, month } = get();
    if (month === 1) set({ month: 12, year: year - 1 });
    else set({ month: month - 1 });
  },
  goToNextMonth: () => {
    const { year, month } = get();
    if (month === 12) set({ month: 1, year: year + 1 });
    else set({ month: month + 1 });
  },
}));
