// 3-minute minimalist VJ set
// ~12 scenes, changing every 15-20 seconds, slow builds

const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b)); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function panels(p) { return post('/api/panels', { panels: p }); }

const scenes = [
  // 0:00 — Open with Brakhage, single panel, very gentle feedback. Let it breathe.
  { t: 0, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: 'brakhage-mothlight-slow.mp4',
      state: { intensity: 0.15, feedbackAmount: 0.7, rotation: 0.001, zoom: 1.001, colorShift: 0, brightness: 1.05, sourceMix: 0.6, glitch: 0 } },
  ]},

  // 0:18 — Slowly introduce color shift
  { t: 18, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: 'brakhage-mothlight-slow.mp4',
      state: { intensity: 0.2, feedbackAmount: 0.75, rotation: 0.0015, zoom: 1.001, colorShift: 0.05, brightness: 1.05, sourceMix: 0.55, glitch: 0 } },
  ]},

  // 0:35 — Split: Brakhage left, Glen Gould right. Calm.
  { t: 35, p: [
    { id: 0, rect: {x:0,y:0,w:0.55,h:1}, effect: 'feedback', source: 'brakhage-mothlight-slow.mp4',
      state: { intensity: 0.2, feedbackAmount: 0.75, rotation: 0.002, zoom: 1.001, colorShift: 0.05, brightness: 1.05, sourceMix: 0.55, glitch: 0 } },
    { id: 1, rect: {x:0.55,y:0,w:0.45,h:1}, effect: 'feedback', source: 'GlenGouldDoc.mov',
      state: { intensity: 0.15, feedbackAmount: 0.7, rotation: -0.001, zoom: 1.0, colorShift: 0, brightness: 1.0, sourceMix: 0.6, glitch: 0 } },
  ]},

  // 0:55 — Bring Gould wider, add slight noise texture
  { t: 55, p: [
    { id: 0, rect: {x:0,y:0,w:0.35,h:1}, effect: 'colorshift', source: 'brakhage-mothlight-slow.mp4',
      state: { intensity: 0.25, feedbackAmount: 0.7, rotation: 0.002, zoom: 1.001, colorShift: 0.08, brightness: 1.05, sourceMix: 0.5, glitch: 0 } },
    { id: 1, rect: {x:0.35,y:0,w:0.65,h:1}, effect: 'feedback', source: 'GlenGouldDoc.mov',
      state: { intensity: 0.2, feedbackAmount: 0.78, rotation: -0.001, zoom: 1.001, colorShift: 0.03, brightness: 1.05, sourceMix: 0.55, glitch: 0 } },
  ]},

  // 1:12 — Full Gould with Musique Concrete blended in. Building.
  { t: 72, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: 'GlenGouldDoc.mov',
      source2: 'Musique Concrete.mp4',
      state: { intensity: 0.25, feedbackAmount: 0.8, rotation: -0.002, zoom: 1.002, colorShift: 0.05, brightness: 1.08, sourceMix: 0.5, blend2: 0.25, glitch: 0 } },
  ]},

  // 1:30 — Noise texture underneath, Gould floating on top
  { t: 90, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'noise', source: 'noise-dark-clouds.png',
      state: { intensity: 0.3, feedbackAmount: 0.65, rotation: 0.001, zoom: 1.0, colorShift: 0.03, brightness: 0.9, sourceMix: 0.7, glitch: 0 } },
    { id: 1, rect: {x:0.1,y:0.05,w:0.8,h:0.9}, effect: 'feedback', source: 'GlenGouldDoc.mov',
      state: { intensity: 0.2, feedbackAmount: 0.8, rotation: -0.002, zoom: 1.002, colorShift: 0.05, brightness: 1.1, sourceMix: 0.5, opacity: 0.7, glitch: 0 } },
  ]},

  // 1:48 — Peak energy. Glitch on Musique Concrete, reverse Brakhage accent.
  { t: 108, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'glitch', source: 'Musique Concrete.mp4',
      state: { intensity: 0.35, feedbackAmount: 0.82, rotation: 0.003, zoom: 1.002, colorShift: 0.1, brightness: 1.1, sourceMix: 0.5, glitch: 0.08 } },
    { id: 1, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: 'brakhage-mothlight-slow.mp4', reverse: true,
      state: { intensity: 0.2, feedbackAmount: 0.75, rotation: -0.003, zoom: 1.001, colorShift: 0.05, brightness: 1.0, sourceMix: 0.4, opacity: 0.35, glitch: 0 } },
  ]},

  // 2:05 — Pull back. Single panel, calm colorshift on bitmap.
  { t: 125, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'colorshift', source: 'coloredbitmap.png',
      state: { intensity: 0.2, feedbackAmount: 0.72, rotation: 0.001, zoom: 1.001, colorShift: 0.06, brightness: 1.0, sourceMix: 0.55, glitch: 0 } },
  ]},

  // 2:20 — Split: bitmap left, BBC doc right. Gentle.
  { t: 140, p: [
    { id: 0, rect: {x:0,y:0,w:0.5,h:1}, effect: 'feedback', source: 'coloredbitmap.png',
      state: { intensity: 0.2, feedbackAmount: 0.72, rotation: 0.002, zoom: 1.001, colorShift: 0.04, brightness: 1.05, sourceMix: 0.55, glitch: 0 } },
    { id: 1, rect: {x:0.5,y:0,w:0.5,h:1}, effect: 'feedback', source: 'The New Sound of Music (BBC Do.mp4',
      state: { intensity: 0.15, feedbackAmount: 0.7, rotation: -0.001, zoom: 1.0, colorShift: 0, brightness: 1.05, sourceMix: 0.6, glitch: 0 } },
  ]},

  // 2:35 — Full BBC doc, fading out energy
  { t: 155, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: 'The New Sound of Music (BBC Do.mp4',
      state: { intensity: 0.15, feedbackAmount: 0.68, rotation: -0.001, zoom: 1.0, colorShift: 0.02, brightness: 1.0, sourceMix: 0.6, glitch: 0 } },
  ]},

  // 2:50 — Closing. Dark noise texture, very minimal.
  { t: 170, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'noise', source: 'noise-dark-clouds.png',
      state: { intensity: 0.1, feedbackAmount: 0.6, rotation: 0.0005, zoom: 1.0, colorShift: 0, brightness: 0.85, sourceMix: 0.5, glitch: 0 } },
  ]},

  // 3:00 — Fade to black
  { t: 180, p: [
    { id: 0, rect: {x:0,y:0,w:1,h:1}, effect: 'feedback', source: 'color:#000000',
      state: { intensity: 0.05, feedbackAmount: 0.5, rotation: 0, zoom: 1.0, colorShift: 0, brightness: 0.5, sourceMix: 0.3, glitch: 0 } },
  ]},
];

async function run() {
  console.log('--- 3 min set starting ---');
  const start = Date.now();

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const elapsed = (Date.now() - start) / 1000;
    const wait = Math.max(0, scene.t - elapsed);

    if (wait > 0) {
      console.log(`  waiting ${wait.toFixed(0)}s...`);
      await new Promise(r => setTimeout(r, wait * 1000));
    }

    const mins = Math.floor(scene.t / 60);
    const secs = scene.t % 60;
    const src = scene.p.map(p => p.source?.replace(/\.(mp4|mov|png|jpg)$/i,'').slice(0,15)).join(' + ');
    console.log(`  ${mins}:${secs.toString().padStart(2,'0')} — ${src}`);

    await panels(scene.p);
  }

  console.log('--- set complete ---');
}

run().catch(console.error);
