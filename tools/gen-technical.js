#!/usr/bin/env node
/**
 * Generates technical/calibration pattern images for VJ use.
 * Stage micrometers, resolution targets, test cards, grid patterns.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'vj', 'images');

async function svgToPng(name, svg) {
  const outPath = path.join(OUT, name);
  await sharp(Buffer.from(svg)).resize(1024).png().toFile(outPath);
  console.log(`Generated: ${name}`);
}

// 1. Stage micrometer — ruler with fine divisions
function stageMicrometer() {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600">
  <rect width="1000" height="600" fill="#0a0a0a"/>
  <g stroke="#00ff88" fill="#00ff88" font-family="monospace">`;

  // Main scale
  const y = 300;
  svg += `<line x1="50" y1="${y}" x2="950" y2="${y}" stroke-width="1.5"/>`;

  for (let i = 0; i <= 90; i++) {
    const x = 50 + i * 10;
    const isMajor = i % 10 === 0;
    const isMid = i % 5 === 0;
    const h = isMajor ? 40 : isMid ? 25 : 12;
    svg += `<line x1="${x}" y1="${y - h}" x2="${x}" y2="${y + h}" stroke-width="${isMajor ? 1.5 : 0.5}"/>`;
    if (isMajor) {
      svg += `<text x="${x}" y="${y - 50}" text-anchor="middle" font-size="14">${i / 10}</text>`;
    }
  }

  // Label
  svg += `<text x="500" y="50" text-anchor="middle" font-size="18">STAGE MICROMETER  1div = 10μm</text>`;
  svg += `<text x="500" y="80" text-anchor="middle" font-size="11" fill="#00ff8866">0.01mm DIVISIONS  ×100</text>`;

  // Fine scale below
  const y2 = 430;
  svg += `<line x1="200" y1="${y2}" x2="800" y2="${y2}" stroke-width="0.8"/>`;
  for (let i = 0; i <= 120; i++) {
    const x = 200 + i * 5;
    const h = i % 10 === 0 ? 20 : i % 5 === 0 ? 12 : 6;
    svg += `<line x1="${x}" y1="${y2 - h}" x2="${x}" y2="${y2 + h}" stroke-width="0.4"/>`;
  }
  svg += `<text x="500" y="${y2 + 50}" text-anchor="middle" font-size="11">FINE SCALE  5μm</text>`;

  // Corner crosshairs
  for (const [cx, cy] of [[80, 80], [920, 80], [80, 520], [920, 520]]) {
    svg += `<line x1="${cx-20}" y1="${cy}" x2="${cx+20}" y2="${cy}" stroke-width="0.5"/>`;
    svg += `<line x1="${cx}" y1="${cy-20}" x2="${cx}" y2="${cy+20}" stroke-width="0.5"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke-width="0.5"/>`;
  }

  svg += `</g></svg>`;
  return svg;
}

// 2. USAF 1951 resolution target
function usafTarget() {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#f5f0e8"/>
  <g fill="#111">`;

  // Title
  svg += `<text x="400" y="40" text-anchor="middle" font-family="monospace" font-size="14" fill="#333">USAF 1951 RESOLVING POWER TEST TARGET</text>`;

  // Generate bar groups at different sizes
  const groups = [
    { x: 100, y: 100, w: 80, h: 16, label: 'G0-1' },
    { x: 100, y: 200, w: 60, h: 12, label: 'G0-2' },
    { x: 100, y: 280, w: 45, h: 9, label: 'G0-3' },
    { x: 100, y: 340, w: 34, h: 7, label: 'G0-4' },
    { x: 100, y: 390, w: 25, h: 5, label: 'G0-5' },
    { x: 100, y: 430, w: 19, h: 4, label: 'G0-6' },
    { x: 100, y: 460, w: 14, h: 3, label: 'G1-1' },
    { x: 100, y: 485, w: 10, h: 2, label: 'G1-2' },
    { x: 100, y: 505, w: 7.5, h: 1.5, label: 'G1-3' },
    { x: 100, y: 520, w: 5.5, h: 1.1, label: 'G1-4' },
  ];

  for (const g of groups) {
    // Horizontal bars
    for (let i = 0; i < 3; i++) {
      svg += `<rect x="${g.x}" y="${g.y + i * g.h * 2}" width="${g.w}" height="${g.h}"/>`;
    }
    // Vertical bars offset to the right
    for (let i = 0; i < 3; i++) {
      svg += `<rect x="${g.x + g.w + 20 + i * g.h * 2}" y="${g.y}" width="${g.h}" height="${g.w}"/>`;
    }
    svg += `<text x="${g.x + g.w * 2 + 60}" y="${g.y + g.w/2}" font-family="monospace" font-size="9" fill="#666">${g.label}</text>`;
  }

  // Second set mirrored on right
  for (const g of groups.slice(0, 6)) {
    const rx = 800 - g.x - g.w;
    for (let i = 0; i < 3; i++) {
      svg += `<rect x="${rx}" y="${g.y + i * g.h * 2}" width="${g.w}" height="${g.h}"/>`;
    }
  }

  // Center crosshair
  svg += `<line x1="380" y1="400" x2="420" y2="400" stroke="#111" stroke-width="0.5"/>`;
  svg += `<line x1="400" y1="380" x2="400" y2="420" stroke="#111" stroke-width="0.5"/>`;
  svg += `<circle cx="400" cy="400" r="15" fill="none" stroke="#111" stroke-width="0.5"/>`;

  // Border marks
  svg += `<rect x="20" y="20" width="760" height="760" fill="none" stroke="#333" stroke-width="1"/>`;
  svg += `<text x="400" y="780" text-anchor="middle" font-family="monospace" font-size="10" fill="#666">MIL-STD-150A  SECTION 5.1.1.7</text>`;

  svg += `</g></svg>`;
  return svg;
}

// 3. TV test card style
function testCard() {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 750">
  <rect width="1000" height="750" fill="#111"/>`;

  // Color bars top
  const colors = ['#fff', '#ff0', '#0ff', '#0f0', '#f0f', '#f00', '#00f'];
  colors.forEach((c, i) => {
    svg += `<rect x="${i * 143}" y="0" width="143" height="100" fill="${c}"/>`;
  });

  // Grayscale ramp
  for (let i = 0; i < 20; i++) {
    const v = Math.floor(i * 255 / 19).toString(16).padStart(2, '0');
    svg += `<rect x="${i * 50}" y="100" width="50" height="40" fill="#${v}${v}${v}"/>`;
  }

  // Center circle and crosshair
  svg += `<circle cx="500" cy="420" r="200" fill="none" stroke="#fff" stroke-width="2"/>`;
  svg += `<circle cx="500" cy="420" r="150" fill="none" stroke="#888" stroke-width="1"/>`;
  svg += `<circle cx="500" cy="420" r="100" fill="none" stroke="#555" stroke-width="1"/>`;
  svg += `<circle cx="500" cy="420" r="50" fill="none" stroke="#333" stroke-width="1"/>`;
  svg += `<line x1="250" y1="420" x2="750" y2="420" stroke="#666" stroke-width="0.5"/>`;
  svg += `<line x1="500" y1="170" x2="500" y2="670" stroke="#666" stroke-width="0.5"/>`;

  // Grid
  for (let x = 100; x < 1000; x += 100) {
    svg += `<line x1="${x}" y1="150" x2="${x}" y2="700" stroke="#222" stroke-width="0.5"/>`;
  }
  for (let y = 200; y < 700; y += 100) {
    svg += `<line x1="0" y1="${y}" x2="1000" y2="${y}" stroke="#222" stroke-width="0.5"/>`;
  }

  // Text
  svg += `<text x="500" y="400" text-anchor="middle" font-family="monospace" font-size="28" fill="#fff">TEST PATTERN</text>`;
  svg += `<text x="500" y="440" text-anchor="middle" font-family="monospace" font-size="14" fill="#888">1000×750  60Hz  NTSC</text>`;

  // Corner markers
  svg += `<text x="30" y="730" font-family="monospace" font-size="10" fill="#555">SYNC</text>`;
  svg += `<text x="920" y="730" font-family="monospace" font-size="10" fill="#555">FIELD</text>`;

  svg += `</svg>`;
  return svg;
}

// 4. Reticle / crosshair overlay
function reticle() {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#050505"/>
  <g stroke="#00ff44" fill="#00ff44" font-family="monospace">`;

  const cx = 400, cy = 400;

  // Concentric circles with distance markings
  for (let r = 50; r <= 350; r += 50) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${r % 100 === 0 ? 1 : 0.3}" stroke-opacity="${r % 100 === 0 ? 0.8 : 0.3}"/>`;
    if (r % 100 === 0) {
      svg += `<text x="${cx + r + 5}" y="${cy - 3}" font-size="9" fill-opacity="0.6">${r/50}</text>`;
    }
  }

  // Main crosshair
  svg += `<line x1="30" y1="${cy}" x2="770" y2="${cy}" stroke-width="0.5" stroke-opacity="0.6"/>`;
  svg += `<line x1="${cx}" y1="30" x2="${cx}" y2="770" stroke-width="0.5" stroke-opacity="0.6"/>`;

  // Tick marks on crosshair
  for (let i = -350; i <= 350; i += 25) {
    if (i === 0) continue;
    const h = i % 50 === 0 ? 8 : 4;
    svg += `<line x1="${cx + i}" y1="${cy - h}" x2="${cx + i}" y2="${cy + h}" stroke-width="0.4" stroke-opacity="0.5"/>`;
    svg += `<line x1="${cx - h}" y1="${cy + i}" x2="${cx + h}" y2="${cy + i}" stroke-width="0.4" stroke-opacity="0.5"/>`;
  }

  // Diagonal lines
  svg += `<line x1="100" y1="100" x2="700" y2="700" stroke-width="0.3" stroke-opacity="0.2"/>`;
  svg += `<line x1="700" y1="100" x2="100" y2="700" stroke-width="0.3" stroke-opacity="0.2"/>`;

  // Center dot
  svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="#00ff44"/>`;

  // Degree markers around outer ring
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = deg * Math.PI / 180;
    const r1 = 340, r2 = 355;
    const x1 = cx + r1 * Math.cos(rad), y1 = cy + r1 * Math.sin(rad);
    const x2 = cx + r2 * Math.cos(rad), y2 = cy + r2 * Math.sin(rad);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${deg % 90 === 0 ? 1.5 : 0.5}"/>`;
    if (deg % 45 === 0) {
      const tx = cx + 370 * Math.cos(rad), ty = cy + 370 * Math.sin(rad);
      svg += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="10">${deg}°</text>`;
    }
  }

  svg += `<text x="${cx}" y="25" text-anchor="middle" font-size="12">RETICLE CAL  ×40</text>`;
  svg += `</g></svg>`;
  return svg;
}

// 5. Oscilloscope grid
function oscilloscope() {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600">
  <rect width="1000" height="600" fill="#001a00"/>
  <g stroke="#00cc33" fill="#00cc33" font-family="monospace">`;

  // Grid
  for (let x = 50; x <= 950; x += 90) {
    svg += `<line x1="${x}" y1="50" x2="${x}" y2="550" stroke-width="${x === 500 ? 1 : 0.3}" stroke-opacity="${x === 500 ? 0.8 : 0.25}"/>`;
  }
  for (let y = 50; y <= 550; y += 83.3) {
    svg += `<line x1="50" y1="${y}" x2="950" y2="${y}" stroke-width="${Math.abs(y - 300) < 5 ? 1 : 0.3}" stroke-opacity="${Math.abs(y - 300) < 5 ? 0.8 : 0.25}"/>`;
  }

  // Sub-grid dots
  for (let x = 50; x <= 950; x += 18) {
    svg += `<circle cx="${x}" cy="300" r="0.8" fill-opacity="0.4"/>`;
  }
  for (let y = 50; y <= 550; y += 16.66) {
    svg += `<circle cx="500" cy="${y}" r="0.8" fill-opacity="0.4"/>`;
  }

  // Waveform — sine
  let d = 'M ';
  for (let x = 50; x <= 950; x += 2) {
    const t = (x - 50) / 900;
    const y = 300 - Math.sin(t * Math.PI * 6) * 120 * Math.exp(-t * 0.8);
    d += `${x},${y} `;
  }
  svg += `<path d="${d}" fill="none" stroke="#00ff66" stroke-width="2" stroke-opacity="0.9"/>`;

  // Labels
  svg += `<text x="30" y="30" font-size="11">CH1  500mV/div</text>`;
  svg += `<text x="500" y="590" text-anchor="middle" font-size="11">TIME  2ms/div</text>`;
  svg += `<text x="900" y="30" text-anchor="end" font-size="11">TRIG: AUTO</text>`;

  // Border
  svg += `<rect x="50" y="50" width="900" height="500" fill="none" stroke-width="1.5"/>`;

  svg += `</g></svg>`;
  return svg;
}

async function main() {
  await svgToPng('cal-micrometer.png', stageMicrometer());
  await svgToPng('cal-usaf-target.png', usafTarget());
  await svgToPng('cal-test-card.png', testCard());
  await svgToPng('cal-reticle.png', reticle());
  await svgToPng('cal-oscilloscope.png', oscilloscope());
  console.log('Done! Generated 5 technical/calibration images.');
}

main().catch(console.error);
