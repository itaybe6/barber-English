// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const fromEmail =
  Deno.env.get("MONTHLY_REPORT_FROM_EMAIL") || "onboarding@resend.dev";

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean }> {
  if (!resendApiKey) {
    console.warn(
      "[send-monthly-report] Missing RESEND_API_KEY. Skipping email."
    );
    return { ok: false };
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Failed to send email (${resp.status}): ${errText}`);
  }
  return { ok: true };
}

const REPORT_TZ = "Asia/Jerusalem";

function getJerusalemParts(d = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(d);
  const get = (t: string) =>
    parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  let hour = get("hour");
  if (hour >= 24) hour = 0;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  };
}

function getPreviousMonthFromJerusalem(j: {
  year: number;
  month: number;
}): { year: number; month: number } {
  if (j.month === 1) return { year: j.year - 1, month: 12 };
  return { year: j.year, month: j.month - 1 };
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseHm(s: string | null | undefined): { h: number; m: number } {
  if (!s || typeof s !== "string") return { h: 9, m: 0 };
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return { h: 9, m: 0 };
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10);
  h = Math.max(0, Math.min(23, h));
  min = Math.max(0, Math.min(59, min));
  return { h, m };
}

function clampReportDay(d: number | null | undefined): number {
  const n = typeof d === "number" && !Number.isNaN(d) ? Math.floor(d) : 1;
  return Math.min(28, Math.max(1, n));
}

const SCHEDULE_WINDOW_MINUTES = 60;

function shouldSendNowForSchedule(
  parts: ReturnType<typeof getJerusalemParts>,
  dayOfMonth: number,
  timeStr: string | null | undefined
): boolean {
  if (parts.day !== dayOfMonth) return false;
  const { h: sh, m: sm } = parseHm(timeStr ?? "09:00");
  const nowM = parts.hour * 60 + parts.minute;
  const schedM = sh * 60 + sm;
  const endM = Math.min(schedM + SCHEDULE_WINDOW_MINUTES, 24 * 60);
  if (endM <= schedM) return false;
  return nowM >= schedM && nowM < endM;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function buildReportHtml(
  businessName: string,
  businessNumber: string | null,
  year: number,
  month: number,
  incomeRows: Array<{ service_name: string; count: number; price: number; total: number }>,
  totalIncome: number,
  expenseRows: Array<{ description: string; category: string; amount: number; expense_date: string }>,
  totalExpenses: number
): string {
  const monthName = MONTH_NAMES[month - 1] || `Month ${month}`;
  const netProfit = totalIncome - totalExpenses;

  const incomeRowsHtml = incomeRows.length > 0
    ? incomeRows
        .map(
          (r) =>
            `<tr><td style="padding:8px;border-bottom:1px solid #eee">${r.service_name}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.count}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(r.price)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${formatCurrency(r.total)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#999">No income this month</td></tr>`;

  const expenseRowsHtml = expenseRows.length > 0
    ? expenseRows
        .map(
          (e) =>
            `<tr><td style="padding:8px;border-bottom:1px solid #eee">${e.description || e.category}</td><td style="padding:8px;border-bottom:1px solid #eee">${e.category}</td><td style="padding:8px;border-bottom:1px solid #eee">${e.expense_date}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#DC2626">${formatCurrency(e.amount)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#999">No expenses this month</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#f8f9fa;border-radius:12px;padding:24px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:22px">Monthly Financial Report</h1>
    <p style="margin:0;color:#666;font-size:15px">${monthName} ${year}</p>
    <p style="margin:8px 0 0;font-size:15px"><strong>${businessName}</strong>${businessNumber ? ` &middot; Business #${businessNumber}` : ""}</p>
  </div>

  <div style="display:flex;gap:12px;margin-bottom:24px">
    <div style="flex:1;background:#ECFDF5;border-radius:10px;padding:16px">
      <p style="margin:0;font-size:13px;color:#16A34A;font-weight:600">Total Income</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#16A34A">${formatCurrency(totalIncome)}</p>
    </div>
    <div style="flex:1;background:#FEF2F2;border-radius:10px;padding:16px">
      <p style="margin:0;font-size:13px;color:#DC2626;font-weight:600">Total Expenses</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#DC2626">${formatCurrency(totalExpenses)}</p>
    </div>
    <div style="flex:1;background:${netProfit >= 0 ? "#ECFDF5" : "#FEF2F2"};border-radius:10px;padding:16px">
      <p style="margin:0;font-size:13px;color:${netProfit >= 0 ? "#16A34A" : "#DC2626"};font-weight:600">Net Profit</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:${netProfit >= 0 ? "#16A34A" : "#DC2626"}">${netProfit >= 0 ? "+" : ""}${formatCurrency(netProfit)}</p>
    </div>
  </div>

  <h2 style="font-size:18px;margin:24px 0 12px">Income Breakdown</h2>
  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #eee">
    <thead><tr style="background:#f8f9fa">
      <th style="padding:10px 8px;text-align:left;font-size:13px;color:#666">Service</th>
      <th style="padding:10px 8px;text-align:center;font-size:13px;color:#666">Appointments</th>
      <th style="padding:10px 8px;text-align:right;font-size:13px;color:#666">Price</th>
      <th style="padding:10px 8px;text-align:right;font-size:13px;color:#666">Total</th>
    </tr></thead>
    <tbody>${incomeRowsHtml}</tbody>
    <tfoot><tr style="background:#f8f9fa">
      <td colspan="3" style="padding:10px 8px;font-weight:700">Total Income</td>
      <td style="padding:10px 8px;text-align:right;font-weight:700;color:#16A34A">${formatCurrency(totalIncome)}</td>
    </tr></tfoot>
  </table>

  <h2 style="font-size:18px;margin:24px 0 12px">Expenses</h2>
  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #eee">
    <thead><tr style="background:#f8f9fa">
      <th style="padding:10px 8px;text-align:left;font-size:13px;color:#666">Description</th>
      <th style="padding:10px 8px;text-align:left;font-size:13px;color:#666">Category</th>
      <th style="padding:10px 8px;text-align:left;font-size:13px;color:#666">Date</th>
      <th style="padding:10px 8px;text-align:right;font-size:13px;color:#666">Amount</th>
    </tr></thead>
    <tbody>${expenseRowsHtml}</tbody>
    <tfoot><tr style="background:#f8f9fa">
      <td colspan="3" style="padding:10px 8px;font-weight:700">Total Expenses</td>
      <td style="padding:10px 8px;text-align:right;font-weight:700;color:#DC2626">${formatCurrency(totalExpenses)}</td>
    </tr></tfoot>
  </table>

  <p style="margin:24px 0 0;font-size:12px;color:#999;text-align:center">
    This report was generated automatically. Income is calculated based on current service prices.
  </p>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text().catch(() => "");
    let body: {
      forceSendForBusinessId?: string;
      ignoreLastSent?: boolean;
    } = {};
    try {
      if (rawBody) body = JSON.parse(rawBody);
    } catch {
      /* ignore invalid JSON */
    }

    const authBearer = (req.headers.get("Authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const isServiceCaller = authBearer === serviceRoleKey;
    const forceBusinessId =
      isServiceCaller && body.forceSendForBusinessId
        ? String(body.forceSendForBusinessId).trim()
        : null;
    const ignoreLastSent = isServiceCaller && Boolean(body.ignoreLastSent);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const jNow = getJerusalemParts();
    const { year, month } = getPreviousMonthFromJerusalem(jNow);
    const reportPeriod = periodKey(year, month);

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const { data: businesses, error: bizErr } = await admin
      .from("business_profile")
      .select(
        "id, display_name, business_number, accountant_email, accountant_report_day_of_month, accountant_report_time, accountant_report_last_sent_period"
      )
      .not("accountant_email", "is", null);

    if (bizErr) {
      console.error("[send-monthly-report] Error fetching businesses:", bizErr);
      return new Response(JSON.stringify({ error: "DB error" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const eligibleBusinesses = (businesses || []).filter(
      (b: any) => b.accountant_email && b.accountant_email.trim().length > 0
    );

    let toProcess = eligibleBusinesses;
    if (forceBusinessId) {
      toProcess = eligibleBusinesses.filter((b: any) => b.id === forceBusinessId);
      if (toProcess.length === 0) {
        return new Response(
          JSON.stringify({
            error:
              "forceSendForBusinessId not found or business has no accountant_email",
            forceBusinessId,
          }),
          {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          }
        );
      }
    }

    let sentCount = 0;
    let skippedSchedule = 0;
    let skippedAlreadySent = 0;
    let skippedEmailNotConfigured = 0;

    for (const biz of toProcess) {
      try {
        const businessId = biz.id;
        const scheduleDay = clampReportDay(biz.accountant_report_day_of_month);
        const scheduleTime = biz.accountant_report_time ?? "09:00";

        if (!forceBusinessId) {
          if (!shouldSendNowForSchedule(jNow, scheduleDay, scheduleTime)) {
            skippedSchedule++;
            continue;
          }
        }

        if (!ignoreLastSent && biz.accountant_report_last_sent_period === reportPeriod) {
          skippedAlreadySent++;
          continue;
        }

        const { data: appointments } = await admin
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
        for (const svc of services || []) {
          serviceMap.set(svc.id, { name: svc.name, price: svc.price });
          serviceNameMap.set((svc.name || "").toLowerCase(), {
            id: svc.id,
            price: svc.price,
          });
        }

        const breakdownMap = new Map();
        for (const appt of appointments || []) {
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
          (a: any, b: any) => b.total - a.total
        );
        const totalIncome = incomeRows.reduce(
          (s: number, r: any) => s + r.total,
          0
        );

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
        }));
        const totalExpenses = expenseRows.reduce(
          (s: number, e: any) => s + e.amount,
          0
        );

        const monthName = MONTH_NAMES[month - 1];
        const subject = `Monthly Report – ${biz.display_name || "Business"} – ${monthName} ${year}`;
        const html = buildReportHtml(
          biz.display_name || "Business",
          biz.business_number,
          year,
          month,
          incomeRows,
          totalIncome,
          expenseRows,
          totalExpenses
        );

        const emailResult = await sendEmail(
          biz.accountant_email,
          subject,
          html
        );
        if (!emailResult.ok) {
          skippedEmailNotConfigured++;
          console.warn(
            `[send-monthly-report] RESEND_API_KEY missing or send skipped for ${businessId}`
          );
          continue;
        }

        const { error: updErr } = await admin
          .from("business_profile")
          .update({ accountant_report_last_sent_period: reportPeriod })
          .eq("id", businessId);

        if (updErr) {
          console.error(
            `[send-monthly-report] Sent email but failed to mark period for ${businessId}:`,
            updErr
          );
        }

        sentCount++;
        console.log(
          `[send-monthly-report] Sent report for business ${businessId} to ${biz.accountant_email}`
        );
      } catch (bizErr) {
        console.error(
          `[send-monthly-report] Error processing business ${biz.id}:`,
          bizErr
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent: sentCount,
        processed: toProcess.length,
        totalEligible: eligibleBusinesses.length,
        reportPeriod,
        timeZone: REPORT_TZ,
        jerusalemNow: {
          ...jNow,
          label: `${jNow.year}-${String(jNow.month).padStart(2, "0")}-${String(
            jNow.day
          ).padStart(2, "0")} ${String(jNow.hour).padStart(2, "0")}:${String(
            jNow.minute
          ).padStart(2, "0")}`,
        },
        scheduleWindowMinutes: SCHEDULE_WINDOW_MINUTES,
        skippedSchedule,
        skippedAlreadySent,
        skippedEmailNotConfigured,
        forceBusinessId: forceBusinessId || undefined,
        hint:
          "Invoke this function periodically (e.g. pg_cron every hour). Schedule is evaluated in Asia/Jerusalem. Test: POST with Authorization: Bearer SERVICE_ROLE_KEY and JSON {\"forceSendForBusinessId\":\"<uuid>\",\"ignoreLastSent\":true}",
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("[send-monthly-report] unexpected error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
