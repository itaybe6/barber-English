// @ts-nocheck
/**
 * Super-admin only: encrypt/decrypt Pulseem secrets for business_profile.
 * Auth: Bearer = Secret API key (sb_secret_…) or legacy JWT service_role.
 * Secret: PULSEEM_FIELD_ENCRYPTION_KEY — Base64 of 32 bytes (openssl rand -base64 32).
 *
 * verify_jwt is disabled at the Gateway level; auth is done here.
 *
 * Bearer is accepted if it equals SUPABASE_SERVICE_ROLE_KEY (new sb_secret_… format)
 * OR if it is a legacy JWT with role service_role, verified with JWT signing secret:
 *   - SUPABASE_JWT_SECRET (if present in runtime), or
 *   - JWT_SECRET — use this name in Dashboard → Edge Functions → Secrets (UI forbids SUPABASE_* for manual secrets).
 *   Value = Project Settings → API → JWT Secret (same as legacy key verification).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v5.2.3/index.ts";
import {
  decryptPulseemField,
  encryptPulseemField,
} from "./pulseemFieldCrypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PULSEEM_ASMX =
  "https://www.pulseem.co.il/Pulseem/pulseemsendservices.asmx";

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

/** Token shape for logs only — never log full secrets or JWTs. */
function bearerShape(token: string): "empty" | "jwt_eyJ" | "sb_secret" | "other" {
  if (!token) return "empty";
  if (token.startsWith("eyJ")) return "jwt_eyJ";
  if (token.startsWith("sb_secret_")) return "sb_secret";
  return "other";
}

/** Dashboard blocks manual secrets named SUPABASE_*; use JWT_SECRET with API JWT Secret value. */
function jwtSigningSecretForVerify(): string {
  return (
    Deno.env.get("SUPABASE_JWT_SECRET") ??
    Deno.env.get("JWT_SECRET") ??
    ""
  ).trim();
}

/**
 * New secret key (sb_secret_…) or legacy JWT service_role from the same project.
 * On failure, logs safe diagnostics to Supabase Functions logs (Dashboard → Logs).
 */
async function authorizeServiceRole(req: Request): Promise<boolean> {
  const hasAuthHeader = !!(req.headers.get("Authorization") ?? "").trim();
  const apikey = (req.headers.get("apikey") ?? "").trim();
  const auth = bearerFromRequest(req);

  if (!auth) {
    console.error("[pulseem-admin-credentials] auth_fail", {
      step: "missing_or_empty_bearer",
      hasAuthorizationHeader: hasAuthHeader,
      apikeyHeaderLength: apikey.length,
    });
    return false;
  }

  const expected = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const jwtSecret = jwtSigningSecretForVerify();

  if (!expected) {
    console.error("[pulseem-admin-credentials] auth_fail", {
      step: "edge_env",
      problem: "SUPABASE_SERVICE_ROLE_KEY is empty in Edge runtime — check Supabase auto-secrets / project link",
      bearerShape: bearerShape(auth),
      bearerLength: auth.length,
    });
    return false;
  }

  if (auth === expected) {
    return true;
  }

  // Client token differs from Edge's service role: try JWT path (legacy eyJ… service_role)
  if (!auth.startsWith("eyJ")) {
    console.error("[pulseem-admin-credentials] auth_fail", {
      step: "secret_compare",
      problem:
        "Bearer !== Edge SUPABASE_SERVICE_ROLE_KEY and token does not start with eyJ (not a legacy JWT). App must send the same service_role secret/JWT as this project's API settings.",
      bearerShape: bearerShape(auth),
      bearerLength: auth.length,
      edgeSecretLength: expected.length,
      apikeyLength: apikey.length,
      apikeySameLengthAsBearer: apikey.length === auth.length,
      hint:
        "EXPO_PUBLIC_* in Dashboard Secrets is for Expo only. For JWT verify add Edge secret JWT_SECRET (JWT Secret from Settings → API); manual names cannot start with SUPABASE_.",
    });
    return false;
  }

  if (!jwtSecret) {
    console.error("[pulseem-admin-credentials] auth_fail", {
      step: "jwt_path",
      problem:
        "Client sent JWT (eyJ…) but no JWT signing secret in Edge. Add Edge Function secret named JWT_SECRET (value = Settings → API → JWT Secret). Dashboard disallows SUPABASE_JWT_SECRET as manual name. Or use sb_secret service_role in app to match Edge SUPABASE_SERVICE_ROLE_KEY.",
      bearerLength: auth.length,
      edgeSecretLength: expected.length,
    });
    return false;
  }

  try {
    const { payload } = await jwtVerify(
      auth,
      new TextEncoder().encode(jwtSecret),
      { algorithms: ["HS256"] },
    );
    const role = String(payload.role ?? "");
    if (role === "service_role") {
      return true;
    }
    console.error("[pulseem-admin-credentials] auth_fail", {
      step: "jwt_role",
      problem: "JWT signature OK but role is not service_role (often anon key sent by mistake)",
      role,
      iss: payload.iss,
    });
    return false;
  } catch (e) {
    console.error("[pulseem-admin-credentials] auth_fail", {
      step: "jwt_verify",
      problem: "jwtVerify threw — wrong JWT secret, expired token, or malformed JWT",
      errorMessage: (e as Error)?.message ?? String(e),
      bearerLength: auth.length,
    });
    return false;
  }
}

async function testPulseemCredits(userId: string, password: string): Promise<
  | { ok: true; credits: string }
  | { ok: false; message: string }
