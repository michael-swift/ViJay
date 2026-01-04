// NOISE FLOOR RISING: Total burial
// The signal gets completely overwhelmed - noise WINS

const fs = require('fs');
const path = require('path');

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const WIDTH = 720;
const HEIGHT = 1280;
const FRAMES = 90; // longer for more dramatic burial

const outDir = path.join(__dirname, 'noisefloor-frames');
fs.mkdirSync(outDir, { recursive: true });

function drawSignal() {
  let svg = '';
  // Staff lines and notes
  const staffY = [300, 480, 660, 840];
  staffY.forEach(baseY => {
    for (let i = 0; i < 5; i++) {
      const y = baseY + i * 14;
      svg += `  <line x1="50" y1="${y}" x2="${WIDTH-50}" y2="${y}" stroke="#ffffff" stroke-width="1.5"/>\n`;
    }
    svg += `  <text x="70" y="${baseY + 40}" font-family="serif" font-size="45" fill="#ffffff">𝄞</text>\n`;
    for (let n = 0; n < 9; n++) {
      const nx = 140 + n * 60;
      const ny = baseY + (n % 5) * 7 + 7;
      svg += `  <ellipse cx="${nx}" cy="${ny}" rx="8" ry="6" fill="#ffffff"/>\n`;
    }
  });
  return svg;
}

function drawNoise(random, density) {
  let svg = '';
  // TOTAL BURIAL - 150k particles at max
  const numParticles = Math.floor(density * 150000);

  for (let i = 0; i < numParticles; i++) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    const size = random() * 5 + 1;

    // Full range grays, high opacity - BURY IT
    const gray = Math.floor(random() * 220) + 30;
    const opacity = 0.5 + random() * 0.5;

    svg += `  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" fill="rgb(${gray},${gray},${gray})" opacity="${opacity.toFixed(2)}"/>\n`;
  }
  return svg;
}

for (let frame = 0; frame < FRAMES; frame++) {
  const random = mulberry32(frame * 1000 + 42);
  const t = frame / (FRAMES - 1);

  // Aggressive exponential curve - noise wins fast then dominates
  const noiseDensity = Math.pow(t, 2);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0a"/>
`;

  // Title fades early
  if (t < 0.4) {
    const titleOpacity = 1 - (t / 0.4);
    svg += `  <text x="${WIDTH/2}" y="100" font-family="serif" font-size="42" fill="rgba(255,255,255,${titleOpacity.toFixed(2)})" text-anchor="middle">SIGNAL</text>\n`;
    svg += `  <text x="${WIDTH/2}" y="140" font-family="serif" font-size="16" fill="rgba(100,100,100,${(titleOpacity * 0.7).toFixed(2)})" text-anchor="middle">before the noise floor rises</text>\n`;
  }

  // Signal always drawn first (underneath)
  svg += drawSignal();

  // Noise on top - always, increasingly
  svg += drawNoise(random, noiseDensity);

  // End text fades in
  if (t > 0.85) {
    const endOpacity = (t - 0.85) / 0.15;
    svg += `  <text x="${WIDTH/2}" y="${HEIGHT - 40}" font-family="monospace" font-size="12" fill="rgba(60,60,60,${endOpacity.toFixed(2)})" text-anchor="middle">the heat death of music</text>\n`;
  }

  svg += '</svg>';

  const filename = path.join(outDir, `frame-${String(frame).padStart(3, '0')}.svg`);
  fs.writeFileSync(filename, svg);

  if (frame % 15 === 0) console.log(`Frame ${frame}/${FRAMES-1} - noise: ${(noiseDensity * 100).toFixed(0)}%`);
}

console.log(`\nGenerated ${FRAMES} frames`);
