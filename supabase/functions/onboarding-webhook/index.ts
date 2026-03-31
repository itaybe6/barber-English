// @ts-nocheck
/**
 * Landing / Lovable onboarding → creates tenant like Super Admin "הוספת עסק".
 *
 * URL (for Lovable secret WEBHOOK_URL):
 *   https://<project-ref>.supabase.co/functions/v1/onboarding-webhook
 *
 * Supabase Dashboard → Edge Functions → Secrets:
 *   ONBOARDING_WEBHOOK_SECRET — long random string; same value must be sent as:
 *     Authorization: Bearer <ONBOARDING_WEBHOOK_SECRET>
 *     OR x-onboarding-secret / X-Webhook-Secret (לובאל) — אותו ערך
 *
 * Optional Pulseem: same as app — set PULSEEM_MAIN_API_KEY + PULSEEM_FIELD_ENCRYPTION_KEY;
 * after insert we call pulseem-provision-subaccount (service role, internal).
 *
 * POST JSON — לובאל יכול לשלוח שטוח או מקונן תחת: data, payload, body, record,
 * onboarding, form, submission, business, user, details, customer, tenant
 *
 * שם עסק (display_name ב-DB) — עדיפות עברית, אחרת אנגלית:
 *   business_name_hebrew, businessNameHebrew, business_name_he, name_he,
 *   businessName, display_name, company_name, שם_העסק_בעברית
 *   business_name_english, businessNameEnglish, business_name_en, name_en, שם_העסק_באנגלית
 *
 * שם אפליקציה / תיקיית branding (אנגלית, אות ראשונה חייבת להיות אות):
 *   clientName, app_name, appName, application_name, app_slug, client_slug, expo_slug, bundle_id
 *
 * מנהל:
 *   adminName, manager_name, admin_name, owner_name, full_name, contact_name, שם_המנהל
 *   adminPhone, phone, manager_phone, mobile, cellphone, tel, מספר_טלפון
 *   adminPassword, password, manager_password, admin_pass, סיסמה, סיסמת_מנהל
 *
 * כתובת: address, business_address, location, full_address, כתובת_העסק
 *
 * צבע: primaryColor, primary_color, brand_color, theme_color, accent_color
 *
 * תמונות — שטוח או תחת images / branding / assets / media:
 *   logo + logoBase64, logo_base64, logo_image
 *   icon + iconBase64, icon_base64, app_icon
 *   splash + splashBase64, splash_base64
 *   (נתמך גם URL https — הורדה לשרת)
 *
 * תמונות דף בית (מסלול "תמונות" בלובאל — תמונת מנהל וכו'):
 *   נשמרות ב-business_profile.home_hero_images (כמו עריכת בית באפליקציה).
 *   שדות: managerPhoto, manager_photo, תמונת_מנהל, admin_photo,
 *   או מערך home_hero_images | homeHeroImages | hero_images | manager_photos (מחרוזות base64 / URL).
 *   אפשר גם תחת images.manager_photo וכו'.
 *   הלוגו העסקי נשאר בנתיב branding (logo.png) — לא מערבבים עם hero אלא אם נשלח גם במערך hero.
 *
 * שירותים (אופציונלי): services | service_list | offered_services | שירותים — מערך ללא הגבלת כמות:
 *   { name | שם_שירות, price | מחיר, duration | duration_minutes | משך | משך_בדקות,
 *     תמונה אופציונלית: image_url | image | service_image | תמונה | אובייקט image: { url | base64 } }
 *   אם ריק — נוצרים 3 שירותי ברירת מחדל כמו בסופר־אדמין.
 *
 * פולסים: pulseemFromNumber, pulseem_from_number (ברירת מחדל clientName), pulseemSubPassword
 *
 * SMS לבעל המערכת אחרי onboarding מוצלח (חשבון Pulseem ראשי — PULSEEM_MAIN_API_KEY):
 *   ONBOARDING_NOTIFY_SMS_PHONE — יעד(ים): מספרים מופרדים בפסיק/נקודה-פסיק/שורה חדשה
 *     ברירת מחדל: 0502307500,0527488779
 *   ONBOARDING_WEBHOOK_FROM_NUMBER — Secret: שולח SMS ייעודי לפונקציה זו (למשל 0508085737); עדיפות ראשונה
 *   ONBOARDING_NOTIFY_SMS_FROM — שולח חלופי; אחרת PULSEEM_REST_FROM_NUMBER / PULSEEM_FROM_NUMBER / PULSEEM_OTP_FROM_NUMBER
 *   אם אף אחד לא מוגדר — ברירת מחדל קודית לשולח: 0508085737
 *   ONBOARDING_NOTIFY_SMS_DISABLED=1 — לכבות שליחה
 *
 * מבנה לובאל (דוגמה):
 *   { "event": "new_business_onboarded", "timestamp": "...", "data": { "business": { ... }, "services": [...] } }
 *   business: business_name_he, business_name_en, app_name_en, address, manager_name, phone,
 *   manager_password, logo_url, manager_photo_url, id (UUID אופציונלי — יהיה business_profile.id),
 *   plan, price, commitment (לא נשמרים ב-DB כרגע)
 *   services[]: name, price, duration_minutes, sort_order → order_index
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-onboarding-secret, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

/** מיזוג שדות מתוך אובייקטים מקוננים (דפוס נפוץ בלובאל / webhooks). */
function mergePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const nestKeys = [
    "data",
    "payload",
    "body",
    "record",
    "onboarding",
    "form",
    "submission",
    "business",
    "user",
    "details",
    "customer",
    "tenant",
  ];
  for (const k of nestKeys) {
    const v = raw[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, v as Record<string, unknown>);
    }
  }
  // Lovable: data.business.{ ... } — משטחים לשורש ל-pickStr
  const bizNested = out.business;
  if (bizNested && typeof bizNested === "object" && !Array.isArray(bizNested)) {
    Object.assign(out, bizNested as Record<string, unknown>);
  }
  return out;
}

