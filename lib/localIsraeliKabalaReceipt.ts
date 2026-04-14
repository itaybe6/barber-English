import { Platform, Share } from 'react-native';
import type { Appointment, BusinessProfile } from '@/lib/supabase';
import { getBusinessId, supabase } from '@/lib/supabase';
import { allocateNextLocalKabalaReceiptSerial } from '@/lib/api/localKabalaReceiptSerial';
import { useAuthStore } from '@/stores/authStore';

export type LocalKabalaIssueErrorCode =
  | 'missing_business_id'
  | 'missing_osek'
  | 'missing_seller_name'
  | 'missing_address'
  | 'price_unknown'
  | 'invalid_status'
  | 'serial_failed'
  | 'pdf_failed';

/** Standard VAT rate for עוסק מורשה (verify periodically against רשות המסים). */
export const LOCAL_KABALA_VAT_RATE = 0.18;

export type LocalKabalaPaymentMethod = 'cash' | 'credit' | 'transfer' | 'check';

export type LocalKabalaReceiptOptions = {
  /** Default מזומן when omitted. */
  paymentMethod?: LocalKabalaPaymentMethod;
  /** Last 4 digits — shown only when payment is אשראי. */
  cardLast4?: string;
  /** מספר הקצאה from SHAAM when applicable (caller supplies after API). */
  allocationNumber?: string;
  /** Overrides `profile.vat_exempt`. */
  vatExempt?: boolean;
  /**
   * How `resolveServicePriceForAppointment` amount is interpreted for VAT lines.
   * `gross_incl_vat` — price is what the customer pays (incl. VAT). Default.
   * `net_before_vat` — price is net; total adds VAT.
   */
  priceBasis?: 'gross_incl_vat' | 'net_before_vat';
};

export type LocalKabalaReceiptMime = 'application/pdf' | 'text/html';

