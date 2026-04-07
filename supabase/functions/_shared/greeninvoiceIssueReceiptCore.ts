// @ts-nocheck
/**
 * Shared Green Invoice receipt issuance (document 400).
 * Used by greeninvoice-issue-receipt HTTP and by finance-accountant-package in-process
 * (avoids Edge→Edge fetch + JWT gateway 401 when verify_jwt mismatches).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptPulseemField } from "./pulseemFieldCrypto.ts";

const GREEN_LIVE = "https://api.greeninvoice.co.il/api";
const GREEN_SANDBOX = "https://sandbox.d.greeninvoice.co.il/api";

const DOC_TYPE_RECEIPT = 400;
const PAYMENT_CASH = 1;
const INCOME_VAT_DEFAULT = 0;

export const greeninvoiceIssueReceiptCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...greeninvoiceIssueReceiptCors, "Content-Type": "application/json" },
  });
}

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

function apiBase(body: Record<string, unknown>): string {
  return useSandboxEffective(body) ? GREEN_SANDBOX : GREEN_LIVE;
}

async function fetchGreenInvoiceJwt(
  tokenUrl: string,
  apiKeyId: string,
  apiSecret: string,
): Promise<{ ok: true; jwt: string } | { ok: false; message: string }> {
  const id = apiKeyId.trim();
  const secret = apiSecret.trim();
  if (!id || !secret) {
    return { ok: false, message: "חסר מזהה מפתח או מפתח סודי" };
  }
  try {
    const res = await fetch(tokenUrl, {
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

function parseGiErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const msg = (body as Record<string, unknown>)["messages"];
  const m = msg && typeof msg === "object"
    ? (msg as Record<string, unknown>)["message"]
    : undefined;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const d = (m as Record<string, unknown>)["description"];
    if (typeof d === "string" && d.trim()) return d;
  }
  if (Array.isArray(m) && m[0] && typeof m[0] === "object") {
    const d = (m[0] as Record<string, unknown>)["description"];
    if (typeof d === "string" && d.trim()) return d;
  }
  return undefined;
}

/**
 * Same contract as POST greeninvoice-issue-receipt JSON body → JSON response.
 */
