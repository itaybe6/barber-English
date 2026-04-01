// @ts-nocheck
/**
 * Daily (cron): clients whose birth month/day matches today in Asia/Jerusalem get an in-app
 * notification (+ push/SMS via existing INSERT trigger → notification-push-sms).
 * Runs from 12:00 Jerusalem until end of day (deduped per user/day) unless force=true.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v5.2.3/index.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TZ = "Asia/Jerusalem";
/** First eligible Jerusalem hour (inclusive). No upper bound until midnight — dedupe via birthday_notification_sent_date. */
const SCHEDULE_HOUR = 12;

const BIRTHDAY_TITLE = "יום הולדת שמח!";
const NOTIFICATION_TYPE = "general" as const;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
/** Trimmed; matches Project Settings → API service_role (JWT). */
const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

function bearerOrApikeyToken(req: Request): string {
  const auth = (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (auth) return auth;
  return (req.headers.get("apikey") || req.headers.get("x-api-key") || "").trim();
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function jwtSigningSecretForVerify(): string {
  return (
    Deno.env.get("SUPABASE_JWT_SECRET") ??
    Deno.env.get("JWT_SECRET") ??
    ""
  ).trim();
}

async function authorizeInvokeBearer(token: string): Promise<boolean> {
  if (!token || !serviceRoleKey) return false;
  if (token === serviceRoleKey) return true;
  if (!token.startsWith("eyJ")) return false;
  const secret = jwtSigningSecretForVerify();
  if (!secret) return false;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] },
    );
    return String(payload.role ?? "") === "service_role";
  } catch {
    return false;
  }
}

function getJerusalemParts(d = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
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

function jerusalemYmd(parts: ReturnType<typeof getJerusalemParts>): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${
    String(parts.day).padStart(2, "0")
  }`;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function shouldRunAfterNoonJerusalem(
  parts: ReturnType<typeof getJerusalemParts>,
): boolean {
  return parts.hour >= SCHEDULE_HOUR;
}

/** Match calendar birthday in Jerusalem (Feb 29 → Feb 28 on non-leap years). */
function isBirthdayToday(
  birthDateStr: string,
  j: ReturnType<typeof getJerusalemParts>,
): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDateStr).trim());
  if (!m) return false;
  const bm = parseInt(m[2], 10);
  const bd = parseInt(m[3], 10);
  if (bm === j.month && bd === j.day) return true;
  if (
    !isLeapYear(j.year) &&
    j.month === 2 &&
    j.day === 28 &&
    bm === 2 &&
    bd === 29
  ) {
    return true;
  }
  return false;
}

function birthdayMessage(businessDisplayName: string): string {
  const name = String(businessDisplayName || "העסק").trim() || "העסק";
  return `מזל טוב! ${name} מאחלים לך יום מלא שמחה ואור — ושנה נפלאה קדימה.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const token = bearerOrApikeyToken(req);
  if (!(await authorizeInvokeBearer(token))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { force?: boolean; forceBusinessId?: string } = {};
  try {
    const t = await req.text();
    if (t) body = JSON.parse(t);
  } catch {
    /* ignore */
  }

  const force = Boolean(body.force);
  const forceBusinessId = body.forceBusinessId
    ? String(body.forceBusinessId).trim()
    : null;

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const j = getJerusalemParts();
    const todayYmd = jerusalemYmd(j);

    if (!force && !shouldRunAfterNoonJerusalem(j)) {
      return json({
        ok: true,
        skipped: "outside_schedule",
        timeZone: TZ,
        jerusalemNow: {
          ...j,
          ymd: todayYmd,
        },
        hint:
          "POST with Authorization: Bearer SERVICE_ROLE_KEY and JSON {\"force\":true} to test anytime.",
      });
    }

    let bizQuery = admin
      .from("business_profile")
      .select("id, display_name");

    if (forceBusinessId) {
      bizQuery = bizQuery.eq("id", forceBusinessId);
    }

    const { data: businesses, error: bizErr } = await bizQuery;

    if (bizErr) {
      console.error("[birthday-notifications] businesses", bizErr);
      return json({ error: "DB error (businesses)" }, 500);
    }

    let inserted = 0;
    let skippedAlready = 0;
    let skippedNoPhone = 0;
    let skippedBlocked = 0;
    let birthdayMatches = 0;

    for (const biz of businesses || []) {
      const businessId = biz.id as string;
      const displayName = (biz.display_name as string) || "העסק";

      const { data: clients, error: usersErr } = await admin
        .from("users")
        .select(
          "id, name, phone, birth_date, birthday_notification_sent_date, client_approved, block",
        )
        .eq("business_id", businessId)
        .eq("user_type", "client")
        .not("birth_date", "is", null);

      if (usersErr) {
        console.error("[birthday-notifications] users", businessId, usersErr);
        continue;
      }

      for (const u of clients || []) {
        if (u.block === true) {
          skippedBlocked++;
          continue;
        }
        if (u.client_approved === false) {
          skippedBlocked++;
          continue;
        }
        const birth = u.birth_date as string | null;
        if (!birth || !isBirthdayToday(birth, j)) continue;
        birthdayMatches++;
        if (u.birthday_notification_sent_date === todayYmd) {
          skippedAlready++;
          continue;
        }
        const phone = String(u.phone || "").trim();
        if (!phone) {
          skippedNoPhone++;
          continue;
        }

        const recipientName = String(u.name || "לקוח").trim() || "לקוח";

        const { data: ins, error: insErr } = await admin
          .from("notifications")
          .insert({
            title: BIRTHDAY_TITLE,
            content: birthdayMessage(displayName),
            type: NOTIFICATION_TYPE,
            recipient_name: recipientName,
            recipient_phone: phone,
            business_id: businessId,
            user_id: u.id as string,
            is_read: false,
          })
          .select("id")
          .maybeSingle();

        if (insErr || !ins?.id) {
          console.error(
            "[birthday-notifications] insert failed",
            businessId,
            u.id,
            insErr,
          );
          continue;
        }

        const { error: updErr } = await admin
          .from("users")
          .update({ birthday_notification_sent_date: todayYmd })
          .eq("id", u.id as string)
          .eq("business_id", businessId);

        if (updErr) {
          console.error(
            "[birthday-notifications] stamp failed (notification created)",
            u.id,
            updErr,
          );
        }

        inserted++;
      }
    }

    return json({
      ok: true,
      inserted,
      birthdayMatches,
      skippedAlready,
      skippedNoPhone,
      skippedBlocked,
      businesses: (businesses || []).length,
      timeZone: TZ,
      jerusalemDate: todayYmd,
      force: force || undefined,
      forceBusinessId: forceBusinessId || undefined,
      hint:
        "Schedule: pg_cron or external cron, hourly or at 12:05 Asia/Jerusalem, POST this function with service role JWT. Test: {\"force\":true,\"forceBusinessId\":\"<uuid>\"}",
    });
  } catch (e) {
    console.error("[birthday-notifications]", e);
    return json({ error: String(e) }, 500);
  }
});