export type LocalKabalaIssueResult =
  | { ok: true; fileUri: string; mimeType: LocalKabalaReceiptMime }
  | { ok: false; error: LocalKabalaIssueErrorCode; messageHe: string };

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatCurrencyNis(n: number, fractionDigits: 0 | 2 = 2): string {
  const v = roundMoney2(n);
  return `₪${v.toLocaleString('he-IL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

function paymentMethodHebrew(
  method: LocalKabalaPaymentMethod,
  cardLast4?: string,
): string {
  const last = String(cardLast4 ?? '').replace(/\D/g, '').slice(-4);
  switch (method) {
    case 'credit':
      return last.length === 4 ? `אשראי (4 ספרות אחרונות: ${last})` : 'אשראי';
    case 'transfer':
      return 'העברה בנקאית';
    case 'check':
      return "צ'ק";
    case 'cash':
    default:
      return 'מזומן';
  }
}

function parseYyyyMmDd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Total for threshold / display; VAT lines when not exempt. */
export function computeLocalKabala320Amounts(params: {
  catalogPrice: number;
  vatExempt: boolean;
  priceBasis: 'gross_incl_vat' | 'net_before_vat';
  vatRate?: number;
}): {
  vatExempt: boolean;
  netBeforeVat: number;
  vatAmount: number;
  totalInclVat: number;
} {
  const rate = params.vatRate ?? LOCAL_KABALA_VAT_RATE;
  const raw = Math.max(0, params.catalogPrice);
  if (params.vatExempt) {
    const total = roundMoney2(raw);
    return { vatExempt: true, netBeforeVat: total, vatAmount: 0, totalInclVat: total };
  }
  if (params.priceBasis === 'net_before_vat') {
    const net = roundMoney2(raw);
    const vat = roundMoney2(net * rate);
    const total = roundMoney2(net + vat);
    return { vatExempt: false, netBeforeVat: net, vatAmount: vat, totalInclVat: total };
  }
  const total = roundMoney2(raw);
  const net = roundMoney2(total / (1 + rate));
  const vat = roundMoney2(total - net);
  return { vatExempt: false, netBeforeVat: net, vatAmount: vat, totalInclVat: total };
}

/**
 * סף מספר הקצאה — על **סכום לפני מע״מ** (כמו בשע״מ): 25,000 ₪ עד סוף 2025, 10,000 ₪ מינואר 2026, 5,000 ₪ מיוני 2026.
 * קבלה 320: תזכורת בלבד ללקוחות שמדווחים גבוה; חובת הקצאה החלה בדרך כלל על חשבוניות מס (300/305/310).
 */
export function allocationNetThresholdNisForDocumentDate(documentDateYyyyMmDd: string): number {
  const doc = parseYyyyMmDd(documentDateYyyyMmDd);
  if (!doc) return 25_000;
  const y2026jan = new Date(2026, 0, 1);
  const y2026jun = new Date(2026, 5, 1);
  if (doc < y2026jan) return 25_000;
  if (doc < y2026jun) return 10_000;
  return 5_000;
}

function allocationNoticeForKabala320(params: {
  netBeforeVat: number;
  vatExempt: boolean;
  documentDateYyyyMmDd: string;
}): { show: boolean; thresholdNetNis: number } {
  if (params.vatExempt) {
    return { show: false, thresholdNetNis: allocationNetThresholdNisForDocumentDate(params.documentDateYyyyMmDd) };
  }
  const thresholdNetNis = allocationNetThresholdNisForDocumentDate(params.documentDateYyyyMmDd);
  const show = params.netBeforeVat > thresholdNetNis;
  return { show, thresholdNetNis };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** YYYY-MM-DD → DD/MM/YYYY for display */
function formatDateIl(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) return yyyyMmDd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Display name for buyer — appointment row or linked user. */
export async function resolveClientNameForAppointment(apt: Appointment): Promise<string> {
  let name = String(apt.client_name ?? '').trim();
  if (name) return name;
  const uid = apt.user_id?.trim();
  if (!uid) return 'לקוח';
  const bid = getBusinessId();
  if (!bid) return 'לקוח';
  const { data } = await supabase.from('users').select('name').eq('id', uid).eq('business_id', bid).maybeSingle();
  const n = String(data?.name ?? '').trim();
  return n || 'לקוח';
}

/** Resolve catalog price: `service_id` first, then exact `service_name` match on `services`. */
export async function resolveServicePriceForAppointment(apt: Appointment): Promise<number> {
  const businessId = getBusinessId();
  if (!businessId) return 0;
  const sid = apt.service_id?.trim();
  if (sid) {
    const { data } = await supabase
      .from('services')
      .select('price')
      .eq('id', sid)
      .eq('business_id', businessId)
      .maybeSingle();
    if (data?.price != null) {
      const p = Number(data.price);
      if (p > 0) return p;
    }
  }
  const serviceName = String(apt.service_name ?? '').trim();
  if (!serviceName) return 0;
  const { data: services } = await supabase.from('services').select('name, price').eq('business_id', businessId);
  const lower = serviceName.toLowerCase();
  for (const s of services ?? []) {
    if (String(s.name ?? '').toLowerCase() === lower) {
      const p = Number(s.price);
      if (p > 0) return p;
    }
  }
  return 0;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function normalizeHexColor(hex: string | undefined, fallback: string): string {
  const h = String(hex ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h;
  if (/^#[0-9A-Fa-f]{3}$/.test(h)) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return fallback;
}

export function buildLocalKabala320ReceiptHtml(params: {
  sellerName: string;
  sellerOsekDisplay: string;
  businessAddress: string;
  businessPhone: string;
  buyerName: string;
  serviceDescription: string;
  vatExempt: boolean;
  netBeforeVat: number;
  vatAmount: number;
  totalInclVat: number;
  paymentMethodHe: string;
  documentDate: string;
  appointmentId: string;
  receiptSerial: number;
  accentColor: string;
  allocationNumber?: string;
  allocationThresholdNote: boolean;
  /** סף לפני מע״מ למועד המסמך — מוצג כש־`allocationThresholdNote` */
  allocationThresholdNetNis?: number;
}): string {
  const {
    sellerName,
    sellerOsekDisplay,
    businessAddress,
    businessPhone,
    buyerName,
    serviceDescription,
    vatExempt,
    netBeforeVat,
    vatAmount,
    totalInclVat,
    paymentMethodHe,
    documentDate,
    appointmentId,
    receiptSerial,
    accentColor,
    allocationNumber,
    allocationThresholdNote,
    allocationThresholdNetNis,
  } = params;

  const safeSeller = escapeHtml(sellerName);
  const safeOsek = escapeHtml(sellerOsekDisplay);
  const safeAddr = escapeHtml(businessAddress);
  const safePhone = escapeHtml(businessPhone);
  const safeBuyer = escapeHtml(buyerName);
  const safeService = escapeHtml(serviceDescription);
  const safePayment = escapeHtml(paymentMethodHe);
  const dateLine = escapeHtml(formatDateIl(documentDate));
  const safeApt = escapeHtml(appointmentId);
  const serialStr = escapeHtml(String(receiptSerial));
  const vatPct = Math.round(LOCAL_KABALA_VAT_RATE * 100);
  const netStr = escapeHtml(formatCurrencyNis(netBeforeVat, 2));
  const vatStr = escapeHtml(formatCurrencyNis(vatAmount, 2));
  const totalStr = escapeHtml(formatCurrencyNis(totalInclVat, 2));
  const safeAlloc = allocationNumber ? escapeHtml(String(allocationNumber).trim()) : '';

  const phoneRow =
    businessPhone.trim().length > 0
      ? `<div><strong>טלפון:</strong> <span class="mono">${safePhone}</span></div>`
      : `<div><strong>טלפון:</strong> <span class="note">לא צוין בפרופיל העסק</span></div>`;

  const vatBlock = vatExempt
    ? `<section class="vat-box exempt" aria-label="מעמ">
        <div class="vat-box-title">מע״מ</div>
        <p class="vat-exempt-label">עוסק פטור ממע״מ — לא נגבית מע״מ בעסקה זו, בהתאם לסטטוס העסק ברשות המסים.</p>
        <div class="vat-rows">
          <div class="vat-row total-only"><span class="vk">סה״כ לתשלום</span><span class="vv strong-xl">${totalStr}</span></div>
        </div>
      </section>`
    : `<section class="vat-box" aria-label="פירוט מעמ">
        <div class="vat-box-title">פירוט מע״מ (${vatPct}%)</div>
        <div class="vat-rows">
          <div class="vat-row"><span class="vk">מחיר לפני מע״מ</span><span class="vv">${netStr}</span></div>
          <div class="vat-row"><span class="vk">מע״מ ${vatPct}%</span><span class="vv">${vatStr}</span></div>
          <div class="vat-row total-line"><span class="vk">סה״כ כולל מע״מ</span><span class="vv strong-xl">${totalStr}</span></div>
        </div>
      </section>`;

  const thNis =
    allocationThresholdNetNis != null
      ? allocationThresholdNetNis
      : allocationNetThresholdNisForDocumentDate(documentDate);
  const thStr = escapeHtml(thNis.toLocaleString('he-IL'));

  const allocBlock =
    allocationThresholdNote || safeAlloc
      ? `<div class="foot-block allocation">
          <strong>מספר הקצאה (שע״מ / SHAAM)</strong>
          ${
            safeAlloc
              ? `<p>מספר הקצאה: <span class="mono">${safeAlloc}</span></p>`
              : ''
          }
          ${
            allocationThresholdNote
              ? `<p class="warn">סכום העסקה <strong>לפני מע״מ</strong> (${netStr}) עובר את הסף הרלוונטי למועד המסמך (<strong>${thStr} ₪</strong> לפני מע״מ). בחשבונית מס ובמסמכים שנדרשים בחוק, יש לקבל מספר הקצאה <strong>בזמן אמת</strong> ממערכות רשות המסים ולשלבו במסמך הרשמי.</p>`
              : ''
          }
        </div>`
      : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans Hebrew", sans-serif;
      color: #1c1c1e;
      background: #f5f5f7;
      direction: rtl;
      unicode-bidi: embed;
      font-size: 13px;
      line-height: 1.45;
    }
    body { padding: 16px 12px 28px; }
    .sheet {
      max-width: 640px;
      margin: 0 auto;
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 8px 28px rgba(0,0,0,0.08);
      border: 1px solid #e8e8ed;
      direction: rtl;
      text-align: right;
    }
    .accent-bar { height: 5px; background: ${accentColor}; }
    .head {
      padding: 20px 20px 14px;
      text-align: center;
      border-bottom: 1px solid #eee;
    }
    .biz { font-size: 21px; font-weight: 700; letter-spacing: -0.02em; color: #111; }
    .doc-type { margin-top: 6px; font-size: 13px; color: #444; font-weight: 600; }
    .doc-sub { margin-top: 4px; font-size: 12px; color: #666; }
    .biz-meta { margin-top: 12px; text-align: right; padding: 0 4px; font-size: 13px; color: #333; }
    .biz-meta div { margin: 4px 0; }
    .biz-meta .note { color: #888; font-weight: 500; }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #555;
      letter-spacing: 0.02em;
      margin: 16px 20px 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #ececf0;
    }
    .serial-wrap {
      margin: 0 16px 0;
      padding: 12px 14px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(0,0,0,0.03), rgba(0,0,0,0.01));
      border: 1px solid #ececf0;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      direction: rtl;
      gap: 12px;
    }
    .serial-label { font-size: 12px; color: #666; text-align: right; flex: 0 1 auto; direction: rtl; }
    .serial-num {
      font-size: 18px;
      font-weight: 700;
      color: ${accentColor};
      letter-spacing: 0.03em;
      text-align: right;
      direction: rtl;
      flex: 0 1 auto;
      min-width: 0;
    }
    .body { padding: 8px 20px 12px; }
    .row {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: 9px 0;
      border-bottom: 1px solid #f0f0f2;
      font-size: 13px;
      direction: rtl;
    }
    .row:last-child { border-bottom: none; }
    .k {
      color: #6b6b70;
      flex: 0 1 40%;
      text-align: right;
      padding-left: 8px;
    }
    .v {
      font-weight: 600;
      flex: 1 1 60%;
      text-align: right;
      word-break: break-word;
      direction: rtl;
    }
    .vat-box {
      margin: 12px 16px 16px;
      padding: 14px 16px 16px;
      border-radius: 12px;
      border: 2px solid ${accentColor}44;
      background: linear-gradient(180deg, ${accentColor}12, #fff 40%);
    }
    .vat-box.exempt {
      border-color: #c4c4cc;
      background: #f8f8fa;
    }
    .vat-box-title {
      font-size: 13px;
      font-weight: 700;
      color: #333;
      margin-bottom: 10px;
      text-align: right;
    }
    .vat-exempt-label {
      margin: 0 0 10px;
      font-size: 13px;
      color: #444;
      text-align: right;
    }
    .vat-rows { display: flex; flex-direction: column; gap: 8px; }
    .vat-row {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: baseline;
      direction: rtl;
      font-size: 13px;
      padding: 6px 0;
      border-bottom: 1px dashed #e0e0e6;
    }
    .vat-row:last-child { border-bottom: none; }
    .vat-row.total-line { padding-top: 10px; margin-top: 4px; border-top: 2px solid ${accentColor}55; border-bottom: none; }
    .vk { color: #5c5c63; text-align: right; }
    .vv { font-weight: 700; text-align: right; direction: rtl; }
    .strong-xl { font-size: 20px; color: #111; }
    .foot {
      padding: 16px 18px 20px;
      font-size: 11px;
      line-height: 1.55;
      color: #555;
      background: #fafafa;
      border-top: 1px solid #eee;
      text-align: right;
    }
    .foot-block { margin-bottom: 12px; }
    .foot-block:last-child { margin-bottom: 0; }
    .foot-block.allocation .warn { color: #7a4a00; margin-top: 6px; }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      direction: ltr;
      unicode-bidi: isolate;
      display: inline-block;
      text-align: left;
    }
    @media print {
      body { background: #fff; padding: 0; font-size: 12pt; }
      .sheet { box-shadow: none; border-radius: 0; max-width: 100%; border: none; }
      .vat-box { break-inside: avoid; }
    }
    @media (max-width: 420px) {
      body { padding: 8px 6px; }
      .head { padding: 16px 14px; }
      .body, .foot { padding-left: 14px; padding-right: 14px; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="accent-bar"></div>
    <header class="head">
      <div class="biz">${safeSeller}</div>
      <div class="doc-type">קבלה — סוג מסמך 320</div>
      <div class="doc-sub">קבלה (320) — פירוט שדות לתיעוד ושקיפות מול הלקוח; יש לוודא עמידה בדינים ובהוראות רשות המסים לפי סוג העסק והמסמך.</div>
      <div class="biz-meta">
        <div><strong>כתובת:</strong> ${safeAddr}</div>
        ${phoneRow}
        <div><strong>${vatExempt ? 'עוסק פטור — מזהה עסק:' : 'עוסק מורשה / ח.פ.:'}</strong> ${safeOsek}</div>
      </div>
    </header>
    <div class="section-title">פרטי מסמך</div>
    <div class="serial-wrap">
      <div class="serial-label">מספר סידורי עוקב (קבלה)</div>
      <div class="serial-num">מס׳ ${serialStr}</div>
    </div>
    <div class="body">
      <div class="row"><span class="k">תאריך הפקה</span><span class="v">${dateLine}</span></div>
      <div class="row"><span class="k">שם לקוח</span><span class="v">${safeBuyer}</span></div>
      <div class="row"><span class="k">תיאור שירות / מוצר</span><span class="v">${safeService}</span></div>
      <div class="row"><span class="k">אמצעי תשלום</span><span class="v">${safePayment}</span></div>
      <div class="row"><span class="k">אסמכתא</span><span class="v"><span class="mono">${safeApt}</span></span></div>
    </div>
    <div class="section-title">סכומים</div>
    ${vatBlock}
    <footer class="foot">
      ${allocBlock}
      <div class="foot-block">
        מסמך זה הופק במערכת הניהול של בית העסק לצורכי תיעוד ולקוח. דיווחים, מסמכים חשמליים רשמיים ומספרי הקצאה מ־SHAAM — לפי סוג המסמך והוראות רשות המסים העדכניות.
        ${
          vatExempt
            ? ' עוסק פטור אינו גובה מע״מ; יש לוודא את הסטטוס מול הרשות.'
            : ` שיעור המע״מ (${vatPct}%) וספי ההקצאה (לפני מע״מ) יש לעדכן מול פרסומי הרשות בעת שינוי.`
        }
      </div>
    </footer>
  </div>
</body>
</html>`;
}

