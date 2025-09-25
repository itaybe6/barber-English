const fs = require('fs');
const path = require('path');
require('dotenv').config();

// -------------------------------------------------------------
// 1. מי הלקוח? אם אין הגדרה – ננסה לגזור מה-EAS_BUILD_PROFILE → eas.json
//    מאפשר להריץ: `npx eas-cli build --profile production` בלי CLIENT מקומי
// -------------------------------------------------------------
let clientFromProfile = undefined;
try {
  const profileName = process.env.EAS_BUILD_PROFILE;
  if (profileName) {
    const easJsonPath = path.join(__dirname, 'eas.json');
    const easJson = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
    clientFromProfile = easJson?.build?.[profileName]?.env?.CLIENT;
  }
} catch {}

const CLIENT = process.env.CLIENT || clientFromProfile || 'JamesBarber';
const clientDir = path.join(__dirname, 'branding', CLIENT);

// -------------------------------------------------------------
// 2. טוען ENV_FILE של הלקוח אם קיים
// -------------------------------------------------------------
const envPath = path.join(clientDir, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log(`✅ Loaded environment from: ${envPath}`);
} else {
  console.warn(`⚠️ Environment file not found: ${envPath}`);
}

// -------------------------------------------------------------
// 3. טוען app.config.json של הלקוח
// -------------------------------------------------------------
let appConfig = { expo: {} };
const clientConfigPath = path.join(clientDir, 'app.config.json');
if (fs.existsSync(clientConfigPath)) {
  try {
    appConfig = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));
    console.log(`✅ Loaded config for client: ${CLIENT}`);
  } catch (error) {
    console.error(`❌ Error parsing client config: ${error.message}`);
  }
} else {
  console.warn(`⚠️ Client config not found: ${clientConfigPath}`);
}

// -------------------------------------------------------------
// 4. טוען theme.json של הלקוח (אם קיים)
// -------------------------------------------------------------
let themeConfig = {};
const clientThemePath = path.join(clientDir, 'theme.json');
if (fs.existsSync(clientThemePath)) {
  try {
    themeConfig = JSON.parse(fs.readFileSync(clientThemePath, 'utf8'));
    console.log(`✅ Loaded theme for client: ${CLIENT}`);
  } catch (error) {
    console.error(`❌ Error parsing theme.json: ${error.message}`);
  }
} else {
  console.warn(`⚠️ No theme.json found at: ${clientThemePath}`);
}

// -------------------------------------------------------------
// 5. מוסיף extra עם משתני ENV + fallback בטוח
// -------------------------------------------------------------
appConfig.expo = appConfig.expo || {};
appConfig.expo.extra = {
  ...(appConfig.expo.extra || {}),
  CLIENT,
  theme: themeConfig,
  BUSINESS_ID: process.env.BUSINESS_ID || appConfig.expo.extra?.BUSINESS_ID || 'default',
  EXPO_PUBLIC_SUPABASE_URL:
    process.env.EXPO_PUBLIC_SUPABASE_URL || appConfig.expo.extra?.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || appConfig.expo.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY:
    process.env.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY || process.env.GOOGLE_STATIC_MAPS_KEY,
  EXPO_PUBLIC_GOOGLE_PLACES_KEY: process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY
};

// -------------------------------------------------------------
// 6. projectId ל-EAS: לא מכריחים ברירת־מחדל של פרויקט אחר
//    אם קיים ב-ENV נשתמש בו; אחרת נשאיר ריק כדי ש-EAS יקשר/ייצור
// -------------------------------------------------------------
try {
  appConfig.expo.extra = appConfig.expo.extra || {};
  appConfig.expo.extra.eas = appConfig.expo.extra.eas || {};
  const projectIdFromEnv = process.env.EAS_PROJECT_ID || appConfig.expo.extra.eas.projectId;
  if (projectIdFromEnv) {
    appConfig.expo.extra.eas.projectId = projectIdFromEnv;
  } else {
    try { delete appConfig.expo.extra.eas.projectId; } catch {}
  }
} catch {}

// -------------------------------------------------------------
// 7. מבטיח שתמיד יש comgooglemaps ב-iOS infoPlist
// -------------------------------------------------------------
try {
  appConfig.expo.ios = appConfig.expo.ios || {};
  appConfig.expo.ios.infoPlist = appConfig.expo.ios.infoPlist || {};
  const schemes = new Set([
    ...(appConfig.expo.ios.infoPlist.LSApplicationQueriesSchemes || []),
    'comgooglemaps'
  ]);
  appConfig.expo.ios.infoPlist.LSApplicationQueriesSchemes = Array.from(schemes);
} catch {}

// -------------------------------------------------------------
// 8. כותב current.json עם קונפיג מלא (debug/runtime)
// -------------------------------------------------------------
const currentConfigPath = path.join(__dirname, 'branding', 'current.json');
const currentConfig = {
  client: CLIENT,
  config: appConfig,
  theme: themeConfig,
  timestamp: new Date().toISOString()
};

try {
  const brandingDir = path.dirname(currentConfigPath);
  if (!fs.existsSync(brandingDir)) {
    fs.mkdirSync(brandingDir, { recursive: true });
  }
  fs.writeFileSync(currentConfigPath, JSON.stringify(currentConfig, null, 2));
  console.log(`✅ Written current config to: ${currentConfigPath}`);
} catch (error) {
  console.error(`❌ Error writing current config: ${error.message}`);
}

// -------------------------------------------------------------
// 9. כותב src/config/currentClient.ts
// -------------------------------------------------------------
try {
  const currentClientPath = path.join(__dirname, 'src', 'config', 'currentClient.ts');
  const currentClientContent = `// Current client configuration
// This file is automatically updated by the build process

export const CURRENT_CLIENT = '${CLIENT}';
`;
  const configDir = path.dirname(currentClientPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(currentClientPath, currentClientContent);
  console.log(`✅ Written current client to: ${currentClientPath}`);
} catch (error) {
  console.error(`❌ Error writing current client: ${error.message}`);
}

// -------------------------------------------------------------
// 10. ייצוא סופי ל-Expo
// -------------------------------------------------------------
module.exports = appConfig;
