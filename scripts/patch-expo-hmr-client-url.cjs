/**
 * Metro HmrServer passes `clientUrl` from Node's legacy `url.parse()`.
 * @expo/metro-config 54.x (bundled under @expo/cli) uses `new URL(options.clientUrl)`,
 * which throws "Invalid URL" for that object. Normalize to a string after install.
 */
const fs = require('fs');
const path = require('path');

const BUG_SNIPPET = 'const clientUrl = new URL(options.clientUrl);';
const PATCH_MARKER = 'Metro HmrServer passes a legacy';

const NEEDLE = `function hmrJSBundle(delta, graph, options) {
    return {
        added: generateModules(delta.added.values(), graph, options),`;

const REPLACEMENT = `function hmrJSBundle(delta, graph, options) {
    // Metro HmrServer passes a legacy \`url.parse()\` object; \`new URL()\` unknown_object throws Invalid URL.
    const clientUrlString = typeof options.clientUrl === 'string'
        ? options.clientUrl
        : require('node:url').format(options.clientUrl);
    const opts = { ...options, clientUrl: clientUrlString };
    return {
        added: generateModules(delta.added.values(), graph, opts),`;

function findHmrBundleFiles(startDir, out) {
  if (!fs.existsSync(startDir)) return;
  for (const ent of fs.readdirSync(startDir, { withFileTypes: true })) {
    const p = path.join(startDir, ent.name);
    if (ent.isDirectory()) findHmrBundleFiles(p, out);
    else if (
      ent.name === 'hmrJSBundle.js' &&
      p.includes(`${path.sep}@expo${path.sep}metro-config${path.sep}build${path.sep}serializer${path.sep}fork${path.sep}`)
    ) {
      out.push(p);
    }
  }
}

const files = [];
findHmrBundleFiles(path.join(__dirname, '..', 'node_modules'), files);

let patched = 0;
for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(BUG_SNIPPET) || s.includes(PATCH_MARKER)) continue;
  if (!s.includes(NEEDLE)) continue;
  s = s.replace(NEEDLE, REPLACEMENT);
  s = s.replace(
    'modified: generateModules(delta.modified.values(), graph, options),',
    'modified: generateModules(delta.modified.values(), graph, opts),'
  );
  fs.writeFileSync(file, s);
  patched++;
  console.log('[patch-expo-hmr-client-url] Patched', file);
}

if (patched === 0) {
  console.log('[patch-expo-hmr-client-url] No buggy @expo/metro-config HMR serializer found (already patched or different layout).');
}
