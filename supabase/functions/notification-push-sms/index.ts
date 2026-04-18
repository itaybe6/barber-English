// @ts-nocheck
/**
 * Triggered on INSERT into public.notifications (Database Webhook).
 * For recipients who are clients (users.user_type = 'client'): sends Expo push + Pulseem SMS
 * (SMS skipped for type `home_broadcast` — admin home screen broadcast).
 * Admin-targeted rows are skipped (no SMS, no push from this function).
 *
 * Invoked by DB trigger (pg_net) on INSERT into notifications — see migration
 * 20250329120000_notifications_insert_edge_webhook.sql + Vault secret
 * notification_edge_invoke_jwt (service_role JWT). Optional: same URL via Dashboard Webhook
 * (do not enable both, or deliveries duplicate).
 * Requires same secrets as auth-phone-otp: SUPABASE_*, PULSEEM_FIELD_ENCRYPTION_KEY (if Pulseem fields encrypted).
 * Sender secrets: PULSEEM_OTP_FROM_NUMBER, PULSEEM_FROM_NUMBER, PULSEEM_REST_FROM_NUMBER, PULSEEM_ASMX_FROM_NUMBER
 * (same precedence as auth-phone-otp). DB pulseem_from_number is used as-is unless
 * PULSEEM_OTP_ALPHANUMERIC_FALLBACK_BUSINESS_PHONE=1 (legacy).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptPulseemField } from "./pulseemFieldCrypto.ts";

const PULSEEM_ASMX =
  "https://www.pulseem.co.il/Pulseem/pulseemsendservices.asmx";
const PULSEEM_REST = "https://api.pulseem.com/api/v1/SmsApi/SendSms";
const PULSEEM_REST_SMS_REPORT =
  "https://api.pulseem.com/api/v1/SmsApi/GetSMSReport";

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
  if (d.length === 9 && /^5\d{8}$/.test(d)) return "972" + d;
  return d;
}

function pulseemEffectiveFromNumber(
  fromDb: string,
  otpFrom: string,
  fromSecret: string,
  businessPhone: string | null | undefined,
): string {
  const envFrom = (otpFrom || fromSecret).trim();
  if (envFrom) return envFrom;
  const db = String(fromDb ?? "").trim();
  if (!db) return "";
  const legacyAlphanumFallback = /^(1|true|yes)$/i.test(
    String(Deno.env.get("PULSEEM_OTP_ALPHANUMERIC_FALLBACK_BUSINESS_PHONE") ?? "").trim(),
  );
  if (legacyAlphanumFallback && /[a-zA-Z]/.test(db)) {
    const p = String(businessPhone ?? "").trim();
    if (p) {
      const d = normalizeSmsDestination(p);
      if (d.length >= 10) return d;
    }
  }
  return db;
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

/** Align with auth-phone-otp / pulseem-admin-credentials — Pulseem expects header APIKEY. */
function classifyPulseemRestJson(
  payload: Record<string, unknown>,
): "success" | "failure" | "unknown" {
  const errs = payload.errors ?? payload.Errors;
  if (Array.isArray(errs) && errs.length > 0) return "failure";

  const errMsg = String(
    payload.errorMessage ?? payload.ErrorMessage ?? payload.errorDescription ?? "",
  ).trim();
  if (errMsg && !/^null$/i.test(errMsg)) return "failure";

  const st = String(payload.status ?? payload.Status ?? "").toLowerCase();
  if (st === "error" || st === "failed" || st === "failure") return "failure";
  if (st === "success" || st === "ok" || st === "succeeded") return "success";

  const boolKeys = [
    payload.success,
    payload.Success,
    payload.isSuccess,
    payload.IsSuccess,
    payload.isSucceeded,
    payload.IsSucceeded,
    payload.succeeded,
    payload.Succeeded,
  ];
  if (boolKeys.some((v) => v === true)) return "success";
  if (boolKeys.some((v) => v === false)) return "failure";

  const failN =
    typeof payload.failure === "number"
      ? payload.failure
      : typeof payload.Failure === "number"
        ? payload.Failure
        : null;
  const succN =
    typeof payload.success === "number"
      ? payload.success
      : typeof payload.Success === "number"
        ? payload.Success
        : null;
  if (failN !== null && failN > 0) return "failure";
  if (succN !== null && succN > 0) return "success";

  const ec = payload.errorCode ?? payload.ErrorCode ?? payload.code ?? payload.Code;
  if (typeof ec === "number" && ec !== 0 && ec !== 200) return "failure";

  const nested = payload.data ?? payload.Data ?? payload.result ?? payload.Result;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return classifyPulseemRestJson(nested as Record<string, unknown>);
  }

  const failCount =
    (typeof payload.failedCount === "number" ? payload.failedCount : null) ??
    (typeof payload.FailedCount === "number" ? payload.FailedCount : null) ??
    (typeof payload.failedSmsCount === "number" ? payload.failedSmsCount : null);
  if (typeof failCount === "number" && failCount > 0) return "failure";

  const sentOk =
    (typeof payload.sentSmsCount === "number" ? payload.sentSmsCount : null) ??
    (typeof payload.SentSmsCount === "number" ? payload.SentSmsCount : null) ??
    (typeof payload.successSmsCount === "number" ? payload.successSmsCount : null) ??
    (typeof payload.validSmsCount === "number" ? payload.validSmsCount : null);
  if (typeof sentOk === "number" && sentOk > 0) return "success";

  return "unknown";
}

