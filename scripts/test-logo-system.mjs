#!/usr/bin/env node

/**
 * Test script for Logo System
 * Tests that logos are loaded correctly from branding folders
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🎨 Testing Logo System');
console.log('=====================');

// Test 1: Check if logo files exist in branding folders
console.log('1️⃣ Checking logo files in branding folders...');

const clients = ['clientA', 'clientB'];
let allLogosExist = true;

for (const client of clients) {
  const logoPath = join(__dirname, '..', 'branding', client, 'logo.png');
  const logoWhitePath = join(__dirname, '..', 'branding', client, 'logo-white.png');
  
  try {
    readFileSync(logoPath);
    console.log(`✅ ${client}/logo.png exists`);
  } catch (error) {
    console.log(`❌ ${client}/logo.png missing`);
    allLogosExist = false;
  }
  
  try {
    readFileSync(logoWhitePath);
    console.log(`✅ ${client}/logo-white.png exists`);
  } catch (error) {
    console.log(`❌ ${client}/logo-white.png missing`);
    allLogosExist = false;
  }
}

// Test 2: Check app.config.json files
console.log('\n2️⃣ Checking app.config.json files...');

for (const client of clients) {
  const configPath = join(__dirname, '..', 'branding', client, 'app.config.json');
  
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    
    if (config.expo?.extra?.CLIENT === client) {
      console.log(`✅ ${client} app.config.json has correct CLIENT`);
    } else {
      console.log(`❌ ${client} app.config.json missing or incorrect CLIENT`);
      allLogosExist = false;
    }
    
    if (config.expo?.extra?.logo) {
      console.log(`✅ ${client} app.config.json has logo path`);
    } else {
      console.log(`❌ ${client} app.config.json missing logo path`);
      allLogosExist = false;
    }
    
    if (config.expo?.extra?.logoWhite) {
      console.log(`✅ ${client} app.config.json has logoWhite path`);
    } else {
      console.log(`❌ ${client} app.config.json missing logoWhite path`);
      allLogosExist = false;
    }
  } catch (error) {
    console.log(`❌ ${client} app.config.json error:`, error.message);
    allLogosExist = false;
  }
}

// Test 3: Check assets.ts file
console.log('\n3️⃣ Checking assets.ts file...');

try {
  const assetsPath = join(__dirname, '..', 'src', 'theme', 'assets.ts');
  const assetsContent = readFileSync(assetsPath, 'utf8');
  
  if (assetsContent.includes('branding/clientA/logo.png')) {
    console.log('✅ assets.ts references clientA logo correctly');
  } else {
    console.log('❌ assets.ts missing clientA logo reference');
    allLogosExist = false;
  }
  
  if (assetsContent.includes('branding/clientB/logo.png')) {
    console.log('✅ assets.ts references clientB logo correctly');
  } else {
    console.log('❌ assets.ts missing clientB logo reference');
    allLogosExist = false;
  }
} catch (error) {
  console.log('❌ assets.ts error:', error.message);
  allLogosExist = false;
}

// Test 4: Check login.tsx and register.tsx
console.log('\n4️⃣ Checking login and register screens...');

const screens = ['app/login.tsx', 'app/register.tsx'];

for (const screen of screens) {
  try {
    const screenPath = join(__dirname, '..', screen);
    const screenContent = readFileSync(screenPath, 'utf8');
    
    if (screenContent.includes('getCurrentClientLogo()')) {
      console.log(`✅ ${screen} uses getCurrentClientLogo()`);
    } else {
      console.log(`❌ ${screen} not using getCurrentClientLogo()`);
      allLogosExist = false;
    }
  } catch (error) {
    console.log(`❌ ${screen} error:`, error.message);
    allLogosExist = false;
  }
}

// Summary
console.log('\n📊 Summary:');
if (allLogosExist) {
  console.log('🎉 All logo system tests passed!');
  console.log('');
  console.log('✅ Logo files exist in branding folders');
  console.log('✅ app.config.json files configured correctly');
  console.log('✅ assets.ts references correct paths');
  console.log('✅ Login and register screens use dynamic logos');
  console.log('');
  console.log('🚀 Ready to test:');
  console.log('   npm run start:clientA  # Should show clientA logo');
  console.log('   npm run start:clientB  # Should show clientB logo');
} else {
  console.log('❌ Some logo system tests failed. Please check the issues above.');
  process.exit(1);
}
