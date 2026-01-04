#!/usr/bin/env node
// Feedback Loop Tool
// Creates actual visual feedback by re-encoding images through each iteration
// Compression artifacts accumulate creating emergent degradation

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USAGE = `
Feedback Loop Tool - Creates real visual feedback with compression artifacts

Usage: node feedback.js <input-image> <output-dir> [options]

Options:
  --iterations, -n   Number of feedback iterations (default: 30)
  --quality, -q      JPEG quality 1-100, lower = more artifacts (default: 85)
  --scale, -s        Scale of nested image 0.3-0.9 (default: 0.7)
  --offset-x         Horizontal offset of nested image (default: 0)
  --offset-y         Vertical offset of nested image (default: 0)
  --rotate, -r       Rotation per iteration in degrees (default: 0)
  --zoom, -z         Zoom center point each iteration (default: false)
  --blend            Blend mode: overlay, multiply, screen (default: overlay)
  --brightness, -b   Brightness boost per iteration 0-0.5 (default: 0)
  --glitch, -g       Chance of color glitch per iteration 0-1 (default: 0)
  --passes, -p       JPEG encode/decode passes per iteration (default: 1)

Example:
  node feedback.js input.png ./feedback-output -n 50 -q 75 -s 0.6 -b 0.05 -g 0.15
`;

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const inputPath = args[0];
const outputDir = args[1];

// Parse options
function getArg(names, defaultVal) {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && args[idx + 1]) {
      return args[idx + 1];
    }
  }
  return defaultVal;
}

function hasFlag(names) {
  return names.some(n => args.includes(n));
}

const iterations = parseInt(getArg(['--iterations', '-n'], '30'));
const quality = parseInt(getArg(['--quality', '-q'], '85'));
const scale = parseFloat(getArg(['--scale', '-s'], '0.7'));
const offsetX = parseFloat(getArg(['--offset-x'], '0'));
const offsetY = parseFloat(getArg(['--offset-y'], '0'));
const rotate = parseFloat(getArg(['--rotate', '-r'], '0'));
const zoom = hasFlag(['--zoom', '-z']);
const blend = getArg(['--blend'], 'overlay');
const brightness = parseFloat(getArg(['--brightness', '-b'], '0'));
const glitchChance = parseFloat(getArg(['--glitch', '-g'], '0'));
const passes = parseInt(getArg(['--passes', '-p'], '1'));

console.log(`
Feedback Loop Settings:
  Input: ${inputPath}
  Output: ${outputDir}
  Iterations: ${iterations}
  JPEG Quality: ${quality} (lower = more artifacts)
  Nested Scale: ${scale}
  Offset: (${offsetX}, ${offsetY})
  Rotation: ${rotate}°/iteration
  Zoom Mode: ${zoom}
  Brightness Boost: ${brightness}/iteration
  Glitch Chance: ${(glitchChance * 100).toFixed(0)}%
  JPEG Passes: ${passes}
`);

// Create output directory
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.join(outputDir, 'frames'), { recursive: true });

// Get image dimensions using ffprobe
function getImageDimensions(imgPath) {
  const result = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${imgPath}"`,
    { encoding: 'utf8' }
  ).trim();
  const [width, height] = result.split(',').map(Number);
  return { width, height };
}

