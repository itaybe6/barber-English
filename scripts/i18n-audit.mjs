import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(process.cwd());

const SOURCE_DIRS = [
  path.join(PROJECT_ROOT, 'app'),
  path.join(PROJECT_ROOT, 'components'),
  path.join(PROJECT_ROOT, 'lib'),
  path.join(PROJECT_ROOT, 'stores'),
  path.join(PROJECT_ROOT, 'src'),
];

const LOCALES = {
  en: path.join(PROJECT_ROOT, 'src', 'locales', 'en.json'),
  he: path.join(PROJECT_ROOT, 'src', 'locales', 'he.json'),
};

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.expo',
  '.git',
  'dist',
  'build',
  'android',
  'ios',
  '.next',
]);

function isTextCodeFile(filePath) {
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx');
}

async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(ent.name)) continue;
      out.push(...(await walk(path.join(dir, ent.name))));
    } else if (ent.isFile()) {
      const fp = path.join(dir, ent.name);
      if (isTextCodeFile(fp)) out.push(fp);
    }
  }
  return out;
}

function getByPath(obj, keyPath) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object' || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function extractKeysFromSource(sourceText) {
  /** @type {Map<string, { defaults: Set<string> }>} */
  const keys = new Map();

  // Matches:
  // t('a.b.c')
  // t("a.b.c", "Default")
  // i18n.t('a.b.c')
  //
  // Note: We intentionally only capture literal string keys.
  const callRe = /\b(?:t|i18n\.t)\(\s*(['"])([^'"]+)\1\s*(?:,\s*(['"`])([^`"'$\\]*(?:\\.[^`"'$\\]*)*)\3)?/g;
  // The default-value capture above is conservative; if it doesn't match, we still keep the key.

  let m;
  while ((m = callRe.exec(sourceText)) !== null) {
    const key = String(m[2] || '').trim();
    if (!key) continue;
    const def = typeof m[4] === 'string' ? m[4] : '';
    const rec = keys.get(key) || { defaults: new Set() };
    if (def) rec.defaults.add(def);
    keys.set(key, rec);
  }
  return keys;
}

async function main() {
  const localeData = {};
  for (const [lng, p] of Object.entries(LOCALES)) {
    const raw = await fs.readFile(p, 'utf8');
    localeData[lng] = JSON.parse(raw);
  }

  /** @type {Map<string, { defaults: Set<string>, files: Set<string> }>} */
  const allKeys = new Map();

  for (const dir of SOURCE_DIRS) {
    const files = await walk(dir);
    for (const file of files) {
      const text = await fs.readFile(file, 'utf8');
      const keys = extractKeysFromSource(text);
      for (const [k, meta] of keys.entries()) {
        const rec = allKeys.get(k) || { defaults: new Set(), files: new Set() };
        for (const d of meta.defaults) rec.defaults.add(d);
        rec.files.add(path.relative(PROJECT_ROOT, file));
        allKeys.set(k, rec);
      }
    }
  }

  const sortedKeys = [...allKeys.keys()].sort((a, b) => a.localeCompare(b));

  /** @type {Record<string, Array<{key: string, defaults: string[], files: string[]}>>} */
  const missing = {};
  for (const lng of Object.keys(LOCALES)) missing[lng] = [];

  for (const key of sortedKeys) {
    for (const [lng, data] of Object.entries(localeData)) {
      const v = getByPath(data, key);
      if (typeof v === 'undefined') {
        const meta = allKeys.get(key);
        missing[lng].push({
          key,
          defaults: meta ? [...meta.defaults] : [],
          files: meta ? [...meta.files].slice(0, 5) : [],
        });
      }
    }
  }

  const total = sortedKeys.length;
  console.log(`\n[i18n-audit] total keys in code: ${total}\n`);
  for (const [lng, list] of Object.entries(missing)) {
    console.log(`[i18n-audit] missing in ${lng}: ${list.length}`);
  }

  for (const [lng, list] of Object.entries(missing)) {
    if (list.length === 0) continue;
    console.log(`\n=== Missing in ${lng} (${list.length}) ===`);
    for (const item of list) {
      const def = item.defaults.length ? `  default: ${JSON.stringify(item.defaults[0])}` : '';
      const files = item.files.length ? `  files: ${item.files.join(', ')}` : '';
      console.log(`- ${item.key}${def}${files ? `\n  ${files}` : ''}`);
    }
  }

  // Exit with non-zero if missing
  const anyMissing = Object.values(missing).some((l) => l.length > 0);
  if (anyMissing) process.exitCode = 2;
}

main().catch((e) => {
  console.error('[i18n-audit] failed:', e);
  process.exitCode = 1;
});

