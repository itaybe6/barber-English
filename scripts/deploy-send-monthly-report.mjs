#!/usr/bin/env node
/**
 * Deploy Edge Function send-monthly-report via Supabase CLI.
 *
 * Once:  npx supabase login
 * Link:  npx supabase link --project-ref <YOUR_PROJECT_REF>
 *
 * Or set SUPABASE_PROJECT_REF and run this script (uses --project-ref when linked state missing).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRef = (process.env.SUPABASE_PROJECT_REF || '').trim();

const args = ['supabase', 'functions', 'deploy', 'send-monthly-report'];
if (projectRef) {
  args.push('--project-ref', projectRef);
}

console.log('→ npx', args.join(' '));
const r = spawnSync('npx', args, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

if (r.status !== 0) {
  console.error(`
Deploy failed (exit ${r.status}).

Setup:
  1. npm i -g supabase   OR   use npx supabase (bundled with npx)
  2. supabase login
  3. supabase link --project-ref <ref from Dashboard → Settings → General>
  4. Optional: set env SUPABASE_PROJECT_REF for CI

Secrets (Dashboard → Edge Functions → send-monthly-report → Secrets):
  RESEND_API_KEY=re_...
  MONTHLY_REPORT_FROM_EMAIL=you@yourdomain.com   (optional)

Cron: run database/cron_invoke_send_monthly_report.sql in SQL Editor (replace placeholders).
`);
  process.exit(r.status ?? 1);
}

console.log(`
Done. Next:
  • Edge secrets: RESEND_API_KEY (+ optional MONTHLY_REPORT_FROM_EMAIL)
  • SQL: database/cron_invoke_send_monthly_report.sql (pg_cron + pg_net)
`);
