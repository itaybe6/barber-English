/** AES-256-GCM for Pulseem secrets at rest (DB). Duplicate lives in auth-phone-otp/ — keep in sync. */
export const PULSEEM_ENC_PREFIX = "enc:v1:";

function b64ToBytes(b64: string): Uint8Array {
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(normalized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

export async function encryptPulseemField(plaintext: string, keyB64: string): Promise<string> {
  const pt = String(plaintext ?? "");
  if (!pt) return "";
  const key = await importAesKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(pt),
    ),
  );
  const combined = new Uint8Array(iv.length + enc.length);
  combined.set(iv, 0);
  combined.set(enc, iv.length);
  return PULSEEM_ENC_PREFIX + bytesToB64Url(combined);
}

export async function decryptPulseemField(stored: string, keyB64: string): Promise<string> {
  const s = String(stored ?? "").trim();
  if (!s) return "";
  if (!s.startsWith(PULSEEM_ENC_PREFIX)) return s;
  if (!String(keyB64 ?? "").trim()) {
    throw new Error(
      "Encrypted Pulseem fields in DB require PULSEEM_FIELD_ENCRYPTION_KEY on the Edge Function",
    );
  }
  const key = await importAesKey(keyB64);
  const combined = b64ToBytes(s.slice(PULSEEM_ENC_PREFIX.length));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(dec);
}
