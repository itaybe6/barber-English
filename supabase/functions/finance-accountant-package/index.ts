// @ts-nocheck
/**
 * Super-admin only: issue Green Invoice receipts for selected appointments, then email accountant
 * (Resend) with monthly XLSX, HTML summary, links to issued receipts, and expense receipt images.
 *
 * Body: { business_id, caller_user_id, year, month, appointment_ids: string[], use_sandbox?: boolean }
 * Auth: verify_jwt=false — validates caller_user_id is super_admin for business_id.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CATEGORY_LABELS_HE: Record<string, string> = {
  rent: "שכירות",
  supplies: "חומרים",
  equipment: "ציוד",
  marketing: "שיווק",
  other: "אחר",
};

const MAX_APPOINTMENTS = 100;
const MAX_EXPENSE_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 2_500_000;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function formatIls(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

function sanitizeFilenamePart(s: string): string {
  const t = String(s || "Business")
    .replace(/[/\\:*?"<>|]/g, "_")
    .trim()
    .slice(0, 80);
  return t || "Business";
}

function pickGiUrl(url: unknown): string | null {
  if (typeof url === "string" && url.startsWith("http")) return url;
  if (!url || typeof url !== "object") return null;
  const o = url as Record<string, unknown>;
  for (const k of ["he", "origin", "en"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  return null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

type EmailAttachment = {
  filename: string;
  content: string;
  content_type?: string;
};

async function sendResendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
): Promise<{ ok: boolean }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail =
    Deno.env.get("MONTHLY_REPORT_FROM_EMAIL") || "onboarding@resend.dev";
  if (!resendApiKey) {
    console.warn("[finance-accountant-package] Missing RESEND_API_KEY");
    return { ok: false };
  }
  const payload: Record<string, unknown> = {
    from: fromEmail,
    to: [to],
    subject,
    html,
  };
  if (attachments?.length) payload.attachments = attachments;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Resend ${resp.status}: ${errText}`);
  }
  return { ok: true };
}

async function issueReceiptHttp(
  supabaseUrl: string,
  serviceRole: string,
  appointmentId: string,
  businessId: string,
  callerUserId: string,
  useSandbox: boolean,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${supabaseUrl}/functions/v1/greeninvoice-issue-receipt`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appointment_id: appointmentId,
      business_id: businessId,
      caller_user_id: callerUserId,
      use_sandbox: useSandbox,
    }),
  });
  try {
    return await res.json();
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

function buildWorkbook(
  businessName: string,
  businessNumber: string | null,
  year: number,
  month: number,
  incomeRows: Array<{ service_name: string; count: number; price: number; total: number }>,
  totalIncome: number,
  expenseRows: Array<{
    description: string;
    category: string;
    amount: number;
    expense_date: string;
    receipt_url?: string;
  }>,
  totalExpenses: number,
  issuedLines: Array<{
    client: string;
    service: string;
    date: string;
    time: string;
    amount: number;
    docUrl: string;
    docNumber: string;
  }>,
): { base64: string; filename: string } {
  const wb = XLSX.utils.book_new();
  const monthName = MONTH_NAMES[month - 1] || `Month ${month}`;
  const periodLabel = `${monthName} ${year}`;
  const net = totalIncome - totalExpenses;

  const summaryAoa = [
    ["דוח חודשי לרואה חשבון (נשלח מהאפליקציה)"],
    [],
    ["שם העסק", businessName],
    ["תקופה", periodLabel],
    ["מספר עוסק / ח.פ.", businessNumber || ""],
    [],
    ['סה"כ הכנסות (ILS)', totalIncome],
    ['סה"כ הוצאות (ILS)', totalExpenses],
    ["רווח נקי (ILS)", net],
    [],
    ["קבלות שהופקו בשליחה זו", String(issuedLines.length)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), "סיכום");

  const incomeHeader = [
    ['שירות', "מספר תורים", "מחיר ליחידה (ILS)", 'סה"כ שורה (ILS)'],
  ];
  const incomeBody = incomeRows.map((r) => [
    r.service_name,
    r.count,
    r.price,
    r.total,
  ]);
  const incomeAoa = [
    ...incomeHeader,
    ...incomeBody,
    [],
    ['סה"כ הכנסות', "", "", totalIncome],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incomeAoa), "הכנסות");

  const expHeader = [
    ["תיאור", "קטגוריה", "תאריך", "סכום (ILS)", "קישור קבלה"],
  ];
  const expBody = expenseRows.map((e) => {
    const catKey = e.category || "other";
    const catHe = CATEGORY_LABELS_HE[catKey] || catKey;
    return [
      e.description || catHe,
      catHe,
      e.expense_date,
      e.amount,
      e.receipt_url || "",
    ];
  });
  const expAoa = [
    ...expHeader,
    ...expBody,
    [],
    ['סה"כ הוצאות', "", "", totalExpenses, ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expAoa), "הוצאות");

  const issHead = [["לקוח", "שירות", "תאריך", "שעה", "סכום (ILS)", "מספר מסמך", "קישור קבלה"]];
  const issBody = issuedLines.map((l) => [
    l.client,
    l.service,
    l.date,
    l.time,
    l.amount,
    l.docNumber,
    l.docUrl,
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([...issHead, ...issBody]),
    "קבלות_הופקו",
  );

  const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
  const filename =
    `Accountant_Package_${sanitizeFilenamePart(businessName)}_${year}-${
      String(month).padStart(2, "0")
    }.xlsx`;
  return { base64, filename };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const businessId = String(body.business_id ?? "").trim();
  const callerUserId = String(body.caller_user_id ?? "").trim();
  const year = Number(body.year);
  const month = Number(body.month);
  const useSandbox =
    body.use_sandbox === true || body.use_sandbox === "true" || body.use_sandbox === 1;
  const idsRaw = body.appointment_ids;
  if (!businessId || !callerUserId) {
    return json({ ok: false, error: "missing_context" }, 400);
  }
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return json({ ok: false, error: "invalid_period" }, 400);
  }
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return json({ ok: false, error: "no_appointments" }, 400);
  }
  const appointmentIds = [...new Set(idsRaw.map((x) => String(x).trim()).filter(Boolean))];
  if (appointmentIds.length > MAX_APPOINTMENTS) {
    return json({ ok: false, error: "too_many_appointments" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = (req.headers.get("Authorization") ?? "").trim();
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!bearer || !anonKey) {
    return json({ ok: false, error: "missing_auth" }, 401);
  }
  const userSb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authErr } = await userSb.auth.getUser();
  const authUid = authData?.user?.id?.trim();
  if (authErr || !authUid || authUid !== callerUserId) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole);

  const { data: urow, error: uErr } = await admin
    .from("users")
    .select("business_id, user_type")
    .eq("id", callerUserId)
    .maybeSingle();

  if (uErr || !urow?.business_id) {
    return json({ ok: false, error: "user_not_found" }, 403);
  }
  if (String(urow.business_id).trim() !== businessId) {
    return json({ ok: false, error: "forbidden_wrong_business" }, 403);
  }
  if (String(urow.user_type) !== "super_admin") {
    return json({ ok: false, error: "forbidden_not_super_admin" }, 403);
  }

  const { data: profile, error: pErr } = await admin
    .from("business_profile")
    .select(
      "display_name, business_number, accountant_email, greeninvoice_has_credentials",
    )
    .eq("id", businessId)
    .maybeSingle();

  if (pErr || !profile) {
    return json({ ok: false, error: "profile_not_found" }, 400);
  }
  const accountantEmail = String(profile.accountant_email ?? "").trim();
  if (!accountantEmail) {
    return json({ ok: false, error: "accountant_email_missing" }, 400);
  }
  if (!profile.greeninvoice_has_credentials) {
    return json({ ok: false, error: "greeninvoice_not_connected" }, 400);
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data: apptsCheck, error: acErr } = await admin
    .from("appointments")
    .select("id, slot_date, receipt_issued, is_available, status")
    .eq("business_id", businessId)
    .in("id", appointmentIds);

  if (acErr || !apptsCheck?.length) {
    return json({ ok: false, error: "appointments_not_found" }, 400);
  }
  if (apptsCheck.length !== appointmentIds.length) {
    return json({ ok: false, error: "appointment_mismatch" }, 400);
  }
  for (const a of apptsCheck) {
    const sd = String(a.slot_date ?? "");
    if (sd < startDate || sd >= endDate) {
      return json({ ok: false, error: "appointment_wrong_month" }, 400);
    }
    if (a.is_available === true) {
      return json({ ok: false, error: "appointment_invalid" }, 400);
    }
    const st = String(a.status ?? "");
    if (st !== "completed" && st !== "confirmed") {
      return json({ ok: false, error: "appointment_not_eligible" }, 400);
    }
    if (a.receipt_issued === true) {
      return json({ ok: false, error: "receipt_already_issued" }, 400);
    }
  }

  const issuedLines: Array<{
    client: string;
    service: string;
    date: string;
    time: string;
    amount: number;
    docUrl: string;
    docNumber: string;
  }> = [];
  const issueErrors: string[] = [];

  for (const aid of appointmentIds) {
    const gi = await issueReceiptHttp(
      supabaseUrl,
      serviceRole,
      aid,
      businessId,
      callerUserId,
      useSandbox,
    );
    if (!gi.ok) {
      issueErrors.push(
        `${aid.slice(0, 8)}…: ${String(gi.error ?? "unknown")}`,
      );
      continue;
    }
    const doc = gi.document as Record<string, unknown> | undefined;
    const url = pickGiUrl(doc?.url);
    const num = doc?.number != null ? String(doc.number) : "";
    const { data: row } = await admin
      .from("appointments")
      .select(
        "slot_date, slot_time, service_name, client_name, user_id, service_id",
      )
      .eq("id", aid)
      .eq("business_id", businessId)
      .maybeSingle();
    let client = String(row?.client_name ?? "").trim();
    const uid = row?.user_id ? String(row.user_id).trim() : "";
    if (!client && uid) {
      const { data: cu } = await admin
        .from("users")
        .select("name")
        .eq("id", uid)
        .eq("business_id", businessId)
        .maybeSingle();
      client = String(cu?.name ?? "").trim();
    }
    if (!client) client = "לקוח";
    let price = 0;
    const sid = row?.service_id ? String(row.service_id).trim() : "";
    const svcName = String(row?.service_name ?? "שירות").trim() || "שירות";
    if (sid) {
      const { data: svc } = await admin
        .from("services")
        .select("price")
        .eq("id", sid)
        .eq("business_id", businessId)
        .maybeSingle();
      price = Number(svc?.price) || 0;
    }
    if (price <= 0) {
      const { data: services } = await admin
        .from("services")
        .select("name, price")
        .eq("business_id", businessId);
      const lower = svcName.toLowerCase();
      for (const s of services ?? []) {
        if (String(s.name ?? "").toLowerCase() === lower) {
          price = Number(s.price) || 0;
          break;
        }
      }
    }
    issuedLines.push({
      client,
      service: svcName,
      date: String(row?.slot_date ?? ""),
      time: String(row?.slot_time ?? ""),
      amount: price,
      docUrl: url || "",
      docNumber: num,
    });
  }

  if (issueErrors.length && issuedLines.length === 0) {
    return json({
      ok: false,
      error: "all_receipts_failed",
      details: issueErrors,
    }, 400);
  }

  const { data: allAppts } = await admin
    .from("appointments")
    .select("id, service_name, service_id, slot_date, status")
    .eq("business_id", businessId)
    .eq("is_available", false)
    .in("status", ["confirmed", "completed"])
    .gte("slot_date", startDate)
    .lt("slot_date", endDate);

  const { data: services } = await admin
    .from("services")
    .select("id, name, price")
    .eq("business_id", businessId);

  const serviceMap = new Map();
  const serviceNameMap = new Map();
  for (const svc of services ?? []) {
    serviceMap.set(svc.id, { name: svc.name, price: svc.price });
    serviceNameMap.set((svc.name || "").toLowerCase(), {
      id: svc.id,
      price: svc.price,
    });
  }

  const breakdownMap = new Map();
  for (const appt of allAppts ?? []) {
    let price = 0;
    let serviceName = appt.service_name || "Unknown";
    if (appt.service_id && serviceMap.has(appt.service_id)) {
      const svc = serviceMap.get(appt.service_id);
      price = svc.price;
      serviceName = svc.name;
    } else {
      const match = serviceNameMap.get(serviceName.toLowerCase());
      if (match) price = match.price;
    }
    const key = appt.service_id || serviceName;
    const existing = breakdownMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += price;
    } else {
      breakdownMap.set(key, {
        service_name: serviceName,
        price,
        count: 1,
        total: price,
      });
    }
  }

  const incomeRows = Array.from(breakdownMap.values()).sort(
    (a: any, b: any) => b.total - a.total,
  );
  const totalIncome = incomeRows.reduce((s: number, r: any) => s + r.total, 0);

  const { data: expenses } = await admin
    .from("business_expenses")
    .select("*")
    .eq("business_id", businessId)
    .gte("expense_date", startDate)
    .lt("expense_date", endDate)
    .order("expense_date", { ascending: false });

  const expenseRows = (expenses || []).map((e: any) => ({
    description: e.description || "",
    category: e.category || "other",
    amount: Number(e.amount),
    expense_date: e.expense_date,
    receipt_url: typeof e.receipt_url === "string" ? e.receipt_url : "",
  }));
  const totalExpenses = expenseRows.reduce((s: number, e: any) => s + e.amount, 0);

  const bizName = String(profile.display_name ?? "עסק").trim() || "עסק";
  const bn = profile.business_number != null
    ? String(profile.business_number)
    : null;

  const { base64: xlsxBase64, filename: xlsxFilename } = buildWorkbook(
    bizName,
    bn,
    year,
    month,
    incomeRows,
    totalIncome,
    expenseRows,
    totalExpenses,
    issuedLines,
  );

  const monthName = MONTH_NAMES[month - 1] || `${month}`;
  const linksHtml = issuedLines.length
    ? `<ul style="padding-right:18px">${
      issuedLines.map((l) =>
        `<li style="margin:6px 0">${l.client} · ${l.service} · ${formatIls(l.amount)}${
          l.docUrl
            ? ` — <a href="${l.docUrl}">פתיחת קבלה${l.docNumber ? ` (${l.docNumber})` : ""}</a>`
            : ""
        }</li>`
      ).join("")
    }</ul>`
    : "<p>לא הופקו קבלות.</p>";

  const errBlock = issueErrors.length
    ? `<p style="color:#b45309;font-size:14px">חלק מהקבלות נכשלו:<br/>${
      issueErrors.map((e) => e.replace(/</g, "")).join("<br/>")
    }</p>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body dir="rtl" style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#111">
  <h1 style="font-size:20px">חבילת סגירת חודש</h1>
  <p style="color:#444">${bizName} · ${monthName} ${year}</p>
  <p>מצורף קובץ Excel (סיכום, הכנסות, הוצאות, קבלות שהופקו). תמונות/קבלות של הוצאות מצורפות כקבצים נפרדים כשאפשר.</p>
  <h2 style="font-size:16px;margin-top:24px">קבלות שהופקו עכשיו</h2>
  ${linksHtml}
  ${errBlock}
  <p style="margin-top:24px;font-size:13px;color:#666">נשלח אוטומטית מהאפליקציה (מנהל על).</p>
</body></html>`;

  const attachments: EmailAttachment[] = [
    {
      filename: xlsxFilename,
      content: xlsxBase64,
      content_type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ];

  let attCount = 0;
  for (const e of expenseRows) {
    if (attCount >= MAX_EXPENSE_ATTACHMENTS) break;
    const u = String(e.receipt_url || "").trim();
    if (!u.startsWith("http")) continue;
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength > MAX_ATTACHMENT_BYTES) continue;
      const ct = r.headers.get("content-type") || "application/octet-stream";
      const ext = ct.includes("png") ? "png" : ct.includes("webp")
        ? "webp"
        : "jpg";
      attachments.push({
        filename: `expense_${e.expense_date}_${attCount + 1}.${ext}`,
        content: uint8ToBase64(buf),
        content_type: ct.split(";")[0].trim(),
      });
      attCount++;
    } catch {
      /* skip */
    }
  }

  const subject =
    `חבילת פיננסים — ${bizName} — ${monthName} ${year}`;

  let emailOk = false;
  try {
    const r = await sendResendEmail(accountantEmail, subject, html, attachments);
    emailOk = r.ok;
  } catch (e) {
    console.error("[finance-accountant-package] email", e);
    return json({
      ok: false,
      error: "email_failed",
      message: (e as Error)?.message,
      issued_count: issuedLines.length,
      receipt_errors: issueErrors,
    }, 502);
  }

  return json({
    ok: true,
    issued_count: issuedLines.length,
    email_sent: emailOk,
    receipt_errors: issueErrors.length ? issueErrors : undefined,
    expense_attachments: attCount,
  });
});