> {
  const uid = userId.trim();
  const pw = password.trim();
  if (!uid || !pw) {
    return { ok: false, message: "יש להזין מזהה משתמש וסיסמה" };
  }
  try {
    const url =
      `${PULSEEM_ASMX}/GetSMScreditsLeft?userID=${encodeURIComponent(uid)}&password=${encodeURIComponent(pw)}`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `שגיאת רשת (${res.status})` };
    }
    const fault = text.match(/<faultstring[^>]*>([^<]+)</i);
    if (fault) return { ok: false, message: fault[1]!.trim() };
    const dec = text.match(/<decimal[^>]*>([^<]*)</i);
    if (dec) return { ok: true, credits: dec[1]!.trim() };
    return { ok: false, message: "תגובה לא צפויה מפולסים" };
  } catch (e) {
    return { ok: false, message: (e as Error)?.message ?? "בדיקה נכשלה" };
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
    console.error("[pulseem-admin-credentials] config_fail", {
      step: "after_auth",
      problem: "PULSEEM_FIELD_ENCRYPTION_KEY missing or empty in Edge secrets",
    });
    return json({ error: "missing_pulseem_encryption_key" }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRole);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(body.action ?? "");

  if (action === "encrypt_for_insert") {
    const apiKey = String(body.pulseem_api_key ?? "").trim();
    const password = String(body.pulseem_password ?? "").trim();
    const out: Record<string, string | null> = {};
    if (apiKey) out.pulseem_api_key = await encryptPulseemField(apiKey, encKey);
    if (password) {
      out.pulseem_password = await encryptPulseemField(password, encKey);
    }
    return json(out);
  }

  if (action === "save_credentials") {
    const businessId = String(body.businessId ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    const fromNum = String(body.fromNumber ?? "").trim();
    const newPass = String(body.password ?? "").trim();
    if (!businessId) {
      return json({ ok: false, errorMessage: "חסר מזהה עסק" });
    }
    if (!userId) {
      return json({ ok: false, errorMessage: "חסר מזהה משתמש פולסים" });
    }
    if (!fromNum) {
      return json({
        ok: false,
        errorMessage: "חסר מספר שולח (מאיזה מספר נשלח ה-SMS)",
      });
    }

    const { data: row, error: fetchErr } = await admin
      .from("business_profile")
      .select("pulseem_password, pulseem_api_key, branding_client_name")
      .eq("id", businessId)
      .maybeSingle();

    if (fetchErr || !row) {
      return json({ ok: false, errorMessage: "לא נמצא עסק" });
    }

    let existingPass = "";
    try {
      existingPass = await decryptPulseemField(
        String(row.pulseem_password ?? "").trim(),
        encKey,
      );
    } catch (e) {
      console.error("[pulseem-admin-credentials] decrypt existing password:", e);
      return json({ ok: false, errorMessage: "פענוח סיסמה שמורה נכשל" });
    }

    let existingApiPlain = "";
    try {
      existingApiPlain = await decryptPulseemField(
        String(row.pulseem_api_key ?? "").trim(),
        encKey,
      );
    } catch (e) {
      console.error("[pulseem-admin-credentials] decrypt api key:", e);
      return json({ ok: false, errorMessage: "פענוח מפתח API שמור נכשל" });
    }

    const finalPassword = newPass || existingPass;
    if (!finalPassword) {
      return json({
        ok: false,
        errorMessage:
          "נדרשת סיסמת API (או השאר ריק אם כבר נשמרה)",
      });
    }

    let passEnc: string;
    let apiEnc: string | null = null;
    try {
      passEnc = await encryptPulseemField(finalPassword, encKey);
      if (existingApiPlain) {
        apiEnc = await encryptPulseemField(existingApiPlain, encKey);
      }
    } catch (e) {
      console.error("[pulseem-admin-credentials] encrypt:", e);
      return json({ ok: false, errorMessage: "הצפנה נכשלה" });
    }

    const { error: updErr } = await admin
      .from("business_profile")
      .update({
        pulseem_user_id: userId,
        pulseem_from_number: fromNum,
        pulseem_password: passEnc,
        pulseem_has_password: true,
        ...(apiEnc ? { pulseem_api_key: apiEnc, pulseem_has_api_key: true } : {}),
      })
      .eq("id", businessId);

    if (updErr) {
      console.error("[pulseem-admin-credentials] update:", updErr);
      return json({ ok: false, errorMessage: "שמירה למסד נכשלה" });
    }

    const envPlaintext: Record<string, string> = {
      PULSEEM_USER_ID: userId,
      PULSEEM_PASSWORD: finalPassword,
      PULSEEM_FROM_NUMBER: fromNum,
    };
    if (existingApiPlain) {
      envPlaintext.PULSEEM_API_KEY = existingApiPlain;
    }

    return json({ ok: true, envPlaintext });
  }

  if (action === "test_connection") {
    const businessId = String(body.businessId ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    const passwordOverride = String(body.password ?? "").trim();
    if (!businessId) {
      return json({ ok: false, message: "חסר מזהה עסק" });
    }
    if (!userId) {
      return json({ ok: false, message: "חסר מזהה משתמש" });
    }

    let password = passwordOverride;
    if (!password) {
      const { data: row } = await admin
        .from("business_profile")
        .select("pulseem_password")
        .eq("id", businessId)
        .maybeSingle();
      try {
        password = await decryptPulseemField(
          String(row?.pulseem_password ?? "").trim(),
          encKey,
        );
      } catch (e) {
        console.error("[pulseem-admin-credentials] test decrypt:", e);
        return json({ ok: false, message: "לא ניתן לפענח סיסמה מהמסד" });
      }
    }

    const result = await testPulseemCredits(userId, password);
    return json(result.ok ? { ok: true, credits: result.credits } : result);
  }

  return json({ error: "unknown_action" }, 400);
});
