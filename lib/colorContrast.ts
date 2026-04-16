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

export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const fg = getRelativeLuminance(foregroundHex);
  const bg = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * True when the primary is so light that white foreground fails contrast
 * (pale yellow, cream, etc.).
 */
export function isLightPrimaryColor(hex: string, luminanceThreshold = 0.62): boolean {
  return getRelativeLuminance(hex) > luminanceThreshold;
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return `rgba(28,28,30,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function darkenPrimaryUntilContrast(
  primaryHex: string,
  backgroundHex: string,
  minimumContrast = 4.5
): string {
  for (let ratio = 0.18; ratio <= 0.9; ratio += 0.04) {
    const candidate = darkenHex(primaryHex, ratio);
    if (getContrastRatio(candidate, backgroundHex) >= minimumContrast) {
      return candidate;
    }
  }
  return '#1C1C1E';
}

export function getOnPrimaryForeground(primaryHex: string): string {
  if (!isLightPrimaryColor(primaryHex)) return '#FFFFFF';
  return darkenPrimaryUntilContrast(primaryHex, primaryHex, 4.5);
}

export function getOnPrimaryForegroundMuted(primaryHex: string): string {
  if (!isLightPrimaryColor(primaryHex)) return 'rgba(255,255,255,0.88)';
  return hexToRgba(getOnPrimaryForeground(primaryHex), 0.74);
}

/** Icons / accent text on white or very light primary tints */
export function getPrimaryAsForegroundOnLightSurface(primaryHex: string, themeText: string): string {
  if (!isLightPrimaryColor(primaryHex)) return primaryHex;
  const candidate = darkenPrimaryUntilContrast(primaryHex, '#FFFFFF', 4.5);
  return getContrastRatio(candidate, '#FFFFFF') >= 4.5 ? candidate : themeText;
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

/** Mix toward white — `ratio` 0 unchanged, 1 → white */
export function lightenHex(hex: string, ratio: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return hex;
  const mix = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n + (255 - n) * ratio)))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(rgb.r)}${mix(rgb.g)}${mix(rgb.b)}`;
}

/** Donut / legend segment on light card — darkened but still hue-related */
export function getPrimaryForChartSegment(primaryHex: string): string {
  if (!isLightPrimaryColor(primaryHex)) return primaryHex;
  return darkenHex(primaryHex, 0.52);
}
