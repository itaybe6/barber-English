import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** קואורדינטות חלון (measureInWindow) של כפתור הפלוס בסרגל */
export type AdminCalendarPlusAnchorWindow = {
  x: number;
  y: number;
  width: number;
  height: number;
} | null;

export type AdminCalendarReminderFabRegistration = {
  isOpen: boolean;
  onPress: () => void;
} | null;

type Ctx = {
  registration: AdminCalendarReminderFabRegistration;
  setRegistration: (r: AdminCalendarReminderFabRegistration) => void;
  plusAnchorWindow: AdminCalendarPlusAnchorWindow;
  setPlusAnchorWindow: (r: AdminCalendarPlusAnchorWindow) => void;
};

const AdminCalendarReminderFabContext = createContext<Ctx | null>(null);

export function AdminCalendarReminderFabProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [registration, setRegistration] =
    useState<AdminCalendarReminderFabRegistration>(null);
  const [plusAnchorWindow, setPlusAnchorWindow] =
    useState<AdminCalendarPlusAnchorWindow>(null);

  const value = useMemo(
    () => ({
      registration,
      setRegistration,
      plusAnchorWindow,
      setPlusAnchorWindow,
    }),
    [registration, plusAnchorWindow]
  );

  return (
    <AdminCalendarReminderFabContext.Provider value={value}>
      {children}
    </AdminCalendarReminderFabContext.Provider>
  );
}

export function useAdminCalendarReminderFabRegistration() {
  const ctx = useContext(AdminCalendarReminderFabContext);
  if (!ctx) {
    throw new Error(
      "useAdminCalendarReminderFabRegistration must be used within AdminCalendarReminderFabProvider"
    );
  }
  return ctx.setRegistration;
}

export function useAdminCalendarReminderFab(): AdminCalendarReminderFabRegistration {
  const ctx = useContext(AdminCalendarReminderFabContext);
  return ctx?.registration ?? null;
}

export function useAdminCalendarPlusAnchorWindow(): AdminCalendarPlusAnchorWindow {
  const ctx = useContext(AdminCalendarReminderFabContext);
  return ctx?.plusAnchorWindow ?? null;
}

export function useAdminCalendarSetPlusAnchorWindow() {
  const ctx = useContext(AdminCalendarReminderFabContext);
  if (!ctx) {
    throw new Error(
      "useAdminCalendarSetPlusAnchorWindow must be used within AdminCalendarReminderFabProvider"
    );
  }
  return ctx.setPlusAnchorWindow;
}
