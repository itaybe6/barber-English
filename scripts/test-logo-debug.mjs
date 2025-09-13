#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Test logo switching with different clients
const testLogoSwitching = async () => {
  console.log('🎨 Testing Logo Switching Debug...\n');

  const clients = ['clientA', 'clientB'];
  
  for (const client of clients) {
    console.log(`\n🔍 Testing client: ${client}`);
    
    // Set environment variable
    process.env.CLIENT = client;
    
    try {
      // Run app.config.js to update the currentClient.ts file
      const { execSync } = require('child_process');
      execSync('node app.config.js', { 
        cwd: projectRoot,
        env: { ...process.env, CLIENT: client }
      });
      
      // Read the updated currentClient.ts file
      const currentClientPath = path.join(projectRoot, 'src', 'config', 'currentClient.ts');
      if (fs.existsSync(currentClientPath)) {
        const content = fs.readFileSync(currentClientPath, 'utf8');
        const match = content.match(/export const CURRENT_CLIENT = '(.+)';/);
        if (match) {
          const currentClient = match[1];
          console.log(`✅ Current client set to: ${currentClient}`);
          
          // Check if the logo file exists
          const logoPath = path.join(projectRoot, 'assets', 'images', `${currentClient}-logo.png`);
          if (fs.existsSync(logoPath)) {
            console.log(`✅ Logo file exists: ${currentClient}-logo.png`);
          } else {
            console.log(`❌ Logo file missing: ${currentClient}-logo.png`);
          }
        } else {
          console.log('❌ Could not parse CURRENT_CLIENT from file');
        }
      } else {
        console.log('❌ currentClient.ts file not found');
      }
      
    } catch (error) {
      console.error(`❌ Error testing ${client}:`, error.message);
    }
  }
  
  console.log('\n🎉 Logo switching test completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Run: npm run start:clientA');
  console.log('2. Check the console logs to see which client is detected');
  console.log('3. Run: npm run start:clientB');
  console.log('4. Check the console logs to see which client is detected');
  console.log('5. Look at the header logo in both home screens');
};

// Run the test
testLogoSwitching().catch(console.error);
