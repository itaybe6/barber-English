// @ts-nocheck
/**
 * Admin-only: validate Green Invoice API credentials and store encrypted secret on business_profile.
 * Auth: verify_jwt=false — body must include business_id + caller_user_id; service role checks users row (admin, same tenant).
 * (App login is phone/OTP + Zustand, not Supabase Auth — no user JWT for functions.invoke.)
 * Encryption: PULSEEM_FIELD_ENCRYPTION_KEY (same as Pulseem fields).
 *
 * Green Invoice token: POST {base}/v1/account/token with JSON { id, secret }; JWT in X-Authorization-Bearer.
 * Sandbox: secret GREEN_INVOICE_USE_SANDBOX=true and/or body use_sandbox: true (app dev toggle).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptPulseemField } from "./pulseemFieldCrypto.ts";

const GREEN_LIVE_BASE = "https://api.greeninvoice.co.il/api";
const GREEN_SANDBOX_BASE = "https://sandbox.d.greeninvoice.co.il/api";

function sandboxFromEnv(): boolean {
  const v = (Deno.env.get("GREEN_INVOICE_USE_SANDBOX") ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function bodyWantsSandbox(body: Record<string, unknown>): boolean {
  const b = body["use_sandbox"];
  return b === true || b === "true" || b === 1;
}

function useSandboxEffective(body: Record<string, unknown>): boolean {
  return sandboxFromEnv() || bodyWantsSandbox(body);
}

function tokenUrl(body: Record<string, unknown>): string {
  const base = useSandboxEffective(body) ? GREEN_SANDBOX_BASE : GREEN_LIVE_BASE;
  return `${base}/v1/account/token`;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function fetchGreenInvoiceJwt(
  apiKeyId: string,
  apiSecret: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; jwt: string } | { ok: false; message: string }> {
  const id = apiKeyId.trim();
  const secret = apiSecret.trim();
  if (!id || !secret) {
    return { ok: false, message: "חסר מזהה מפתח או מפתח סודי" };
  }
  try {
    const res = await fetch(tokenUrl(body), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, secret }),
    });
    const jwt = (res.headers.get("X-Authorization-Bearer") ?? "").trim();
    if (!res.ok || !jwt) {
      let detail = `שגיאת חשבונית ירוקה (${res.status})`;
      try {
        const j = await res.json();
        const msg = j?.messages?.message;
        if (typeof msg === "object" && msg?.description) {
          detail = String(msg.description);
        }
      } catch {
        /* ignore */
      }
      return { ok: false, message: detail };
    }
    return { ok: true, jwt };
  } catch (e) {
    return {
      ok: false,
      message: (e as Error)?.message ?? "בדיקת התחברות נכשלה",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const businessIdRaw = String(body.business_id ?? "").trim();
  const callerUserId = String(body.caller_user_id ?? "").trim();
  if (!businessIdRaw || !callerUserId) {
    return json({ ok: false, error: "missing_caller_context" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encKey = (Deno.env.get("PULSEEM_FIELD_ENCRYPTION_KEY") ?? "").trim();

  const admin = createClient(supabaseUrl, serviceRole);
  const { data: urow, error: selErr } = await admin
    .from("users")
    .select("business_id, user_type")
    .eq("id", callerUserId)
    .maybeSingle();

  if (selErr || !urow?.business_id) {
    return json({ ok: false, error: "user_not_found" }, 403);
  }
  if (String(urow.business_id).trim() !== businessIdRaw) {
    return json({ ok: false, error: "forbidden_wrong_business" }, 403);
  }
  const role = String(urow.user_type ?? "");
  if (role !== "admin" && role !== "super_admin") {
    return json({ ok: false, error: "forbidden_not_admin" }, 403);
  }

  const businessId = businessIdRaw;

  const action = String(body.action ?? "");

  if (action === "verify") {
    const apiKeyId = String(body.api_key_id ?? "").trim();
    const apiSecret = String(body.api_secret ?? "").trim();
    if (!apiKeyId || !apiSecret) {
      return json({ ok: false, error: "missing_credentials" }, 400);
    }
    const gi = await fetchGreenInvoiceJwt(apiKeyId, apiSecret, body);
    if (!gi.ok) {
      return json({ ok: false, error: "greeninvoice_auth_failed", message: gi.message }, 400);
    }
    return json({ ok: true });
  }

  if (action === "disconnect") {
    const { error: updErr } = await admin
      .from("business_profile")
      .update({
        greeninvoice_api_key_id: null,
        greeninvoice_api_secret: null,
        greeninvoice_has_credentials: false,
      })
      .eq("id", businessId);

    if (updErr) {
      console.error("[greeninvoice-connect] disconnect:", updErr);
      return json({ ok: false, error: "update_failed" }, 500);
    }
    return json({ ok: true });
  }

  if (action !== "connect") {
    return json({ ok: false, error: "unknown_action" }, 400);
  }

  if (!encKey) {
    return json({ ok: false, error: "missing_encryption_key" }, 500);
  }

  const apiKeyId = String(body.api_key_id ?? "").trim();
  const apiSecret = String(body.api_secret ?? "").trim();
  if (!apiKeyId || !apiSecret) {
    return json({ ok: false, error: "missing_credentials" }, 400);
  }

  const gi = await fetchGreenInvoiceJwt(apiKeyId, apiSecret, body);
  if (!gi.ok) {
    return json({ ok: false, error: "greeninvoice_auth_failed", message: gi.message }, 400);
  }

  let encSecret: string;
  try {
    encSecret = await encryptPulseemField(apiSecret, encKey);
  } catch (e) {
    console.error("[greeninvoice-connect] encrypt:", e);
    return json({ ok: false, error: "encrypt_failed" }, 500);
  }

  const { error: updErr } = await admin
    .from("business_profile")
    .update({
      greeninvoice_api_key_id: apiKeyId,
      greeninvoice_api_secret: encSecret,
      greeninvoice_has_credentials: true,
    })
    .eq("id", businessId);

  if (updErr) {
    console.error("[greeninvoice-connect] update:", updErr);
    return json({ ok: false, error: "update_failed" }, 500);
  }

  return json({ ok: true });
});