function pickNumber(
  o: Record<string, unknown>,
  keys: string[],
  defaultVal: number,
): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(String(v).replace(/,/g, "").trim());
      if (Number.isFinite(n)) return n;
    }
  }
  return defaultVal;
}

function subObject(
  o: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const v = o[key];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickImageField(p: Record<string, unknown>, keys: string[]): string {
  const direct = pickStr(p, keys);
  if (direct) return direct;
  for (const containerKey of ["images", "branding", "assets", "media"]) {
    const inner = subObject(p, containerKey);
    if (inner) {
      const hit = pickStr(inner, keys);
      if (hit) return hit;
    }
  }
  return "";
}

async function imageInputToBytes(input: string): Promise<Uint8Array | null> {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const r = await fetch(s, { redirect: "follow" });
      if (!r.ok) return null;
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      console.warn("[onboarding-webhook] image fetch failed", e);
      return null;
    }
  }
  try {
    return base64ToBytes(s);
  } catch {
    return null;
  }
}

function guessImageContentType(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function extFromContentType(ct: string): string {
  const p = (ct.split("/")[1] || "jpg").toLowerCase().split(";")[0];
  if (p === "jpeg") return "jpg";
  return p || "jpg";
}

async function uploadBytesGetPublicUrl(
  admin: ReturnType<typeof createClient>,
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const { error } = await admin.storage.from("app_design").upload(
    storagePath,
    bytes,
    { contentType, upsert: false },
  );
  if (error) {
    console.error("[onboarding-webhook] storage", storagePath, error);
    return null;
  }
  const { data } = admin.storage.from("app_design").getPublicUrl(storagePath);
  return data?.publicUrl ?? null;
}

/** מקורות גולמיים (base64 / URL) לתמונות שמוצגות בדף הבית — כמו edit-home-hero. */
function collectHeroSourceStrings(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  const single = pickImageField(p, [
    "managerPhoto",
    "manager_photo",
    "manager_photo_url",
    "admin_photo",
    "manager_image",
    "managerImage",
    "תמונת_מנהל",
    "home_hero_main",
  ]);
  if (single) add(single);

  const inner = subObject(p, "images");
  if (inner) {
    const m = pickStr(inner, [
      "manager",
      "managerPhoto",
      "manager_photo",
      "admin_photo",
      "manager_image",
      "תמונת_מנהל",
    ]);
    if (m) add(m);
    const heroArr = inner.home_hero ?? inner.hero ?? inner.homeHero;
    if (Array.isArray(heroArr)) {
      for (const item of heroArr) {
        if (typeof item === "string") add(item);
      }
    }
  }

  const arrays = [
    p.home_hero_images,
    p.homeHeroImages,
    p.hero_images,
    p.heroImages,
    p.manager_photos,
    p.managerPhotos,
    p.home_page_images,
  ];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === "string" && item.trim()) add(item.trim());
      else if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const s = pickStr(o, [
          "url",
          "src",
          "base64",
          "data",
          "image",
          "imageUrl",
          "image_url",
        ]);
        if (s) add(s);
      }
    }
  }

  return out;
}

