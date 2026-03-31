export type AppLanguageCode = 'en' | 'he' | 'ar' | 'ru';

export function normalizeAppLanguage(raw: string | undefined | null): AppLanguageCode {
  const l = (raw || '').trim().toLowerCase();
  if (l.startsWith('he')) return 'he';
  if (l.startsWith('ar')) return 'ar';
  if (l.startsWith('ru')) return 'ru';
  return 'en';
}

export function isRtlLanguage(code: string | undefined | null): boolean {
  const l = (code || '').toLowerCase();
  return l.startsWith('he') || l.startsWith('ar');
}

/** BCP 47 tag for `Intl` / `toLocaleDateString` */
export function toBcp47Locale(code: string | undefined | null): string {
  switch (normalizeAppLanguage(code)) {
    case 'he':
      return 'he-IL';
    case 'ar':
      return 'ar-SA';
    case 'ru':
      return 'ru-RU';
    default:
      return 'en-US';
  }
}
