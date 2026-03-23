#!/usr/bin/env node

/**
 * pull-branding.mjs — Downloads branding files from Supabase Storage
 * and creates the local branding/<ClientName>/ folder.
 * If no files exist in storage, scaffolds a new branding folder locally.
 *
 * Usage:
 *   node scripts/pull-branding.mjs <ClientName>   — pull or scaffold specific client
 *   node scripts/pull-branding.mjs --all           — pull all clients
 *   node scripts/pull-branding.mjs --list          — list available clients
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { randomUUID } from 'crypto';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Load .env synchronously
const dotenv = require('dotenv');
dotenv.config({ path: path.join(projectRoot, '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase config in .env');
  console.error('   Ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in the root .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET = 'app_design';
const BRANDING_PREFIX = 'branding';

async function listClients() {
  const { data, error } = await supabase.storage.from(BUCKET).list(BRANDING_PREFIX);
  if (error) {
    console.error('❌ Error listing branding folders:', error.message);
    return [];
  }
  return (data || []).filter(item => !item.name.includes('.')).map(item => item.name);
}

function scaffoldClient(clientName) {
  const localPath = path.join(projectRoot, 'branding', clientName);
  const slug = clientName.toLowerCase();
  const businessId = randomUUID();

  if (fs.existsSync(localPath)) {
    console.log(`  ⚠️  Directory branding/${clientName}/ already exists — skipping scaffold`);
    return false;
  }

  console.log(`\n🆕 Scaffolding new branding folder for: ${clientName}`);

  fs.mkdirSync(localPath, { recursive: true });
  console.log(`  ✅ Created directory: branding/${clientName}/`);

  const envContent = `# ${clientName} Environment Configuration
EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey || ''}
EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey || ''}
BUSINESS_ID=${businessId}
CLIENT_NAME=${clientName}
`;
  fs.writeFileSync(path.join(localPath, '.env'), envContent);
  console.log(`  ✅ Created: branding/${clientName}/.env`);

  const appConfig = {
    expo: {
      name: clientName,
      slug: slug,
      version: '1.0.0',
      orientation: 'portrait',
      icon: `./branding/${clientName}/icon.png`,
      scheme: slug,
      userInterfaceStyle: 'automatic',
      splash: {
        image: `./branding/${clientName}/splash.png`,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
      ios: {
        buildNumber: '1',
        supportsTablet: true,
        bundleIdentifier: `com.${slug}.app`,
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
          CFBundleDevelopmentRegion: 'en',
          CFBundleAllowMixedLocalizations: true,
          NSPhotoLibraryUsageDescription: 'The app needs access to photos to select and upload images to the gallery or profile.',
          NSPhotoLibraryAddUsageDescription: 'The app may save photos you\'ve taken to your photo library.',
          NSCameraUsageDescription: 'The app needs access to the camera to take photos for upload.',
        },
        jsEngine: 'hermes',
      },
      android: {
        package: `com.${slug}.app`,
        versionCode: 1,
        adaptiveIcon: {
          foregroundImage: `./branding/${clientName}/icon.png`,
          backgroundColor: '#ffffff',
        },
        intentFilters: [
          {
            autoVerify: true,
            action: 'VIEW',
            data: { scheme: 'https', host: `${slug}.com` },
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
        supportsRtl: false,
      },
      web: { favicon: `./branding/${clientName}/icon.png` },
      plugins: [
        ['expo-router', { origin: `https://${slug}.com/` }],
        ['expo-notifications', { color: '#ffffff' }],
        'expo-web-browser',
        'expo-font',
        'expo-localization',
      ],
      experiments: { typedRoutes: true },
      locales: { he: './assets/locales/he.json' },
      extra: {
        router: { origin: `https://${slug}.com/` },
        eas: { projectId: '' },
        locale: 'en',
        CLIENT: clientName,
        BUSINESS_ID: businessId,
        logo: `./branding/${clientName}/logo.png`,
        logoWhite: `./branding/${clientName}/logo-white.png`,
      },
    },
  };
  fs.writeFileSync(path.join(localPath, 'app.config.json'), JSON.stringify(appConfig, null, 2));
  console.log(`  ✅ Created: branding/${clientName}/app.config.json`);

  const theme = {
    colors: {
      primary: '#007AFF',
      secondary: '#5856D6',
      accent: '#FF3B30',
      background: '#FFFFFF',
      surface: '#F2F2F7',
      text: '#1C1C1E',
      textSecondary: '#8E8E93',
      border: '#E5E5EA',
      success: '#34C759',
      warning: '#FF9500',
      error: '#FF3B30',
      info: '#007AFF',
    },
    branding: {
      logo: `./branding/${clientName}/logo.png`,
      logoWhite: `./branding/${clientName}/logo-white.png`,
      companyName: clientName,
      website: `https://${slug}.com`,
      supportEmail: `support@${slug}.com`,
    },
    fonts: { primary: 'System', secondary: 'System' },
  };
  fs.writeFileSync(path.join(localPath, 'theme.json'), JSON.stringify(theme, null, 2));
  console.log(`  ✅ Created: branding/${clientName}/theme.json`);

  const requiredImages = ['icon.png', 'splash.png', 'logo.png', 'logo-white.png'];
  console.log(`\n  ⚠️  Missing image files (add them manually):`);
  for (const img of requiredImages) {
    console.log(`     - branding/${clientName}/${img}`);
  }

  addNpmScripts(clientName);

  console.log('');
  console.log('🎉 Scaffold complete!');
  console.log('');
  console.log(`  BUSINESS_ID: ${businessId}`);
  console.log('');
  console.log('📋 Next steps:');
  console.log(`  1. Replace placeholder images in branding/${clientName}/ with real assets`);
  console.log(`  2. Update branding/${clientName}/.env if needed`);
  console.log(`  3. Run: npm run start:${clientName}`);

  return true;
}

function addNpmScripts(clientName) {
  const pkgPath = path.join(projectRoot, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = pkg.scripts || {};
    let changed = false;

    const toAdd = {
      [`start:${clientName}`]: `cross-env CLIENT=${clientName} node app.config.js && cross-env CLIENT=${clientName} expo start --tunnel`,
      [`start:${clientName}:lan`]: `cross-env CLIENT=${clientName} node app.config.js && cross-env CLIENT=${clientName} expo start --lan`,
      [`start:${clientName}:localhost`]: `cross-env CLIENT=${clientName} node app.config.js && cross-env CLIENT=${clientName} expo start --localhost`,
      [`start:web:${clientName}`]: `cross-env CLIENT=${clientName} node app.config.js && cross-env CLIENT=${clientName} expo start --web --tunnel`,
      [`build:${clientName}:ios`]: `cross-env CLIENT=${clientName} node scripts/build-client.mjs ${clientName} ios`,
      [`build:${clientName}:android`]: `cross-env CLIENT=${clientName} node scripts/build-client.mjs ${clientName} android`,
      [`build:${clientName}:all`]: `cross-env CLIENT=${clientName} node scripts/build-client.mjs ${clientName} all`,
    };

    for (const [key, val] of Object.entries(toAdd)) {
      if (!scripts[key]) {
        scripts[key] = val;
        changed = true;
      }
    }

    if (changed) {
      pkg.scripts = scripts;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`  ✅ Added npm scripts for ${clientName} to package.json`);
    }
  } catch (err) {
    console.error(`  ⚠️  Could not update package.json: ${err.message}`);
  }
}

async function pullClient(clientName) {
  console.log(`\n📦 Pulling branding for: ${clientName}`);

  const storagePath = `${BRANDING_PREFIX}/${clientName}`;
  const localPath = path.join(projectRoot, 'branding', clientName);

  const { data: files, error } = await supabase.storage.from(BUCKET).list(storagePath);
  if (error) {
    console.error(`❌ Error listing files for ${clientName}:`, error.message);
    console.log('  ↓ Falling back to local scaffold...');
    return scaffoldClient(clientName);
  }

  const realFiles = (files || []).filter(f => f.name && !f.name.startsWith('.emptyFolder'));

  if (realFiles.length === 0) {
    console.log(`  ⚠️  No files found in storage for ${clientName}`);
    console.log('  ↓ Scaffolding new branding folder locally...');
    return scaffoldClient(clientName);
  }

  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
    console.log(`  ✅ Created directory: branding/${clientName}/`);
  }

  let downloaded = 0;
  for (const file of realFiles) {
    const fileStoragePath = `${storagePath}/${file.name}`;
    const fileLocalPath = path.join(localPath, file.name);

    try {
      const { data, error: dlError } = await supabase.storage.from(BUCKET).download(fileStoragePath);
      if (dlError) {
        console.error(`  ❌ Error downloading ${file.name}:`, dlError.message);
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(fileLocalPath, buffer);
      console.log(`  ✅ ${file.name} (${(buffer.length / 1024).toFixed(1)} KB)`);
      downloaded++;
    } catch (err) {
      console.error(`  ❌ Error saving ${file.name}:`, err.message);
    }
  }

  console.log(`  📁 ${downloaded}/${realFiles.length} files downloaded to branding/${clientName}/`);

  addNpmScripts(clientName);

  return true;
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage:');
  console.log('  node scripts/pull-branding.mjs <ClientName>  — pull from storage or scaffold new client');
  console.log('  node scripts/pull-branding.mjs --all          — pull all clients from storage');
  console.log('  node scripts/pull-branding.mjs --list         — list available clients in storage');
  process.exit(0);
}

if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(args[0]) && !args[0].startsWith('--')) {
  console.error('❌ Client name must start with a letter and contain only letters and numbers');
  process.exit(1);
}

(async () => {
  if (args[0] === '--list') {
    const clients = await listClients();
    const localBranding = path.join(projectRoot, 'branding');
    const localClients = fs.existsSync(localBranding)
      ? fs.readdirSync(localBranding).filter(d => fs.statSync(path.join(localBranding, d)).isDirectory())
      : [];

    console.log('\n📦 Storage clients:');
    if (clients.length === 0) {
      console.log('  (none)');
    } else {
      clients.forEach(c => console.log(`  • ${c}`));
    }

    console.log('\n📁 Local branding folders:');
    if (localClients.length === 0) {
      console.log('  (none)');
    } else {
      localClients.forEach(c => console.log(`  • ${c}`));
    }
  } else if (args[0] === '--all') {
    const clients = await listClients();
    if (clients.length === 0) {
      console.log('No clients found in storage.');
    } else {
      console.log(`Found ${clients.length} client(s) to pull...`);
      for (const c of clients) {
        await pullClient(c);
      }
      console.log('\n🎉 Done pulling all clients!');
    }
  } else {
    const success = await pullClient(args[0]);
    if (success) {
      console.log(`\n🎉 Done! Run: npm run start:${args[0]}`);
    }
  }
})();