function assertPulseemRestJsonSuccess(responseText: string): void {
  const trimmed = responseText.trim();
  if (!trimmed) throw new Error("pulseem_rest_empty_response");
  if (!trimmed.startsWith("{")) {
    const low = trimmed.toLowerCase();
    if (low === "true" || low === '"true"') return;
    if (low === "false" || low === '"false"') throw new Error("pulseem_rest_rejected");
    throw new Error(
      `pulseem_rest_non_json_body:${trimmed.slice(0, 240).replace(/\s+/g, " ")}`,
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error("pulseem_rest_invalid_json");
  }
  const c = classifyPulseemRestJson(payload);
  if (c === "failure") {
    const msg = String(
      payload.message ??
        payload.Message ??
        payload.errorMessage ??
        payload.ErrorMessage ??
        payload.error ??
        payload.Error ??
        "pulseem_rest_rejected",
    ).trim();
    throw new Error(msg || "pulseem_rest_rejected");
  }
  if (c === "unknown") {
    throw new Error(
      `pulseem_rest_ambiguous_response:${trimmed.slice(0, 400).replace(/\s+/g, " ")}`,
    );
  }
}

function pulseemRestIsAsync(): boolean {
  const v = String(Deno.env.get("PULSEEM_REST_IS_ASYNC") ?? "true").trim().toLowerCase();
  return !/^(0|false|no|off)$/.test(v);
}

async function pulseemLogSmsReportBestEffort(opts: {
  apiKey: string;
  sendId?: string;
  reference?: string;
  cellphone?: string;
}): Promise<void> {
  if (/^(0|false|no|off)$/i.test(String(Deno.env.get("PULSEEM_REST_FETCH_SMS_REPORT") ?? "1").trim())) {
    return;
  }
  try {
    const res = await fetch(PULSEEM_REST_SMS_REPORT, {
      method: "POST",
      headers: {
        APIKEY: opts.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sendId: opts.sendId ?? null,
        reference: opts.reference ?? null,
        cellphone: opts.cellphone ?? null,
      }),
    });
    const t = await res.text();
    console.log(
      "[notification-push-sms] pulseem GetSMSReport status=",
      res.status,
      "body=",
      t.slice(0, 1200),
    );
  } catch (e) {
    console.warn("[notification-push-sms] GetSMSReport failed:", (e as Error)?.message ?? e);
  }
}

