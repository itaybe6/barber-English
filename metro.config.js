const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

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

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-reanimated') {
    return {
      type: 'sourceFile',
      filePath: reanimatedWebEntry,
    };
  }

  if (typeof defaultResolveRequest === 'function') {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

