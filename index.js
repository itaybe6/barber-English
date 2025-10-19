// כניסת אפליקציה ל-Expo Go
import 'react-native-gesture-handler'; // חשוב שיהיה ראשון
import 'react-native-reanimated'; // נדרש ל-Production (במיוחד ב-iOS) עם babel plugin

// Polyfill for crypto.getRandomValues used by some libraries.
// Keep it minimal to avoid touching TurboModules before runtime is ready.
import 'react-native-get-random-values';

import * as SplashScreen from 'expo-splash-screen';

// Ensure native splash is registered before React tree mounts
try {
  SplashScreen.preventAutoHideAsync().catch(() => {});
} catch {}

import 'expo-router/entry';
// Initialize i18n before React tree mounts
try {
  require('./src/config/i18n');
} catch {}

// Fallback: hide splash after 5s even if React tree didn't mount
setTimeout(() => {
  SplashScreen.hideAsync().catch(() => {});
}, 5000);

// Minimal boot logs to device console in production
try {
  // eslint-disable-next-line no-console
  console.log('[boot] index.js loaded');
} catch {}
