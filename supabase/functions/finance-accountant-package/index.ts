// @ts-nocheck
/**
 * Legacy endpoint — Green Invoice + accountant package flow removed from the app.
 * Returns a stable error so old clients fail clearly instead of 500 on missing DB columns.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json(
    {
      ok: false,
      error: "feature_removed",
      message:
        "Receipt issuance and accountant package were removed. Update the app.",
    },
    410,
  );
});