async function uploadHeroImagesToStorage(
  admin: ReturnType<typeof createClient>,
  sources: string[],
): Promise<string[]> {
  const urls: string[] = [];
  let seq = 0;
  for (const src of sources) {
    const bytes = await imageInputToBytes(src);
    if (!bytes?.length) continue;
    const ct = guessImageContentType(bytes);
    const ext = extFromContentType(ct);
    const path =
      `business-images/home-hero/${Date.now()}_${seq++}_${
        crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      }.${ext}`;
    const url = await uploadBytesGetPublicUrl(admin, path, bytes, ct);
    if (url) urls.push(url);
  }
  return urls;
}

function pickServiceImageInput(o: Record<string, unknown>): string {
  const direct = pickStr(o, [
    "image_url",
    "imageUrl",
    "image",
    "service_image",
    "serviceImage",
    "photo",
    "picture",
    "תמונה",
    "תמונת_שירות",
    "service_image_url",
  ]);
  if (direct) return direct;
  const img = subObject(o, "image");
  if (img) {
    const nested = pickStr(img, ["url", "src", "base64", "data", "dataUrl"]);
    if (nested) return nested;
  }
  return pickImageField(o, ["image_base64", "imageBase64"]);
}

/** טיוטות שירותים — ללא הגבלת כמות; תמונה אופציונלית; sort_order → order_index. */
function buildServiceDrafts(p: Record<string, unknown>): Array<{
  name: string;
  price: number;
  duration_minutes: number;
  imageInput?: string;
  order_index?: number;
}> {
  const defaults: Array<{
    name: string;
    price: number;
    duration_minutes: number;
    imageInput?: string;
    order_index?: number;
  }> = [
    { name: "שירות 1", price: 150, duration_minutes: 60 },
    { name: "שירות 2", price: 50, duration_minutes: 30 },
    { name: "שירות 3", price: 80, duration_minutes: 45 },
  ];

  const rawList =
    p.services ?? p.service_list ?? p.offered_services ?? p.שירותים;
  if (!Array.isArray(rawList) || rawList.length === 0) return defaults;

  const rows: Array<{
    name: string;
    price: number;
    duration_minutes: number;
    imageInput?: string;
    order_index?: number;
  }> = [];

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = pickStr(o, [
      "name",
      "title",
      "service_name",
      "serviceName",
      "שם",
      "שם_שירות",
      "שם_השירות",
    ]);
    if (!name) continue;
    const price = pickNumber(o, ["price", "cost", "amount", "מחיר"], 0);
    let dur = pickNumber(
      o,
      [
        "duration_minutes",
        "duration",
        "minutes",
        "משך",
        "משך_בדקות",
        "משך_דקות",
      ],
      30,
    );
    dur = Math.max(5, Math.min(480, dur || 30));
    const imageInput = pickServiceImageInput(o);
    const sortOrder = pickNumber(o, ["sort_order", "order_index", "order"], -1);
    const row: (typeof rows)[0] = {
      name,
      price,
      duration_minutes: dur,
    };
    if (imageInput) row.imageInput = imageInput;
    if (sortOrder >= 0) row.order_index = Math.floor(sortOrder);
    rows.push(row);
  }
  const sorted = rows.length
    ? [...rows].sort((a, b) =>
      (a.order_index ?? 1e6) - (b.order_index ?? 1e6)
    )
    : defaults;
  return sorted.length ? sorted : defaults;
}

