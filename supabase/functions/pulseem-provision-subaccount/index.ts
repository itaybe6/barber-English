// @ts-nocheck
/**
 * Super-admin only: create a Pulseem sub-account (Direct SMS package) for an existing business_profile row.
 *
 * Auth: same as pulseem-admin-credentials — sb_secret_… or legacy JWT service_role.
 * verify_jwt is disabled at the Gateway level because this function implements
 * its own authorizeServiceRole() check. With verify_jwt:true the Gateway can
 * strip/rewrite the Authorization header, causing the in-function check to fail.
 *
 * Secrets (Supabase Dashboard → Edge Functions):
 *   - PULSEEM_MAIN_API_KEY — main Pulseem REST API key (plaintext; not the Expo Base64 trick)
 *   - PULSEEM_FIELD_ENCRYPTION_KEY — same Base64-32-byte key as other Pulseem edges
 *
 * POST JSON:
 *   { "businessId": "uuid", "subPassword"?: string, "fromNumber"?: string, "directSmsCredits"?: number (default 20),
 *     "replaceExisting"?: boolean }
 *
 * If the business already has pulseem_has_api_key and replaceExisting is not true, returns ok:false.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v5.2.3/index.ts";
import { encryptPulseemField } from "./pulseemFieldCrypto.ts";

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

function slugFromBranding(name: string | null | undefined): string {
  const raw = String(name ?? "app").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return raw || "app";
}

function randomSubPassword(): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const arr = new Uint8Array(14);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += chars[arr[i]! % chars.length];
  return s;
}

async function createPulseemSubAccount(params: {
  mainApiKey: string;
  subAccountName: string;
  accountEmail: string;
  loginUserName: string;
  loginPassword: string;
  directSmsCredits: number;
}): Promise<
  | {
    loginUserName: string;
    loginPassword: string;
    directApiKey: string;
    directSmsCredits: number;
  }
  | { error: string }
> {
  const credits = params.directSmsCredits;
  const accountEmail = params.accountEmail.trim().slice(0, 50);
  const mainApiKey = params.mainApiKey.trim();
  if (!mainApiKey) {
    return { error: "חסר מפתח Pulseem ראשי (סוד PULSEEM_MAIN_API_KEY ב-Supabase)" };
  }
  try {
    const payload = {
      SubAccountName: params.subAccountName.slice(0, 50),
      AccountEmail: accountEmail,
      LoginUserName: params.loginUserName.slice(0, 50),
      LoginPassword: params.loginPassword.slice(0, 50),
      SmsCredits: 0,
      EmailCredits: 0,
      DirectEmailCredits: 0,
      DirectSmsCredits: credits,
    };
    const url =
      `${PULSEEM_REST_BASE}/AccountsApi/AddNewSubaccountAndDirectAcount`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        APIKEY: mainApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      return { error: `Pulseem HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    let j: Record<string, unknown> = {};
    try {
      j = JSON.parse(text) as Record<string, unknown>;
    } catch { /* ignore */ }

    const status = j?.status ?? j?.Status ?? "";
    const errMsg = j?.errorMessage ?? j?.ErrorMessage ?? null;
    if (status && String(status).toLowerCase() !== "success") {
      return {
        error: `Pulseem: ${status}${errMsg ? ` — ${errMsg}` : ""}`,
      };
    }
    if (errMsg) {
      return { error: String(errMsg) };
    }

    const directApiKey: string =
      (j?.directAccountPassword as string) ??
      (j?.DirectAccountPassword as string) ??
      (j?.apiKey as string) ??
      (j?.ApiKey as string) ??
      params.loginPassword;

    const ctr = j?.creditTransferModelResult ?? j?.CreditTransferModelResult;
    const ctrObj = ctr as Record<string, unknown> | undefined;
    const ds = ctrObj?.directSms ?? ctrObj?.DirectSms;
    const dsObj = ds as Record<string, unknown> | undefined;
    const transferredCredits = dsObj?.credits ?? dsObj?.Credits;

    return {
      loginUserName: params.loginUserName,
      loginPassword: params.loginPassword,
      directApiKey,
      directSmsCredits: (typeof transferredCredits === "number"
        ? transferredCredits
        : credits),
    };
  } catch (e) {
    return { error: (e as Error)?.message ?? "createPulseemSubAccount failed" };
  }
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
      errorMessage: "חסר PULSEEM_MAIN_API_KEY ב-Supabase Secrets (מפתח REST הראשי של פולסים)",
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

  const replaceExisting = Boolean(body.replaceExisting);
  const fromNumber = String(body.fromNumber ?? "").trim();
  const subPasswordIn = String(body.subPassword ?? "").trim();
  const directSmsCredits = Math.max(
    0,
    Math.min(10_000, Number(body.directSmsCredits ?? 20) || 20),
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRole);

  const { data: row, error: fetchErr } = await admin
    .from("business_profile")
    .select(
      "id, display_name, branding_client_name, pulseem_has_api_key, pulseem_from_number",
    )
    .eq("id", businessId)
    .maybeSingle();

  if (fetchErr || !row) {
    return json({ ok: false, errorMessage: "לא נמצא עסק" });
  }

  if (row.pulseem_has_api_key && !replaceExisting) {
    return json({
      ok: false,
      errorMessage:
        "לעסק כבר מוגדר מפתח Pulseem. שלח replaceExisting:true כדי ליצור תת-חשבון חדש (יזום רק אם בטוח).",
    });
  }

  const slug = slugFromBranding(row.branding_client_name);
  const subUser = `${slug}sms`.slice(0, 20);
  const subPass = subPasswordIn || randomSubPassword();
  const accountEmail = `${slug}-pulseem@noreply.local`.slice(0, 50);
  const subName = String(row.display_name ?? slug).slice(0, 50) || slug;

  const subResult = await createPulseemSubAccount({
    mainApiKey: mainKey,
    subAccountName: subName,
    accountEmail,
    loginUserName: subUser,
    loginPassword: subPass,
    directSmsCredits,
  });

  if ("error" in subResult) {
    return json({ ok: false, errorMessage: subResult.error });
  }

  let encApi: string;
  let encPass: string;
  try {
    encApi = await encryptPulseemField(subResult.directApiKey, encKey);
    encPass = await encryptPulseemField(subResult.loginPassword, encKey);
  } catch (e) {
    console.error("[pulseem-provision-subaccount] encrypt:", e);
    return json({ ok: false, errorMessage: "הצפנה נכשלה" });
  }

  const fromFinal = fromNumber || String(row.pulseem_from_number ?? "").trim();

  const { error: updErr } = await admin
    .from("business_profile")
    .update({
      pulseem_api_key: encApi,
      pulseem_password: encPass,
      pulseem_user_id: subResult.loginUserName,
      pulseem_has_api_key: true,
      pulseem_has_password: true,
      ...(fromFinal ? { pulseem_from_number: fromFinal } : {}),
    })
    .eq("id", businessId);

  if (updErr) {
    console.error("[pulseem-provision-subaccount] update:", updErr);
    return json({ ok: false, errorMessage: "שמירה למסד נכשלה" });
  }

  const envPlaintext: Record<string, string> = {
    PULSEEM_USER_ID: subResult.loginUserName,
    PULSEEM_PASSWORD: subResult.loginPassword,
    PULSEEM_API_KEY: subResult.directApiKey,
  };
  if (fromFinal) {
    envPlaintext.PULSEEM_FROM_NUMBER = fromFinal;
  }

  return json({
    ok: true,
    loginUserName: subResult.loginUserName,
    directSmsCredits: subResult.directSmsCredits,
    envPlaintext,
  });
});
