import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface EditProductsTabBarActions {
  openCreate: () => void;
  commitReorder: () => Promise<void>;
}

type EditProductsTabBarContextValue = {
  register: (a: EditProductsTabBarActions | null) => void;
  get: () => EditProductsTabBarActions | null;
  deleteMode: boolean;
  setDeleteMode: (v: boolean) => void;
  toggleDeleteMode: () => void;
  reorderMode: boolean;
  setReorderMode: (v: boolean) => void;
  toggleReorderMode: () => void;
  reorderDirty: boolean;
  setReorderDirty: (v: boolean) => void;
  floatingBarHidden: boolean;
  setFloatingBarHidden: (v: boolean) => void;
};

const EditProductsTabBarContext = createContext<EditProductsTabBarContextValue | null>(null);

export function EditProductsTabBarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<EditProductsTabBarActions | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderDirty, setReorderDirty] = useState(false);
  const [floatingBarHidden, setFloatingBarHidden] = useState(false);
  const register = useCallback((a: EditProductsTabBarActions | null) => {
    ref.current = a;
  }, []);
  const get = useCallback(() => ref.current, []);
  const toggleDeleteMode = useCallback(() => {
    setDeleteMode((d) => {
      const next = !d;
      if (next) {
        setReorderMode(false);
        setReorderDirty(false);
      }
      return next;
    });
  }, []);
  const toggleReorderMode = useCallback(() => {
    setReorderMode((r) => {
      const next = !r;
      if (next) setDeleteMode(false);
      if (!next) setReorderDirty(false);
      return next;
    });
  }, []);
  const value = useMemo(
    () => ({
      register,
      get,
      deleteMode,
      setDeleteMode,
      toggleDeleteMode,
      reorderMode,
      setReorderMode,
      toggleReorderMode,
      reorderDirty,
      setReorderDirty,
      floatingBarHidden,
      setFloatingBarHidden,
    }),
    [register, get, deleteMode, toggleDeleteMode, reorderMode, toggleReorderMode, reorderDirty, floatingBarHidden]
  );
  return (
    <EditProductsTabBarContext.Provider value={value}>
      {children}
    </EditProductsTabBarContext.Provider>
  );
}

export function useEditProductsTabBarRegistration(
  actions: EditProductsTabBarActions | null
) {
  const ctx = useContext(EditProductsTabBarContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.register(actions);
    return () => ctx.register(null);
  }, [ctx, actions]);
}

export function useEditProductsTabBarGet(): () => EditProductsTabBarActions | null {
  const ctx = useContext(EditProductsTabBarContext);
  return useCallback(() => ctx?.get() ?? null, [ctx]);
}

export function useEditProductsTabBar() {
  const ctx = useContext(EditProductsTabBarContext);
  if (!ctx) {
    throw new Error('useEditProductsTabBar must be used within EditProductsTabBarProvider');
  }
  return ctx;
}