function verifyOnboardingSecret(req: Request): boolean {
  const expected = (Deno.env.get("ONBOARDING_WEBHOOK_SECRET") ?? "").trim();
  if (!expected) return false;
  const auth = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (auth === expected) return true;
  const h = (req.headers.get("x-onboarding-secret") ?? "").trim();
  if (h === expected) return true;
  const wh = (req.headers.get("x-webhook-secret") ?? "").trim();
  return wh === expected;
}

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = String(b64).replace(/^data:[^;]+;base64,/, "").trim();
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function hashAdminPassword(pw: string): string {
  if (pw === "123456") return "default_hash";
  return `hash_${pw}`;
}

async function invokeProvision(
  supabaseUrl: string,
  serviceRole: string,
  body: Record<string, unknown>,
): Promise<{
  ok: boolean;
  errorMessage?: string;
  envPlaintext?: Record<string, string>;
}> {
  const base = supabaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/functions/v1/pulseem-provision-subaccount`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!res.ok || !data) {
    return { ok: false, errorMessage: `provision HTTP ${res.status}` };
  }
  if (data.error === "unauthorized") {
    return { ok: false, errorMessage: "provision unauthorized" };
  }
  if (!data.ok) {
    return {
      ok: false,
      errorMessage: String(data.errorMessage ?? "provision failed"),
    };
  }
  const envPlaintext = data.envPlaintext as Record<string, string> | undefined;
  return { ok: true, envPlaintext };
}

const PULSEEM_REST_SEND = "https://api.pulseem.com/api/v1/SmsApi/SendSms";
const ONBOARDING_OWNER_SMS_TEXT =
  "מזל טוב אדיר ואיתי האלופים ! יש לכם לקוח חדש";

const DEFAULT_NOTIFY_SMS_PHONES = "0502307500,0527488779";

function phoneDigitsSms(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

function normalizeSmsDestination(raw: string): string {
  const d = phoneDigitsSms(raw);
  if (d.startsWith("972")) return d;
  if (d.startsWith("0") && d.length >= 9 && d.length <= 11) return "972" + d.slice(1);
  if (d.length === 9 && /^5\d{8}$/.test(d)) return "972" + d;
  return d;
}

/** רשימת יעדי SMS — פסיק / ; / שורה חדשה, ללא כפילויות */
function parseNotifyPhoneNumbers(raw: string): string[] {
  const parts = raw
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const n = normalizeSmsDestination(p);
    if (n.length < 11) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

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

/** לא זורק על unknown — שליחת עדכון לבעלים היא best-effort */
function assertPulseemRestJsonLenient(responseText: string): void {
  const trimmed = responseText.trim();
  if (!trimmed) throw new Error("pulseem_rest_empty_response");
  if (!trimmed.startsWith("{")) {
    const low = trimmed.toLowerCase();
    if (low === "true" || low === '"true"') return;
    if (low === "false" || low === '"false"') {
      throw new Error("pulseem_rest_rejected");
    }
    throw new Error("pulseem_rest_non_json_body");
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
        "pulseem_rest_rejected",
    ).trim();
    throw new Error(msg || "pulseem_rest_rejected");
  }
  if (c === "unknown") {
    console.warn(
      "[onboarding-webhook] Pulseem REST ambiguous response:",
      trimmed.slice(0, 500),
    );
  }
}

function pulseemRestIsAsyncOnboarding(): boolean {
  const v = String(Deno.env.get("PULSEEM_REST_IS_ASYNC") ?? "true").trim()
    .toLowerCase();
  return !/^(0|false|no|off)$/.test(v);
}

/**
 * הודעה לבעל הפלטפורמה כשלקוח חדש סיים onboarding (חשבון Pulseem ראשי).
 * לא מפילה את ה-webhook — רק לוגים בשגיאה.
 */
async function sendOwnerNewClientSmsBestEffort(): Promise<{
  sent: boolean;
  skipReason?: string;
  destinations?: number;
}> {
  if (/^(1|true|yes)$/i.test(
    String(Deno.env.get("ONBOARDING_NOTIFY_SMS_DISABLED") ?? "").trim(),
  )) {
    return { sent: false, skipReason: "disabled" };
  }

  const mainKey = (Deno.env.get("PULSEEM_MAIN_API_KEY") ?? "").trim();
  if (!mainKey) {
    return { sent: false, skipReason: "missing_PULSEEM_MAIN_API_KEY" };
  }

  const rawPhones =
    (Deno.env.get("ONBOARDING_NOTIFY_SMS_PHONE") ?? "").trim() ||
    DEFAULT_NOTIFY_SMS_PHONES;
  const toNums = parseNotifyPhoneNumbers(rawPhones);
  if (toNums.length === 0) {
    return { sent: false, skipReason: "invalid_phone" };
  }

  const fromNum = (
    (Deno.env.get("ONBOARDING_WEBHOOK_FROM_NUMBER") ?? "").trim() ||
    (Deno.env.get("ONBOARDING_NOTIFY_SMS_FROM") ?? "").trim() ||
    (Deno.env.get("PULSEEM_REST_FROM_NUMBER") ?? "").trim() ||
    (Deno.env.get("PULSEEM_FROM_NUMBER") ?? "").trim() ||
    (Deno.env.get("PULSEEM_OTP_FROM_NUMBER") ?? "").trim() ||
    "0508085737"
  );

  const sendId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const referenceList = toNums.map(() =>
    crypto.randomUUID().replace(/-/g, "").slice(0, 20)
  );
  const textList = toNums.map(() => ONBOARDING_OWNER_SMS_TEXT);

  const body = {
    sendId,
    isAsync: pulseemRestIsAsyncOnboarding(),
    smsSendData: {
      fromNumber: fromNum,
      toNumberList: toNums,
      referenceList,
      textList,
      isAutomaticUnsubscribeLink: false,
    },
  };

  const res = await fetch(PULSEEM_REST_SEND, {
    method: "POST",
    headers: {
      APIKEY: mainKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Pulseem REST ${res.status}: ${responseText.slice(0, 240)}`);
  }
  assertPulseemRestJsonLenient(responseText);
  console.log("[onboarding-webhook] owner notify SMS ok, to count=", toNums.length);
  return { sent: true, destinations: toNums.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const secretOk = verifyOnboardingSecret(req);
  if (!(Deno.env.get("ONBOARDING_WEBHOOK_SECRET") ?? "").trim()) {
    return json(
      {
        error: "server_misconfigured",
        hint: "Set Edge secret ONBOARDING_WEBHOOK_SECRET in Supabase",
      },
      503,
    );
  }
  if (!secretOk) {
    return json({ error: "unauthorized" }, 401);
  }

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const p = mergePayload(raw);

  const nameHe = pickStr(p, [
    "business_name_he",
    "business_name_hebrew",
    "businessNameHebrew",
    "name_he",
    "name_hebrew",
    "shop_name_he",
    "שם_העסק_בעברית",
  ]);
  const nameEn = pickStr(p, [
    "business_name_english",
    "businessNameEnglish",
    "business_name_en",
    "name_en",
    "shop_name_en",
    "שם_העסק_באנגלית",
  ]);
  const businessName =
    nameHe ||
    nameEn ||
    pickStr(p, [
      "businessName",
      "display_name",
      "business_name",
      "company_name",
      "shop_name",
      "שם_העסק",
    ]);

  let clientName = pickStr(p, [
    "app_name_en",
    "clientName",
    "app_name",
    "appName",
    "application_name",
    "applicationName",
    "app_slug",
    "client_slug",
    "expo_slug",
    "bundle_id",
    "שם_האפליקציה",
    "שם_האפליקציה_באנגלית",
  ]).replace(/[^a-zA-Z0-9]/g, "");

  const adminName = pickStr(p, [
    "adminName",
    "manager_name",
    "managerName",
    "admin_name",
    "owner_name",
    "full_name",
    "contact_name",
    "שם_המנהל",
  ]);
  const adminPhone = pickStr(p, [
    "adminPhone",
    "phone",
    "manager_phone",
    "admin_phone",
    "mobile",
    "cellphone",
    "tel",
    "מספר_טלפון",
  ]);
  const adminPassword = pickStr(p, [
    "adminPassword",
    "password",
    "manager_password",
    "admin_pass",
    "user_password",
    "סיסמה",
    "סיסמת_מנהל",
    "סיסמא_לחשבון_מנהל",
  ]);
  const address = pickStr(p, [
    "address",
    "business_address",
    "location",
    "full_address",
    "כתובת_העסק",
  ]);
  const primaryColor =
    pickStr(p, [
      "primaryColor",
      "primary_color",
      "brand_color",
      "theme_color",
      "accent_color",
    ]) || "#000000";
  const pulseemFromNumber = pickStr(p, [
    "pulseemFromNumber",
    "pulseem_from_number",
  ]);
  const pulseemSubPassword = pickStr(p, [
    "pulseemSubPassword",
    "pulseem_sub_password",
  ]);

  const logoInput = pickImageField(p, [
    "logoBase64",
    "logo_base64",
    "logo",
    "logo_image",
    "logoUrl",
    "logo_url",
  ]);
  const iconInput = pickImageField(p, [
    "iconBase64",
    "icon_base64",
    "icon",
    "app_icon",
    "iconUrl",
    "icon_url",
  ]);
  const splashInput = pickImageField(p, [
    "splashBase64",
    "splash_base64",
    "splash",
    "splash_image",
    "splashUrl",
    "splash_url",
  ]);

  if (!businessName || !clientName || !adminName || !adminPhone || !adminPassword) {
    return json(
      {
        error: "validation_failed",
        hint:
          "Required: business name (Hebrew or English field), app_name/clientName (English slug), adminName, adminPhone, adminPassword. Nested objects merged from data/payload/business/…",
        receivedKeys: Object.keys(p),
      },
      400,
    );
  }
  if (!/^[a-zA-Z]/.test(clientName)) {
    return json(
      {
        error: "invalid_client_name",
        hint: "app_name / clientName must start with a letter (English)",
      },
      400,
    );
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  if (!supabaseUrl || !serviceRole) {
    return json({ error: "server_misconfigured" }, 503);
  }

  const externalBusinessId = pickStr(p, [
    "id",
    "business_id",
    "tenant_id",
    "onboarding_business_id",
  ]);
  let businessId = crypto.randomUUID();
  if (externalBusinessId && isValidUuid(externalBusinessId)) {
    businessId = externalBusinessId.trim().toLowerCase();
  }
  const slug = clientName.toLowerCase();
  const color = primaryColor;
  const pulseFrom = pulseemFromNumber || clientName;

  const admin = createClient(supabaseUrl, serviceRole);

  const { error: profileError } = await admin.from("business_profile").insert({
    id: businessId,
    display_name: businessName,
    address: address || "",
    phone: adminPhone,
    primary_color: color,
    branding_client_name: clientName,
    home_hero_images: [],
    break_by_user: {},
    booking_open_days_by_user: {},
    min_cancellation_hours: 24,
    booking_open_days: 7,
    ...(pulseFrom ? { pulseem_from_number: pulseFrom } : {}),
  });

  if (profileError) {
    console.error("[onboarding-webhook] business_profile", profileError);
    if (profileError.code === "23505") {
      return json({
        ok: true,
        duplicate: true,
        businessId,
        message: "Business already onboarded (same id)",
      });
    }
    return json({ error: "db_error", detail: profileError.message }, 500);
  }

  const { data: adminRow, error: userError } = await admin
    .from("users")
    .insert({
      name: adminName,
      phone: adminPhone,
      user_type: "admin",
      business_id: businessId,
      password_hash: hashAdminPassword(adminPassword),
    })
    .select("id")
    .single();

  if (userError || !adminRow?.id) {
    console.error("[onboarding-webhook] users", userError);
    await admin.from("business_profile").delete().eq("id", businessId);
    return json({ error: "admin_user_failed", detail: userError?.message }, 500);
  }

  const adminUserId = adminRow.id;

  const heroSources = collectHeroSourceStrings(p);
  const heroUrls = await uploadHeroImagesToStorage(admin, heroSources);
  if (heroUrls.length) {
    const { error: heroErr } = await admin
      .from("business_profile")
      .update({ home_hero_images: heroUrls })
      .eq("id", businessId);
    if (heroErr) {
      console.error("[onboarding-webhook] home_hero_images", heroErr);
    }
  }

  const serviceDrafts = buildServiceDrafts(p);
  const serviceRows: Array<{
    name: string;
    price: number;
    duration_minutes: number;
    is_active: boolean;
    business_id: string;
    worker_id: string;
    image_url?: string;
    order_index?: number;
  }> = [];

  let svcSeq = 0;
  for (const d of serviceDrafts) {
    let image_url: string | undefined;
    if (d.imageInput) {
      const b = await imageInputToBytes(d.imageInput);
      if (b?.length) {
        const ct = guessImageContentType(b);
        const ext = extFromContentType(ct);
        const path = `services/${Date.now()}_${svcSeq++}_${
          crypto.randomUUID().replace(/-/g, "").slice(0, 10)
        }.${ext}`;
        const u = await uploadBytesGetPublicUrl(admin, path, b, ct);
        if (u) image_url = u;
      }
    }
    const row: (typeof serviceRows)[0] = {
      name: d.name,
      price: d.price,
      duration_minutes: d.duration_minutes,
      is_active: true,
      business_id: businessId,
      worker_id: adminUserId,
    };
    if (image_url) row.image_url = image_url;
    if (typeof d.order_index === "number") row.order_index = d.order_index;
    serviceRows.push(row);
  }

  const { error: servicesError } = await admin.from("services").insert(
    serviceRows,
  );
  if (servicesError) {
    console.error("[onboarding-webhook] services", servicesError);
  }

  let pulseemOk = false;
  let pulseemError: string | undefined;
  let envPlaintext: Record<string, string> | undefined;

  const provBody: Record<string, unknown> = { businessId };
  if (pulseemSubPassword) provBody.subPassword = pulseemSubPassword;
  if (pulseFrom) provBody.fromNumber = pulseFrom;

  const prov = await invokeProvision(supabaseUrl, serviceRole, provBody);
  if (prov.ok && prov.envPlaintext) {
    pulseemOk = true;
    envPlaintext = prov.envPlaintext;
  } else if (!prov.ok) {
    pulseemError = prov.errorMessage;
    console.warn("[onboarding-webhook] pulseem skipped/failed:", pulseemError);
  }

  const envPulseLines: string[] = [
    "",
    "# Pulseem — מפתח מ«הגדרות API» (חשבון משנה), ל-Edge / אינטגרציות",
  ];
  if (envPlaintext?.PULSEEM_API_KEY) {
    envPulseLines.push(`PULSEEM_API_KEY=${envPlaintext.PULSEEM_API_KEY}`);
  } else {
    envPulseLines.push("# PULSEEM_API_KEY=");
  }
  if (envPlaintext?.PULSEEM_FROM_NUMBER || pulseFrom) {
    envPulseLines.push(
      `PULSEEM_FROM_NUMBER=${envPlaintext?.PULSEEM_FROM_NUMBER ?? pulseFrom}`,
    );
  } else {
    envPulseLines.push("# PULSEEM_FROM_NUMBER=");
  }
  envPulseLines.push("", "# Pulseem — Web Service (שליחת SMS / OTP ב-Edge)", "");
  if (envPlaintext?.PULSEEM_USER_ID) {
    envPulseLines.push(`PULSEEM_USER_ID=${envPlaintext.PULSEEM_USER_ID}`);
  } else {
    envPulseLines.push("# PULSEEM_USER_ID=");
  }
  if (envPlaintext?.PULSEEM_PASSWORD) {
    envPulseLines.push(`PULSEEM_PASSWORD=${envPlaintext.PULSEEM_PASSWORD}`);
  } else {
    envPulseLines.push("# PULSEEM_PASSWORD=");
  }
  envPulseLines.push("");

  const envContent = [
    `# ${businessName} Environment Configuration`,
    `EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl}`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=${serviceRole}`,
    `BUSINESS_ID=${businessId}`,
    `CLIENT_NAME=${clientName}`,
    ...envPulseLines,
  ].join("\n");

  const appConfigObj = {
    expo: {
      name: businessName,
      slug,
      version: "1.0.0",
      orientation: "portrait",
      icon: `./branding/${clientName}/icon.png`,
      scheme: slug,
      userInterfaceStyle: "automatic",
      splash: {
        image: `./branding/${clientName}/splash.png`,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
      ios: {
        buildNumber: "1",
        supportsTablet: true,
        bundleIdentifier: `com.${slug}.app`,
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
          CFBundleDevelopmentRegion: "en",
          CFBundleAllowMixedLocalizations: true,
          NSPhotoLibraryUsageDescription:
            "The app needs access to photos to select and upload images to the gallery or profile.",
          NSPhotoLibraryAddUsageDescription:
            "The app may save photos you've taken to your photo library.",
          NSCameraUsageDescription:
            "The app needs access to the camera to take photos for upload.",
        },
        jsEngine: "hermes",
      },
      android: {
        package: `com.${slug}.app`,
        versionCode: 1,
        adaptiveIcon: {
          foregroundImage: `./branding/${clientName}/icon.png`,
          backgroundColor: "#ffffff",
        },
        intentFilters: [
          {
            autoVerify: true,
            action: "VIEW",
            data: { scheme: "https", host: `${slug}.com` },
            category: ["BROWSABLE", "DEFAULT"],
          },
        ],
        supportsRtl: false,
      },
      web: { favicon: `./branding/${clientName}/icon.png` },
      plugins: [
        ["expo-router", { origin: `https://${slug}.com/` }],
        ["expo-notifications", { color: "#ffffff" }],
        "expo-web-browser",
        "expo-font",
        "expo-localization",
      ],
      experiments: { typedRoutes: true },
      locales: { he: "./assets/locales/he.json" },
      extra: {
        router: { origin: `https://${slug}.com/` },
        eas: { projectId: "" },
        locale: "en",
        CLIENT: clientName,
        BUSINESS_ID: businessId,
        logo: `./branding/${clientName}/logo.png`,
        logoWhite: `./branding/${clientName}/logo-white.png`,
      },
    },
  };

  const themeObj = {
    colors: {
      primary: color,
      secondary: color + "CC",
      accent: "#FF3B30",
      background: "#FFFFFF",
      surface: "#F2F2F7",
      text: "#1C1C1E",
      textSecondary: "#8E8E93",
      border: "#E5E5EA",
      success: "#34C759",
      warning: "#FF9500",
      error: "#FF3B30",
      info: "#007AFF",
    },
    branding: {
      logo: `./branding/${clientName}/logo.png`,
      logoWhite: `./branding/${clientName}/logo-white.png`,
      companyName: businessName,
      website: `https://${slug}.com`,
      supportEmail: `support@${slug}.com`,
    },
    fonts: { primary: "System", secondary: "System" },
  };

  const uploads: Promise<{ path: string; err?: string }>[] = [];

  const up = async (
    fileName: string,
    body: Uint8Array | string,
    contentType: string,
  ) => {
    const storagePath = `branding/${clientName}/${fileName}`;
    const bin = typeof body === "string"
      ? new TextEncoder().encode(body)
      : body;
    const { error } = await admin.storage.from("app_design").upload(
      storagePath,
      bin,
      { contentType, upsert: true },
    );
    if (error) {
      console.error("[onboarding-webhook] upload", fileName, error);
      return { path: fileName, err: error.message };
    }
    return { path: fileName };
  };

  uploads.push(up(".env", envContent, "text/plain"));
  uploads.push(
    up(
      "app.config.json",
      JSON.stringify(appConfigObj, null, 2),
      "application/json",
    ),
  );
  uploads.push(up("theme.json", JSON.stringify(themeObj, null, 2), "application/json"));

  if (logoInput) {
    const b = await imageInputToBytes(logoInput);
    if (b) uploads.push(up("logo.png", b, "image/png"));
  }
  if (iconInput) {
    const b = await imageInputToBytes(iconInput);
    if (b) uploads.push(up("icon.png", b, "image/png"));
  }
  if (splashInput) {
    const b = await imageInputToBytes(splashInput);
    if (b) uploads.push(up("splash.png", b, "image/png"));
  }

  const settled = await Promise.all(uploads);
  const uploadErrors = settled.filter((s) => s.err).map((s) => `${s.path}: ${s.err}`);

  let ownerNotifySms: { sent: boolean; skipReason?: string; error?: string } = {
    sent: false,
  };
  try {
    ownerNotifySms = await sendOwnerNewClientSmsBestEffort();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    console.warn("[onboarding-webhook] owner SMS failed:", msg);
    ownerNotifySms = { sent: false, error: msg };
  }

  return json({
    ok: true,
    businessId,
    clientName,
    displayName: businessName,
    servicesCreated: serviceRows.length,
    homeHeroImagesCount: heroUrls.length,
    pulseemProvisioned: pulseemOk,
    pulseemError: pulseemError ?? null,
    uploadWarnings: uploadErrors.length ? uploadErrors : undefined,
    ownerNotifySms,
  });
});
