// Seeded random for reproducible noise variations
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const seed = parseInt(process.argv[2]) || 42;
const random = mulberry32(seed);

const width = 450;
const height = 800;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#040404"/>
  <!-- SEED: ${seed} -->
`;

function getCarveDistance(x, y) {
  const centerX = 220;
  
  const headY = 260;
  const headTilt = (y - headY) * 0.08;
  const headWidth = 55 + Math.sin(y * 0.05) * 10;
  const headHeight = 70;
  const headDx = (x - centerX - headTilt) / headWidth;
  const headDy = (y - headY) / headHeight;
  const headDist = headDx * headDx + headDy * headDy;
  
  const shoulderY = 370;
  const shoulderWidth = 90 + (x > centerX ? 15 : -10);
  const shoulderHeight = 50;
  const shoulderDx = (x - centerX) / shoulderWidth;
  const shoulderDy = (y - shoulderY) / shoulderHeight;
  const shoulderDist = shoulderDx * shoulderDx + shoulderDy * shoulderDy;
  
  const torsoY = 500;
  const torsoWobble = Math.sin(y * 0.02) * 20 + Math.sin(y * 0.05) * 10;
  const torsoWidth = 70 + torsoWobble;
  const torsoHeight = 180;
  const torsoDx = (x - centerX) / torsoWidth;
  const torsoDy = (y - torsoY) / torsoHeight;
  const torsoDist = torsoDx * torsoDx + torsoDy * torsoDy;
  
  return Math.min(headDist, shoulderDist, torsoDist);
}

const particles = [];

for (let y = 0; y < height; y += 2) {
  for (let x = 0; x < width; x += 2) {
    const ox = Math.floor(random() * 2);
    const oy = Math.floor(random() * 2);
    const px = x + ox;
    const py = y + oy;
    
    if (px >= width || py >= height) continue;
    
    const carveDist = getCarveDistance(px, py);
    
    if (carveDist < 0.3) {
      if (random() < 0.015) {
        const gray = Math.floor(random() * 8) + 2;
        const hex = gray.toString(16).padStart(2, '0');
        particles.push(`<rect x="${px}" y="${py}" width="1" height="1" fill="#${hex}${hex}${hex}"/>`);
      }
    } else if (carveDist < 1) {
      if (random() < 0.08) {
        const gray = Math.floor(random() * 22) + 8;
        const hex = gray.toString(16).padStart(2, '0');
        const h = random() < 0.25 ? Math.floor(random() * 50) + 10 : 1;
        particles.push(`<rect x="${px}" y="${py}" width="1" height="${h}" fill="#${hex}${hex}${hex}"/>`);
      }
    } else if (carveDist < 1.8) {
      const density = 0.3 + (carveDist - 1) * 0.5;
      if (random() < density) {
        const gray = Math.floor(random() * 140) + 40;
        const hex = gray.toString(16).padStart(2, '0');
        particles.push(`<rect x="${px}" y="${py}" width="1" height="1" fill="#${hex}${hex}${hex}"/>`);
      }
    } else {
      if (random() < 0.92) {
        const gray = Math.floor(random() * 190) + 60;
        const hex = gray.toString(16).padStart(2, '0');
        const w = random() < 0.6 ? 1 : 2;
        const h = random() < 0.6 ? 1 : 2;
        particles.push(`<rect x="${px}" y="${py}" width="${w}" height="${h}" fill="#${hex}${hex}${hex}"/>`);
      }
    }
  }
}

svg += particles.join('\n  ');
svg += '\n</svg>';
console.log(svg);
