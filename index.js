// כניסת אפליקציה ל-Expo Go
import 'react-native-gesture-handler'; // חשוב שיהיה ראשון
import 'react-native-reanimated'; // נדרש ל-Production (במיוחד ב-iOS) עם babel plugin

// Polyfill for crypto.getRandomValues used by some libraries.
// Keep it minimal to avoid touching TurboModules before runtime is ready.
import 'react-native-get-random-values';

import 'expo-router/entry';
