/**
 * WCAG-style relative luminance + helpers so pale brand primaries
 * still get readable text/icons (on primary surfaces and on white).
 */

export function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function linearizeChannel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** 0 (black) … 1 (white) */
export function getRelativeLuminance(hex: string): number {
  const rgb = parseHexRgb(hex);
  if (!rgb) return 0;
  const R = linearizeChannel(rgb.r);
  const G = linearizeChannel(rgb.g);
  const B = linearizeChannel(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * True when the primary is so light that white foreground fails contrast
 * (pale yellow, cream, etc.).
 */
export function isLightPrimaryColor(hex: string, luminanceThreshold = 0.62): boolean {
  return getRelativeLuminance(hex) > luminanceThreshold;
}

export function getOnPrimaryForeground(primaryHex: string): string {
  return isLightPrimaryColor(primaryHex) ? '#1C1C1E' : '#FFFFFF';
}

export function getOnPrimaryForegroundMuted(primaryHex: string): string {
  return isLightPrimaryColor(primaryHex) ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.88)';
}

/** Icons / accent text on white or very light primary tints */
export function getPrimaryAsForegroundOnLightSurface(primaryHex: string, themeText: string): string {
  return isLightPrimaryColor(primaryHex) ? themeText : primaryHex;
}

export function darkenHex(hex: string, ratio: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return hex;
  const f = 1 - ratio;
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * f)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
}

/** Donut / legend segment on light card — darkened but still hue-related */
export function getPrimaryForChartSegment(primaryHex: string): string {
  if (!isLightPrimaryColor(primaryHex)) return primaryHex;
  return darkenHex(primaryHex, 0.52);
}
