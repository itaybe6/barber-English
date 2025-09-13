#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Get command line arguments
const args = process.argv.slice(2);
const client = args[0];
const platform = args[1] || 'all';
const buildProfile = args[2] || 'production';

if (!client) {
  console.error('❌ Error: Client name is required');
  console.log('Usage: node scripts/build-client.mjs <client> [platform] [buildProfile]');
  console.log('Example: node scripts/build-client.mjs clientA ios production');
  console.log('Platforms: ios, android, all');
  console.log('Build profiles: development, preview, production');
  process.exit(1);
}

// Validate client exists
const clientPath = path.join(projectRoot, 'branding', client);
if (!fs.existsSync(clientPath)) {
  console.error(`❌ Error: Client '${client}' not found in branding directory`);
  console.log('Available clients:');
  const brandingDir = path.join(projectRoot, 'branding');
  if (fs.existsSync(brandingDir)) {
    const clients = fs.readdirSync(brandingDir)
      .filter(item => fs.statSync(path.join(brandingDir, item)).isDirectory())
      .filter(item => item !== 'current');
    clients.forEach(c => console.log(`  - ${c}`));
  }
  process.exit(1);
}

// Validate platform
const validPlatforms = ['ios', 'android', 'all'];
if (!validPlatforms.includes(platform)) {
  console.error(`❌ Error: Invalid platform '${platform}'`);
  console.log('Valid platforms:', validPlatforms.join(', '));
  process.exit(1);
}

// Validate build profile
const validProfiles = ['development', 'preview', 'production'];
if (!validProfiles.includes(buildProfile)) {
  console.error(`❌ Error: Invalid build profile '${buildProfile}'`);
  console.log('Valid build profiles:', validProfiles.join(', '));
  process.exit(1);
}

console.log(`🚀 Building app for client: ${client}`);
console.log(`📱 Platform: ${platform}`);
console.log(`🔧 Build profile: ${buildProfile}`);
console.log('');

// Set environment variable for the build
process.env.CLIENT = client;

// Function to run EAS build
const runEasBuild = (targetPlatform) => {
  try {
    console.log(`📦 Starting EAS build for ${targetPlatform}...`);
    
    const command = `eas build --platform ${targetPlatform} --profile ${buildProfile}`;
    console.log(`Running: ${command}`);
    
    execSync(command, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        CLIENT: client,
      },
    });
    
    console.log(`✅ EAS build completed for ${targetPlatform}`);
  } catch (error) {
    console.error(`❌ EAS build failed for ${targetPlatform}:`, error.message);
    throw error;
  }
};

// Main build process
const main = async () => {
  try {
    // Verify EAS CLI is installed
    try {
      execSync('eas --version', { stdio: 'pipe' });
    } catch (error) {
      console.error('❌ Error: EAS CLI is not installed');
      console.log('Install it with: npm install -g @expo/eas-cli');
      process.exit(1);
    }

    // Verify we're in an Expo project
    if (!fs.existsSync(path.join(projectRoot, 'app.config.js'))) {
      console.error('❌ Error: app.config.js not found. Make sure you\'re in an Expo project root.');
      process.exit(1);
    }

    // Check if client has required files
    const requiredFiles = ['app.config.json', 'theme.json'];
    for (const file of requiredFiles) {
      const filePath = path.join(clientPath, file);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: Required file not found: branding/${client}/${file}`);
        process.exit(1);
      }
    }

    console.log('✅ Client configuration validated');
    console.log('');

    // Run builds based on platform
    if (platform === 'all') {
      await runEasBuild('ios');
      console.log('');
      await runEasBuild('android');
    } else {
      await runEasBuild(platform);
    }

    console.log('');
    console.log('🎉 All builds completed successfully!');
    console.log(`📱 Client: ${client}`);
    console.log(`🔧 Build profile: ${buildProfile}`);
    console.log(`📦 Platform(s): ${platform === 'all' ? 'iOS & Android' : platform}`);

  } catch (error) {
    console.error('❌ Build process failed:', error.message);
    process.exit(1);
  }
};

// Run the main function
main();
