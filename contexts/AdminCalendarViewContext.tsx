import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CalendarViewMode } from '@/components/admin-calendar/calendarViewMode';

type AdminCalendarViewContextValue = {
  calendarView: CalendarViewMode;
  setCalendarView: (v: CalendarViewMode) => void;
};

const AdminCalendarViewContext = createContext<AdminCalendarViewContextValue | null>(null);

export function AdminCalendarViewProvider({ children }: { children: ReactNode }) {
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('week');
  const value = useMemo(
    () => ({ calendarView, setCalendarView }),
    [calendarView]
  );
  return (
    <AdminCalendarViewContext.Provider value={value}>{children}</AdminCalendarViewContext.Provider>
  );
}

export function useAdminCalendarView(): AdminCalendarViewContextValue {
  const ctx = useContext(AdminCalendarViewContext);
  if (!ctx) {
    throw new Error('useAdminCalendarView must be used within AdminCalendarViewProvider');
  }
  return ctx;
}
