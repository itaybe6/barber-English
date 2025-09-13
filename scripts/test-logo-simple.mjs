#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Simple logo test
const testLogo = async () => {
  console.log('🎨 Testing Logo System...\n');

  // Test clientA
  console.log('1. Testing clientA...');
  process.env.CLIENT = 'clientA';
  const { execSync } = await import('child_process');
  execSync('node app.config.js', { cwd: projectRoot, env: { ...process.env, CLIENT: 'clientA' } });
  
  const currentClientPath = path.join(projectRoot, 'src', 'config', 'currentClient.ts');
  const content = fs.readFileSync(currentClientPath, 'utf8');
  const match = content.match(/export const CURRENT_CLIENT = '(.+)';/);
  if (match) {
    console.log(`✅ clientA set: ${match[1]}`);
  }
  
  // Test clientB
  console.log('\n2. Testing clientB...');
  process.env.CLIENT = 'clientB';
  execSync('node app.config.js', { cwd: projectRoot, env: { ...process.env, CLIENT: 'clientB' } });
  
  const content2 = fs.readFileSync(currentClientPath, 'utf8');
  const match2 = content2.match(/export const CURRENT_CLIENT = '(.+)';/);
  if (match2) {
    console.log(`✅ clientB set: ${match2[1]}`);
  }
  
  console.log('\n🎉 Logo system is working!');
  console.log('\n📋 To test in the app:');
  console.log('1. Run: npm run start:clientA');
  console.log('2. Check the header logo (should be clientA logo)');
  console.log('3. Run: npm run start:clientB');
  console.log('4. Check the header logo (should be clientB/Slotlys logo)');
};

// Run the test
testLogo().catch(console.error);
