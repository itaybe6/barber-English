/**
 * EAS / read-only project roots: @expo/image-utils caches under .expo/web (fails with EACCES).
 * patch-package may not hit every nested copy after npm ci — this script patches all Cache.js instances.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const topNm = path.join(root, 'node_modules');

const paths = new Set();

function scanNm(nmDir) {
  if (!fs.existsSync(nmDir)) return;
  const cacheJs = path.join(nmDir, '@expo', 'image-utils', 'build', 'Cache.js');
  if (fs.existsSync(cacheJs)) paths.add(cacheJs);

  let entries;
  try {
    entries = fs.readdirSync(nmDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name === '.bin' || ent.name.startsWith('.')) continue;
    const p = path.join(nmDir, ent.name);
    if (ent.name.startsWith('@')) {
      for (const inner of fs.readdirSync(p, { withFileTypes: true })) {
        if (inner.isDirectory()) {
          scanNm(path.join(p, inner.name, 'node_modules'));
        }
      }
    } else {
      scanNm(path.join(p, 'node_modules'));
    }
  }
}

function patchSource(src) {
  if (src.includes('getCacheBaseDir')) return null;
  if (!src.includes('CACHE_LOCATION') || !src.includes(".expo/web/cache/production/images")) {
    return null;
  }

  let out = src;
  const blockOld =
    'const path_1 = require("path");\nconst CACHE_LOCATION = \'.expo/web/cache/production/images\';\nconst cacheKeys = {};';
  const blockNew = `const os_1 = require("os");
const path_1 = require("path");
const cacheKeys = {};
function getCacheBaseDir(projectRoot) {
    const id = crypto_1.default.createHash('sha256').update(projectRoot).digest('hex').slice(0, 16);
    return (0, path_1.join)(os_1.tmpdir(), 'expo-image-utils-cache', id);
}`;

  if (!out.includes(blockOld)) {
    const alt = blockOld.replace(/\n/g, '\r\n');
    if (out.includes(alt)) {
      out = out.replace(alt, blockNew.replace(/\n/g, '\r\n'));
    } else {
      return null;
    }
  } else {
    out = out.replace(blockOld, blockNew);
  }

  out = out.replace(
    '    const cacheFolder = (0, path_1.join)(projectRoot, CACHE_LOCATION, type, cacheKey);',
    "    const cacheFolder = (0, path_1.join)(getCacheBaseDir(projectRoot), 'web', 'cache', 'production', 'images', type, cacheKey);"
  );
  out = out.replace(
    '    const cacheFolder = (0, path_1.join)(projectRoot, CACHE_LOCATION, type);',
    "    const cacheFolder = (0, path_1.join)(getCacheBaseDir(projectRoot), 'web', 'cache', 'production', 'images', type);"
  );

  if (out.includes('CACHE_LOCATION')) return null;
  return out;
}

function main() {
  if (!fs.existsSync(topNm)) {
    console.warn('[patch-expo-image-utils-cache] node_modules missing, skip');
    return;
  }
  scanNm(topNm);
  let n = 0;
  for (const filePath of paths) {
    const src = fs.readFileSync(filePath, 'utf8');
    const next = patchSource(src);
    if (next) {
      fs.writeFileSync(filePath, next, 'utf8');
      console.log('[patch-expo-image-utils-cache] patched', path.relative(root, filePath));
      n++;
    }
  }
  if (n === 0 && paths.size > 0) {
    const sample = fs.readFileSync([...paths][0], 'utf8');
    if (sample.includes('getCacheBaseDir')) {
      console.log('[patch-expo-image-utils-cache] already patched (' + paths.size + ' copies)');
    } else {
      console.warn('[patch-expo-image-utils-cache] no file matched expected layout; check @expo/image-utils version');
    }
  }
}

main();
