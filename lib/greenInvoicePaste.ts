/**
 * Parse pasted Green Invoice credentials (from Morning UI after creating an API key).
 * Supports: two lines (id then secret), tab-separated, or "מזהה: / סוד:" prefixes.
 */
export function parseGreenInvoiceCredentialPaste(raw: string): { apiKeyId: string; apiSecret: string } | null {
  const text = raw.replace(/\uFEFF/g, '').trim();
  if (!text) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const stripLabel = (line: string, re: RegExp) => (re.test(line) ? line.replace(re, '').trim() : line);

  if (lines.length >= 2) {
    let id = stripLabel(lines[0]!, /^(מזהה|מזהה מפתח|api\s*key\s*id|id|key\s*id)\s*[:：]\s*/i);
    let secret = stripLabel(lines[1]!, /^(סוד|מפתח סודי|secret)\s*[:：]\s*/i);
    if (id && secret) return { apiKeyId: id, apiSecret: secret };
  }

  const tabParts = text.split('\t').map((s) => s.trim()).filter(Boolean);
  if (tabParts.length >= 2) {
    return { apiKeyId: tabParts[0]!, apiSecret: tabParts[1]! };
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidLine = lines.find((l) => uuidRe.test(l));
  if (uuidLine) {
    const other = lines.find((l) => l !== uuidLine && l.length >= 16);
    if (other) return { apiKeyId: uuidLine, apiSecret: other };
  }

  return null;
}
