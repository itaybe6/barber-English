// @ts-nocheck
/**
 * Cron (pg_net): daily scan of tenants with Pulseem Direct API key.
 * If GetCreditBalance (via pulseem-admin-credentials) is below threshold, inserts
 * `notifications` type=system for every admin user (by phone) on that business_id.
 *
 * Dedupe: same business_id + marker in content within last DEDUPE_DAYS — skip.
 * Auth: POST Bearer === SUPABASE_SERVICE_ROLE_KEY.
 *
 * Deploy: supabase functions deploy pulseem-low-balance-reminder
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** סף קרדיטי «חבילת SMS בAPI» (Direct) — התראה מתחת לזה. */
const THRESHOLD = 50;
/** בלי _ — ב־PostgreSQL LIKE הקו התחתון הוא wildcard. */
const CONTENT_MARKER = "[pulseem-low-balance]";
const DEDUPE_DAYS = 7;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function parseCredits(raw: string): number | null {
  const n = parseFloat(String(raw).replace(/,/g, ".").trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

async function fetchDirectSmsBalance(
  supabaseUrl: string,
  serviceRole: string,
  businessId: string,
): Promise<{ ok: true; credits: string } | { ok: false; message: string }> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/pulseem-admin-credentials`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    body: JSON.stringify({
      action: "fetch_direct_sms_balance",
      businessId,
    }),
  });
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!res.ok || !data) {
    return {
      ok: false,
      message: `pulseem-admin-credentials HTTP ${res.status}`,
    };
  }
  if (data.error === "unauthorized") {
    return { ok: false, message: "unauthorized" };
  }
  if (data.ok === true && typeof data.directSmsCredits === "string") {
    return { ok: true, credits: data.directSmsCredits };
  }
  return {
    ok: false,
    message: String(data.message ?? data.error ?? "balance_fetch_failed"),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!auth || auth !== serviceRole) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole);

  const { data: businesses, error: listErr } = await admin
    .from("business_profile")
    .select("id, display_name")
    .eq("pulseem_has_api_key", true);

  if (listErr) {
    console.error("[pulseem-low-balance-reminder] list businesses", listErr);
    return json({ ok: false, error: "list_failed" }, 500);
  }

  const rows = businesses ?? [];
  const since = new Date(
    Date.now() - DEDUPE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  let scanned = 0;
  let notifiedBusinesses = 0;
  let skippedHigh = 0;
  let skippedUnparseable = 0;
  let skippedDedupe = 0;
  let skippedNoAdmins = 0;
  let fetchFailed = 0;
  const errors: string[] = [];

  for (const b of rows) {
    const businessId = String(b.id ?? "").trim();
    if (!businessId) continue;
    scanned++;

    const bal = await fetchDirectSmsBalance(
      supabaseUrl,
      serviceRole,
      businessId,
    );
    if (!bal.ok) {
      fetchFailed++;
      if (errors.length < 20) {
        errors.push(`${businessId.slice(0, 8)}…: ${bal.message}`);
      }
      continue;
    }

    const n = parseCredits(bal.credits);
    if (n == null || n < 0) {
      skippedUnparseable++;
      continue;
    }
    if (n >= THRESHOLD) {
      skippedHigh++;
      continue;
    }

    const { data: dup } = await admin
      .from("notifications")
      .select("id")
      .eq("business_id", businessId)
      .eq("type", "system")
      .gte("created_at", since)
      .like("content", `%${CONTENT_MARKER}%`)
      .limit(1)
      .maybeSingle();

    if (dup?.id) {
      skippedDedupe++;
      continue;
    }

    const { data: admins, error: adminsErr } = await admin
      .from("users")
      .select("name, phone")
      .eq("business_id", businessId)
      .eq("user_type", "admin")
      .not("phone", "is", null)
      .neq("phone", "");

    if (adminsErr || !admins?.length) {
      skippedNoAdmins++;
      if (adminsErr && errors.length < 20) {
        errors.push(`admins ${businessId.slice(0, 8)}: ${adminsErr.message}`);
      }
      continue;
    }

    const bizLabel = String(b.display_name ?? "").trim() || "העסק";
    const creditsLine = bal.credits.trim();
    const content = [
      CONTENT_MARKER,
      `יתרת חבילת ה-SMS API (פולסים Direct) ב«${bizLabel}»: ${creditsLine}.`,
      "מומלץ להטעין קרדיטים לפני שייגמרו — פנה לתמיכה או לספק האפליקציה לטעינה.",
    ].join("\n");

    const insertRows = admins.map((a: { name?: string | null; phone?: string | null }) => ({
      title: "תזכורת: יתרת SMS API נמוכה",
      content,
      type: "system",
      recipient_name: (a.name || "מנהל").trim() || "מנהל",
      recipient_phone: String(a.phone || "").trim(),
      business_id: businessId,
    }));

    const { error: insErr } = await admin.from("notifications").insert(insertRows);
    if (insErr) {
      if (errors.length < 20) errors.push(`insert ${businessId}: ${insErr.message}`);
      continue;
    }
    notifiedBusinesses++;
  }

  return json({
    ok: true,
    scanned,
    notifiedBusinesses,
    skippedHigh,
    skippedUnparseable,
    skippedDedupe,
    skippedNoAdmins,
    fetchFailed,
    errors,
  });
});
