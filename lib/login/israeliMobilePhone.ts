/**
 * Israeli mobile in national format: 10 digits, prefix 05 (e.g. 0501234567).
 * Accepts common inputs: spaces, dashes, +972 / 972 international prefix.
 */
export function parseIsraeliMobileNational10(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (/^05\d{8}$/.test(d)) return d;
  if (/^9725\d{8}$/.test(d)) return `0${d.slice(3)}`;
  if (d.length === 9 && /^5\d{8}$/.test(d)) return `0${d}`;
  return null;
}

export function isIsraeliMobileNational10(raw: string): boolean {
  return parseIsraeliMobileNational10(raw) !== null;
}
