#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Simple logo check
const checkLogo = () => {
  console.log('🎨 Checking Logo System...\n');

  // Read current client
  const currentClientPath = path.join(projectRoot, 'src', 'config', 'currentClient.ts');
  if (fs.existsSync(currentClientPath)) {
    const content = fs.readFileSync(currentClientPath, 'utf8');
    const match = content.match(/export const CURRENT_CLIENT = '(.+)';/);
    if (match) {
      const currentClient = match[1];
      console.log(`✅ Current client: ${currentClient}`);
      
      // Check if logo exists
      const logoPath = path.join(projectRoot, 'assets', 'images', `${currentClient}-logo.png`);
      if (fs.existsSync(logoPath)) {
        const stats = fs.statSync(logoPath);
        console.log(`✅ Logo file exists: ${currentClient}-logo.png (${(stats.size / 1024).toFixed(1)}KB)`);
      } else {
        console.log(`❌ Logo file missing: ${currentClient}-logo.png`);
      }
      
      // Check if the logo is being used in the code
      const clientHomePath = path.join(projectRoot, 'app', '(client-tabs)', 'index.tsx');
      const adminHomePath = path.join(projectRoot, 'app', '(tabs)', 'index.tsx');
      
      if (fs.existsSync(clientHomePath)) {
        const content = fs.readFileSync(clientHomePath, 'utf8');
        if (content.includes('getCurrentClientLogo()')) {
          console.log('✅ Client home screen uses dynamic logo');
        } else {
          console.log('❌ Client home screen still uses static logo');
        }
      }
      
      if (fs.existsSync(adminHomePath)) {
        const content = fs.readFileSync(adminHomePath, 'utf8');
        if (content.includes('getCurrentClientLogo()')) {
          console.log('✅ Admin home screen uses dynamic logo');
        } else {
          console.log('❌ Admin home screen still uses static logo');
        }
      }
      
    } else {
      console.log('❌ Could not parse CURRENT_CLIENT from file');
    }
  } else {
    console.log('❌ currentClient.ts file not found');
  }
  
  console.log('\n🎯 To test:');
  console.log('1. Run: npm run start:clientB');
  console.log('2. Check the header logo in both home screens');
  console.log('3. The logo should be the Slotlys logo (clientB-logo.png)');
};

// Run the check
checkLogo();
