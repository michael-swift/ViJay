// ENTROPY: A maze that dissolves into chaos
// Generates a recursive maze pattern for 9:16 canvas

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const seed = parseInt(process.argv[2]) || 777;
const random = mulberry32(seed);

const WIDTH = 720;
const HEIGHT = 1280;
const CELL = 40; // maze cell size

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0a"/>
`;

// Generate maze walls using recursive backtracking visualization
// But stylized - not a real solvable maze, just the AESTHETIC of one

const cols = Math.floor(WIDTH / CELL);
const rows = Math.floor(HEIGHT / CELL);

// Draw grid of cells with random walls removed
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const x = col * CELL;
    const y = row * CELL;

    // Randomly decide which walls to draw (creating maze-like paths)
    const drawTop = random() > 0.4;
    const drawRight = random() > 0.4;
    const drawBottom = random() > 0.5;
    const drawLeft = random() > 0.5;

    const wallColor = '#e8e8e8';
    const wallWidth = 3;

    if (drawTop && row > 0) {
      svg += `  <line x1="${x}" y1="${y}" x2="${x + CELL}" y2="${y}" stroke="${wallColor}" stroke-width="${wallWidth}"/>\n`;
    }
    if (drawRight && col < cols - 1) {
      svg += `  <line x1="${x + CELL}" y1="${y}" x2="${x + CELL}" y2="${y + CELL}" stroke="${wallColor}" stroke-width="${wallWidth}"/>\n`;
    }

    // Occasionally add a dot at intersections
    if (random() < 0.15) {
      const dotSize = random() * 4 + 2;
      svg += `  <circle cx="${x}" cy="${y}" r="${dotSize}" fill="${wallColor}"/>\n`;
    }
  }
}

// Add some diagonal "glitch" lines cutting through
for (let i = 0; i < 12; i++) {
  const x1 = random() * WIDTH;
  const y1 = random() * HEIGHT;
  const angle = random() * Math.PI;
  const len = random() * 300 + 100;
  const x2 = x1 + Math.cos(angle) * len;
  const y2 = y1 + Math.sin(angle) * len;

  svg += `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff3366" stroke-width="2" opacity="0.7"/>\n`;
}

// Add a few circles as "destinations" or "waypoints"
for (let i = 0; i < 5; i++) {
  const cx = random() * (WIDTH - 100) + 50;
  const cy = random() * (HEIGHT - 100) + 50;
  const r = random() * 30 + 15;
  svg += `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#00ffaa" stroke-width="2"/>\n`;
}

svg += '</svg>';
console.log(svg);
