import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

export interface EditGalleryTabBarActions {
  openCreate: () => void;
  openEditPicker: () => void;
}

const EditGalleryTabBarContext = createContext<{
  register: (a: EditGalleryTabBarActions | null) => void;
  get: () => EditGalleryTabBarActions | null;
} | null>(null);

export function EditGalleryTabBarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<EditGalleryTabBarActions | null>(null);
  const register = useCallback((a: EditGalleryTabBarActions | null) => {
    ref.current = a;
  }, []);
  const get = useCallback(() => ref.current, []);
  const value = useMemo(() => ({ register, get }), [register, get]);
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
