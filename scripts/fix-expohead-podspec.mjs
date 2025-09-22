#!/usr/bin/env node
// Moves `add_dependency(s, "RNScreens")` below the `s.pod_target_xcconfig` block
// in expo-router's ExpoHead.podspec to avoid nil access during CocoaPods install.

import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const expoHeadPodspecPath = path.join(
  repoRoot,
  'node_modules',
  'expo-router',
  'ios',
  'ExpoHead.podspec'
);

const expoPodspecPath = path.join(
  repoRoot,
  'node_modules',
  'expo',
  'Expo.podspec'
);

const expoViewShadowNodePath = path.join(
  repoRoot,
  'node_modules',
  'expo-modules-core',
  'common',
  'cpp',
  'fabric',
  'ExpoViewShadowNode.cpp'
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

function removeReactAppDependencyProvider(contents) {
  const lines = contents.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes("s.dependency 'ReactAppDependencyProvider'"));
  if (idx === -1) return { changed: false, result: contents };
  lines.splice(idx, 1);
  return { changed: true, result: lines.join('\n') };
}

try {
  // Fix ExpoHead.podspec ordering
  if (fs.existsSync(expoHeadPodspecPath)) {
    const original = fs.readFileSync(expoHeadPodspecPath, 'utf8');
    const { changed, result } = moveAddDependencyLine(original);
    if (changed) {
      fs.writeFileSync(expoHeadPodspecPath, result, 'utf8');
      console.log('[fix-expo-pods] Reordered add_dependency in ExpoHead.podspec');
    } else {
      console.log('[fix-expo-pods] ExpoHead.podspec already OK');
    }
  } else {
    console.log('[fix-expo-pods] ExpoHead.podspec not found, skipping');
  }

  // Remove ReactAppDependencyProvider from Expo.podspec for RN <= 0.76
  if (fs.existsSync(expoPodspecPath)) {
    const expoOriginal = fs.readFileSync(expoPodspecPath, 'utf8');
    const { changed: expoChanged, result: expoResult } = removeReactAppDependencyProvider(expoOriginal);
    if (expoChanged) {
      fs.writeFileSync(expoPodspecPath, expoResult, 'utf8');
      console.log('[fix-expo-pods] Removed ReactAppDependencyProvider from Expo.podspec');
    } else {
      console.log('[fix-expo-pods] Expo.podspec did not reference ReactAppDependencyProvider or already fixed');
    }
  } else {
    console.log('[fix-expo-pods] Expo.podspec not found, skipping');
  }

  // Avoid patching ExpoViewShadowNode.cpp by default. Text patches can introduce
  // syntax errors (e.g., extraneous closing brace) in cloud builds. If you need
  // to force this patch for a specific toolchain, set RN_FORCE_EXPO_VIEW_PATCH=1.
  if (process.env.RN_FORCE_EXPO_VIEW_PATCH === '1') {
    if (fs.existsSync(expoViewShadowNodePath)) {
      try {
        const src = fs.readFileSync(expoViewShadowNodePath, 'utf8');
        if (src.includes('YGDisplayContents') || src.includes('ForceFlattenView')) {
          let patched = src.replace(/\n\s*if \(YGNodeStyleGetDisplay\(&yogaNode_\) == YGDisplayContents\) \{[\s\S]*?\n\s*\}/m, '\n  // [postinstall patch] Disabled ForceFlatten handling for RN < 0.78');
          patched = patched.replace(/\n\}\s*\n\}\s*\n(\}\s*\/\/\s*namespace\s+expo)/m, '\n}\n$1');
          fs.writeFileSync(expoViewShadowNodePath, patched, 'utf8');
          console.log('[fix-expo-pods] Patched ExpoViewShadowNode.cpp');
        } else {
          console.log('[fix-expo-pods] ExpoViewShadowNode.cpp looks compatible; no patch applied');
        }
      } catch (e) {
        console.warn('[fix-expo-pods] Failed patching ExpoViewShadowNode.cpp:', e?.message || e);
      }
    } else {
      console.log('[fix-expo-pods] ExpoViewShadowNode.cpp not found, skipping');
    }
  } else {
    console.log('[fix-expo-pods] Skipping ExpoViewShadowNode.cpp patch');
  }
} catch (err) {
  console.warn('[fix-expo-pods] Failed to adjust Expo podspecs:', err?.message || err);
  // Do not fail install; just warn
  process.exit(0);
}


