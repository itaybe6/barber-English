import { Platform, type TextStyle } from 'react-native';

export const HOME_HEADER_TITLE_FONT_IDS = ['system', 'modern', 'serif', 'mono', 'classic', 'display'] as const;
export type HomeHeaderTitleFontId = (typeof HOME_HEADER_TITLE_FONT_IDS)[number];

export function normalizeHomeHeaderTitleFontId(raw: string | null | undefined): HomeHeaderTitleFontId {
  const v = String(raw ?? '').trim().toLowerCase();
  if ((HOME_HEADER_TITLE_FONT_IDS as readonly string[]).includes(v)) {
    return v as HomeHeaderTitleFontId;
  }
  return 'system';
}

/** Persisted value: null means system default. */
export function homeHeaderTitleFontIdToDb(id: HomeHeaderTitleFontId): string | null {
  return id === 'system' ? null : id;
}

export function homeHeaderTitleFontStyle(id: HomeHeaderTitleFontId): TextStyle {
  switch (id) {
    case 'modern':
      return Platform.select<TextStyle>({
        ios: { fontFamily: 'Helvetica Neue' },
        android: { fontFamily: 'sans-serif-medium' },
        default: {},
      }) ?? {};
    case 'serif':
      return Platform.select<TextStyle>({
        ios: { fontFamily: 'Georgia' },
        android: { fontFamily: 'serif' },
        default: {},
      }) ?? {};
    case 'mono':
      return Platform.select<TextStyle>({
        ios: { fontFamily: 'Menlo' },
        android: { fontFamily: 'monospace' },
        default: {},
      }) ?? {};
    case 'classic':
      return Platform.select<TextStyle>({
        ios: { fontFamily: 'Palatino' },
        android: { fontFamily: 'serif' },
        default: {},
      }) ?? {};
    case 'display':
      return Platform.select<TextStyle>({
        ios: { fontFamily: 'Avenir-Heavy' },
        android: { fontFamily: 'sans-serif-medium' },
        default: {},
      }) ?? {};
    case 'system':
    default:
      return {};
  }
}

/** Allowed when typing the custom home title (English + common punctuation). */
export function filterEnglishHomeHeaderTitle(input: string): string {
  return input.replace(/[^A-Za-z0-9 \-'.&,()]/g, '');
}
