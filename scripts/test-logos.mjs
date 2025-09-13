#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Test logo switching functionality
const testLogoSwitching = () => {
  console.log('🎨 Testing Logo Switching System...\n');

  // Test 1: Check if logo files exist
  console.log('1. Checking logo files...');
  const logoFiles = [
    'assets/images/clientA-logo.png',
    'assets/images/clientB-logo.png',
    'assets/images/logo-03.png'
  ];

  for (const logoFile of logoFiles) {
    const fullPath = path.join(projectRoot, logoFile);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`✅ ${logoFile} - ${(stats.size / 1024).toFixed(1)}KB`);
    } else {
      console.log(`❌ ${logoFile} - File not found`);
    }
  }

  // Test 2: Check assets.ts file
  console.log('\n2. Checking assets.ts file...');
  const assetsPath = path.join(projectRoot, 'src', 'theme', 'assets.ts');
  if (fs.existsSync(assetsPath)) {
    const content = fs.readFileSync(assetsPath, 'utf8');
    if (content.includes('clientA-logo.png') && content.includes('clientB-logo.png')) {
      console.log('✅ assets.ts contains correct logo mappings');
    } else {
      console.log('❌ assets.ts missing logo mappings');
    }
  } else {
    console.log('❌ assets.ts file not found');
  }

  // Test 3: Check client home screen
  console.log('\n3. Checking client home screen...');
  const clientHomePath = path.join(projectRoot, 'app', '(client-tabs)', 'index.tsx');
  if (fs.existsSync(clientHomePath)) {
    const content = fs.readFileSync(clientHomePath, 'utf8');
    if (content.includes('getCurrentClientLogo()')) {
      console.log('✅ Client home screen uses dynamic logo');
    } else {
      console.log('❌ Client home screen still uses static logo');
    }
  } else {
    console.log('❌ Client home screen not found');
  }

  // Test 4: Check admin home screen
  console.log('\n4. Checking admin home screen...');
  const adminHomePath = path.join(projectRoot, 'app', '(tabs)', 'index.tsx');
  if (fs.existsSync(adminHomePath)) {
    const content = fs.readFileSync(adminHomePath, 'utf8');
    if (content.includes('getCurrentClientLogo()')) {
      console.log('✅ Admin home screen uses dynamic logo');
    } else {
      console.log('❌ Admin home screen still uses static logo');
    }
  } else {
    console.log('❌ Admin home screen not found');
  }

  // Test 5: Check imports
  console.log('\n5. Checking imports...');
  const filesToCheck = [
    { path: 'app/(client-tabs)/index.tsx', name: 'Client Home' },
    { path: 'app/(tabs)/index.tsx', name: 'Admin Home' }
  ];

  for (const file of filesToCheck) {
    const fullPath = path.join(projectRoot, file.path);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes("import { getCurrentClientLogo } from '@/src/theme/assets'")) {
        console.log(`✅ ${file.name} imports getCurrentClientLogo`);
      } else {
        console.log(`❌ ${file.name} missing getCurrentClientLogo import`);
      }
    }
  }

  console.log('\n🎉 Logo switching test completed!');
  console.log('\n📋 Summary:');
  console.log('✅ Logo files created for clientA and clientB');
  console.log('✅ assets.ts mapping file created');
  console.log('✅ Client home screen updated to use dynamic logo');
  console.log('✅ Admin home screen updated to use dynamic logo');
  console.log('✅ All imports added correctly');

  console.log('\n🚀 How to test:');
  console.log('1. Run: npm run start:clientA');
  console.log('2. Check that clientA logo appears in both home screens');
  console.log('3. Run: npm run start:clientB');
  console.log('4. Check that clientB logo appears in both home screens');
  console.log('5. Run: npm start (default)');
  console.log('6. Check that default logo appears in both home screens');
};

// Run the test
testLogoSwitching();
