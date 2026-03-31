import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';

// Load resources via require to avoid TS config changes for JSON imports
// eslint-disable-next-line @typescript-eslint/no-var-requires
const en = require('../locales/en.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const he = require('../locales/he.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ar = require('../locales/ar.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ru = require('../locales/ru.json');

const resources = {
  en: { translation: en },
  he: { translation: he },
  ar: { translation: ar },
  ru: { translation: ru },
} as const;

function getInitialLanguage(): 'en' | 'he' | 'ar' | 'ru' {
  try {
    const locales = Localization.getLocales?.();
    const primary = Array.isArray(locales) && locales.length > 0 ? locales[0] : undefined;
    const code = (primary?.languageCode || '').toLowerCase();
    if (code === 'he') return 'he';
    if (code === 'ar') return 'ar';
    if (code === 'ru') return 'ru';
  } catch {}
  return 'en';
}

function ensureLayoutDirection(language: string) {
  const shouldBeRtl = language.startsWith('he') || language.startsWith('ar');
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

i18n.on('languageChanged', (lng) => {
  ensureLayoutDirection(lng);
});

export default i18n;

