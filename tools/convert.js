#!/usr/bin/env node
/**
 * Converts an SVG file to PNG using sharp
 * Usage: node convert.js <input.svg> [output.png]
 *
 * If output is not specified, it will use the same name with .png extension
 * in the drawings/png folder
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function convertSvgToPng(inputPath, outputPath) {
  // Read the SVG file
  const svgBuffer = fs.readFileSync(inputPath);

  // Convert to PNG with sharp
  // Default to 800px width, maintaining aspect ratio
  await sharp(svgBuffer)
    .resize(800)
    .png()
    .toFile(outputPath);

  console.log(`Converted: ${inputPath} -> ${outputPath}`);
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node convert.js <input.svg> [output.png]');
  console.log('Example: node convert.js drawings/svg/myart.svg');
  process.exit(1);
}

const inputPath = args[0];

// Default output path: same name in drawings/png folder
const baseName = path.basename(inputPath, '.svg');
const outputPath = args[1] || path.join('drawings/png', `${baseName}.png`);

// Ensure output directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

convertSvgToPng(inputPath, outputPath)
  .catch(err => {
    console.error('Error converting:', err.message);
    process.exit(1);
  });
