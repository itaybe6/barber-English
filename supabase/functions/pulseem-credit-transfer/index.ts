// @ts-nocheck
/**
 * Super-admin only: POST Pulseem `AccountsApi/CreditTransfer` — load credits onto an existing Direct (sub) account.
 *
 * Per OpenAPI `CreditTransferModel` (api.pulseem.com/swagger/v1/swagger.json):
 * - Request header `APIKEY`: company main REST key (`PULSEEM_MAIN_API_KEY` secret).
 * - JSON body uses lowercase `apikey` for the **target** Direct account API key (stored encrypted on business_profile).
 * - Optional integer fields: emailCredits, smsCredits, directEmailCredits, directSmsCredits.
 *
 * Auth: same as pulseem-provision-subaccount (service_role JWT or sb_secret).
 * verify_jwt must stay false (custom Bearer check).
 *
 * POST JSON:
 *   { "businessId": "uuid",
 *     "directSmsCredits"?: number (default 0),
 *     "emailCredits"?: number, "smsCredits"?: number, "directEmailCredits"?: number }
 * At least one credit field must be > 0.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v5.2.3/index.ts";
import { decryptPulseemField } from "./pulseemFieldCrypto.ts";

const PULSEEM_REST_BASE = "https://api.pulseem.com/api/v1";

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

function bearerFromRequest(req: Request): string {
  return (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

async function authorizeServiceRole(req: Request): Promise<boolean> {
  const auth = bearerFromRequest(req);
  if (!auth) return false;

  const expected = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (expected && auth === expected) return true;

  const jwtSecret = (Deno.env.get("SUPABASE_JWT_SECRET") ?? "").trim();
  if (!jwtSecret || !auth.startsWith("eyJ")) return false;

  try {
    const { payload } = await jwtVerify(
      auth,
      new TextEncoder().encode(jwtSecret),
      { algorithms: ["HS256"] },
    );
    return String(payload.role ?? "") === "service_role";
  } catch {
    return false;
  }
}

function clampInt(n: unknown, fallback: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : fallback;
  return Math.max(0, Math.min(max, v));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!(await authorizeServiceRole(req))) {
    return json({ error: "unauthorized" }, 401);
  }

  const encKey = (Deno.env.get("PULSEEM_FIELD_ENCRYPTION_KEY") ?? "").trim();
  if (!encKey) {
    return json({
      ok: false,
      errorMessage: "חסר PULSEEM_FIELD_ENCRYPTION_KEY ב-Supabase Secrets",
    });
  }

  const mainKey = (Deno.env.get("PULSEEM_MAIN_API_KEY") ?? "").trim();
  if (!mainKey) {
    return json({
      ok: false,
      errorMessage: "חסר PULSEEM_MAIN_API_KEY ב-Supabase Secrets",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const businessId = String(body.businessId ?? "").trim();
  if (!businessId) {
    return json({ ok: false, errorMessage: "חסר מזהה עסק" });
  }

  const emailCredits = clampInt(body.emailCredits, 0, 1_000_000);
  const smsCredits = clampInt(body.smsCredits, 0, 1_000_000);
  const directEmailCredits = clampInt(body.directEmailCredits, 0, 1_000_000);
  const directSmsCredits = clampInt(body.directSmsCredits, 0, 1_000_000);

  if (
    emailCredits + smsCredits + directEmailCredits + directSmsCredits <= 0
  ) {
    return json({
      ok: false,
      errorMessage: "יש לציין לפחות סוג קרדיט אחד עם כמות חיובית",
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRole);

  const { data: row, error: fetchErr } = await admin
    .from("business_profile")
    .select("id, pulseem_api_key, pulseem_has_api_key")
    .eq("id", businessId)
    .maybeSingle();

  if (fetchErr || !row) {
    return json({ ok: false, errorMessage: "לא נמצא עסק" });
  }
  if (!row.pulseem_has_api_key) {
    return json({
      ok: false,
      errorMessage: "לעסק אין מפתח API Pulseem (Direct) — צור תת-חשבון קודם",
    });
  }

  let targetApiKey: string;
  try {
    targetApiKey = await decryptPulseemField(
      String(row.pulseem_api_key ?? "").trim(),
      encKey,
    );
  } catch (e) {
    console.error("[pulseem-credit-transfer] decrypt:", e);
    return json({ ok: false, errorMessage: "פענוח מפתח Pulseem מהמסד נכשל" });
  }
  targetApiKey = targetApiKey.trim();
  if (!targetApiKey) {
    return json({
      ok: false,
      errorMessage: "מפתח API Direct ריק אחרי פענוח",
    });
  }

  /** Matches CreditTransferModel in Pulseem swagger (lowercase `apikey`). */
  const pulseBody = {
    apikey: targetApiKey,
    emailCredits,
    smsCredits,
    directEmailCredits,
    directSmsCredits,
  };

  const url = `${PULSEEM_REST_BASE}/AccountsApi/CreditTransfer`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        APIKEY: mainKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(pulseBody),
    });
  } catch (e) {
    console.error("[pulseem-credit-transfer] fetch:", e);
    return json({
      ok: false,
      errorMessage: (e as Error)?.message ?? "קריאה ל-Pulseem נכשלה",
    });
  }

  const text = await res.text();
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    return json({
      ok: false,
      errorMessage: `Pulseem HTTP ${res.status}: ${text.slice(0, 300)}`,
      pulseemRaw: text.slice(0, 500),
    });
  }

  const status = j?.status ?? j?.Status ?? "";
  const errMsg =
    j?.error ?? j?.Error ?? j?.errorMessage ?? j?.ErrorMessage ?? null;

  if (status && String(status).toLowerCase() !== "success") {
    return json({
      ok: false,
      errorMessage: `Pulseem: ${status}${errMsg ? ` — ${errMsg}` : ""}`,
    });
  }
  if (errMsg) {
    return json({ ok: false, errorMessage: String(errMsg) });
  }

  const ctr = j?.creditTransferModelResult ?? j?.CreditTransferModelResult;
  const ctrObj = ctr as Record<string, unknown> | undefined;
  const pickCredits = (a?: string, b?: string) => {
    const o = (ctrObj?.[a!] ?? ctrObj?.[b!]) as Record<string, unknown> | undefined;
    const c = o?.credits ?? o?.Credits;
    return typeof c === "number" ? c : undefined;
  };

  return json({
    ok: true,
    directSmsCreditsAfter: pickCredits("directSms", "DirectSms"),
    smsCreditsAfter: pickCredits("smsCredits", "SmsCredits"),
    emailCreditsAfter: pickCredits("emailCredits", "EmailCredits"),
    directEmailCreditsAfter: pickCredits("directEmail", "DirectEmail"),
    creditTransferModelResult: ctr ?? null,
  });
});
