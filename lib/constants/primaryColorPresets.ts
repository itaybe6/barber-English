/** Curated primary colors for admin “flower” picker — hex saved to `business_profile.primary_color`. */
export interface PrimaryColorPreset {
  hex: string;
  gradient: { start: string; end: string };
}

function lightenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * ratio));
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}

function preset(hex: string, lighten = 0.38): PrimaryColorPreset {
  return { hex, gradient: { start: hex, end: lightenHex(hex, lighten) } };
}

/** Thirteen main presets — gradients power the Flower UI; `hex` is persisted. */
export const PRIMARY_COLOR_PRESETS: PrimaryColorPreset[] = [
  preset('#1E3A8A'),
  preset('#2563EB'),
  preset('#0891B2'),
  preset('#0D9488'),
  preset('#059669'),
  preset('#16A34A'),
  preset('#CA8A04'),
  preset('#EA580C'),
  preset('#DC2626'),
  preset('#BE185D'),
  preset('#7C3AED'),
  preset('#581C87'),
  preset('#1F2937'),
];

export const PRIMARY_PRESET_GRADIENTS = PRIMARY_COLOR_PRESETS.map((p) => p.gradient);

/** Larger grid for “custom” palette modal (no categories). */
export const EXTENDED_PRIMARY_COLOR_GRID: string[] = [
  '#000000',
  '#1F2937',
  '#374151',
  '#57534E',
  '#78716C',
  '#991B1B',
  '#DC2626',
  '#EA580C',
  '#D97706',
  '#CA8A04',
  '#65A30D',
  '#16A34A',
  '#059669',
  '#0D9488',
  '#0891B2',
  '#0284C7',
  '#2563EB',
  '#1D4ED8',
  '#1E40AF',
  '#1E3A8A',
  '#4F46E5',
  '#5B21B6',
  '#6D28D9',
  '#7C3AED',
  '#6B21A8',
  '#581C87',
  '#86198F',
  '#A21CAF',
  '#BE185D',
  '#DB2777',
  '#EC4899',
  '#F43F5E',
  '#E11D48',
  '#0F766E',
  '#155E75',
  '#1E3A8A',
  '#312E81',
  '#4C1D95',
  '#831843',
  '#9D174D',
  '#B45309',
  '#92400E',
  '#713F12',
  '#3F6212',
  '#14532D',
  '#134E4A',
];
