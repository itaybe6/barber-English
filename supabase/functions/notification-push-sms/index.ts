// @ts-nocheck
/**
 * Triggered on INSERT into public.notifications (Database Webhook).
 * For recipients who are clients (users.user_type = 'client'): sends Expo push + Pulseem SMS.
 * Admin-targeted rows are skipped (no SMS, no push from this function).
 *
 * Invoked by DB trigger (pg_net) on INSERT into notifications — see migration
 * 20250329120000_notifications_insert_edge_webhook.sql + Vault secret
 * notification_edge_invoke_jwt (service_role JWT). Optional: same URL via Dashboard Webhook
 * (do not enable both, or deliveries duplicate).
 * Requires same secrets as auth-phone-otp: SUPABASE_*, PULSEEM_FIELD_ENCRYPTION_KEY (if Pulseem fields encrypted).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptPulseemField } from "./pulseemFieldCrypto.ts";

const PULSEEM_ASMX =
  "https://www.pulseem.co.il/Pulseem/pulseemsendservices.asmx";
const PULSEEM_REST = "https://api.pulseem.com/api/v1/SmsApi/SendSms";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Unicode SMS safe cap (one segment ~70 chars; keep one message reasonable). */
const SMS_MAX_CHARS = 480;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function phoneDigits(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

function normalizeSmsDestination(raw: string): string {
  const d = phoneDigits(raw);
  if (d.startsWith("972")) return d;
  if (d.startsWith("0") && d.length >= 9 && d.length <= 11) return "972" + d.slice(1);
  return d;
}

function parsePulseemSendSingleResult(
  xml: string,
): { ok: true; ref: string } | { ok: false; reason: string } {
  const fault = xml.match(/<faultstring[^>]*>([\s\S]+?)<\/faultstring>/i);
  if (fault) return { ok: false, reason: fault[1].trim() };
  if (/(<string\b[^>]*\/>|SendSingleSMSResult\s*\/>)/.test(xml)) {
    return { ok: false, reason: "pulseem_invalid_credentials_or_sender" };
  }
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
  const stringResult = xml.match(/<string(?:\s[^>]*)?>([^<]*)<\/string>/i);
  if (stringResult) {
    const inner = stringResult[1].trim();
    if (!inner) return { ok: false, reason: "empty_pulseem_result" };
    if (/^-\d+$/.test(inner)) return { ok: false, reason: `pulseem_error_code:${inner}` };
    if (/שגיא|לא\s*תקין|חסר|error|fail|invalid/i.test(inner)) return { ok: false, reason: inner };
    return { ok: true, ref: inner };
  }
  return { ok: false, reason: "unparseable_pulseem_xml" };
}

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
  const res = await fetch(PULSEEM_REST, {
    method: "POST",
    headers: { "Content-Type": "application/json", "APIKey": opts.apiKey },
    body: JSON.stringify(body),
  });
  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Pulseem REST ${res.status}: ${responseText.slice(0, 300)}`);
  }
  const trimmed = responseText.trim();
  if (trimmed.startsWith("{")) {
    try {
      const payload = JSON.parse(trimmed) as Record<string, unknown>;
      const st = String(payload.status ?? payload.Status ?? "").toLowerCase();
      const errMsg = String(payload.error ?? payload.Error ?? "").trim();
      if (st === "error") throw new Error(errMsg || "pulseem_rest_error");
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
    }
  }
}

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
  const res = await fetch(url.toString());
  const xml = await res.text();
  if (!res.ok) throw new Error(`Pulseem ASMX HTTP ${res.status}: ${xml.slice(0, 200)}`);
  const parsed = parsePulseemSendSingleResult(xml);
  if (!parsed.ok) throw new Error(parsed.reason);
}

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
    console.error("[notification-push-sms] pulseem decrypt failed", e);
    return { error: "pulseem_decrypt_failed" as const };
  }
  if (!userId || !password || !fromNumber) {
    return { error: "pulseem_not_configured" as const };
  }
  return { userId, password, fromNumber, apiKey };
}

function findUserByPhoneFlexible(
  rows: Array<{ phone?: string | null }>,
  phoneRaw: string,
) {
  const trimmed = phoneRaw.trim();
  const digits = phoneDigits(trimmed);
  if (!digits) return null;
  return (
    rows.find(
      (u) =>
        phoneDigits(String(u.phone ?? "")) === digits ||
        String(u.phone ?? "").trim() === trimmed,
    ) ?? null
  );
}

function extractRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.record && typeof b.record === "object") {
    return b.record as Record<string, unknown>;
  }
  if (
    typeof b.id === "string" &&
    typeof b.business_id === "string" &&
    b.recipient_phone !== undefined
  ) {
    return b;
  }
  return null;
}

function buildSmsText(title: string, content: string): string {
  const t = String(title || "").trim();
  const c = String(content || "").trim();
  let msg = t ? `${t}\n${c}` : c;
  if (msg.length > SMS_MAX_CHARS) {
    msg = msg.slice(0, SMS_MAX_CHARS - 1) + "…";
  }
  return msg;
}

async function sendExpoPush(opts: {
  pushToken: string;
  title: string;
  body: string;
  notificationId: string;
  nType: string;
}): Promise<boolean> {
  const payload = [
    {
      to: opts.pushToken,
      sound: "default",
      title: opts.title,
      body: opts.body,
      priority: "high",
      data: {
        notificationId: opts.notificationId,
        type: opts.nType,
      },
    },
  ];
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[notification-push-sms] Expo push HTTP", res.status, text.slice(0, 400));
    return false;
  }
  try {
    const j = JSON.parse(text) as { data?: Array<{ status?: string }> };
    const ticket = j.data?.[0];
    if (ticket?.status === "ok") return true;
    console.error("[notification-push-sms] Expo ticket not ok", text.slice(0, 400));
    return false;
  } catch {
    console.error("[notification-push-sms] Expo parse error", text.slice(0, 400));
    return false;
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const raw = body as Record<string, unknown>;
  if (raw.type != null && raw.type !== "INSERT") {
    return json({ ok: true, skipped: "not_insert" });
  }

  const record = extractRecord(body);
  if (!record) {
    return json({ ok: false, error: "missing_record" }, 400);
  }

  const id = String(record.id ?? "").trim();
  const businessId = String(record.business_id ?? "").trim();
  const recipientPhone = String(record.recipient_phone ?? "").trim();
  const title = String(record.title ?? "");
  const content = String(record.content ?? "");
  const nType = String(record.type ?? "general");

  if (!businessId || !recipientPhone) {
    return json({ ok: true, skipped: "missing_business_or_phone" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: usersRows, error: usersErr } = await admin
    .from("users")
    .select("id, user_type, phone, push_token")
    .eq("business_id", businessId);

  if (usersErr || !usersRows?.length) {
    console.error("[notification-push-sms] users fetch", usersErr);
    return json({ ok: false, error: "users_fetch_failed" }, 500);
  }

  const targetUserId =
    record.user_id != null && String(record.user_id).trim() !== ""
      ? String(record.user_id).trim()
      : "";

  const runPushThenSms = async (match: {
    push_token?: string | null;
  }): Promise<{ pushOk: boolean; smsOk: boolean; smsSkip?: string; smsErr?: string }> => {
    let pushOk = false;
    const token = (match.push_token || "").trim();
    if (token) {
      pushOk = await sendExpoPush({
        pushToken: token,
        title: title || "התראה",
        body: content || "",
        notificationId: id || "unknown",
        nType,
      });
      if (pushOk && id) {
        const { error: updErr } = await admin
          .from("notifications")
          .update({ push_sent: true })
          .eq("id", id)
          .eq("business_id", businessId);
        if (updErr) {
          console.error("[notification-push-sms] push_sent update", updErr);
        }
      }
    }

    const creds = await loadPulseemCredentials(admin, businessId);
    if ("error" in creds) {
      console.warn("[notification-push-sms] SMS skipped:", creds.error, "business", businessId);
      return { pushOk, smsOk: false, smsSkip: creds.error };
    }

    try {
      await sendPulseemSingleSms({
        userId: creds.userId,
        password: creds.password,
        fromNumber: creds.fromNumber,
        toNumber: recipientPhone,
        text: buildSmsText(title, content),
        apiKey: creds.apiKey || undefined,
      });
      return { pushOk, smsOk: true };
    } catch (e) {
      console.error("[notification-push-sms] SMS failed", e);
      return {
        pushOk,
        smsOk: false,
        smsErr: String((e as Error)?.message ?? e),
      };
    }
  };

  if (nType === "admin_reminder" && targetUserId) {
    const adminRow = usersRows.find((u) => u.id === targetUserId);
    if (!adminRow || adminRow.user_type !== "admin") {
      return json({ ok: true, skipped: "admin_reminder_not_admin" });
    }
    const out = await runPushThenSms(adminRow);
    return json({
      ok: true,
      push: out.pushOk,
      sms: out.smsOk,
      sms_skip: out.smsSkip,
      sms_error: out.smsErr,
    });
  }

  const match = findUserByPhoneFlexible(usersRows, recipientPhone);
  if (!match || match.user_type !== "client") {
    return json({ ok: true, skipped: "not_client_or_unknown_phone" });
  }

  const out = await runPushThenSms(match);
  return json({
    ok: true,
    push: out.pushOk,
    sms: out.smsOk,
    sms_skip: out.smsSkip,
    sms_error: out.smsErr,
  });
});
