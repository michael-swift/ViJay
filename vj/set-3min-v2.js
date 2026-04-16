// 3-minute minimalist VJ set v2
// All videos, reverse playback, slow dissolves, ~12 scenes

const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b)); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function panels(p) { return post('/api/panels', { panels: p }); }

// Sources
const brakhage = 'videos/brakhage-mothlight-slow.mp4';
const gould = 'videos/GlenGouldDoc.mov';
const musique = 'videos/Musique Concrete.mp4';
const bbc = 'videos/The New Sound of Music (BBC Do.mp4';

const scenes = [
  // 0:00 — Open: Brakhage alone, gentle drift, let the texture breathe
  { t: 0, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: brakhage, reverse: true,
      state: { intensity: 0.15, feedbackAmount: 0.7, rotation: 0.001, zoom: 1.001, colorShift: 0, brightness: 1.05, sourceMix: 0.6, glitch: 0 } },
  ]},

  // 0:20 — Gould emerges as a narrow strip on the right
  { t: 20, p: [
    { id: 0, rect: {x:0,y:0,w:0.75,h:1}, effect: 'feedback', source: brakhage, reverse: true,
      state: { intensity: 0.18, feedbackAmount: 0.72, rotation: 0.0012, zoom: 1.001, colorShift: 0.02, brightness: 1.05, sourceMix: 0.55, glitch: 0 } },
    { id: 1, rect: {x:0.75,y:0,w:0.25,h:1}, effect: 'feedback', source: gould, reverse: true,
      state: { intensity: 0.12, feedbackAmount: 0.68, rotation: -0.0008, zoom: 1.0, colorShift: 0, brightness: 1.0, sourceMix: 0.6, glitch: 0 } },
  ]},

  // 0:40 — Gould grows wider, Brakhage recedes
  { t: 40, p: [
    { id: 0, rect: {x:0,y:0,w:0.4,h:1}, effect: 'colorshift', source: brakhage, reverse: true,
      state: { intensity: 0.2, feedbackAmount: 0.7, rotation: 0.002, zoom: 1.001, colorShift: 0.06, brightness: 1.0, sourceMix: 0.5, glitch: 0 } },
    { id: 1, rect: {x:0.4,y:0,w:0.6,h:1}, effect: 'feedback', source: gould, reverse: true,
      state: { intensity: 0.18, feedbackAmount: 0.75, rotation: -0.001, zoom: 1.001, colorShift: 0.02, brightness: 1.05, sourceMix: 0.55, glitch: 0 } },
  ]},

  // 1:00 — Full Gould, Musique Concrete blended underneath
  { t: 60, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: gould, reverse: true,
      source2: musique,
      state: { intensity: 0.22, feedbackAmount: 0.78, rotation: -0.0015, zoom: 1.002, colorShift: 0.04, brightness: 1.08, sourceMix: 0.5, blend2: 0.2, glitch: 0 } },
  ]},

  // 1:18 — Musique Concrete takes over, building energy
  { t: 78, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: musique, reverse: true,
      state: { intensity: 0.25, feedbackAmount: 0.8, rotation: 0.002, zoom: 1.002, colorShift: 0.06, brightness: 1.1, sourceMix: 0.5, glitch: 0 } },
  ]},

  // 1:35 — Split: Musique Concrete + BBC doc. Two worlds of electronic music.
  { t: 95, p: [
    { id: 0, rect: {x:0,y:0,w:0.5,h:1}, effect: 'feedback', source: musique, reverse: true,
      state: { intensity: 0.28, feedbackAmount: 0.8, rotation: 0.002, zoom: 1.002, colorShift: 0.08, brightness: 1.1, sourceMix: 0.5, glitch: 0 } },
    { id: 1, rect: {x:0.5,y:0,w:0.5,h:1}, effect: 'noise', source: bbc, reverse: true,
      state: { intensity: 0.22, feedbackAmount: 0.75, rotation: -0.0015, zoom: 1.001, colorShift: 0.04, brightness: 1.05, sourceMix: 0.55, glitch: 0 } },
  ]},

  // 1:52 — Peak. Glitch on Musique Concrete, Brakhage overlay
  { t: 112, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'glitch', source: musique, reverse: true,
      state: { intensity: 0.35, feedbackAmount: 0.82, rotation: 0.003, zoom: 1.002, colorShift: 0.12, brightness: 1.12, sourceMix: 0.45, glitch: 0.1 } },
    { id: 1, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: brakhage, reverse: true,
      state: { intensity: 0.2, feedbackAmount: 0.75, rotation: -0.003, zoom: 1.001, colorShift: 0.05, brightness: 1.0, sourceMix: 0.4, opacity: 0.3, glitch: 0 } },
  ]},

  // 2:08 — Drop. BBC doc alone, calm.
  { t: 128, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: bbc, reverse: true,
      state: { intensity: 0.15, feedbackAmount: 0.7, rotation: -0.001, zoom: 1.0, colorShift: 0.02, brightness: 1.0, sourceMix: 0.6, glitch: 0 } },
  ]},

  // 2:22 — BBC wide, Gould narrow accent returns
  { t: 142, p: [
    { id: 0, rect: {x:0,y:0,w:0.7,h:1}, effect: 'feedback', source: bbc, reverse: true,
      state: { intensity: 0.15, feedbackAmount: 0.7, rotation: -0.001, zoom: 1.0, colorShift: 0.02, brightness: 1.02, sourceMix: 0.6, glitch: 0 } },
    { id: 1, rect: {x:0.7,y:0,w:0.3,h:1}, effect: 'colorshift', source: gould, reverse: true,
      state: { intensity: 0.12, feedbackAmount: 0.65, rotation: 0.0008, zoom: 1.0, colorShift: 0.04, brightness: 0.95, sourceMix: 0.55, glitch: 0 } },
  ]},

  // 2:38 — Brakhage returns full, winding down
  { t: 158, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: brakhage, reverse: true,
      state: { intensity: 0.12, feedbackAmount: 0.65, rotation: 0.0008, zoom: 1.0005, colorShift: 0, brightness: 0.95, sourceMix: 0.6, glitch: 0 } },
  ]},

  // 2:52 — Fading. Brakhage barely visible.
  { t: 172, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: brakhage, reverse: true,
      state: { intensity: 0.08, feedbackAmount: 0.55, rotation: 0.0004, zoom: 1.0, colorShift: 0, brightness: 0.8, sourceMix: 0.5, glitch: 0 } },
  ]},

  // 3:00 — Black
  { t: 180, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: 'color:#000000',
      state: { intensity: 0.03, feedbackAmount: 0.4, rotation: 0, zoom: 1.0, colorShift: 0, brightness: 0.4, sourceMix: 0.2, glitch: 0 } },
  ]},
];

async function run() {
  console.log('--- set v2 starting ---');
  const start = Date.now();

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const elapsed = (Date.now() - start) / 1000;
    const wait = Math.max(0, scene.t - elapsed);

    if (wait > 0) await new Promise(r => setTimeout(r, wait * 1000));

    const mins = Math.floor(scene.t / 60);
    const secs = scene.t % 60;
    const src = scene.p.map(p => {
      const name = (p.source || '?').split('/').pop().replace(/\.(mp4|mov|png|jpg)$/i,'').slice(0, 15);
      return `${name}(${p.effect.slice(0,4)})`;
    }).join(' | ');
    console.log(`  ${mins}:${secs.toString().padStart(2,'0')} — ${src}`);

    await panels(scene.p);
  }

  console.log('--- set complete ---');
}

run().catch(console.error);
