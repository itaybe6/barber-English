import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';

export interface PickPrimaryColorTabBarActions {
  openCustomPicker: () => void;
  openPaletteGrid: () => void;
  /** מזהה טאב בהגדרות (למשל design) — כפתור חזרה משחזר את אותו אזור */
  returnSettingsTab?: string;
}

type PickPrimaryColorTabBarContextValue = {
  register: (a: PickPrimaryColorTabBarActions | null) => void;
  get: () => PickPrimaryColorTabBarActions | null;
};

const PickPrimaryColorTabBarContext =
  createContext<PickPrimaryColorTabBarContextValue | null>(null);

export function PickPrimaryColorTabBarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<PickPrimaryColorTabBarActions | null>(null);
  const register = useCallback((a: PickPrimaryColorTabBarActions | null) => {
    ref.current = a;
  }, []);
  const get = useCallback(() => ref.current, []);
  const value = useMemo(
    () => ({ register, get }),
    [register, get]
  );
  return (
    <PickPrimaryColorTabBarContext.Provider value={value}>
      {children}
    </PickPrimaryColorTabBarContext.Provider>
  );
}

export function usePickPrimaryColorTabBar(): PickPrimaryColorTabBarContextValue {
  const ctx = useContext(PickPrimaryColorTabBarContext);
  if (!ctx) {
    throw new Error('usePickPrimaryColorTabBar must be used within PickPrimaryColorTabBarProvider');
  }
  return ctx;
}
