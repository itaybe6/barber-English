import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CalendarViewMode } from '@/components/admin-calendar/calendarViewMode';

type AdminWaitlistCalendarViewContextValue = {
  waitlistCalendarView: CalendarViewMode;
  setWaitlistCalendarView: (v: CalendarViewMode) => void;
};

const AdminWaitlistCalendarViewContext = createContext<AdminWaitlistCalendarViewContextValue | null>(null);

export function AdminWaitlistCalendarViewProvider({ children }: { children: ReactNode }) {
  const [waitlistCalendarView, setWaitlistCalendarView] = useState<CalendarViewMode>('month');
  const value = useMemo(
    () => ({ waitlistCalendarView, setWaitlistCalendarView }),
    [waitlistCalendarView]
  );
  return (
    <AdminWaitlistCalendarViewContext.Provider value={value}>{children}</AdminWaitlistCalendarViewContext.Provider>
  );
}

export function useAdminWaitlistCalendarView(): AdminWaitlistCalendarViewContextValue {
  const ctx = useContext(AdminWaitlistCalendarViewContext);
  if (!ctx) {
    throw new Error('useAdminWaitlistCalendarView must be used within AdminWaitlistCalendarViewProvider');
  }
  return ctx;
}
