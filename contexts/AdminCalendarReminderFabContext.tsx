import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

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

type Setters = {
  setRegistration: Dispatch<SetStateAction<AdminCalendarReminderFabRegistration>>;
  setPlusAnchorWindow: Dispatch<SetStateAction<AdminCalendarPlusAnchorWindow>>;
};

/**
 * Setters live in their own context so updating `registration` or `plusAnchorWindow`
 * does not re-render components that only need stable dispatchers (e.g. calendar screen).
 */
const ReminderFabSettersContext = createContext<Setters | null>(null);

const ReminderFabRegistrationContext =
  createContext<AdminCalendarReminderFabRegistration>(null);

const PlusAnchorWindowContext = createContext<AdminCalendarPlusAnchorWindow>(null);

export function AdminCalendarReminderFabProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [registration, setRegistration] =
    useState<AdminCalendarReminderFabRegistration>(null);
  const [plusAnchorWindow, setPlusAnchorWindow] =
    useState<AdminCalendarPlusAnchorWindow>(null);

  const setters = useMemo(
    () => ({ setRegistration, setPlusAnchorWindow }),
    [],
  );

  return (
    <ReminderFabSettersContext.Provider value={setters}>
      <ReminderFabRegistrationContext.Provider value={registration}>
        <PlusAnchorWindowContext.Provider value={plusAnchorWindow}>
          {children}
        </PlusAnchorWindowContext.Provider>
      </ReminderFabRegistrationContext.Provider>
    </ReminderFabSettersContext.Provider>
  );
}

export function useAdminCalendarReminderFabRegistration() {
  const ctx = useContext(ReminderFabSettersContext);
  if (!ctx) {
    throw new Error(
      'useAdminCalendarReminderFabRegistration must be used within AdminCalendarReminderFabProvider',
    );
  }
  return ctx.setRegistration;
}

export function useAdminCalendarSetPlusAnchorWindow() {
  const ctx = useContext(ReminderFabSettersContext);
  if (!ctx) {
    throw new Error(
      'useAdminCalendarSetPlusAnchorWindow must be used within AdminCalendarReminderFabProvider',
    );
  }
  return ctx.setPlusAnchorWindow;
}

export function useAdminCalendarReminderFab(): AdminCalendarReminderFabRegistration {
  return useContext(ReminderFabRegistrationContext);
}

export function useAdminCalendarPlusAnchorWindow(): AdminCalendarPlusAnchorWindow {
  return useContext(PlusAnchorWindowContext);
}
