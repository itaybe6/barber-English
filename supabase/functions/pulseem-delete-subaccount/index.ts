// @ts-nocheck
/**
 * Super-admin: best-effort removal of Pulseem Direct sub-account before deleting business_profile.
 * Public swagger has no documented delete; we mirror AddNewSubaccountAndDirectAcount naming and
 * CreditTransfer-style body `{ apikey }`. Override path via PULSEEM_DELETE_SUBACCOUNT_PATH if Pulseem
 * documents a different route.
 *
 * Auth: service_role (same as pulseem-credit-transfer). verify_jwt = false.
 *
 * POST JSON: { "businessId": "uuid" }
 *
 * Response:
 *   { ok: true, skipped: true, reason } — no Direct key or no main key (DB delete may proceed)
 *   { ok: true, deleted: true, usedPath, attempt } — Pulseem accepted
 *   { ok: false, errorMessage, lastStatus?, lastBodyPreview? } — all attempts failed (caller may still delete DB)
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

  const jwtSecret = (
    Deno.env.get("SUPABASE_JWT_SECRET") ??
    Deno.env.get("JWT_SECRET") ??
    ""
  ).trim();
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

function pulseemResponseLooksSuccess(
  j: Record<string, unknown>,
  httpOk: boolean,
  rawText: string,
): boolean {
  if (!httpOk) return false;
  const trimmed = rawText.trim();
  if (!trimmed) return true;
  const errMsg = j?.errorMessage ?? j?.ErrorMessage ?? j?.error ?? j?.Error ?? null;
  if (errMsg && String(errMsg).trim()) return false;
  const succ = j?.success ?? j?.Success;
  if (succ === 0 || succ === false || String(succ).toLowerCase() === "false") {
    return false;
  }
  if (succ === 1 || succ === true || String(succ).toLowerCase() === "true") {
    return true;
  }
  const status = j?.status ?? j?.Status ?? "";
  if (status && String(status).toLowerCase() !== "success") return false;
  return true;
}

function parsePulseemJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
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
      ok: true,
      skipped: true,
      reason: "no_PULSEEM_MAIN_API_KEY",
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRole);

  const { data: row, error: fetchErr } = await admin
    .from("business_profile")
    .select(
      "id, display_name, pulseem_api_key, pulseem_has_api_key, pulseem_user_id, pulseem_password, pulseem_has_password",
    )
    .eq("id", businessId)
    .maybeSingle();

  if (fetchErr || !row) {
    return json({ ok: false, errorMessage: "לא נמצא עסק" });
  }

  if (!row.pulseem_has_api_key) {
    return json({
      ok: true,
      skipped: true,
      reason: "no_pulseem_direct_api_key",
    });
  }

  let directApiKey: string;
  try {
    directApiKey = await decryptPulseemField(
      String(row.pulseem_api_key ?? "").trim(),
      encKey,
    );
  } catch (e) {
    console.error("[pulseem-delete-subaccount] decrypt api key:", e);
    return json({
      ok: false,
      errorMessage: "פענוח מפתח Pulseem Direct מהמסד נכשל",
    });
  }
  directApiKey = directApiKey.trim();
  if (!directApiKey) {
    return json({
      ok: false,
      errorMessage: "מפתח API Direct ריק אחרי פענוח",
    });
  }

  const subName = String(row.display_name ?? "").trim().slice(0, 50);
  const loginUser = String(row.pulseem_user_id ?? "").trim();

  let loginPass = "";
  if (row.pulseem_has_password && row.pulseem_password) {
    try {
      loginPass = (
        await decryptPulseemField(String(row.pulseem_password).trim(), encKey)
      ).trim();
    } catch (e) {
      console.warn("[pulseem-delete-subaccount] decrypt password skipped:", e);
    }
  }

  const envPath = (Deno.env.get("PULSEEM_DELETE_SUBACCOUNT_PATH") ?? "")
    .trim()
    .replace(/^\/+/, "");

  const defaultPaths = [
    "AccountsApi/RemoveSubaccountAndDirectAcount",
    "AccountsApi/DeleteSubaccountAndDirectAcount",
    "AccountsApi/RemoveSubaccountAndDirectAccount",
  ];
  const paths = envPath ? [envPath] : defaultPaths;

  type Attempt = { label: string; relPath: string; jsonBody: Record<string, unknown> };
  const attempts: Attempt[] = [];

  for (const relPath of paths) {
    attempts.push({
      label: "apikey_lowercase",
      relPath,
      jsonBody: { apikey: directApiKey },
    });
    attempts.push({
      label: "ApiKey_pascal",
      relPath,
      jsonBody: { ApiKey: directApiKey },
    });
    if (subName) {
      attempts.push({
        label: "SubAccountName",
        relPath,
        jsonBody: { SubAccountName: subName },
      });
      attempts.push({
        label: "subAccountName",
        relPath,
        jsonBody: { subAccountName: subName },
      });
    }
    if (loginUser && loginPass) {
      attempts.push({
        label: "login_credentials",
        relPath,
        jsonBody: {
          LoginUserName: loginUser.slice(0, 50),
          LoginPassword: loginPass.slice(0, 50),
        },
      });
    }
  }

  let lastStatus = 0;
  let lastPreview = "";
  let attemptIdx = 0;

  for (const a of attempts) {
    attemptIdx++;
    const url = `${PULSEEM_REST_BASE}/${a.relPath}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          APIKEY: mainKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(a.jsonBody),
      });
    } catch (e) {
      console.error("[pulseem-delete-subaccount] fetch:", e);
      lastPreview = (e as Error)?.message ?? "fetch_failed";
      continue;
    }

    const text = await res.text();
    lastStatus = res.status;
    lastPreview = text.slice(0, 400);

    if (res.status === 404) {
      console.log(
        "[pulseem-delete-subaccount] 404 skip",
        a.relPath,
        a.label,
      );
      continue;
    }

    const j = parsePulseemJson(text);
    if (pulseemResponseLooksSuccess(j, res.ok, text)) {
      console.log(
        "[pulseem-delete-subaccount] success",
        a.relPath,
        a.label,
      );
      return json({
        ok: true,
        deleted: true,
        usedPath: a.relPath,
        attempt: attemptIdx,
        attemptLabel: a.label,
      });
    }

    console.warn(
      "[pulseem-delete-subaccount] reject",
      a.relPath,
      a.label,
      res.status,
      lastPreview.replace(/\s+/g, " ").slice(0, 200),
    );
  }

  return json({
    ok: false,
    errorMessage:
      "לא נמצאה בקשה מקובלת ב-Pulseem למחיקת תת-חשבון. ודא עם תמיכת פולסים את נתיב ה-API או הגדר PULSEEM_DELETE_SUBACCOUNT_PATH.",
    lastStatus,
    lastBodyPreview: lastPreview.slice(0, 500),
  });
});
