/**
 * Builds ru.json from en.json (Google gtx). Run: node scripts/build-ru-locale.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const enPath = path.join(root, 'src/locales/en.json');
const outPath = path.join(root, 'src/locales/ru.json');

function extractTranslated(body) {
  try {
    const data = JSON.parse(body);
    if (!data || !data[0]) return null;
    return data[0].map((chunk) => chunk[0]).join('');
  } catch {
    return null;
  }
}

async function translateString(text) {
  if (typeof text !== 'string' || text.trim() === '') return text;
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=' +
    encodeURIComponent(text);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      const raw = await r.text();
      const out = extractTranslated(raw);
      if (out) return out;
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
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

async function parallelMap(strings, concurrency, fn) {
  const results = new Array(strings.length);
  let next = 0;
  async function worker() {
    while (true) {
      const j = next++;
      if (j >= strings.length) break;
      results[j] = await fn(strings[j], j);
    }
  }
  const n = Math.min(concurrency, strings.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function main() {
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const unique = new Set();
  collectStrings(en, unique);
  const list = [...unique];

  const CONCURRENCY = 10;
  const BATCH = CONCURRENCY;

  const map = new Map();
  for (let offset = 0; offset < list.length; offset += BATCH) {
    const slice = list.slice(offset, offset + BATCH);
    const translated = await parallelMap(slice, CONCURRENCY, (s) => translateString(s));
    slice.forEach((s, j) => map.set(s, translated[j]));
    process.stderr.write(`ru ${Math.min(offset + slice.length, list.length)}/${list.length}\n`);
    await new Promise((r) => setTimeout(r, 150));
  }

  const out = applyMap(en, map);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('Wrote', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
