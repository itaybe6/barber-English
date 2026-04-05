// @ts-nocheck
/**
 * Periodic job:
 * - client_reminder: business_profile.client_reminder_minutes (business-wide), quiet hours Asia/Jerusalem 08:00–21:00
 * - admin_reminder: business_profile.reminder_minutes_by_user[barber_id], optional (null/0 = off), any time
 *
 * Invoke: Authorization: Bearer <service_role> — same string as Edge SUPABASE_SERVICE_ROLE_KEY,
 * or legacy eyJ… JWT signed with project JWT Secret (verified via jose when strings differ).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/jose@v5.2.3/index.ts";
import { DateTime } from "npm:luxon@3.5.0";

const TZ = "Asia/Jerusalem";
const QUIET_START_HOUR = 8;
const QUIET_END_HOUR = 21;
const FALLBACK_HOUR = 20;
const FALLBACK_MINUTE = 59;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

function jwtSigningSecretForVerify(): string {
  return (
    Deno.env.get("SUPABASE_JWT_SECRET") ??
    Deno.env.get("JWT_SECRET") ??
    ""
  ).trim();
}

/** pg_net often sends legacy eyJ service_role; Edge may use sb_secret_ — verify HS256 when needed. */
async function authorizeInvokeBearer(token: string): Promise<boolean> {
  if (!token || !serviceRoleKey) return false;
  if (token === serviceRoleKey) return true;
  if (!token.startsWith("eyJ")) return false;
  const secret = jwtSigningSecretForVerify();
  if (!secret) {
    console.error(
      "[appointment-reminders] auth: eyJ bearer but no JWT signing secret in Edge env",
    );
    return false;
  }
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] },
    );
    return String(payload.role ?? "") === "service_role";
  } catch (e) {
    console.error("[appointment-reminders] auth: jwt verify failed", String(e));
    return false;
  }
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function appointmentStartLocal(
  slotDate: string,
  slotTime: string,
): DateTime | null {
  const t = (slotTime || "00:00").trim().slice(0, 5);
  const iso = `${slotDate}T${t.length === 5 ? t : "00:00"}`;
  const dt = DateTime.fromISO(iso, { zone: TZ });
  return dt.isValid ? dt : null;
}

function isInsideClientSendWindow(local: DateTime): boolean {
  const mins = local.hour * 60 + local.minute;
  const startM = QUIET_START_HOUR * 60;
  const endM = QUIET_END_HOUR * 60;
  return mins >= startM && mins < endM;
}

function computeClientSendAtLocal(
  apptStart: DateTime,
  leadMinutes: number,
): DateTime {
  const ideal = apptStart.minus({ minutes: leadMinutes });
  if (isInsideClientSendWindow(ideal)) {
    return ideal;
  }
  const idealMins = ideal.hour * 60 + ideal.minute;
  const startM = QUIET_START_HOUR * 60;
  if (idealMins < startM) {
    return ideal.minus({ days: 1 }).set({
      hour: FALLBACK_HOUR,
      minute: FALLBACK_MINUTE,
      second: 0,
      millisecond: 0,
    });
  }
  return ideal.set({
    hour: FALLBACK_HOUR,
    minute: FALLBACK_MINUTE,
    second: 0,
    millisecond: 0,
  });
}

function leadFromMap(
  map: Record<string, unknown> | null | undefined,
  barberId: string | null | undefined,
): number | null {
  if (!barberId || !map || typeof map !== "object") return null;
  const raw = map[barberId];
  if (raw === null || typeof raw === "undefined") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(1440, Math.max(1, n));
}

