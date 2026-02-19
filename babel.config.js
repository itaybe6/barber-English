module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // Fix: web bundles are loaded as classic scripts; transform any `import.meta`
          // usage (often from ESM dependencies) to avoid runtime SyntaxError.
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './',
          },
        },
      ],
      'react-native-reanimated/plugin', // תמיד אחרון
    ].filter(Boolean),
  };
};
