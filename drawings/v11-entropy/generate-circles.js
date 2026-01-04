// HYPNO: Concentric circles that will create moiré interference patterns
// When rotated and scaled through feedback, should produce wild optical effects

const WIDTH = 720;
const HEIGHT = 1280;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#000"/>
`;

// Center point (slightly off-center for asymmetry)
const cx = WIDTH * 0.48;
const cy = HEIGHT * 0.45;

// Concentric circles with varying thickness
for (let r = 10; r < 800; r += 12) {
  const strokeWidth = 2 + Math.sin(r * 0.05) * 1.5;
  const opacity = 0.7 + Math.sin(r * 0.03) * 0.3;
  svg += `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${strokeWidth}" opacity="${opacity.toFixed(2)}"/>\n`;
}

// Add a second set of circles offset - will create interference
const cx2 = WIDTH * 0.52;
const cy2 = HEIGHT * 0.55;
for (let r = 15; r < 600; r += 18) {
  svg += `  <circle cx="${cx2}" cy="${cy2}" r="${r}" fill="none" stroke="#ff0066" stroke-width="1.5" opacity="0.5"/>\n`;
}

// Add some radial lines for extra interference
for (let angle = 0; angle < 360; angle += 15) {
  const rad = angle * Math.PI / 180;
  const x2 = cx + Math.cos(rad) * 700;
  const y2 = cy + Math.sin(rad) * 700;
  svg += `  <line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#00ffff" stroke-width="1" opacity="0.3"/>\n`;
}

svg += '</svg>';
console.log(svg);
