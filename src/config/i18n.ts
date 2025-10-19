import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';

// Load resources via require to avoid TS config changes for JSON imports
// eslint-disable-next-line @typescript-eslint/no-var-requires
const en = require('../locales/en.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const he = require('../locales/he.json');

const resources = {
  en: { translation: en },
  he: { translation: he },
} as const;

function getInitialLanguage(): 'en' | 'he' {
  try {
    const locales = Localization.getLocales?.();
    const primary = Array.isArray(locales) && locales.length > 0 ? locales[0] : undefined;
    const code = (primary?.languageCode || '').toLowerCase();
    if (code === 'he') return 'he';
  } catch {}
  return 'en';
}

function ensureLayoutDirection(language: string) {
  const shouldBeRtl = language.startsWith('he');
  try {
    if (I18nManager.isRTL !== shouldBeRtl) {
      I18nManager.allowRTL(shouldBeRtl);
      I18nManager.forceRTL(shouldBeRtl);
      // Note: App reload is needed for direction change to fully apply.
    }
  } catch {}
}

const initialLng = getInitialLanguage();
ensureLayoutDirection(initialLng);

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: initialLng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  })
  .catch(() => {});

export default i18n;

