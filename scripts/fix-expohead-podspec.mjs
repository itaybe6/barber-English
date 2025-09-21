#!/usr/bin/env node
// Moves `add_dependency(s, "RNScreens")` below the `s.pod_target_xcconfig` block
// in expo-router's ExpoHead.podspec to avoid nil access during CocoaPods install.

import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const podspecPath = path.join(
  repoRoot,
  'node_modules',
  'expo-router',
  'ios',
  'ExpoHead.podspec'
);

function moveAddDependencyLine(contents) {
  const lines = contents.split(/\r?\n/);
  const addDepIdx = lines.findIndex((l) => l.includes('add_dependency(s, "RNScreens")'));
  if (addDepIdx === -1) {
    return { changed: false, result: contents };
  }

  // Find start of xcconfig block
  const xcconfigStartIdx = lines.findIndex((l) => l.includes('s.pod_target_xcconfig ='));
  if (xcconfigStartIdx === -1) {
    // Can't safely move; leave as-is
    return { changed: false, result: contents };
  }

  // Find end of xcconfig block by matching the closing '}' after the start line
  let braceDepth = 0;
  let xcconfigEndIdx = -1;
  for (let i = xcconfigStartIdx; i < lines.length; i++) {
    const line = lines[i];
    // Count braces in a simple way; good enough for this small podspec block
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (i > xcconfigStartIdx && braceDepth === 0) {
      xcconfigEndIdx = i;
      break;
    }
  }

  if (xcconfigEndIdx === -1) {
    return { changed: false, result: contents };
  }

  // If add_dependency already appears after the xcconfig block, no change needed
  if (addDepIdx > xcconfigEndIdx) {
    return { changed: false, result: contents };
  }

  const addDepLine = lines[addDepIdx];
  // Remove original line
  lines.splice(addDepIdx, 1);
  // Insert after the xcconfig block (on the next line)
  lines.splice(xcconfigEndIdx + (addDepIdx < xcconfigEndIdx ? 0 : 1), 0, addDepLine);

  return { changed: true, result: lines.join('\n') };
}

try {
  if (!fs.existsSync(podspecPath)) {
    console.log('[fix-expohead-podspec] ExpoHead.podspec not found, skipping');
    process.exit(0);
  }

  const original = fs.readFileSync(podspecPath, 'utf8');
  const { changed, result } = moveAddDependencyLine(original);
  if (changed) {
    fs.writeFileSync(podspecPath, result, 'utf8');
    console.log('[fix-expohead-podspec] Reordered add_dependency below pod_target_xcconfig');
  } else {
    console.log('[fix-expohead-podspec] No changes needed');
  }
} catch (err) {
  console.warn('[fix-expohead-podspec] Failed to adjust ExpoHead.podspec:', err?.message || err);
  // Do not fail install; just warn
  process.exit(0);
}