/** Business-wide client reminder (integer minutes on business_profile). */
function clientLeadMinutes(raw: unknown): number | null {
  if (raw === null || typeof raw === "undefined") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(1440, Math.max(1, n));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!(await authorizeInvokeBearer(token))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const nowUtc = DateTime.utc();
  const nowLocal = nowUtc.setZone(TZ);
  const todayDate = nowLocal.toISODate();
  const windowEndDate = nowLocal.plus({ days: 2 }).toISODate();

  const { data: appointments, error: apptErr } = await admin
    .from("appointments")
    .select(
      "id, business_id, service_name, slot_date, slot_time, client_name, client_phone, barber_id, status, client_reminder_sent_at, admin_reminder_sent_at",
    )
    .eq("is_available", false)
    .in("status", ["confirmed", "pending"])
    .gte("slot_date", todayDate ?? "1970-01-01")
    .lte("slot_date", windowEndDate ?? "2099-12-31")
    .or(
      "client_reminder_sent_at.is.null,admin_reminder_sent_at.is.null",
    )
    .limit(300);

  if (apptErr) {
    console.error("[appointment-reminders] appointments", apptErr);
    return json({ ok: false, error: "appointments_fetch_failed" }, 500);
  }

  const businessIds = [
    ...new Set((appointments ?? []).map((a) => a.business_id).filter(Boolean)),
  ];
  const profileByBusiness: Record<string, Record<string, unknown>> = {};

  if (businessIds.length) {
    const { data: profiles, error: profErr } = await admin
      .from("business_profile")
      .select(
        "id, reminder_minutes_by_user, client_reminder_minutes, display_name",
      )
      .in("id", businessIds);

    if (profErr) {
      console.error("[appointment-reminders] profiles", profErr);
      return json({ ok: false, error: "profiles_fetch_failed" }, 500);
    }
    for (const p of profiles ?? []) {
      profileByBusiness[String(p.id)] = p as Record<string, unknown>;
    }
  }

  const barberIdsNeedingUser = [
    ...new Set(
      (appointments ?? [])
        .filter((a) => a.barber_id)
        .map((a) => String(a.barber_id)),
    ),
  ];
  const barberById: Record<
    string,
    { id: string; name: string; phone: string }
  > = {};

  if (barberIdsNeedingUser.length) {
    const { data: barbers, error: buErr } = await admin
      .from("users")
      .select("id, name, phone, business_id")
      .in("id", barberIdsNeedingUser);
    if (buErr) {
      console.error("[appointment-reminders] barbers", buErr);
    } else {
      for (const u of barbers ?? []) {
        const id = String(u.id);
        barberById[id] = {
          id,
          name: String(u.name ?? "").trim() || "מנהל",
          phone: String(u.phone ?? "").trim(),
        };
      }
    }
  }

  let examined = 0;
  let clientInserted = 0;
  let adminInserted = 0;
  let skippedClientQuiet = 0;
  let errors = 0;

  const insideClientWindow = isInsideClientSendWindow(nowLocal);

  for (const row of appointments ?? []) {
    examined++;
    const profile = profileByBusiness[String(row.business_id)];

    const apptStart = appointmentStartLocal(row.slot_date, row.slot_time);
    if (!apptStart) {
      errors++;
      continue;
    }
    if (apptStart <= nowLocal) {
      continue;
    }

    const timeLabel = apptStart.toFormat("HH:mm");
    const dateLabel = apptStart.toFormat("dd.MM.yyyy");
    const serviceName = String(row.service_name ?? "שירות").trim();
    const clientNameForMsg = String(row.client_name ?? "").trim();

    // —— Client reminder ——
    if (!row.client_reminder_sent_at && insideClientWindow) {
      const phone = String(row.client_phone ?? "").trim();
      const lead = clientLeadMinutes(profile?.client_reminder_minutes);
      if (phone && lead !== null) {
        const sendAtLocal = computeClientSendAtLocal(apptStart, lead);
        if (sendAtLocal <= nowLocal) {
          const greeting = clientNameForMsg
            ? `היי ${clientNameForMsg}`
            : "שלום";
          const barberName = row.barber_id
            ? (barberById[String(row.barber_id)]?.name ?? "").trim()
            : "";
          const withBarber = barberName ? ` אצל ${barberName}` : "";
          const title = "תזכורת לתור";
          const content =
            `${greeting},\n\n` +
            `יש לך תור ל${serviceName}${withBarber} בתאריך ${dateLabel} בשעה ${timeLabel}.\n\n` +
            `נשמח לראותך!`;

          const { error: insErr } = await admin.from("notifications").insert({
            title,
            content,
            type: "client_reminder",
            recipient_name: clientNameForMsg || "לקוח",
            recipient_phone: phone,
            business_id: row.business_id,
            appointment_id: row.id,
            user_id: null,
            is_read: false,
          });

          if (insErr) {
            const dup = insErr.code === "23505" ||
              String(insErr.message || "").includes("duplicate key");
            if (dup) {
              await admin
                .from("appointments")
                .update({ client_reminder_sent_at: nowUtc.toISO() })
                .eq("id", row.id)
                .eq("business_id", row.business_id)
                .is("client_reminder_sent_at", null);
            } else {
              console.error("[appointment-reminders] client insert", insErr);
              errors++;
            }
          } else {
            await admin
              .from("appointments")
              .update({ client_reminder_sent_at: nowUtc.toISO() })
              .eq("id", row.id)
              .eq("business_id", row.business_id)
              .is("client_reminder_sent_at", null);
            clientInserted++;
          }
        }
      }
    } else if (!row.client_reminder_sent_at && !insideClientWindow) {
      const lead = clientLeadMinutes(profile?.client_reminder_minutes);
      const phone = String(row.client_phone ?? "").trim();
      if (phone && lead !== null) {
        const sendAtLocal = computeClientSendAtLocal(apptStart, lead);
        if (sendAtLocal <= nowLocal) {
          skippedClientQuiet++;
        }
      }
    }

    // —— Admin reminder ——
    if (!row.admin_reminder_sent_at && row.barber_id) {
      const adminMap = profile?.reminder_minutes_by_user as
        | Record<string, unknown>
        | null
        | undefined;
      const leadA = leadFromMap(adminMap, row.barber_id);
      const barber = barberById[String(row.barber_id)];
      if (leadA !== null && barber?.phone) {
        const sendAdmin = apptStart.minus({ minutes: leadA });
        if (sendAdmin <= nowLocal) {
          const clientLabel = String(row.client_name ?? "לקוח").trim() || "לקוח";
          const title = "תזכורת לתור קרוב";
          const content =
            `Reminder: ${clientLabel} · ${serviceName} · ${dateLabel} ${timeLabel}`;

          const { error: insErr } = await admin.from("notifications").insert({
            title,
            content,
            type: "admin_reminder",
            recipient_name: barber.name,
            recipient_phone: barber.phone,
            business_id: row.business_id,
            appointment_id: row.id,
            user_id: barber.id,
            is_read: false,
          });

          if (insErr) {
            const dup = insErr.code === "23505" ||
              String(insErr.message || "").includes("duplicate key");
            if (dup) {
              await admin
                .from("appointments")
                .update({ admin_reminder_sent_at: nowUtc.toISO() })
                .eq("id", row.id)
                .eq("business_id", row.business_id)
                .is("admin_reminder_sent_at", null);
            } else {
              console.error("[appointment-reminders] admin insert", insErr);
              errors++;
            }
          } else {
            await admin
              .from("appointments")
              .update({ admin_reminder_sent_at: nowUtc.toISO() })
              .eq("id", row.id)
              .eq("business_id", row.business_id)
              .is("admin_reminder_sent_at", null);
            adminInserted++;
          }
        }
      }
    }
  }

  return json({
    ok: true,
    examined,
    clientInserted,
    adminInserted,
    skippedClientQuiet,
    errors,
    now_jerusalem: nowLocal.toISO(),
    insideClientSendWindow: insideClientWindow,
  });
});