export async function prepareLocalKabala320ReceiptPdf(
  apt: Appointment,
  profile: BusinessProfile,
  options?: LocalKabalaReceiptOptions,
): Promise<LocalKabalaIssueResult> {
  if (!getBusinessId()) {
    return { ok: false, error: 'missing_business_id', messageHe: 'לא נמצא מזהה עסק.' };
  }
  const st = String(apt.status ?? '');
  if (st !== 'confirmed' && st !== 'completed') {
    return {
      ok: false,
      error: 'invalid_status',
      messageHe: 'ניתן להפיק קבלה לתורים שאושרו או הושלמו בלבד.',
    };
  }
  if (apt.is_available === true) {
    return { ok: false, error: 'invalid_status', messageHe: 'לא ניתן להפיק קבלה למשבצת פנויה.' };
  }

  const osekRaw = String(profile.business_number ?? '').trim();
  const osekDigits = digitsOnly(osekRaw);
  if (osekDigits.length < 8) {
    return {
      ok: false,
      error: 'missing_osek',
      messageHe: 'יש למלא מספר עוסק מורשה תקין בפרופיל העסק (הגדרות).',
    };
  }

  const sellerName = String(profile.display_name ?? '').trim();
  if (!sellerName) {
    return { ok: false, error: 'missing_seller_name', messageHe: 'יש למלא שם העסק בפרופיל.' };
  }

  const businessAddress = String(profile.address ?? '').trim();
  if (!businessAddress) {
    return {
      ok: false,
      error: 'missing_address',
      messageHe: 'יש למלא כתובת עסק בפרופיל (הגדרות) להפקת קבלה בהתאם לדרישות רשות המסים.',
    };
  }
  const businessPhone = String(profile.phone ?? '').trim();

  const price = await resolveServicePriceForAppointment(apt);
  if (price <= 0) {
    return {
      ok: false,
      error: 'price_unknown',
      messageHe: 'לא נמצא מחיר לשירות. ודאו שהתור מקושר לשירות במחירון.',
    };
  }

  const callerUserId = String(useAuthStore.getState().user?.id ?? '').trim();
  if (!callerUserId) {
    return {
      ok: false,
      error: 'serial_failed',
      messageHe: 'לא זוהה משתמש מחובר. התחברו מחדש לאפליקציה.',
    };
  }
  const serialRes = await allocateNextLocalKabalaReceiptSerial({
    businessId: getBusinessId()!,
    callerUserId,
  });
  if (serialRes.ok === false) {
    return { ok: false, error: 'serial_failed', messageHe: serialRes.messageHe };
  }
  const receiptSerial = serialRes.serial;

  const buyerName = await resolveClientNameForAppointment(apt);
  const serviceDescription = String(apt.service_name ?? 'שירות').trim() || 'שירות';
  const documentDate = String(apt.slot_date ?? '').trim() || new Date().toISOString().slice(0, 10);
  const accent = normalizeHexColor(profile.primary_color, '#2d6a4f');

  const vatExempt = options?.vatExempt === true || profile.vat_exempt === true;
  const priceBasis = options?.priceBasis === 'net_before_vat' ? 'net_before_vat' : 'gross_incl_vat';
  const amounts = computeLocalKabala320Amounts({
    catalogPrice: price,
    vatExempt,
    priceBasis,
  });
  const payMethod: LocalKabalaPaymentMethod = options?.paymentMethod ?? 'cash';
  const paymentHe = paymentMethodHebrew(
    payMethod,
    payMethod === 'credit' ? options?.cardLast4 : undefined,
  );
  const allocNum = String(options?.allocationNumber ?? '').trim();
  const allocNotice = allocationNoticeForKabala320({
    netBeforeVat: amounts.netBeforeVat,
    vatExempt: amounts.vatExempt,
    documentDateYyyyMmDd: documentDate,
  });

  const html = buildLocalKabala320ReceiptHtml({
    sellerName,
    sellerOsekDisplay: osekRaw || osekDigits,
    businessAddress,
    businessPhone,
    buyerName,
    serviceDescription,
    vatExempt: amounts.vatExempt,
    netBeforeVat: amounts.netBeforeVat,
    vatAmount: amounts.vatAmount,
    totalInclVat: amounts.totalInclVat,
    paymentMethodHe: paymentHe,
    documentDate,
    appointmentId: apt.id,
    receiptSerial,
    accentColor: accent,
    allocationNumber: allocNum || undefined,
    allocationThresholdNote: allocNotice.show,
    allocationThresholdNetNis: allocNotice.show ? allocNotice.thresholdNetNis : undefined,
  });

  /** HTML בלבד — לא טוענים `expo-print` (מודול נטיבי שלא קיים ב־dev client רבים; גרם ל־ERROR בלוג). PDF: אחרי `npx expo run:ios` אפשר להחזיר שימוש ב־expo-print. */
  let fileUri: string;
  let mimeType: LocalKabalaReceiptMime;
  try {
    const FS = await import('expo-file-system/legacy');
    const base = FS.cacheDirectory ?? '';
    const safeName = `kabala-${receiptSerial}-${apt.id.replace(/-/g, '').slice(0, 12)}`;
    const path = `${base}${safeName}.html`;
    await FS.writeAsStringAsync(path, html, { encoding: FS.EncodingType.UTF8 });
    fileUri = path;
    mimeType = 'text/html';
  } catch (e2) {
    console.error('[localKabala] HTML file write failed', e2);
    return {
      ok: false,
      error: 'pdf_failed',
      messageHe: 'יצירת קובץ הקבלה נכשלה. נסו שוב.',
    };
  }

  return { ok: true, fileUri, mimeType };
}

/**
 * Share receipt file (PDF or HTML). Uses React Native `Share` only — no `expo-sharing`
 * (ExpoSharing native module is often missing until a fresh dev-client build).
 */
export async function shareLocalKabalaPdf(
  fileUri: string,
  dialogTitle: string,
  _mimeType: LocalKabalaReceiptMime = 'application/pdf',
): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await Share.share({ url: fileUri, title: dialogTitle });
      return;
    }
    // iOS: `url` opens share sheet for file:// ; Android: `url` works for many local URIs in current RN.
    await Share.share({ title: dialogTitle, url: fileUri });
  } catch (e) {
    if (__DEV__) {
      console.warn('[localKabala] Share.share', e);
    }
  }
}