export async function handleGreenInvoiceIssueReceiptBody(
  body: Record<string, unknown>,
): Promise<Response> {
  const businessIdRaw = String(body.business_id ?? "").trim();
  const callerUserId = String(body.caller_user_id ?? "").trim();
  const appointmentId = String(body.appointment_id ?? "").trim();

  if (!businessIdRaw || !callerUserId) {
    return json({ ok: false, error: "missing_caller_context" }, 400);
  }
  if (!appointmentId) {
    return json({ ok: false, error: "missing_appointment_id" }, 400);
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

  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .select(
      "id, business_id, status, service_name, service_id, slot_date, slot_time, client_name, user_id, is_available, receipt_issued",
    )
    .eq("id", appointmentId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (apptErr || !appt) {
    return json({ ok: false, error: "appointment_not_found" }, 404);
  }
  if (appt.receipt_issued === true) {
    return json({ ok: false, error: "receipt_already_issued" }, 400);
  }
  const st = String(appt.status ?? "");
  if (st !== "completed" && st !== "confirmed") {
    return json({ ok: false, error: "appointment_not_completed" }, 400);
  }
  if (appt.is_available === true) {
    return json({ ok: false, error: "appointment_invalid" }, 400);
  }

  let clientName = String(appt.client_name ?? "").trim();
  const uid = appt.user_id ? String(appt.user_id).trim() : "";
  if (!clientName && uid) {
    const { data: u } = await admin
      .from("users")
      .select("name")
      .eq("id", uid)
      .eq("business_id", businessId)
      .maybeSingle();
    clientName = String(u?.name ?? "").trim();
  }
  if (!clientName) clientName = "לקוח";

  const serviceName = String(appt.service_name ?? "שירות").trim() || "שירות";

  let price = 0;
  const sid = appt.service_id ? String(appt.service_id).trim() : "";
  if (sid) {
    const { data: svc } = await admin
      .from("services")
      .select("price, name")
      .eq("id", sid)
      .eq("business_id", businessId)
      .maybeSingle();
    if (svc) {
      price = Number(svc.price) || 0;
    }
  }
  if (price <= 0) {
    const { data: services } = await admin
      .from("services")
      .select("id, name, price")
      .eq("business_id", businessId);
    const lower = serviceName.toLowerCase();
    for (const s of services ?? []) {
      if (String(s.name ?? "").toLowerCase() === lower) {
        price = Number(s.price) || 0;
        break;
      }
    }
  }
  if (price <= 0) {
    return json({ ok: false, error: "appointment_price_unknown" }, 400);
  }

  const { data: profile, error: profErr } = await admin
    .from("business_profile")
    .select("greeninvoice_api_key_id, greeninvoice_api_secret, greeninvoice_has_credentials")
    .eq("id", businessId)
    .maybeSingle();

  if (profErr || !profile?.greeninvoice_has_credentials) {
    return json({ ok: false, error: "greeninvoice_not_connected" }, 400);
  }

  const apiKeyId = String(profile.greeninvoice_api_key_id ?? "").trim();
  const encSecret = String(profile.greeninvoice_api_secret ?? "").trim();
  if (!apiKeyId || !encSecret) {
    return json({ ok: false, error: "greeninvoice_not_connected" }, 400);
  }
  if (!encKey) {
    return json({ ok: false, error: "missing_encryption_key" }, 500);
  }

  let apiSecret: string;
  try {
    apiSecret = await decryptPulseemField(encSecret, encKey);
  } catch (e) {
    console.error("[greeninvoice-issue-receipt] decrypt:", e);
    return json({ ok: false, error: "decrypt_failed" }, 500);
  }
  if (!apiSecret.trim()) {
    return json({ ok: false, error: "greeninvoice_not_connected" }, 400);
  }

  const base = apiBase(body);
  const tokenUrl = `${base}/v1/account/token`;
  const gi = await fetchGreenInvoiceJwt(tokenUrl, apiKeyId, apiSecret);
  if (!gi.ok) {
    return json(
      { ok: false, error: "greeninvoice_auth_failed", message: gi.message },
      400,
    );
  }

  const docDate = String(appt.slot_date ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const remarks =
    `תור ${appointmentId.slice(0, 8)}… | ${docDate} ${String(appt.slot_time ?? "").trim()} | ${serviceName}`;

  const payload = {
    type: DOC_TYPE_RECEIPT,
    date: docDate,
    lang: "he",
    currency: "ILS",
    signed: true,
    rounding: false,
    client: {
      name: clientName,
      add: false,
    },
    income: [
      {
        description: serviceName,
        quantity: 1,
        price,
        currency: "ILS",
        vatType: INCOME_VAT_DEFAULT,
      },
    ],
    payment: [
      {
        type: PAYMENT_CASH,
        date: docDate,
        price,
        currency: "ILS",
      },
    ],
    remarks,
  };

  let docRes: Response;
  try {
    docRes = await fetch(`${base}/v1/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${gi.jwt}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json(
      {
        ok: false,
        error: "greeninvoice_request_failed",
        message: (e as Error)?.message,
      },
      502,
    );
  }

  let docBody: unknown = null;
  try {
    const txt = await docRes.text();
    if (txt) docBody = JSON.parse(txt);
  } catch {
    /* ignore */
  }

  if (!docRes.ok) {
    const msg = parseGiErrorMessage(docBody) ??
      `שגיאה בהפקת מסמך (${docRes.status})`;
    return json(
      { ok: false, error: "greeninvoice_document_failed", message: msg },
      400,
    );
  }

  const d = docBody && typeof docBody === "object"
    ? docBody as Record<string, unknown>
    : {};

  await admin
    .from("appointments")
    .update({ receipt_issued: true })
    .eq("id", appointmentId)
    .eq("business_id", businessId);

  return json({
    ok: true,
    sandbox: useSandboxEffective(body),
    document: {
      id: d["id"] ?? null,
      number: d["number"] ?? null,
      url: d["url"] ?? null,
    },
  });
}
