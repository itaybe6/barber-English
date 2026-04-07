// @ts-nocheck
/**
 * Admin-only: create a Green Invoice receipt (document type 400) for a completed appointment.
 * Auth: verify_jwt=false — body includes business_id + caller_user_id; service role validates admin + tenant.
 *
 * Core logic: ../_shared/greeninvoiceIssueReceiptCore.ts (also used by finance-accountant-package in-process).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  handleGreenInvoiceIssueReceiptBody,
  greeninvoiceIssueReceiptCors as cors,
} from "../_shared/greeninvoiceIssueReceiptCore.ts";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  return handleGreenInvoiceIssueReceiptBody(body);
});
