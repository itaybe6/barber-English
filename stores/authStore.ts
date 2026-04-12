import { create } from 'zustand/react';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserType } from '@/constants/auth';
import { clearPersistedAppUiLanguage } from '@/lib/appLanguagePreference';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  hasHydrated: boolean;
  notificationsEnabled: boolean;
  login: (user: User) => void;
  logout: () => void;
  isAdminUser: () => boolean;
  isSuperAdminUser: () => boolean;
  updateUserProfile: (updates: Partial<User>) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      isAdmin: false,
      isSuperAdmin: false,
      notificationsEnabled: true,
      login: (user: User) => {
        const rawRole: unknown = (user as any)?.type ?? (user as any)?.user_type;
        const role = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : undefined;
        const isBlocked = Boolean((user as any)?.block);
        const allowSession = !isBlocked;
        set({
          user: allowSession ? user : null,
          isAuthenticated: allowSession,
          isAdmin: allowSession && (role === 'admin' || role === 'super_admin'),
          isSuperAdmin: allowSession && role === 'super_admin',
        });
        
        // Force a re-render by getting the state immediately
        setTimeout(() => {
          const currentState = get();
        }, 100);
      },
      logout: () => {
        set({ user: null, isAuthenticated: false, isAdmin: false, isSuperAdmin: false, notificationsEnabled: true });
        // Proactively clear persisted auth to avoid race conditions when the app is killed quickly
        AsyncStorage.removeItem('auth-storage').catch(() => {});
        void clearPersistedAppUiLanguage();
      },
      isAdminUser: () => {
        const { user } = get();
        const rawRole: unknown = (user as any)?.type ?? (user as any)?.user_type;
        const role = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : undefined;
        return role === 'admin' || role === 'super_admin';
      },
      isSuperAdminUser: () => {
        const { user } = get();
        const rawRole: unknown = (user as any)?.type ?? (user as any)?.user_type;
        const role = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : undefined;
        return role === 'super_admin';
      },
      updateUserProfile: (updates: Partial<User>) => {
        const current = get().user;
        if (!current) return;
        const updatedUser = { ...current, ...updates } as User;
        const rawRole: unknown = (updatedUser as any)?.type ?? (updatedUser as any)?.user_type;
        const role = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : undefined;
        set({ user: updatedUser, isAdmin: role === 'admin' || role === 'super_admin', isSuperAdmin: role === 'super_admin' });
      },
      setNotificationsEnabled: (enabled: boolean) => {
        set({ notificationsEnabled: enabled });
      },
    }),
    {
      name: 'auth-storage',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state, error) => {
        // Before rehydration starts
        if (state) {
          state.hasHydrated = false as any;
        }
        return (rehydratedState: AuthState | undefined) => {
          if (rehydratedState) {
            rehydratedState.hasHydrated = true as any;
            const rawRole: unknown = (rehydratedState.user as any)?.type ?? (rehydratedState.user as any)?.user_type;
            const role = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : undefined;
            const isBlocked = Boolean((rehydratedState.user as any)?.block);
            if (rehydratedState.user && isBlocked) {
              rehydratedState.user = null;
              rehydratedState.isAuthenticated = false;
              rehydratedState.isAdmin = false;
              rehydratedState.isSuperAdmin = false;
            } else {
              rehydratedState.isAdmin = role === 'admin' || role === 'super_admin';
              rehydratedState.isSuperAdmin = role === 'super_admin';
              rehydratedState.isAuthenticated = Boolean(rehydratedState.user);
            }
          }
        };
      },
      migrate: (persistedState: any, version) => {
        // Migrate legacy persisted users that used `user.user_type` instead of `user.type`
        if (!persistedState) return persistedState;
        if (version < 2) {
          const nextState = { ...persistedState };
          if (nextState.user && !nextState.user.type && nextState.user.user_type) {
            nextState.user = { ...nextState.user, type: nextState.user.user_type };
          }
          const rawRole: unknown = nextState.user?.type ?? nextState.user?.user_type;
          const role = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : undefined;
          nextState.isAdmin = role === 'admin' || role === 'super_admin';
          nextState.isSuperAdmin = role === 'super_admin';
          return nextState;
        }
        return persistedState;
      },
    }
  )
); 