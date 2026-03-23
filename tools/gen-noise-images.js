#!/usr/bin/env node
/**
 * Generates noise texture images for the VJ system using sharp.
 * Outputs PNGs directly to vj/images/.
 */

const sharp = require('sharp');
const path = require('path');

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const W = 512, H = 512;

async function generateImage(name, pixelFn) {
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixelFn(x, y);
      const i = (y * W + x) * 3;
      buf[i] = r; buf[i+1] = g; buf[i+2] = b;
    }
  }
  const outPath = path.join(__dirname, '..', 'vj', 'images', name);
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toFile(outPath);
  console.log(`Generated: ${outPath}`);
}

async function main() {
  const rng1 = mulberry32(101);
  // 1. Static noise - black and white grain
  await generateImage('noise-static.png', (x, y) => {
    const v = Math.floor(rng1() * 256);
    return [v, v, v];
  });

  const rng2 = mulberry32(202);
  // 2. Color noise - RGB static
  await generateImage('noise-color.png', (x, y) => {
    return [Math.floor(rng2() * 256), Math.floor(rng2() * 256), Math.floor(rng2() * 256)];
  });

  const rng3 = mulberry32(303);
  // 3. Plasma - smooth color gradients
  await generateImage('noise-plasma.png', (x, y) => {
    const nx = x / W, ny = y / H;
    const v1 = Math.sin(nx * 12 + rng3() * 0.3) * 0.5 + 0.5;
    const v2 = Math.sin(ny * 8 + nx * 6) * 0.5 + 0.5;
    const v3 = Math.sin((nx + ny) * 10) * 0.5 + 0.5;
    return [Math.floor(v1 * 255), Math.floor(v2 * 200), Math.floor(v3 * 255)];
  });

  // 4. Dark clouds - moody texture
  await generateImage('noise-dark-clouds.png', (x, y) => {
    const rng = mulberry32(x * 7 + y * 13 + 404);
    const nx = x / W, ny = y / H;
    const base = Math.sin(nx * 5) * Math.cos(ny * 7) * 0.5 + 0.5;
    const detail = rng() * 0.3;
    const v = Math.floor((base * 0.4 + detail) * 80);
    const r = Math.min(255, v + 10);
    const g = Math.min(255, Math.floor(v * 0.6));
    const b = Math.min(255, v + 30);
    return [r, g, b];
  });

  // 5. Glitch bands - horizontal bands of color
  const rng5 = mulberry32(505);
  const bands = Array.from({length: 40}, () => ({
    start: Math.floor(rng5() * H),
    height: Math.floor(rng5() * 30) + 2,
    r: Math.floor(rng5() * 256),
    g: Math.floor(rng5() * 256),
    b: Math.floor(rng5() * 256),
    offset: Math.floor(rng5() * 100) - 50,
  }));
  await generateImage('noise-glitch-bands.png', (x, y) => {
    for (const band of bands) {
      if (y >= band.start && y < band.start + band.height) {
        const sx = (x + band.offset + W) % W;
        const fade = Math.sin((sx / W) * Math.PI) * 0.8 + 0.2;
        return [Math.floor(band.r * fade), Math.floor(band.g * fade), Math.floor(band.b * fade)];
      }
    }
    return [5, 5, 10];
  });

  // 6. Concentric rings
  await generateImage('noise-rings.png', (x, y) => {
    const cx = x - W/2, cy = y - H/2;
    const dist = Math.sqrt(cx*cx + cy*cy);
    const v = Math.sin(dist * 0.15) * 0.5 + 0.5;
    const r = Math.floor(v * 180);
    const g = Math.floor(Math.sin(dist * 0.1 + 2) * 80 + 80);
    const b = Math.floor(v * 255);
    return [r, g, b];
  });

  console.log('Done! Generated 6 noise images.');
}

main().catch(console.error);
