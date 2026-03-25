const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroDefaultResolve } = require('metro-resolver');

// Metro (Expo SDK 54) sometimes resolves `react-native-reanimated` to its `src/`
// entry on web (via the `react-native` field). With Reanimated 4.x this can
// break because some source-only paths aren't meant to be bundled directly.
//
// Workaround: on web, force Metro to use the compiled `lib/module` entry.
const config = getDefaultConfig(__dirname);

const reanimatedWebEntry = path.join(
  __dirname,
  'node_modules',
  'react-native-reanimated',
  'lib',
  'module',
  'index.js'
);

// Chain custom resolution with Metro's default. Do not use `context.resolveRequest`
// alone: with Expo 54, `config.resolver.resolveRequest` is often null, and calling
// `context.resolveRequest` here can break bare imports (e.g. react-native-gesture-handler).
// metro-resolver's `resolve` implements the correct fallback wrapping.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-reanimated') {
    return {
      type: 'sourceFile',
      filePath: reanimatedWebEntry,
    };
  }

  return metroDefaultResolve(context, moduleName, platform);
};

module.exports = config;

