import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppLanguageCode } from '@/lib/i18nLocale';
import { normalizeAppLanguage } from '@/lib/i18nLocale';

export const APP_UI_LANGUAGE_STORAGE_KEY = 'app-ui-language-preference-v1';

export async function persistAppUiLanguage(raw: string): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_UI_LANGUAGE_STORAGE_KEY, normalizeAppLanguage(raw));
  } catch {
    /* ignore */
  }
}

export async function readPersistedAppUiLanguage(): Promise<AppLanguageCode | null> {
  try {
    const raw = await AsyncStorage.getItem(APP_UI_LANGUAGE_STORAGE_KEY);
    if (raw == null || String(raw).trim() === '') return null;
    return normalizeAppLanguage(raw);
  } catch {
    return null;
  }
}

export async function clearPersistedAppUiLanguage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(APP_UI_LANGUAGE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
