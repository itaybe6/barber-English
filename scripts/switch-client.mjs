#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Get client from command line arguments
const args = process.argv.slice(2);
const targetClient = args[0];

if (!targetClient) {
  console.error('❌ Error: Client name is required');
  console.log('Usage: node scripts/switch-client.mjs <client>');
  console.log('Example: node scripts/switch-client.mjs clientA');
  console.log('');
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

// Validate client exists
const clientPath = path.join(projectRoot, 'branding', targetClient);
if (!fs.existsSync(clientPath)) {
  console.error(`❌ Error: Client '${targetClient}' not found in branding directory`);
  process.exit(1);
}

console.log(`🔄 Switching to client: ${targetClient}`);
console.log('');

try {
  // Set environment variable and run app.config.js
  process.env.CLIENT = targetClient;
  
  // Run app.config.js to update current.json and currentClient.ts
  console.log('📝 Updating configuration files...');
  execSync('node app.config.js', { 
    cwd: projectRoot,
    stdio: 'pipe',
    env: { ...process.env, CLIENT: targetClient }
  });
  
  console.log('✅ Configuration updated successfully');
  console.log('');
  
  // Show current client info
  const currentConfigPath = path.join(projectRoot, 'branding', 'current.json');
  if (fs.existsSync(currentConfigPath)) {
    const currentConfig = JSON.parse(fs.readFileSync(currentConfigPath, 'utf8'));
    console.log('📱 Current App Configuration:');
    console.log(`   Name: ${currentConfig.config.expo.name}`);
    console.log(`   Bundle ID: ${currentConfig.config.expo.ios.bundleIdentifier}`);
    console.log(`   Company: ${currentConfig.theme.branding.companyName}`);
    console.log(`   Primary Color: ${currentConfig.theme.colors.primary}`);
    console.log('');
  }
  
  console.log('🎯 Next steps:');
  console.log(`   Start development: npm run start:${targetClient}`);
  console.log(`   Build iOS: npm run build:${targetClient}:ios`);
  console.log(`   Build Android: npm run build:${targetClient}:android`);
  console.log('');
  console.log('✅ Client switch completed!');
  
} catch (error) {
  console.error('❌ Error switching client:', error.message);
  process.exit(1);
}
