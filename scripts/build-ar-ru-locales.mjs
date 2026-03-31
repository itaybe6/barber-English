/**
 * One-off / maintenance: builds src/locales/ar.json and src/locales/ru.json from en.json
 * using the public Google Translate "gtx" endpoint. Preserves {{interpolation}} tokens
 * in practice for most strings. Re-run after large en.json changes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const enPath = path.join(root, 'src/locales/en.json');
const cachePath = path.join(__dirname, '.locale-ar-ru-cache.json');

function extractTranslated(body) {
  try {
    const data = JSON.parse(body);
    if (!data || !data[0]) return null;
    return data[0].map((chunk) => chunk[0]).join('');
  } catch {
    return null;
  }
}

async function translateString(text, tl) {
  if (typeof text !== 'string') return text;
  if (text.trim() === '') return text;
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' +
    tl +
    '&dt=t&q=' +
    encodeURIComponent(text);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url);
      const raw = await r.text();
      const out = extractTranslated(raw);
      if (out) return out;
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 250 * (attempt + 1)));
  }
  return text;
}

function collectStrings(obj, set) {
  if (typeof obj === 'string') {
    set.add(obj);
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) collectStrings(v, set);
  }
}

function applyMap(obj, map) {
  if (typeof obj === 'string') return map.get(obj) ?? obj;
  if (Array.isArray(obj)) return obj.map((x) => applyMap(x, map));
  if (obj && typeof obj === 'object') {
    const o = {};
    for (const k of Object.keys(obj)) o[k] = applyMap(obj[k], map);
    return o;
  }
  return obj;
}

function loadCache() {
  try {
    if (fs.existsSync(cachePath)) {
      const j = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (j && typeof j === 'object') return j;
    }
  } catch {
    /* fresh */
  }
  return { ar: {}, ru: {} };
}

function saveCache(c) {
  fs.writeFileSync(cachePath, JSON.stringify(c, null, 0), 'utf8');
}

async function buildForTarget(en, tl) {
  const cache = loadCache();
  if (!cache[tl]) cache[tl] = {};
  const unique = new Set();
  collectStrings(en, unique);
  const list = [...unique];
  const map = new Map();
  let i = 0;
  for (const s of list) {
    i++;
    if (cache[tl][s]) {
      map.set(s, cache[tl][s]);
      continue;
    }
    if (i % 25 === 0) {
      process.stderr.write(`${tl} ${i}/${list.length}\n`);
      saveCache(cache);
    }
    const translated = await translateString(s, tl);
    cache[tl][s] = translated;
    map.set(s, translated);
    await new Promise((res) => setTimeout(res, 65));
  }
  saveCache(cache);
  return applyMap(en, map);
}

async function main() {
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  for (const tl of ['ar', 'ru']) {
    const out = await buildForTarget(en, tl);
    const outPath = path.join(root, 'src/locales', `${tl}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
    process.stderr.write(`Wrote ${outPath}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
