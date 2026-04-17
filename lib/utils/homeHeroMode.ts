export type HomeHeroMode = 'marquee' | 'single_fullbleed';

export function normalizeHomeHeroMode(value: unknown): HomeHeroMode {
  return value === 'single_fullbleed' ? 'single_fullbleed' : 'marquee';
}

export type HomeHeroSingleKind = 'image' | 'video';

export function normalizeHomeHeroSingleKind(value: unknown): HomeHeroSingleKind | null {
  if (value === 'video') return 'video';
  if (value === 'image') return 'image';
  return null;
}

export function inferHomeHeroSingleKindFromUrl(url: string): HomeHeroSingleKind {
  const base = url.split('?')[0].toLowerCase();
  if (/\.(mp4|m4v|mov|webm|mkv|3gp)$/.test(base)) return 'video';
  return 'image';
}
