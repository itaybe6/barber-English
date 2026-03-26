// @ts-nocheck
/**
 * Phone SMS OTP for tenant login/register via Pulseem (legacy SendSingleSMS).
 * Reads credentials only from public.business_profile (service role) — never from the app’s local branding/.env.
 * pulseem_password / pulseem_api_key: decrypt with PULSEEM_FIELD_ENCRYPTION_KEY if stored as enc:v1:...
 * Needs: pulseem_user_id, pulseem_password, pulseem_from_number. REST send uses pulseem_api_key when set.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptPulseemField } from "./pulseemFieldCrypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PULSEEM_ASMX =
  "https://www.pulseem.co.il/Pulseem/pulseemsendservices.asmx";
const PULSEEM_REST = "https://api.pulseem.com/api/v1/SmsApi/SendSms";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 8;
const MAX_VERIFY_ATTEMPTS = 8;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function phoneDigits(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function randomSixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

/** 32 random bytes as hex (64 chars) for post-OTP profile completion token */
function randomProfileSetupToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Israeli mobile 05xxxxxxxx → 9725xxxxxxxx (many SMS gateways require this). */
function normalizeSmsDestination(raw: string): string {
  const d = phoneDigits(raw);
  if (d.startsWith("972")) return d;
  if (d.startsWith("0") && d.length >= 9 && d.length <= 11) return "972" + d.slice(1);
  return d;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Pulseem SOAP response parser.
 * Success: <SendSingleSMSResult>positive_number</SendSingleSMSResult>
 * Failure: <SendSingleSMSResult /> (self-closing = invalid sender/credentials)
 *       or <SendSingleSMSResult>-N</SendSingleSMSResult> (negative = error code)
 */
function parsePulseemSendSingleResult(
  xml: string,
): { ok: true; ref: string } | { ok: false; reason: string } {
  // SOAP fault
  const fault = xml.match(/<faultstring[^>]*>([\s\S]+?)<\/faultstring>/i);
  if (fault) return { ok: false, reason: fault[1].trim() };

  // Self-closing empty tags = Pulseem rejected (wrong credentials or unregistered sender)
  // HTTP GET: <string xmlns="http://tempuri.org/" />
  // SOAP:     <SendSingleSMSResult />
  if (/(<string\b[^>]*\/>|SendSingleSMSResult\s*\/>)/.test(xml)) {
    console.error(
      "[auth-phone-otp] pulseem returned empty result — wrong credentials or unregistered sender. XML:",
      xml,
    );
    return { ok: false, reason: "pulseem_invalid_credentials_or_sender" };
  }

  // SOAP: <SendSingleSMSResult>value</SendSingleSMSResult>
  const soapResult = xml.match(
    /SendSingleSMSResult[^>]*>\s*([\s\S]*?)\s*<\/[^>]*SendSingleSMSResult>/i,
  );
  if (soapResult) {
    const inner = soapResult[1].trim();
    if (!inner) return { ok: false, reason: "empty_pulseem_result" };
    if (/^-\d+$/.test(inner)) return { ok: false, reason: `pulseem_error_code:${inner}` };
    if (/שגיא|לא\s*תקין|חסר|error|fail|invalid/i.test(inner)) return { ok: false, reason: inner };
    return { ok: true, ref: inner };
  }

  // HTTP GET: <string xmlns="http://tempuri.org/">value</string>
  const stringResult = xml.match(/<string(?:\s[^>]*)?>([^<]*)<\/string>/i);
  if (stringResult) {
    const inner = stringResult[1].trim();
    if (!inner) return { ok: false, reason: "empty_pulseem_result" };
    if (/^-\d+$/.test(inner)) return { ok: false, reason: `pulseem_error_code:${inner}` };
    if (/שגיא|לא\s*תקין|חסר|error|fail|invalid/i.test(inner)) return { ok: false, reason: inner };
    return { ok: true, ref: inner };
  }

  console.error("[auth-phone-otp] unparseable pulseem response. Full XML:", xml);
  return {
    ok: false,
    reason: `unparseable_pulseem_xml:${xml.slice(0, 400).replace(/\s+/g, " ")}`,
  };
}

/**
 * Sends via Pulseem REST API (requires DirectSmsCredits on the sub-account).
 * Auth: APIKey header with pulseem_api_key.
 */
async function sendPulseemViaRestApi(opts: {
  apiKey: string;
  fromNumber: string;
  toNumber: string;
  text: string;
}): Promise<void> {
  const to = normalizeSmsDestination(opts.toNumber);
  const ref = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

  const body = {
    sendId: ref,
    isAsync: false,
    smsSendData: {
      fromNumber: opts.fromNumber,
      toNumberList: [to],
      referenceList: [ref],
      textList: [opts.text],
      isAutomaticUnsubscribeLink: false,
    },
  };

  console.log("[auth-phone-otp] sending via Pulseem REST API, to=", to, "from=", opts.fromNumber);

  const res = await fetch(PULSEEM_REST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "APIKey": opts.apiKey,
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  console.log("[auth-phone-otp] pulseem REST response status=", res.status, "body=", responseText);

  if (!res.ok) {
    throw new Error(`Pulseem REST ${res.status}: ${responseText.slice(0, 300)}`);
  }

  const trimmed = responseText.trim();
  if (trimmed.startsWith("{")) {
    try {
      const payload = JSON.parse(trimmed) as Record<string, unknown>;
      const st = String(payload.status ?? payload.Status ?? "").toLowerCase();
      const errMsg = String(payload.error ?? payload.Error ?? "").trim();
      if (st === "error") {
        throw new Error(errMsg || "pulseem_rest_error");
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        // non-JSON or truncated body — treat as ok if HTTP was 2xx
      } else {
        throw e;
      }
    }
  }

  console.log("[auth-phone-otp] pulseem REST ok, to=", to);
}

/**
 * Sends via legacy Pulseem ASMX HTTP GET (uses userID + password).
 * Returns a simple <string> XML response with message ID (positive) or error code (negative).
 */
async function sendPulseemViaAsmx(opts: {
  userId: string;
  password: string;
  fromNumber: string;
  toNumber: string;
  text: string;
}): Promise<void> {
  const to = normalizeSmsDestination(opts.toNumber);
  const ref = crypto.randomUUID().slice(0, 12);

  const url = new URL(`${PULSEEM_ASMX}/SendSingleSMS`);
  url.searchParams.set("userID", opts.userId);
  url.searchParams.set("password", opts.password);
  url.searchParams.set("fromNumber", opts.fromNumber);
  url.searchParams.set("toNumber", to);
  url.searchParams.set("reference", ref);
  url.searchParams.set("text", opts.text);
  url.searchParams.set("delayDeliveryMinutes", "0");

  console.log("[auth-phone-otp] sending via Pulseem ASMX, to=", to, "from=", opts.fromNumber);

  const res = await fetch(url.toString());
  const xml = await res.text();
  console.log("[auth-phone-otp] pulseem ASMX response status=", res.status, "body=", xml);

  if (!res.ok) {
    throw new Error(`Pulseem ASMX HTTP ${res.status}: ${xml.slice(0, 200)}`);
  }
  const parsed = parsePulseemSendSingleResult(xml);
  if (!parsed.ok) {
    console.error("[auth-phone-otp] pulseem ASMX rejected:", parsed.reason);
    throw new Error(parsed.reason);
  }
  console.log("[auth-phone-otp] pulseem ASMX ok, messageRef=", parsed.ref, "to=", to);
}

/**
 * Main send function — prefers REST API (DirectSmsCredits) when apiKey is available,
 * falls back to legacy ASMX (userID + password) otherwise.
 */
async function sendPulseemSingleSms(opts: {
  userId: string;
  password: string;
  fromNumber: string;
  toNumber: string;
  text: string;
  apiKey?: string;
}): Promise<void> {
  if (opts.apiKey) {
    return sendPulseemViaRestApi({
      apiKey: opts.apiKey,
      fromNumber: opts.fromNumber,
      toNumber: opts.toNumber,
      text: opts.text,
    });
  }
  return sendPulseemViaAsmx({
    userId: opts.userId,
    password: opts.password,
    fromNumber: opts.fromNumber,
    toNumber: opts.toNumber,
    text: opts.text,
  });
}

async function findUserByPhoneFlexible(
  admin: ReturnType<typeof createClient>,
  businessId: string,
  phoneRaw: string,
) {
  const trimmed = phoneRaw.trim();
  const digits = phoneDigits(trimmed);
  if (!digits) return null;
  const { data: rows, error } = await admin
    .from("users")
    .select("*")
    .eq("business_id", businessId);
  if (error || !rows?.length) return null;
  return (
    rows.find(
      (u: { phone: string }) =>
        phoneDigits(u.phone) === digits || u.phone?.trim() === trimmed,
    ) || null
  );
}

function userExistsForRegister(
  rows: { phone: string }[],
  phoneRaw: string,
): boolean {
  const trimmed = phoneRaw.trim();
  const digits = phoneDigits(trimmed);
  return rows.some(
    (u) => phoneDigits(u.phone) === digits || u.phone?.trim() === trimmed,
  );
}

async function loadPulseemCredentials(
  admin: ReturnType<typeof createClient>,
  businessId: string,
) {
  const { data: row, error } = await admin
    .from("business_profile")
    .select(
      "id, pulseem_user_id, pulseem_password, pulseem_from_number, pulseem_api_key",
    )
    .eq("id", businessId)
    .maybeSingle();
  if (error || !row) return { error: "business_not_found" as const };
  const userId = (row.pulseem_user_id || "").trim();
  const fromNumber = (row.pulseem_from_number || "").trim();
  const encKey = (Deno.env.get("PULSEEM_FIELD_ENCRYPTION_KEY") ?? "").trim();
  let password: string;
  let apiKey: string;
  try {
    password = (
      await decryptPulseemField(String(row.pulseem_password || "").trim(), encKey)
    ).trim();
    apiKey = (
      await decryptPulseemField(String(row.pulseem_api_key || "").trim(), encKey)
    ).trim();
  } catch (e) {
    console.error("[auth-phone-otp] pulseem decrypt failed", e);
    return { error: "pulseem_decrypt_failed" as const };
  }
  if (!userId || !password || !fromNumber) {
    return { error: "pulseem_not_configured" as const };
  }
  return {
    userId,
    password,
    fromNumber,
    apiKey,
  };
}

async function notifyAdminsNewClient(
  admin: ReturnType<typeof createClient>,
  businessId: string,
  name: string,
  phone: string,
) {
  const { data: admins } = await admin
    .from("users")
    .select("name, phone")
    .eq("business_id", businessId)
    .eq("user_type", "admin")
    .not("phone", "is", null)
    .neq("phone", "");
  if (!admins?.length) return;
  const notifications = admins.map((a: { name?: string; phone?: string }) => ({
    title: "לקוח חדש ממתין לאישור",
    content: `${name} (${phone}) נרשם וממתין לאישורך באפליקציה.`,
    type: "system",
    recipient_name: a.name || "מנהל",
    recipient_phone: (a.phone || "").trim(),
    business_id: businessId,
  }));
  await admin.from("notifications").insert(notifications);
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

  const action = body.action as string;
  const businessId = String(body.business_id || "").trim();

  if (!businessId) {
    return json({ ok: false, error: "missing_business_or_phone" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (action === "complete_register_profile") {
      const profileSetupToken = String(body.profile_setup_token || "").trim();
      const name = String(body.name || "").trim();
      const birthRaw = String(body.birth_date || "").trim();
      const imageUrl = String(body.image_url || "").trim();

      if (!profileSetupToken || profileSetupToken.length < 32) {
        return json({ ok: false, error: "invalid_token" }, 400);
      }
      if (!name) {
        return json({ ok: false, error: "missing_name" }, 400);
      }

      const tokenHash = await sha256Hex(profileSetupToken);
      const { data: tokRows, error: tokSelErr } = await admin
        .from("auth_register_profile_tokens")
        .select("id, user_id, phone, expires_at, used_at")
        .eq("business_id", businessId)
        .eq("token_hash", tokenHash)
        .limit(1);

      if (tokSelErr || !tokRows?.[0]) {
        return json({ ok: false, error: "invalid_token" }, 400);
      }
      const tok = tokRows[0];
      if (tok.used_at) {
        return json({ ok: false, error: "token_used" }, 400);
      }
      if (new Date(tok.expires_at).getTime() <= Date.now()) {
        return json({ ok: false, error: "token_expired" }, 400);
      }

      let birthDate: string | null = null;
      if (birthRaw) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthRaw)) {
          return json({ ok: false, error: "invalid_birth_date" }, 400);
        }
        birthDate = birthRaw;
      }

      const regPhone = String(tok.phone || "").trim();
      const profileFields: Record<string, unknown> = { name };
      if (birthDate) profileFields.birth_date = birthDate;
      else profileFields.birth_date = null;
      if (imageUrl) profileFields.image_url = imageUrl;

      const userSelect =
        "id, name, phone, email, user_type, image_url, client_approved, block";

      let displayName = name;
      let displayPhone = regPhone;
      let sessionUser: {
        id: string;
        name: string;
        phone: string;
        email: string | null;
        user_type: string;
        image_url: string | null;
        client_approved: boolean;
        block: boolean;
      };

      if (tok.user_id) {
        // Legacy: user row already existed (old flow after verify_register_otp).
        const { data: updatedUser, error: updErr } = await admin
          .from("users")
          .update(profileFields)
          .eq("id", tok.user_id)
          .eq("business_id", businessId)
          .select(userSelect)
          .maybeSingle();

        if (updErr || !updatedUser) {
          console.error("[auth-phone-otp] complete profile update", updErr);
          return json({ ok: false, error: "update_failed" }, 500);
        }
        displayName = updatedUser.name || name;
        displayPhone = String(updatedUser.phone || "").trim();
        sessionUser = {
          id: updatedUser.id,
          name: updatedUser.name,
          phone: updatedUser.phone,
          email: updatedUser.email ?? null,
          user_type: updatedUser.user_type,
          image_url: updatedUser.image_url ?? null,
          client_approved: updatedUser.client_approved !== false,
          block: !!updatedUser.block,
        };
      } else {
        if (!regPhone) {
          return json({ ok: false, error: "invalid_token" }, 400);
        }
        const { data: allUsers } = await admin
          .from("users")
          .select("phone")
          .eq("business_id", businessId);
        if (userExistsForRegister(allUsers || [], regPhone)) {
          return json({ ok: false, error: "phone_registered" }, 400);
        }
        const randomSecret = `otp_only_${crypto.randomUUID()}`;
        const { data: inserted, error: insUserErr } = await admin
          .from("users")
          .insert({
            ...profileFields,
            phone: regPhone,
            email: null,
            user_type: "client",
            business_id: businessId,
            password_hash: randomSecret,
            client_approved: false,
          })
          .select(userSelect)
          .single();

        if (insUserErr || !inserted) {
          console.error("[auth-phone-otp] complete profile insert user", insUserErr);
          return json({ ok: false, error: "create_user_failed" }, 500);
        }
        displayName = inserted.name || name;
        displayPhone = String(inserted.phone || "").trim();
        sessionUser = {
          id: inserted.id,
          name: inserted.name,
          phone: inserted.phone,
          email: inserted.email ?? null,
          user_type: inserted.user_type,
          image_url: inserted.image_url ?? null,
          client_approved: inserted.client_approved !== false,
          block: !!inserted.block,
        };
      }

      await admin
        .from("auth_register_profile_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tok.id);

      await notifyAdminsNewClient(
        admin,
        businessId,
        displayName,
        displayPhone,
      );

      return json({
        ok: true,
        user: {
          id: sessionUser.id,
          name: sessionUser.name,
          phone: sessionUser.phone,
          email: sessionUser.email,
          user_type: sessionUser.user_type,
          image_url: sessionUser.image_url,
          client_approved: sessionUser.client_approved,
          block: sessionUser.block,
        },
      });
    }

    const phone = String(body.phone || "").trim();

    if (!phone) {
      return json({ ok: false, error: "missing_business_or_phone" }, 400);
    }

    const digits = phoneDigits(phone);
    if (digits.length < 9) {
      return json({ ok: false, error: "invalid_phone" }, 400);
    }

    if (action === "send_login_otp") {
      const user = await findUserByPhoneFlexible(admin, businessId, phone);
      if (!user) {
        return json({ ok: true });
      }

      const pulse = await loadPulseemCredentials(admin, businessId);
      if ("error" in pulse) {
        if (pulse.error === "pulseem_decrypt_failed") {
          return json({ ok: false, error: "pulseem_decrypt_failed" }, 500);
        }
        return json(
          {
            ok: false,
            error:
              pulse.error === "pulseem_not_configured"
                ? "pulseem_not_configured"
                : "business_not_found",
          },
          400,
        );
      }

      const { count, error: cntErr } = await admin
        .from("auth_otp_send_log")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("phone_digits", digits)
        .gte(
          "created_at",
          new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        );

      if (cntErr) {
        console.error("[auth-phone-otp] send_log count", cntErr);
      } else if ((count ?? 0) >= MAX_SENDS_PER_HOUR) {
        return json({ ok: false, error: "rate_limit_sends" }, 429);
      }

      const code = randomSixDigitCode();
      const codeHash = await sha256Hex(`${businessId}:${digits}:login:${code}`);
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

      await admin
        .from("auth_phone_otp_challenges")
        .delete()
        .eq("business_id", businessId)
        .eq("phone_digits", digits)
        .eq("purpose", "login");

      const { error: insErr } = await admin.from("auth_phone_otp_challenges")
        .insert({
          business_id: businessId,
          phone_digits: digits,
          purpose: "login",
          code_hash: codeHash,
          expires_at: expiresAt,
          verify_attempts: 0,
        });
      if (insErr) {
        console.error("[auth-phone-otp] insert challenge", insErr);
        return json({ ok: false, error: "db_error" }, 500);
      }

      await admin.from("auth_otp_send_log").insert({
        business_id: businessId,
        phone_digits: digits,
      });

      const msg = `Your login code: ${code}`;
      try {
        await sendPulseemSingleSms({
          userId: pulse.userId,
          password: pulse.password,
          fromNumber: pulse.fromNumber,
          toNumber: phone.trim(),
          text: msg,
          apiKey: pulse.apiKey || undefined,
        });
      } catch (e) {
        console.error("[auth-phone-otp] pulseem send", e);
        await admin.from("auth_phone_otp_challenges").delete().eq(
          "business_id",
          businessId,
        ).eq("phone_digits", digits).eq("purpose", "login");
        return json(
          { ok: false, error: "sms_send_failed", detail: String(e) },
          502,
        );
      }

      return json({ ok: true });
    }

    if (action === "verify_login_otp") {
      const code = String(body.code || "").replace(/\D/g, "");
      if (code.length !== 6) {
        return json({ ok: false, error: "invalid_code" }, 400);
      }

      const { data: rows, error: selErr } = await admin
        .from("auth_phone_otp_challenges")
        .select("*")
        .eq("business_id", businessId)
        .eq("phone_digits", digits)
        .eq("purpose", "login")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (selErr || !rows?.[0]) {
        return json({ ok: false, error: "no_active_code" }, 400);
      }

      const ch = rows[0];
      if (ch.verify_attempts >= MAX_VERIFY_ATTEMPTS) {
        return json({ ok: false, error: "too_many_attempts" }, 429);
      }

      const expectHash = await sha256Hex(
        `${businessId}:${digits}:login:${code}`,
      );
      const match = timingSafeEqualHex(expectHash, ch.code_hash);

      if (!match) {
        await admin
          .from("auth_phone_otp_challenges")
          .update({
            verify_attempts: ch.verify_attempts + 1,
          })
          .eq("id", ch.id);
        return json({ ok: false, error: "wrong_code" }, 400);
      }

      await admin.from("auth_phone_otp_challenges").delete().eq("id", ch.id);

      const user = await findUserByPhoneFlexible(admin, businessId, phone);
      if (!user) {
        return json({ ok: false, error: "user_not_found" }, 400);
      }

      return json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email ?? null,
          user_type: user.user_type,
          image_url: user.image_url ?? null,
          client_approved: user.client_approved !== false,
          block: !!user.block,
        },
      });
    }

    if (action === "send_register_otp") {
      const { data: allUsers, error: uErr } = await admin
        .from("users")
        .select("phone")
        .eq("business_id", businessId);
      if (uErr) {
        return json({ ok: false, error: "db_error" }, 500);
      }
      if (userExistsForRegister(allUsers || [], phone)) {
        return json({ ok: false, error: "phone_registered" }, 400);
      }

      const pulse = await loadPulseemCredentials(admin, businessId);
      if ("error" in pulse) {
        if (pulse.error === "pulseem_decrypt_failed") {
          return json({ ok: false, error: "pulseem_decrypt_failed" }, 500);
        }
        return json(
          {
            ok: false,
            error:
              pulse.error === "pulseem_not_configured"
                ? "pulseem_not_configured"
                : "business_not_found",
          },
          400,
        );
      }

      const { count, error: cntErr } = await admin
        .from("auth_otp_send_log")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("phone_digits", digits)
        .gte(
          "created_at",
          new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        );

      if (cntErr) {
        console.error("[auth-phone-otp] send_log count", cntErr);
      } else if ((count ?? 0) >= MAX_SENDS_PER_HOUR) {
        return json({ ok: false, error: "rate_limit_sends" }, 429);
      }

      const code = randomSixDigitCode();
      const codeHash = await sha256Hex(
        `${businessId}:${digits}:register:${code}`,
      );
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

      await admin
        .from("auth_phone_otp_challenges")
        .delete()
        .eq("business_id", businessId)
        .eq("phone_digits", digits)
        .eq("purpose", "register");

      const { error: insErr } = await admin.from("auth_phone_otp_challenges")
        .insert({
          business_id: businessId,
          phone_digits: digits,
          purpose: "register",
          code_hash: codeHash,
          expires_at: expiresAt,
          verify_attempts: 0,
        });
      if (insErr) {
        console.error("[auth-phone-otp] insert challenge", insErr);
        return json({ ok: false, error: "db_error" }, 500);
      }

      await admin.from("auth_otp_send_log").insert({
        business_id: businessId,
        phone_digits: digits,
      });

      const msg = `Your registration code: ${code}`;
      try {
        await sendPulseemSingleSms({
          userId: pulse.userId,
          password: pulse.password,
          fromNumber: pulse.fromNumber,
          toNumber: phone.trim(),
          text: msg,
          apiKey: pulse.apiKey || undefined,
        });
      } catch (e) {
        console.error("[auth-phone-otp] pulseem send", e);
        await admin.from("auth_phone_otp_challenges").delete().eq(
          "business_id",
          businessId,
        ).eq("phone_digits", digits).eq("purpose", "register");
        return json(
          { ok: false, error: "sms_send_failed", detail: String(e) },
          502,
        );
      }

      return json({ ok: true });
    }

    if (action === "verify_register_otp") {
      const code = String(body.code || "").replace(/\D/g, "");
      if (code.length !== 6) {
        return json({ ok: false, error: "invalid_code" }, 400);
      }

      const { data: rows, error: selErr } = await admin
        .from("auth_phone_otp_challenges")
        .select("*")
        .eq("business_id", businessId)
        .eq("phone_digits", digits)
        .eq("purpose", "register")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (selErr || !rows?.[0]) {
        return json({ ok: false, error: "no_active_code" }, 400);
      }

      const ch = rows[0];
      if (ch.verify_attempts >= MAX_VERIFY_ATTEMPTS) {
        return json({ ok: false, error: "too_many_attempts" }, 429);
      }

      const expectHash = await sha256Hex(
        `${businessId}:${digits}:register:${code}`,
      );
      const match = timingSafeEqualHex(expectHash, ch.code_hash);

      if (!match) {
        await admin
          .from("auth_phone_otp_challenges")
          .update({
            verify_attempts: ch.verify_attempts + 1,
          })
          .eq("id", ch.id);
        return json({ ok: false, error: "wrong_code" }, 400);
      }

      await admin.from("auth_phone_otp_challenges").delete().eq("id", ch.id);

      const { data: allUsers } = await admin
        .from("users")
        .select("phone")
        .eq("business_id", businessId);
      if (userExistsForRegister(allUsers || [], phone)) {
        return json({ ok: false, error: "phone_registered" }, 400);
      }

      const profileSetupToken = randomProfileSetupToken();
      const tokenHash = await sha256Hex(profileSetupToken);
      const profileTokenExpires = new Date(
        Date.now() + 60 * 60 * 1000,
      ).toISOString();
      const phoneTrimmed = phone.trim();
      const { error: tokErr } = await admin
        .from("auth_register_profile_tokens")
        .insert({
          business_id: businessId,
          user_id: null,
          phone: phoneTrimmed,
          token_hash: tokenHash,
          expires_at: profileTokenExpires,
        });
      if (tokErr) {
        console.error("[auth-phone-otp] profile token insert", tokErr);
        return json({ ok: false, error: "db_error" }, 500);
      }

      // Opaque id for storage uploads only — no users row until complete_register_profile.
      const uploadSessionId = crypto.randomUUID();
      return json({
        ok: true,
        profile_setup_token: profileSetupToken,
        user: {
          id: uploadSessionId,
          name: "",
          phone: phoneTrimmed,
          email: null,
          user_type: "client",
          image_url: null,
          client_approved: false,
          block: false,
        },
      });
    }

    // Diagnostic: check Pulseem credentials and DirectSms credits via REST API
    if (action === "check_pulseem") {
      const pulse = await loadPulseemCredentials(admin, businessId);
      if ("error" in pulse) {
        const st = pulse.error === "pulseem_decrypt_failed" ? 500 : 400;
        return json({ ok: false, error: pulse.error }, st);
      }

      // Check ASMX credits (legacy)
      const asmxUrl = new URL(`${PULSEEM_ASMX}/GetSMScreditsLeft`);
      asmxUrl.searchParams.set("userID", pulse.userId);
      asmxUrl.searchParams.set("password", pulse.password);
      const asmxRes = await fetch(asmxUrl.toString());
      const asmxXml = await asmxRes.text();

      // Check REST API credits (if api_key set)
      let restCredits: unknown = null;
      if (pulse.apiKey) {
        const restRes = await fetch("https://api.pulseem.com/api/v1/AccountsApi/GetCreditBalance", {
          method: "POST",
          headers: { "Content-Type": "application/json", "APIKey": pulse.apiKey },
          body: JSON.stringify({}),
        });
        restCredits = await restRes.text();
      }

      return json({
        ok: true,
        pulseem_userId: pulse.userId,
        pulseem_fromNumber: pulse.fromNumber,
        has_api_key: !!pulse.apiKey,
        asmx_credits_raw: asmxXml,
        rest_credits_raw: restCredits,
      });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[auth-phone-otp]", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
