import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Text, View } from 'react-native';
import i18n from '@/src/config/i18n';
import { normalizeAppLanguage } from '@/lib/i18nLocale';
import { persistAppUiLanguage, readPersistedAppUiLanguage } from '@/lib/appLanguagePreference';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import React from 'react';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi } from '@/lib/api/notifications';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import { ColorUpdateProvider } from '@/lib/contexts/ColorUpdateContext';
import { BusinessColorsProvider } from '@/lib/contexts/BusinessColorsContext';
import { StatusBar } from 'expo-status-bar';

// RTL is configured in i18n (Hebrew + Arabic → RTL)

export const unstable_settings = {
  // Remove initialRouteName to let the navigation logic handle routing
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
// In dev with fast refresh this can be called multiple times; ignore errors.
SplashScreen.preventAutoHideAsync().catch(() => {});

type SplashHideState = "idle" | "hiding" | "done";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
    'FbPragmati-Regular': require('../assets/fonts/FbPragmati-Regular.otf'),
    'FbPragmati-Bold': require('../assets/fonts/FbPragmati-Bold.otf'),
    'FbPragmati-Light': require('../assets/fonts/FbPragmati-Light.otf'),
    'FbPragmati-Black': require('../assets/fonts/FbPragmati-Black.otf'),
    'FbPragmati-Thin': require('../assets/fonts/FbPragmati-Thin.otf'),
  });

  const { isAuthenticated, isAdminUser, user, notificationsEnabled } = useAuthStore();
  const [storeHydrated, setStoreHydrated] = React.useState(false);
  const [fontError, setFontError] = React.useState<string | null>(null);
  const segments = useSegments();
  const router = useRouter();
  const [bootDebug, setBootDebug] = React.useState<{ start: number; notes: string[] }>({ start: Date.now(), notes: [] });
  /** hideAsync must run at most once — onLayout fires repeatedly and extra calls throw on iOS. */
  const splashHideRef = React.useRef<SplashHideState>("idle");
  const addNote = React.useCallback((m: string) => {
    if (__DEV__) {
      setBootDebug((s) => ({ ...s, notes: [...s.notes, `${Math.round((Date.now()-s.start)/1000)}s ${m}`] }));
    }
    try { console.log('[boot]', m); } catch {}
  }, []);

  // Compute desired group upfront (do not place hooks after conditional returns!)
  const rawRole: unknown = (user as any)?.type ?? (user as any)?.user_type;
  const normalizedRole = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : '';
  const desiredGroup = normalizedRole === 'super_admin'
    ? '/(super-admin)'
    : (normalizedRole === 'admin' || isAdminUser()) ? '/(tabs)' : '/(client-tabs)';

  // Enforce correct top-level group using segments (groups are hidden from pathname)
  React.useEffect(() => {
    if (!loaded || !storeHydrated) return;
    if (!isAuthenticated || !user) return;
    const currentTop = segments[0];
    const desiredTop = desiredGroup.replace('/', ''); // e.g., '(tabs)'
    if (currentTop !== desiredTop) {
      router.replace(desiredGroup as any);
    }
  }, [loaded, storeHydrated, isAuthenticated, user, segments, desiredGroup, normalizedRole, router]);

  // If unauthenticated, ensure we are on the public client group by default
  React.useEffect(() => {
    if (!loaded || !storeHydrated) return;
    if (!isAuthenticated) {
      const currentTop = segments[0];
      // Allow staying on login/register or public client group
      const topSeg = currentTop as string | undefined;
      const isAllowed =
        topSeg === '(client-tabs)' ||
        topSeg === 'login' ||
        topSeg === 'login-otp' ||
        topSeg === 'register' ||
        typeof topSeg === 'undefined';
      if (!isAllowed) {
        router.replace('/(client-tabs)');
      }
    }
  }, [loaded, storeHydrated, isAuthenticated, segments, router]);

  // Wait for zustand-persist hydration
  React.useEffect(() => {
    addNote('auth persist subscribe');
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setStoreHydrated(true);
      addNote('auth hydrated');
      if (__DEV__) {
        // eslint-disable-next-line no-console
      }
    });
    // If already hydrated (e.g., fast refresh), reflect immediately
    if (useAuthStore.persist.hasHydrated()) {
      setStoreHydrated(true);
      addNote('auth already hydrated');
    }
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // After auth hydration: prefer language from user row, then local fallback (last i18n choice), else device default from i18n init.
  useEffect(() => {
    if (!storeHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        if (isAuthenticated && user) {
          const userLang: unknown = (user as any)?.language;
          if (typeof userLang === 'string' && userLang.trim().length > 0) {
            const normalized = normalizeAppLanguage(userLang);
            if (!cancelled && normalizeAppLanguage(i18n.language) !== normalized) {
              await i18n.changeLanguage(normalized);
              await persistAppUiLanguage(normalized);
            }
            return;
          }
          const stored = await readPersistedAppUiLanguage();
          if (!cancelled && stored && normalizeAppLanguage(i18n.language) !== stored) {
            await i18n.changeLanguage(stored);
            await persistAppUiLanguage(stored);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeHydrated, isAuthenticated, user]);

  // Handle font loading errors gracefully - DO NOT THROW IN PRODUCTION
  useEffect(() => {
    if (error) {
      console.error('Font loading error:', error);
      setFontError(error.message || 'Failed to load fonts');
      addNote('font error');
      
      // In development, you might want to see the error more clearly
      if (__DEV__) {
        console.warn('Font loading failed in development mode:', error);
      }
      
      // DO NOT throw the error - this prevents app crashes
      // Instead, we'll handle it gracefully by continuing with system fonts
    }
  }, [error]);

  const hideSplashOnce = React.useCallback(async (reason: string) => {
    if (splashHideRef.current === "done") return;
    if (splashHideRef.current === "hiding") return;
    splashHideRef.current = "hiding";
    try {
      addNote(`${reason} -> hide splash`);
      await SplashScreen.hideAsync();
      splashHideRef.current = "done";
    } catch (err) {
      splashHideRef.current = "idle";
      console.warn("Failed to hide splash screen:", err);
    }
  }, [addNote]);

  const onLayoutRootView = React.useCallback(
    async (_e?: any) => {
      await hideSplashOnce("onLayout");
    },
    [hideSplashOnce],
  );

  // Set default text styling
  useEffect(() => {
    // Font weight styling can be handled via CSS or style props
  }, []);

  // Register and persist push token for the logged-in user, gated by user preference
  React.useEffect(() => {
    const registerToken = async () => {
      try {
        if (!user?.phone || !notificationsEnabled) return;
        const token = await notificationsApi.requestNotificationPermissions();
        if (token) {
          await notificationsApi.registerPushToken(user.phone, token);
        }
      } catch (e) {
        // ignore
      }
    };
    registerToken();
  }, [user?.phone, notificationsEnabled]);

  // Fuse: ensure splash hides even if onLayout is delayed (single guarded call)
  useEffect(() => {
    const t = setTimeout(() => {
      void hideSplashOnce("3000ms fallback");
    }, 3000);
    return () => clearTimeout(t);
  }, [hideSplashOnce]);

  // When fonts finish (or error), prompt hide — still only runs once via ref
  useEffect(() => {
    if (!loaded && !error) return;
    const t = setTimeout(() => {
      void hideSplashOnce("fonts loaded");
    }, 100);
    return () => clearTimeout(t);
  }, [loaded, error, hideSplashOnce]);

  let content: React.ReactNode = null;

  // אם המשתמש לא מחובר, הצג את דף הבית הציבורי + מסכי התחברות/הרשמה
  if (!isAuthenticated) {
    content = (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(client-tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="login-otp" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(super-admin)" />
      </Stack>
    );
  } else if (!user) {
    // אם המשתמש מחובר אבל ה-user עדיין לא נטען, המתן מעט (מניעת ניווט שגוי)
    content = null;
  } else {
    // אם המשתמש מחובר, בדוק איזה סוג משתמש הוא
    content = (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(client-tabs)" />
        <Stack.Screen name="(super-admin)" />
      </Stack>
    );
  }

  return (
    <ColorUpdateProvider>
      <BusinessColorsProvider>
        <ThemeProvider>
          <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
            <BottomSheetModalProvider>
              <StatusBar style="dark" />
              {content}
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </ThemeProvider>
      </BusinessColorsProvider>
    </ColorUpdateProvider>
  );
}
