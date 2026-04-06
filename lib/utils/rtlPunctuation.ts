/**
 * BiDi helpers for Hebrew/Arabic UI strings next to Latin or neutral punctuation.
 * U+200F RLM — binds ':' to the RTL label; U+200E LRM — starts LTR for Latin names.
 */

export function bidiLabelColon(label: string, value: string): string {
  const v = String(value).trim();
  const hasLatin = /[A-Za-z]/.test(v);
  if (hasLatin) {
    return `${label}\u200F:\u200E${v}`;
  }
  return `${label}\u200F: ${v}`;
}

/** RTL label line only: colon binds to the Hebrew/Arabic label (U+200F RLM before ':'). */
export function bidiRtlLabelWithColon(label: string): string {
  return `${String(label).trim()}\u200F:`;
}

/** In RTL UI, lead Latin-heavy values with LTR mark so English service names render correctly. */
export function bidiIsolateLtrValue(value: string): string {
  const v = String(value).trim();
  if (!v) return v;
  return /[A-Za-z]/.test(v) ? `\u200E${v}` : v;
}
