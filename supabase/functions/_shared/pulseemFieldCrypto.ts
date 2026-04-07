/** AES-256-GCM for secrets at rest (DB). Shared by Green Invoice Edge functions. */
export const PULSEEM_ENC_PREFIX = "enc:v1:";

function b64ToBytes(b64: string): Uint8Array {
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(normalized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importAesKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64ToBytes(keyB64.trim());
  if (raw.length !== 32) {
    throw new Error(
      "PULSEEM_FIELD_ENCRYPTION_KEY must be Base64 for 32 bytes (e.g. openssl rand -base64 32)",
    );
  }
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function decryptPulseemField(stored: string, keyB64: string): Promise<string> {
  const s = String(stored ?? "").trim();
  if (!s) return "";
  if (!s.startsWith(PULSEEM_ENC_PREFIX)) return s;
  if (!String(keyB64 ?? "").trim()) {
    throw new Error(
      "Encrypted fields in DB require PULSEEM_FIELD_ENCRYPTION_KEY on the Edge Function",
    );
  }
  const key = await importAesKey(keyB64);
  const combined = b64ToBytes(s.slice(PULSEEM_ENC_PREFIX.length));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(dec);
}
