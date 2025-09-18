// כניסת אפליקציה ל-Expo Go
import 'react-native-gesture-handler'; // אפשרי אבל טוב להקדים

// Polyfill for crypto.getRandomValues needed by uuid in some libs (e.g., Google Places)
import 'react-native-get-random-values';
// Fallback for environments where global.crypto is missing (older RN)
// Try to attach getRandomValues via expo-crypto (preferred) or expo-random if available
try {
  if (typeof global.crypto === 'undefined') {
    // Lazy import to avoid crashes if not installed
    let cryptoImpl;
    try {
      // expo-crypto newer API
      cryptoImpl = require('expo-crypto');
      global.crypto = {
        getRandomValues: cryptoImpl.getRandomValues || cryptoImpl.getRandomValuesAsync,
      };
    } catch {
      try {
        const expoRandom = require('expo-random');
        global.crypto = {
          getRandomValues: (arr) => {
            const bytes = expoRandom.getRandomBytes(arr.length);
            arr.set(bytes);
            return arr;
          },
        };
      } catch {}
    }
  }
} catch {}

import 'expo-router/entry';
