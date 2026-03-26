#!/usr/bin/env node
/**
 * One-off: encrypt plaintext pulseem_api_key / pulseem_password for a business_profile row
 * Same ciphertext format as Edge pulseemFieldCrypto.ts: enc:v1: + AES-256-GCM.
 *
 * Usage (from project root, .env with service role + encryption key):
 *   node scripts/encrypt-pulseem-row.mjs 464cb35b-0fbb-413f-91fe-1ad49addcb77
 *   node scripts/encrypt-pulseem-row.mjs <uuid> --dry-run
 *
 * Env:
 *   EXPO_PUBLIC_SUPABASE_URL or SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY
 *   PULSEEM_FIELD_ENCRYPTION_KEY — same Base64 secret as on Edge Functions (openssl rand -base64 32)
 */
import "dotenv/config";
import crypto from "node:crypto";

const ENC_PREFIX = "enc:v1:";

function b64ToBytes(b64) {
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = Buffer.from(normalized, "base64");
  return new Uint8Array(bin);
}

function bytesToB64Url(bytes) {
  const b = Buffer.from(bytes);
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function encryptPulseemField(plaintext, keyB64) {
  const pt = String(plaintext ?? "");
  if (!pt) return "";
  const raw = b64ToBytes(keyB64.trim());
  if (raw.length !== 32) {
    throw new Error(
      "PULSEEM_FIELD_ENCRYPTION_KEY must decode to 32 bytes (use: openssl rand -base64 32)",
    );
  }
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
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
  return ENC_PREFIX + bytesToB64Url(combined);
}

function needEncrypt(s) {
  const t = String(s ?? "").trim();
  if (!t) return false;
  if (t.startsWith(ENC_PREFIX)) return false;
  return true;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  const businessId = args[0]?.trim();
  if (!businessId) {
    console.error("Usage: node scripts/encrypt-pulseem-row.mjs <business_uuid> [--dry-run]");
    process.exit(1);
  }

  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(
    /\/$/,
    "",
  );
  const serviceRole =
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  const encKey = (process.env.PULSEEM_FIELD_ENCRYPTION_KEY || "").trim();

  if (!url || !serviceRole) {
    console.error("Missing EXPO_PUBLIC_SUPABASE_URL and service role key in .env");
    process.exit(1);
  }
  if (!encKey) {
    console.error("Missing PULSEEM_FIELD_ENCRYPTION_KEY in .env (same value as Supabase Edge secrets)");
    process.exit(1);
  }

  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const sel = `${url}/rest/v1/business_profile?id=eq.${businessId}&select=id,pulseem_api_key,pulseem_password,pulseem_has_api_key,pulseem_has_password`;
  const getRes = await fetch(sel, { headers: { ...headers, Accept: "application/json" } });
  if (!getRes.ok) {
    console.error("GET failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const rows = await getRes.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    console.error("No row for id:", businessId);
    process.exit(1);
  }

  const updates = {};
  if (needEncrypt(row.pulseem_api_key)) {
    updates.pulseem_api_key = await encryptPulseemField(row.pulseem_api_key, encKey);
    updates.pulseem_has_api_key = true;
    console.log("Will encrypt pulseem_api_key (plaintext length:", String(row.pulseem_api_key).length, ")");
  } else {
    console.log("pulseem_api_key: skip (empty or already enc:v1:)");
  }
  if (needEncrypt(row.pulseem_password)) {
    updates.pulseem_password = await encryptPulseemField(row.pulseem_password, encKey);
    updates.pulseem_has_password = true;
    console.log("Will encrypt pulseem_password (plaintext length:", String(row.pulseem_password).length, ")");
  } else {
    console.log("pulseem_password: skip (empty or already enc:v1:)");
  }

  if (Object.keys(updates).length === 0) {
    console.log("Nothing to update.");
    return;
  }

  if (dryRun) {
    console.log("[dry-run] PATCH payload keys:", Object.keys(updates).join(", "));
    return;
  }

  const patchUrl = `${url}/rest/v1/business_profile?id=eq.${businessId}`;
  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  if (!patchRes.ok) {
    console.error("PATCH failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }
  console.log("OK — business_profile updated for", businessId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
