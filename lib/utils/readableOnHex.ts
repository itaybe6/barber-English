/** Returns high-contrast text/icon color (#FFFFFF or #1C1C1E) for a hex background. */
export function readableOnHex(hex: string): '#FFFFFF' | '#1C1C1E' {
  const c = hex.replace('#', '').trim();
  const full = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c;
  if (full.length !== 6) return '#1C1C1E';
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.52 ? '#1C1C1E' : '#FFFFFF';
}
