#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target file size in KB
const TARGET_SIZE_KB = 300; // 300KB per image
const MAX_WIDTH = 800; // Maximum width for mobile display
const QUALITY = 80; // JPEG quality (0-100)

const imagesDir = path.join(__dirname, '..', 'assets', 'images', 'default');

console.log('🔍 Analyzing image sizes...\n');

// Function to get file size in KB
function getFileSizeKB(filePath) {
  const stats = fs.statSync(filePath);
  return Math.round(stats.size / 1024 * 100) / 100;
}

// Function to get file size in MB
function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  return Math.round(stats.size / (1024 * 1024) * 100) / 100;
}

// Recursively find all image files
function findImageFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findImageFiles(fullPath));
    } else if (item.match(/\.(jpg|jpeg|png)$/i)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Analyze current image sizes
const imageFiles = findImageFiles(imagesDir);
const totalSize = imageFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const totalSizeMB = Math.round(totalSize / (1024 * 1024) * 100) / 100;

console.log(`📊 Found ${imageFiles.length} images`);
console.log(`📦 Total size: ${totalSizeMB} MB\n`);

// Show largest files
const filesWithSizes = imageFiles.map(file => ({
  path: file,
  sizeKB: getFileSizeKB(file),
  sizeMB: getFileSizeMB(file),
  relativePath: path.relative(imagesDir, file)
}));

filesWithSizes.sort((a, b) => b.sizeMB - a.sizeMB);

console.log('🔴 Largest files:');
filesWithSizes.slice(0, 10).forEach((file, index) => {
  const status = file.sizeMB > 1 ? '❌ TOO LARGE' : file.sizeKB > TARGET_SIZE_KB ? '⚠️  LARGE' : '✅ OK';
  console.log(`${index + 1}. ${file.relativePath} - ${file.sizeMB} MB ${status}`);
});

console.log('\n📋 Recommendations:');
console.log('1. Install ImageMagick: https://imagemagick.org/script/download.php#windows');
console.log('2. Or use online tools like: https://tinypng.com/ or https://compressor.io/');
console.log('3. Target size: Under 300KB per image');
console.log('4. Resolution: Max 800px width for mobile');
console.log('5. Quality: 80% JPEG quality\n');

// Calculate potential savings
const oversizedFiles = filesWithSizes.filter(f => f.sizeKB > TARGET_SIZE_KB);
const currentOversizedSize = oversizedFiles.reduce((sum, f) => sum + f.sizeKB, 0);
const potentialSavings = currentOversizedSize - (oversizedFiles.length * TARGET_SIZE_KB);

console.log(`💰 Potential savings: ${Math.round(potentialSavings / 1024 * 100) / 100} MB`);
console.log(`📱 This would improve app loading speed significantly!\n`);

// Create optimization commands for ImageMagick (if installed)
console.log('🛠️  ImageMagick commands to optimize images:');
console.log('(Run these after installing ImageMagick)\n');

oversizedFiles.forEach(file => {
  const outputPath = file.path.replace(/\.(jpg|jpeg|png)$/i, '_optimized.$1');
  const command = `magick "${file.path}" -resize ${MAX_WIDTH}x> -quality ${QUALITY} "${outputPath}"`;
  console.log(`# ${file.relativePath} (${file.sizeMB} MB)`);
  console.log(command);
  console.log('');
});

console.log('💡 Alternative: Use online tools to batch compress all images');
console.log('💡 Or use Sharp library in Node.js for programmatic optimization');