// Create SVG with nested feedback image
function createFeedbackSVG(imgPath, width, height, iteration) {
  const imgData = fs.readFileSync(imgPath).toString('base64');
  const ext = path.extname(imgPath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  // Calculate nested image properties
  const nestedW = width * scale;
  const nestedH = height * scale;
  const nestedX = (width - nestedW) / 2 + offsetX;
  const nestedY = (height - nestedH) / 2 + offsetY;

  // Cumulative rotation
  const totalRotation = rotate * iteration;
  const centerX = width / 2;
  const centerY = height / 2;

  // Optional zoom effect - progressively crop in
  let viewBox = `0 0 ${width} ${height}`;
  if (zoom && iteration > 0) {
    const zoomFactor = 1 - (iteration * 0.01); // Slowly zoom in
    const zoomW = width * zoomFactor;
    const zoomH = height * zoomFactor;
    const zoomX = (width - zoomW) / 2;
    const zoomY = (height - zoomH) / 2;
    viewBox = `${zoomX} ${zoomY} ${zoomW} ${zoomH}`;
  }

  // Blend mode opacity based on setting
  const blendOpacity = blend === 'overlay' ? 0.85 : (blend === 'multiply' ? 0.9 : 0.8);

  // Brightness filter - cumulative boost to counteract darkening
  const brightnessBoost = 1 + (brightness * iteration);
  const filterDef = brightness > 0 ? `
  <defs>
    <filter id="brighten">
      <feComponentTransfer>
        <feFuncR type="linear" slope="${brightnessBoost}" intercept="0"/>
        <feFuncG type="linear" slope="${brightnessBoost}" intercept="0"/>
        <feFuncB type="linear" slope="${brightnessBoost}" intercept="0"/>
      </feComponentTransfer>
    </filter>
  </defs>` : '';

  const filterAttr = brightness > 0 ? ' filter="url(#brighten)"' : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
       width="${width}" height="${height}" viewBox="${viewBox}">
  ${filterDef}

  <!-- Background: previous iteration at full size -->
  <image xlink:href="data:${mimeType};base64,${imgData}"
         x="0" y="0" width="${width}" height="${height}"${filterAttr}/>

  <!-- Nested feedback: same image scaled down and centered -->
  <image xlink:href="data:${mimeType};base64,${imgData}"
         x="${nestedX}" y="${nestedY}"
         width="${nestedW}" height="${nestedH}"
         opacity="${blendOpacity}"
         transform="rotate(${totalRotation} ${centerX} ${centerY})"${filterAttr}/>
</svg>`;

  return svg;
}

// Main feedback loop
async function runFeedback() {
  // Copy input as iteration 000
  const { width, height } = getImageDimensions(inputPath);
  console.log(`Image dimensions: ${width}x${height}`);

  // Start with input converted to JPEG (to establish artifact baseline)
  const frame000 = path.join(outputDir, 'frames', '000.jpg');
  execSync(`ffmpeg -y -i "${inputPath}" -q:v ${Math.floor((100 - quality) / 10 + 2)} "${frame000}"`, { stdio: 'pipe' });
  console.log(`Frame 000: Initial (converted to JPEG q=${quality})`);

  let currentFrame = frame000;

  for (let i = 1; i <= iterations; i++) {
    const frameNum = String(i).padStart(3, '0');
    const svgPath = path.join(outputDir, 'frames', `${frameNum}.svg`);
    const jpgPath = path.join(outputDir, 'frames', `${frameNum}.jpg`);

    // Create feedback SVG using current frame
    const svg = createFeedbackSVG(currentFrame, width, height, i);
    fs.writeFileSync(svgPath, svg);

    // Convert SVG to PNG first using our convert tool, then to JPEG for artifacts
    const pngPath = path.join(outputDir, 'frames', `${frameNum}.png`);
    const convertScript = path.join(__dirname, 'convert.js');

    execSync(`node "${convertScript}" "${svgPath}" "${pngPath}"`, { stdio: 'pipe' });

    // Convert PNG to JPEG with compression artifacts
    // Apply glitch effect randomly (color shift via ffmpeg hue filter)
    let glitchFilter = '';
    if (glitchChance > 0 && Math.random() < glitchChance) {
      // Random hue shift between -30 and +30 degrees, saturation boost
      const hueShift = Math.floor(Math.random() * 60) - 30;
      const satBoost = 1 + Math.random() * 0.5;
      glitchFilter = `-vf "hue=h=${hueShift}:s=${satBoost.toFixed(2)}" `;
      console.log(`  [glitch] Hue shift: ${hueShift}°, Sat: ${satBoost.toFixed(2)}`);
    }

    // First pass: PNG to JPEG
    execSync(
      `ffmpeg -y -i "${pngPath}" ${glitchFilter}-q:v ${Math.floor((100 - quality) / 10 + 2)} "${jpgPath}"`,
      { stdio: 'pipe' }
    );

    // Additional JPEG passes for more artifacts (re-encode the JPEG multiple times)
    if (passes > 1) {
      const tempPath = path.join(outputDir, 'frames', `${frameNum}_temp.jpg`);
      for (let p = 1; p < passes; p++) {
        // Decode and re-encode to accumulate artifacts
        fs.renameSync(jpgPath, tempPath);
        execSync(
          `ffmpeg -y -i "${tempPath}" -q:v ${Math.floor((100 - quality) / 10 + 2)} "${jpgPath}"`,
          { stdio: 'pipe' }
        );
        fs.unlinkSync(tempPath);
      }
    }

    // Clean up intermediate files
    fs.unlinkSync(svgPath);
    fs.unlinkSync(pngPath);

    // This frame becomes input for next iteration
    currentFrame = jpgPath;

    if (i % 5 === 0 || i === iterations) {
      console.log(`Frame ${frameNum}: Feedback iteration ${i}/${iterations}`);
    }
  }

  console.log(`\nDone! ${iterations + 1} frames in ${path.join(outputDir, 'frames')}`);
  console.log(`\nTo create video:\n  ffmpeg -framerate 10 -i ${path.join(outputDir, 'frames')}/%03d.jpg -c:v libx264 -pix_fmt yuv420p ${path.join(outputDir, 'feedback.mp4')}`);
}

runFeedback().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
