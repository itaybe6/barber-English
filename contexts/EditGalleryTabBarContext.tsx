import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface EditGalleryTabBarActions {
  openCreate: () => void;
  /** Persist gallery order and exit reorder mode (called from tab bar check). */
  commitReorder: () => Promise<void>;
}

type EditGalleryTabBarContextValue = {
  register: (a: EditGalleryTabBarActions | null) => void;
  get: () => EditGalleryTabBarActions | null;
  deleteMode: boolean;
  setDeleteMode: (v: boolean) => void;
  toggleDeleteMode: () => void;
  reorderMode: boolean;
  setReorderMode: (v: boolean) => void;
  toggleReorderMode: () => void;
  /** True after the user dragged items; tab bar shows save (check) until committed. */
  reorderDirty: boolean;
  setReorderDirty: (v: boolean) => void;
  /** When true, admin floating tab bar is hidden (e.g. full-screen image viewer on edit-gallery). */
  floatingBarHidden: boolean;
  setFloatingBarHidden: (v: boolean) => void;
};

const EditGalleryTabBarContext = createContext<EditGalleryTabBarContextValue | null>(null);

export function EditGalleryTabBarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<EditGalleryTabBarActions | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderDirty, setReorderDirty] = useState(false);
  const [floatingBarHidden, setFloatingBarHidden] = useState(false);
  const register = useCallback((a: EditGalleryTabBarActions | null) => {
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
    <EditGalleryTabBarContext.Provider value={value}>
      {children}
    </EditGalleryTabBarContext.Provider>
  );
}

export function useEditGalleryTabBarRegistration(
  actions: EditGalleryTabBarActions | null
) {
  const ctx = useContext(EditGalleryTabBarContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.register(actions);
    return () => ctx.register(null);
  }, [ctx, actions]);
}

export function useEditGalleryTabBarGet(): () => EditGalleryTabBarActions | null {
  const ctx = useContext(EditGalleryTabBarContext);
  return useCallback(() => ctx?.get() ?? null, [ctx]);
}

export function useEditGalleryTabBar() {
  const ctx = useContext(EditGalleryTabBarContext);
  if (!ctx) {
    throw new Error('useEditGalleryTabBar must be used within EditGalleryTabBarProvider');
  }
  return ctx;
}
