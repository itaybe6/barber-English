module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'expo-router/babel',
      [
        'module-resolver',
        {
          alias: {
            '@': './',
            // Force CJS builds to avoid import.meta in ESM on web
            'zustand/middleware': 'zustand/middleware.js',
            zustand: 'zustand/index.js',
          },
        },
      ],
      'react-native-reanimated/plugin', // תמיד אחרון
    ],
  };
};
