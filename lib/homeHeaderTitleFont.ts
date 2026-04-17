import { Platform, type TextStyle } from 'react-native';

/** Legacy preset IDs (still honored when reading from DB). */
export const HOME_HEADER_TITLE_FONT_IDS = ['system', 'modern', 'serif', 'mono', 'classic', 'display'] as const;
export type HomeHeaderTitleFontId = (typeof HOME_HEADER_TITLE_FONT_IDS)[number];

/**
 * Curated Google Fonts (official families via @expo-google-fonts), bundled in `app/_layout.tsx`.
 * Stored in `business_profile.home_header_title_font` as `gf_*` (or null for system).
 */
export const HOME_HEADER_GOOGLE_FONT_OPTIONS = [
  {
    id: 'gf_inter' as const,
    fontFamily: 'Inter_600SemiBold' as const,
    displayName: 'Inter',
  },
  {
    id: 'gf_montserrat' as const,
    fontFamily: 'Montserrat_600SemiBold' as const,
    displayName: 'Montserrat',
  },
  {
    id: 'gf_playfair' as const,
    fontFamily: 'PlayfairDisplay_700Bold' as const,
    displayName: 'Playfair Display',
  },
  {
    id: 'gf_roboto' as const,
    fontFamily: 'Roboto_500Medium' as const,
    displayName: 'Roboto',
  },
  {
    id: 'gf_merriweather' as const,
    fontFamily: 'Merriweather_700Bold' as const,
    displayName: 'Merriweather',
  },
  {
    id: 'gf_oswald' as const,
    fontFamily: 'Oswald_600SemiBold' as const,
    displayName: 'Oswald',
  },
  {
    id: 'gf_lato' as const,
    fontFamily: 'Lato_700Bold' as const,
    displayName: 'Lato',
  },
  /** More visually distinct families (script, mono, display, slab, geometric) */
  {
    id: 'gf_poppins' as const,
    fontFamily: 'Poppins_600SemiBold' as const,
    displayName: 'Poppins',
  },
  {
    id: 'gf_dancing_script' as const,
    fontFamily: 'DancingScript_600SemiBold' as const,
    displayName: 'Dancing Script',
  },
  {
    id: 'gf_pacifico' as const,
    fontFamily: 'Pacifico_400Regular' as const,
    displayName: 'Pacifico',
  },
  {
    id: 'gf_space_mono' as const,
    fontFamily: 'SpaceMono_700Bold' as const,
    displayName: 'Space Mono',
  },
  {
    id: 'gf_bebas_neue' as const,
    fontFamily: 'BebasNeue_400Regular' as const,
    displayName: 'Bebas Neue',
  },
  {
    id: 'gf_alfa_slab' as const,
    fontFamily: 'AlfaSlabOne_400Regular' as const,
    displayName: 'Alfa Slab One',
  },
  {
    id: 'gf_lobster' as const,
    fontFamily: 'Lobster_400Regular' as const,
    displayName: 'Lobster',
  },
  {
    id: 'gf_cinzel' as const,
    fontFamily: 'Cinzel_700Bold' as const,
    displayName: 'Cinzel',
  },
  {
    id: 'gf_righteous' as const,
    fontFamily: 'Righteous_400Regular' as const,
    displayName: 'Righteous',
  },
  {
    id: 'gf_permanent_marker' as const,
    fontFamily: 'PermanentMarker_400Regular' as const,
    displayName: 'Permanent Marker',
  },
  {
    id: 'gf_orbitron' as const,
    fontFamily: 'Orbitron_700Bold' as const,
    displayName: 'Orbitron',
  },
] as const;

export type HomeHeaderGoogleFontId = (typeof HOME_HEADER_GOOGLE_FONT_OPTIONS)[number]['id'];

export type HomeHeaderTitleFontKey = HomeHeaderTitleFontId | HomeHeaderGoogleFontId;

const GOOGLE_IDS = new Set<string>(HOME_HEADER_GOOGLE_FONT_OPTIONS.map((o) => o.id));
const LEGACY_IDS = new Set<string>(HOME_HEADER_TITLE_FONT_IDS);

export function isHomeHeaderGoogleFontId(v: string): v is HomeHeaderGoogleFontId {
  return GOOGLE_IDS.has(v);
}

export function normalizeHomeHeaderTitleFontKey(raw: string | null | undefined): HomeHeaderTitleFontKey {
  const v = String(raw ?? '').trim().toLowerCase();
  if (GOOGLE_IDS.has(v)) return v as HomeHeaderGoogleFontId;
  if (LEGACY_IDS.has(v)) return v as HomeHeaderTitleFontId;
  return 'system';
}

/** @deprecated Use normalizeHomeHeaderTitleFontKey — same behavior, wider return type. */
export const normalizeHomeHeaderTitleFontId = normalizeHomeHeaderTitleFontKey;

/** Maps DB value → font picker selection (legacy presets map to closest Google font). */
export function homeHeaderTitleFontToPickerSelection(
  raw: string | null | undefined,
): 'system' | HomeHeaderGoogleFontId {
  const k = normalizeHomeHeaderTitleFontKey(raw);
  if (k === 'system') return 'system';
  if (isHomeHeaderGoogleFontId(k)) return k;
  switch (k) {
    case 'modern':
      return 'gf_inter';
    case 'serif':
      return 'gf_merriweather';
    case 'mono':
      return 'gf_roboto';
    case 'classic':
      return 'gf_playfair';
    case 'display':
      return 'gf_oswald';
    default:
      return 'gf_inter';
  }
}

export function homeHeaderTitleFontKeyToDb(key: HomeHeaderTitleFontKey | 'system'): string | null {
  return key === 'system' ? null : key;
}

/** @deprecated Use homeHeaderTitleFontKeyToDb */
export const homeHeaderTitleFontIdToDb = homeHeaderTitleFontKeyToDb;

function legacyHomeHeaderTitleFontStyle(id: HomeHeaderTitleFontId): TextStyle {
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

export function homeHeaderTitleFontStyle(raw: string | null | undefined): TextStyle {
  const k = normalizeHomeHeaderTitleFontKey(raw);
  const google = HOME_HEADER_GOOGLE_FONT_OPTIONS.find((o) => o.id === k);
  if (google) return { fontFamily: google.fontFamily };
  if ((HOME_HEADER_TITLE_FONT_IDS as readonly string[]).includes(k) && k !== 'system') {
    return legacyHomeHeaderTitleFontStyle(k as HomeHeaderTitleFontId);
  }
  return {};
}

/** Allowed when typing the custom home title (English + common punctuation). */
export function filterEnglishHomeHeaderTitle(input: string): string {
  return input.replace(/[^A-Za-z0-9 \-'.&,()]/g, '');
}
