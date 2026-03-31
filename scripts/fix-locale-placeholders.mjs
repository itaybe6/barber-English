/**
 * Aligns {{interpolation}} names in a translated locale with en.json (MT often corrupts them).
 * Usage: node scripts/fix-locale-placeholders.mjs ar
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function fixString(en, loc) {
  if (typeof en !== 'string' || typeof loc !== 'string') return loc;
  const enKeys = [...en.matchAll(/\{\{([^}]+)\}\}/g)].map((x) => x[1]);
  const parts = loc.split(/\{\{[^}]+\}\}/);
  const phCount = (loc.match(/\{\{[^}]+\}\}/g) || []).length;
  if (enKeys.length !== phCount) return loc;
  let out = parts[0] ?? '';
  for (let i = 0; i < enKeys.length; i++) {
    out += '{{' + enKeys[i] + '}}' + (parts[i + 1] ?? '');
  }
  return out;
}

function walk(enNode, locNode) {
  if (typeof enNode === 'string' && typeof locNode === 'string') {
    return fixString(enNode, locNode);
  }
  if (Array.isArray(enNode) && Array.isArray(locNode)) {
    return locNode.map((item, i) => walk(enNode[i], item));
  }
  if (
    enNode &&
    typeof enNode === 'object' &&
    locNode &&
    typeof locNode === 'object' &&
    !Array.isArray(enNode) &&
    !Array.isArray(locNode)
  ) {
    const o = {};
    for (const k of Object.keys(locNode)) {
      if (Object.prototype.hasOwnProperty.call(enNode, k)) o[k] = walk(enNode[k], locNode[k]);
      else o[k] = locNode[k];
    }
    return o;
  }
  return locNode;
}

const tag = process.argv[2] || 'ar';
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/en.json'), 'utf8'));
const loc = JSON.parse(fs.readFileSync(path.join(root, 'src/locales', `${tag}.json`), 'utf8'));
const fixed = walk(en, loc);
fs.writeFileSync(path.join(root, 'src/locales', `${tag}.json`), JSON.stringify(fixed, null, 2) + '\n', 'utf8');
console.log('fixed', tag);
