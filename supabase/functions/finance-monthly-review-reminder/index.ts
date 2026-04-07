// @ts-nocheck
/**
 * Cron: hourly. In-app notification for super_admin only when:
 * - business has Green Invoice connected + accountant_email set
 * - Jerusalem calendar: last 3 days of month OR first 3 days of month (grace for previous month)
 * - finance_monthly_review_reminder_period !== target YYYY-MM (dedupe)
 *
 * Auth: POST with service role (pg_net); no JWT required on function.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REPORT_TZ = "Asia/Jerusalem";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function getJerusalemParts(d = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(d);
  const get = (t: string) =>
    parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Report month to remind about, or null if outside send window. */
function targetReportPeriod(j: {
  year: number;
  month: number;
  day: number;
}): { year: number; month: number } | null {
  const last = lastDayOfMonth(j.year, j.month);
  const inLast3 = j.day >= last - 2;
  const inFirst3 = j.day <= 3;
  if (inLast3) return { year: j.year, month: j.month };
  if (inFirst3) {
    if (j.month === 1) return { year: j.year - 1, month: 12 };
    return { year: j.year, month: j.month - 1 };
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!auth || auth !== serviceRole) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const j = getJerusalemParts();
  const target = targetReportPeriod(j);
  if (!target) {
    return json({
      ok: true,
      skipped: "outside_window",
      jerusalem: j,
    });
  }
  const pk = periodKey(target.year, target.month);

  const { data: profiles, error: pErr } = await admin
    .from("business_profile")
    .select(
      "id, display_name, greeninvoice_has_credentials, accountant_email, finance_monthly_review_reminder_period",
    )
    .eq("greeninvoice_has_credentials", true);

  if (pErr) {
    console.error("[finance-monthly-review-reminder] profiles", pErr);
    return json({ ok: false, error: "db_error" }, 500);
  }

  let inserted = 0;
  let skipped = 0;
  let skippedNoEmail = 0;
  let skippedDedupe = 0;
  let skippedNoSuperAdmin = 0;

  for (const p of profiles ?? []) {
    const bid = String(p.id ?? "").trim();
    const acct = String(p.accountant_email ?? "").trim();
    if (!bid) continue;
    if (!acct) {
      skippedNoEmail++;
      continue;
    }
    if (String(p.finance_monthly_review_reminder_period ?? "") === pk) {
      skippedDedupe++;
      continue;
    }

    const { data: supers, error: uErr } = await admin
      .from("users")
      .select("id, name, phone")
      .eq("business_id", bid)
      .in("user_type", ["admin", "super_admin"])
      .not("phone", "is", null);

    if (uErr || !supers?.length) {
      skippedNoSuperAdmin++;
      continue;
    }

    const title = "סגירת חודש — קבלות ודוח לרואה חשבון";
    const content =
      `הגיע הזמן לסגור את ${pk}: בחרו תורים להפקת קבלות בחשבונית ירוקה ושלחו חבילה לרואה החשבון.\n[[PERIOD:${pk}]]`;

    let bizInserted = 0;
    for (const u of supers) {
      const phone = String(u.phone ?? "").trim();
      if (!phone) continue;
      const { error: insErr } = await admin.from("notifications").insert({
        title,
        content,
        type: "finance_monthly_review",
        recipient_name: String(u.name ?? "מנהל").trim() || "מנהל",
        recipient_phone: phone,
        business_id: bid,
        user_id: u.id,
        is_read: false,
      });
      if (insErr) {
        console.error("[finance-monthly-review-reminder] insert", bid, insErr);
        skipped++;
        continue;
      }
      bizInserted++;
      inserted++;
    }

    if (bizInserted > 0) {
      const { error: updErr } = await admin
        .from("business_profile")
        .update({ finance_monthly_review_reminder_period: pk })
        .eq("id", bid);

      if (updErr) {
        console.error("[finance-monthly-review-reminder] update period", bid, updErr);
      }
    }
  }

  return json({
    ok: true,
    reportPeriod: pk,
    jerusalem: j,
    inserted,
    skipped,
    skippedNoEmail,
    skippedDedupe,
    skippedNoSuperAdmin,
    businesses: (profiles ?? []).length,
  });
});
