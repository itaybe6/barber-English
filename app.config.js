const fs = require('fs');
const path = require('path');

// Get client from environment variable, default to 'clientA'
const CLIENT = process.env.CLIENT || 'clientA';

// Load environment variables for the specific client
const envPath = path.join(__dirname, 'branding', CLIENT, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log(`✅ Loaded environment from: ${envPath}`);
} else {
  console.warn(`⚠️ Environment file not found: ${envPath}`);
}

// Paths for client-specific configs
const clientConfigPath = path.join(__dirname, 'branding', CLIENT, 'app.config.json');
const clientThemePath = path.join(__dirname, 'branding', CLIENT, 'theme.json');
const currentConfigPath = path.join(__dirname, 'branding', 'current.json');

// Default config (fallback)
const defaultConfig = {
  expo: {
    name: "Default App",
    slug: "default-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "myapp",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      buildNumber: "1",
      supportsTablet: true,
      bundleIdentifier: "com.default.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        CFBundleDevelopmentRegion: "en",
        CFBundleAllowMixedLocalizations: true,
        NSPhotoLibraryUsageDescription: "The app needs access to photos to select and upload images to the gallery or profile.",
        NSPhotoLibraryAddUsageDescription: "The app may save photos you've taken to your photo library.",
        NSCameraUsageDescription: "The app needs access to the camera to take photos for upload.",
        LSApplicationQueriesSchemes: ["comgooglemaps"]
      },
      jsEngine: "hermes"
    },
    android: {
      package: "com.default.app",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      intentFilters: [
        {
          autoVerify: true,
          action: "VIEW",
          data: {
            scheme: "https",
            host: "default.com"
          },
          category: [
            "BROWSABLE",
            "DEFAULT"
          ]
        }
      ],
      supportsRtl: false
    },
    web: {
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      [
        "expo-router",
        {
          origin: "https://default.com/"
        }
      ],
      [
        "expo-notifications",
        {
          color: "#ffffff"
        }
      ],
      "expo-web-browser",
      "expo-font",
      "expo-localization"
    ],
    experiments: {
      typedRoutes: true
    },
    locales: {
      he: "./assets/locales/he.json"
    },
      extra: {
        router: {
          origin: "https://default.com/"
        },
        eas: {
          projectId: "f0c09635-7e73-4fc6-94e1-b0addf0ab9f3"
        },
        locale: "en",
        CLIENT: CLIENT, // Add the current client to extra
        BUSINESS_ID: process.env.BUSINESS_ID, // Add the business ID to extra
        EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY || process.env.GOOGLE_STATIC_MAPS_KEY,
        EXPO_PUBLIC_GOOGLE_PLACES_KEY: process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY 
      }
  }
};

// Default theme (fallback)
const defaultTheme = {
  colors: {
    primary: "#007AFF",
    secondary: "#5856D6",
    accent: "#FF3B30",
    background: "#FFFFFF",
    surface: "#F2F2F7",
    text: "#1C1C1E",
    textSecondary: "#8E8E93",
    border: "#E5E5EA",
    success: "#34C759",
    warning: "#FF9500",
    error: "#FF3B30",
    info: "#007AFF"
  },
  branding: {
    logo: "./assets/images/logo-03.png",
    logoWhite: "./assets/images/logo-03.png",
    companyName: "Default Company",
    website: "https://default.com",
    supportEmail: "support@default.com"
  },
  fonts: {
    primary: "System",
    secondary: "System"
  }
};

// Load client-specific config
let appConfig;
try {
  if (fs.existsSync(clientConfigPath)) {
    const clientConfig = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));
    appConfig = clientConfig;
    console.log(`✅ Loaded config for client: ${CLIENT}`);
  } else {
    console.warn(`⚠️  Client config not found: ${clientConfigPath}, using default config`);
    appConfig = defaultConfig;
  }
} catch (error) {
  console.error(`❌ Error loading client config: ${error.message}`);
  appConfig = defaultConfig;
}

// Load client-specific theme
let themeConfig;
try {
  if (fs.existsSync(clientThemePath)) {
    const clientTheme = JSON.parse(fs.readFileSync(clientThemePath, 'utf8'));
    themeConfig = clientTheme;
    console.log(`✅ Loaded theme for client: ${CLIENT}`);
  } else {
    console.warn(`⚠️  Client theme not found: ${clientThemePath}, using default theme`);
    themeConfig = defaultTheme;
  }
} catch (error) {
  console.error(`❌ Error loading client theme: ${error.message}`);
  themeConfig = defaultTheme;
}

// Add theme and business ID to appConfig extra
appConfig.expo.extra.theme = themeConfig;
appConfig.expo.extra.BUSINESS_ID = process.env.BUSINESS_ID;

// Ensure iOS LSApplicationQueriesSchemes contains comgooglemaps for Google Maps deep linking
try {
  appConfig.expo.ios = appConfig.expo.ios || {};
  appConfig.expo.ios.infoPlist = appConfig.expo.ios.infoPlist || {};
  const schemes = new Set([...(appConfig.expo.ios.infoPlist.LSApplicationQueriesSchemes || []), 'comgooglemaps']);
  appConfig.expo.ios.infoPlist.LSApplicationQueriesSchemes = Array.from(schemes);
} catch {}

// Create current.json with both config and theme
const currentConfig = {
  client: CLIENT,
  config: appConfig,
  theme: themeConfig,
  timestamp: new Date().toISOString()
};

// Write current.json for runtime access
try {
  // Ensure branding directory exists
  const brandingDir = path.dirname(currentConfigPath);
  if (!fs.existsSync(brandingDir)) {
    fs.mkdirSync(brandingDir, { recursive: true });
  }
  
  fs.writeFileSync(currentConfigPath, JSON.stringify(currentConfig, null, 2));
  console.log(`✅ Written current config to: ${currentConfigPath}`);
} catch (error) {
  console.error(`❌ Error writing current config: ${error.message}`);
}

// Write current client to a separate file for easy access
try {
  const currentClientPath = path.join(__dirname, 'src', 'config', 'currentClient.ts');
  const currentClientContent = `// Current client configuration
// This file is automatically updated by the build process

export const CURRENT_CLIENT = '${CLIENT}';
`;
  
  // Ensure src/config directory exists
  const configDir = path.dirname(currentClientPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(currentClientPath, currentClientContent);
  console.log(`✅ Written current client to: ${currentClientPath}`);
} catch (error) {
  console.error(`❌ Error writing current client: ${error.message}`);
}

// Export the app config for Expo
module.exports = appConfig;
