#!/usr/bin/env node

/**
 * delete-branding.mjs — Removes the local branding/<ClientName>/ directory from this repo.
 * Run this after deleting a tenant in Super Admin (the mobile app cannot delete files on your PC).
 *
 * Usage:
 *   node scripts/delete-branding.mjs <ClientName>
 *   npm run delete-branding -- <ClientName>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const brandingRoot = path.join(projectRoot, 'branding');

function usage() {
  console.log(`
Usage:
  node scripts/delete-branding.mjs <ClientName>

Example:
  node scripts/delete-branding.mjs KetyCooper
`);
}

function assertSafeClientName(raw) {
  const name = String(raw || '').trim();
  if (!name) {
    console.error('❌ Missing client folder name.');
    usage();
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9]+$/.test(name)) {
    console.error('❌ Invalid name: use only English letters and digits (same rules as app folder name).');
    process.exit(1);
  }
  return name;
}

function resolveTargetDir(clientName) {
  const target = path.join(brandingRoot, clientName);
  const resolvedBranding = path.resolve(brandingRoot);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedBranding, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel === '') {
    console.error('❌ Refusing to delete: path escapes branding/ or is invalid.');
    process.exit(1);
  }
  return resolvedTarget;
}

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  usage();
  process.exit(arg ? 0 : 1);
}

const clientName = assertSafeClientName(arg);
const targetDir = resolveTargetDir(clientName);

if (!fs.existsSync(targetDir)) {
  console.log(`⚠️  No folder at branding/${clientName}/ — nothing to delete.`);
  process.exit(0);
}

fs.rmSync(targetDir, { recursive: true, force: true });
console.log(`✅ Removed local folder: branding/${clientName}/`);
