// @ts-nocheck
/**
 * Phone SMS OTP for tenant login/register via Pulseem (legacy SendSingleSMS).
 * Reads credentials only from public.business_profile (service role) — never from the app’s local branding/.env.
 * Needs: pulseem_user_id, pulseem_password, pulseem_from_number. pulseem_api_key alone is not used here yet.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PULSEEM_ASMX =
  "https://www.pulseem.co.il/Pulseem/pulseemsendservices.asmx";

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

async function sendPulseemSingleSms(opts: {
  userId: string;
  password: string;
  fromNumber: string;
  toNumber: string;
  text: string;
}): Promise<void> {
  const ref = crypto.randomUUID().slice(0, 12);
  const url = new URL(`${PULSEEM_ASMX}/SendSingleSMS`);
  url.searchParams.set("userID", opts.userId);
  url.searchParams.set("password", opts.password);
  url.searchParams.set("fromNumber", opts.fromNumber);
  url.searchParams.set("toNumber", opts.toNumber);
  url.searchParams.set("reference", ref);
  url.searchParams.set("text", opts.text);
  url.searchParams.set("delayDeliveryMinutes", "0");
  const res = await fetch(url.toString());
  const xml = await res.text();
  if (!res.ok) {
    throw new Error(`Pulseem HTTP ${res.status}`);
  }
  const fault = xml.match(/<faultstring[^>]*>([^<]+)/i);
  if (fault) {
    throw new Error(fault[1].trim());
  }
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
  const password = (row.pulseem_password || "").trim();
  const fromNumber = (row.pulseem_from_number || "").trim();
  if (!userId || !password || !fromNumber) {
    return { error: "pulseem_not_configured" as const };
  }
  return {
    userId,
    password,
    fromNumber,
    apiKey: (row.pulseem_api_key || "").trim(),
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
  const phone = String(body.phone || "").trim();

  if (!businessId || !phone) {
    return json({ ok: false, error: "missing_business_or_phone" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const digits = phoneDigits(phone);
  if (digits.length < 9) {
    return json({ ok: false, error: "invalid_phone" }, 400);
  }

  try {
    if (action === "send_login_otp") {
      const user = await findUserByPhoneFlexible(admin, businessId, phone);
      if (!user) {
        return json({ ok: true });
      }

      const pulse = await loadPulseemCredentials(admin, businessId);
      if ("error" in pulse) {
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
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim();
      if (code.length !== 6) {
        return json({ ok: false, error: "invalid_code" }, 400);
      }
      if (!name) {
        return json({ ok: false, error: "missing_name" }, 400);
      }
      if (!email) {
        return json({ ok: false, error: "missing_email" }, 400);
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

      const randomSecret = `otp_only_${crypto.randomUUID()}`;
      const { data: inserted, error: insUserErr } = await admin
        .from("users")
        .insert({
          name,
          user_type: "client",
          phone: phone.trim(),
          email,
          business_id: businessId,
          password_hash: randomSecret,
          client_approved: false,
        })
        .select("*")
        .single();

      if (insUserErr || !inserted) {
        console.error("[auth-phone-otp] insert user", insUserErr);
        return json({ ok: false, error: "create_user_failed" }, 500);
      }

      await notifyAdminsNewClient(
        admin,
        businessId,
        name,
        phone.trim(),
      );

      return json({
        ok: true,
        user: {
          id: inserted.id,
          name: inserted.name,
          phone: inserted.phone,
          email: inserted.email ?? null,
          user_type: inserted.user_type,
          image_url: inserted.image_url ?? null,
          client_approved: false,
          block: false,
        },
      });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[auth-phone-otp]", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
