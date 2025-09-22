#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Get client name from command line arguments
const args = process.argv.slice(2);
const clientName = args[0];

if (!clientName) {
  console.error('❌ Error: Client name is required');
  console.log('Usage: node scripts/add-client.mjs <clientName>');
  console.log('Example: node scripts/add-client.mjs clientC');
  process.exit(1);
}

// Validate client name (alphanumeric, can start with uppercase)
if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(clientName)) {
  console.error('❌ Error: Client name must start with a letter and contain only letters and numbers');
  console.log('Example: clientC, myapp, brand1');
  process.exit(1);
}

const clientPath = path.join(projectRoot, 'branding', clientName);

// Check if client already exists
if (fs.existsSync(clientPath)) {
  console.error(`❌ Error: Client '${clientName}' already exists`);
  process.exit(1);
}

console.log(`🆕 Creating new client: ${clientName}`);
console.log('');

try {
  // Create client directory
  fs.mkdirSync(clientPath, { recursive: true });
  console.log(`✅ Created directory: branding/${clientName}/`);

  // Create app.config.json template
  const appConfigTemplate = {
    expo: {
      name: `${clientName.charAt(0).toUpperCase() + clientName.slice(1)} App`,
      slug: `${clientName}-app`,
      version: "1.0.0",
      orientation: "portrait",
      icon: `./branding/${clientName}/icon.png`,
      scheme: clientName,
      userInterfaceStyle: "automatic",
      splash: {
        image: `./branding/${clientName}/splash.png`,
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      ios: {
        buildNumber: "1",
        supportsTablet: true,
        bundleIdentifier: `com.${clientName}.app`,
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
          CFBundleDevelopmentRegion: "en",
          CFBundleAllowMixedLocalizations: true,
          NSPhotoLibraryUsageDescription: "The app needs access to photos to select and upload images to the gallery or profile.",
          NSPhotoLibraryAddUsageDescription: "The app may save photos you've taken to your photo library.",
          NSCameraUsageDescription: "The app needs access to the camera to take photos for upload."
        },
        jsEngine: "hermes"
      },
      android: {
        package: `com.${clientName}.app`,
        versionCode: 1,
        adaptiveIcon: {
          foregroundImage: `./branding/${clientName}/icon.png`,
          backgroundColor: "#ffffff"
        },
        intentFilters: [
          {
            autoVerify: true,
            action: "VIEW",
            data: {
              scheme: "https",
              host: `${clientName}.com`
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
        favicon: `./branding/${clientName}/icon.png`
      },
      plugins: [
        [
          "expo-router",
          {
            origin: `https://${clientName}.com/`
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
          origin: `https://${clientName}.com/`
        },
        eas: {
          projectId: "f0c09635-7e73-4fc6-94e1-b0addf0ab9f3"
        },
        locale: "en"
      }
    }
  };

  const appConfigPath = path.join(clientPath, 'app.config.json');
  fs.writeFileSync(appConfigPath, JSON.stringify(appConfigTemplate, null, 2));
  console.log(`✅ Created: branding/${clientName}/app.config.json`);

  // Create theme.json template
  const themeTemplate = {
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
      logo: `./branding/${clientName}/logo.png`,
      logoWhite: `./branding/${clientName}/logo-white.png`,
      companyName: `${clientName.charAt(0).toUpperCase() + clientName.slice(1)} Company`,
      website: `https://${clientName}.com`,
      supportEmail: `support@${clientName}.com`
    },
    fonts: {
      primary: "System",
      secondary: "System"
    }
  };

  const themePath = path.join(clientPath, 'theme.json');
  fs.writeFileSync(themePath, JSON.stringify(themeTemplate, null, 2));
  console.log(`✅ Created: branding/${clientName}/theme.json`);

  // Update assets.ts to include new client
  const assetsPath = path.join(projectRoot, 'src', 'theme', 'assets.ts');
  if (fs.existsSync(assetsPath)) {
    let assetsContent = fs.readFileSync(assetsPath, 'utf8');
    
    // Add new client to clientLogos
    const logoRegex = /clientLogos = \{([^}]+)\}/;
    const match = assetsContent.match(logoRegex);
    if (match) {
      const currentLogos = match[1];
      const newLogoEntry = `  ${clientName}: require('../../assets/images/${clientName}-logo.png'),`;
      const updatedLogos = currentLogos + '\n' + newLogoEntry;
      assetsContent = assetsContent.replace(logoRegex, `clientLogos = {${updatedLogos}\n}`);
      
      fs.writeFileSync(assetsPath, assetsContent);
      console.log(`✅ Updated: src/theme/assets.ts`);
    }
  }

  // Create placeholder image files (empty files with instructions)
  const placeholderFiles = [
    { name: 'icon.png', description: 'App icon (1024x1024px)' },
    { name: 'splash.png', description: 'Splash screen (1242x2436px)' },
    { name: 'logo.png', description: 'Company logo' },
    { name: 'logo-white.png', description: 'White version of company logo' }
  ];

  for (const file of placeholderFiles) {
    const filePath = path.join(clientPath, file.name);
    const placeholderContent = `# ${file.description}
# Replace this file with your actual ${file.description.toLowerCase()}
# Recommended size: ${file.description.includes('1024') ? '1024x1024px' : file.description.includes('1242') ? '1242x2436px' : 'as needed'}
`;
    fs.writeFileSync(filePath, placeholderContent);
    console.log(`✅ Created placeholder: branding/${clientName}/${file.name}`);
  }

  // Create logo file in assets/images
  const logoAssetPath = path.join(projectRoot, 'assets', 'images', `${clientName}-logo.png`);
  const logoPlaceholderContent = `# ${clientName} Logo
# Replace this file with your actual logo image
# This logo will be used in the app header
`;
  fs.writeFileSync(logoAssetPath, logoPlaceholderContent);
  console.log(`✅ Created placeholder: assets/images/${clientName}-logo.png`);

  // Create additional logo file in client branding directory
  const clientLogoPath = path.join(clientPath, 'logo.png');
  const clientLogoPlaceholderContent = `# ${clientName} Logo
# Replace this file with your actual logo image
# This is the same logo as the one in assets/images/${clientName}-logo.png
# Both files should contain the same logo image
`;
  fs.writeFileSync(clientLogoPath, clientLogoPlaceholderContent);
  console.log(`✅ Created placeholder: branding/${clientName}/logo.png`);

  // Create .env file for the new client
  const envContent = `# ${clientName} Environment Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
BUSINESS_ID=${clientName}-business-id-${Math.random().toString(36).substr(2, 9)}
CLIENT=${clientName}
`;
  const envPath = path.join(clientPath, '.env');
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Created: branding/${clientName}/.env`);

  console.log('');
  console.log('🎉 Client created successfully!');
  console.log('');
  console.log('📋 Next steps:');
  console.log(`1. Replace placeholder files in branding/${clientName}/ with your actual assets:`);
  console.log(`   - icon.png (1024x1024px)`);
  console.log(`   - splash.png (1242x2436px)`);
  console.log(`   - logo.png (company logo)`);
  console.log(`   - logo-white.png (white version of logo)`);
  console.log(`2. Replace assets/images/${clientName}-logo.png with your logo`);
  console.log(`3. Note: Both logo files should contain the same logo image:`);
  console.log(`   - branding/${clientName}/logo.png`);
  console.log(`   - assets/images/${clientName}-logo.png`);
  console.log(`4. Update branding/${clientName}/.env with your actual values:`);
  console.log(`   - EXPO_PUBLIC_SUPABASE_URL`);
  console.log(`   - EXPO_PUBLIC_SUPABASE_ANON_KEY`);
  console.log(`   - EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`);
  console.log(`   - BUSINESS_ID (unique for this client)`);
  console.log(`5. Customize branding/${clientName}/theme.json with your colors and branding`);
  console.log(`6. Customize branding/${clientName}/app.config.json with your app details`);
  console.log(`7. Add build scripts to package.json:`);
  console.log(`   "start:${clientName}": "cross-env CLIENT=${clientName} node app.config.js && cross-env CLIENT=${clientName} expo start --tunnel"`);
  console.log(`   "build:${clientName}:ios": "cross-env CLIENT=${clientName} node scripts/build-client.mjs ${clientName} ios"`);
  console.log(`   "build:${clientName}:android": "cross-env CLIENT=${clientName} node scripts/build-client.mjs ${clientName} android"`);
  console.log(`8. Test your client: npm run switch:client ${clientName}`);

} catch (error) {
  console.error('❌ Error creating client:', error.message);
  process.exit(1);
}