async function sendPulseemViaRestApi(opts: {
  apiKey: string;
  fromNumber: string;
  toNumber: string;
  text: string;
}): Promise<void> {
  const to = normalizeSmsDestination(opts.toNumber);
  const ref = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const isAsync = pulseemRestIsAsync();
  const body = {
    sendId: ref,
    isAsync,
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
    headers: {
      APIKEY: opts.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Pulseem REST ${res.status}: ${responseText.slice(0, 300)}`);
  }
  assertPulseemRestJsonSuccess(responseText);
  try {
    const parsed = JSON.parse(responseText.trim()) as Record<string, unknown>;
    const sid = String(parsed.sendId ?? parsed.SendId ?? "").trim();
    await pulseemLogSmsReportBestEffort({
      apiKey: opts.apiKey,
      sendId: sid || undefined,
      reference: ref,
      cellphone: to,
    });
  } catch {
    /* ignore */
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

function pulseemRestFromNumber(mainFrom: string): string {
  const restOnly = (Deno.env.get("PULSEEM_REST_FROM_NUMBER") ?? "").trim();
  return restOnly || mainFrom;
}

function pulseemAsmxEffectiveFrom(mainFrom: string): string {
  const otp = (Deno.env.get("PULSEEM_OTP_FROM_NUMBER") ?? "").trim();
  const asmxOnly = (Deno.env.get("PULSEEM_ASMX_FROM_NUMBER") ?? "").trim();
  if (otp) return otp;
  if (asmxOnly) return asmxOnly;
  return mainFrom;
}

function isPulseemSenderNotApprovedError(message: string): boolean {
  return /sender name is not approved|sender.*not approved|not approved.*sender/i.test(
    message,
  );
}

async function sendPulseemSingleSms(opts: {
  userId: string;
  password: string;
  fromNumber: string;
  toNumber: string;
  text: string;
  apiKey?: string;
}): Promise<void> {
  const asmxFrom = pulseemAsmxEffectiveFrom(opts.fromNumber);
  if (opts.apiKey) {
    const fromRest = pulseemRestFromNumber(opts.fromNumber);
    try {
      await sendPulseemViaRestApi({
        apiKey: opts.apiKey,
        fromNumber: fromRest,
        toNumber: opts.toNumber,
        text: opts.text,
      });
      return;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (isPulseemSenderNotApprovedError(msg)) {
        console.warn(
          "[notification-push-sms] Pulseem REST sender rejected; ASMX retry. REST from=",
          fromRest,
          "ASMX from=",
          asmxFrom,
        );
        return sendPulseemViaAsmx({
          userId: opts.userId,
          password: opts.password,
          fromNumber: asmxFrom,
          toNumber: opts.toNumber,
          text: opts.text,
        });
      }
      throw e;
    }
  }
  return sendPulseemViaAsmx({
    userId: opts.userId,
    password: opts.password,
    fromNumber: asmxFrom,
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
      "id, phone, pulseem_user_id, pulseem_password, pulseem_from_number, pulseem_api_key",
    )
    .eq("id", businessId)
    .maybeSingle();
  if (error || !row) return { error: "business_not_found" as const };
  const userId = (row.pulseem_user_id || "").trim();
  const fromDb = (row.pulseem_from_number || "").trim();
  const fromSecret = (Deno.env.get("PULSEEM_FROM_NUMBER") ?? "").trim();
  const otpFrom = (Deno.env.get("PULSEEM_OTP_FROM_NUMBER") ?? "").trim();
  const fromNumber = pulseemEffectiveFromNumber(
    fromDb,
    otpFrom,
    fromSecret,
    row.phone,
  );
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

    if (nType === "home_broadcast") {
      return { pushOk, smsOk: false, smsSkip: "home_broadcast_push_only" };
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
