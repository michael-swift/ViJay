const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, 'images');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Serve images directory
app.use('/images', express.static(IMAGES_DIR));

// --- Audio data (sent from browser, available to agent) ---
const audio = {
  bass: 0, mid: 0, high: 0, overall: 0, beat: 0,
  lastUpdate: 0,
};

// --- State ---
// Server is the single source of truth. Browser renders from server-broadcast state.
const state = {
  currentEffect: 'feedback',
  intensity: 0.5,
  feedbackAmount: 0.85,
  rotation: 0.002,
  zoom: 1.002,
  colorShift: 0.0,
  images: [],
  currentImageIndex: 0,
  mode: 'manual', // manual | autonomous | copilot
  preset: null,
  panels: [
    { id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback', source: null }
  ],
  flash: 0,        // strobe flash (0-1, client decays)
  blackout: false,  // blackout toggle
  activePanel: 0,   // which panel keyboard controls target
};

// Presets: bundled parameter sets
const PRESETS = {
  chaos: { intensity: 0.95, feedbackAmount: 0.92, rotation: 0.015, zoom: 1.01, colorShift: 0.5 },
  calm: { intensity: 0.3, feedbackAmount: 0.75, rotation: 0.001, zoom: 1.0005, colorShift: 0.0 },
  strobe: { intensity: 0.8, feedbackAmount: 0.5, rotation: 0.0, zoom: 1.0, colorShift: 0.0 },
  drift: { intensity: 0.6, feedbackAmount: 0.88, rotation: 0.005, zoom: 1.003, colorShift: 0.1 },
};

// --- Image scanning ---
function scanImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    return [];
  }
  return fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|mov)$/i.test(f))
    .sort();
}

state.images = scanImages();

// Watch images directory
const watcher = chokidar.watch(IMAGES_DIR, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
});

watcher.on('add', (filePath) => {
  const filename = path.basename(filePath);
  if (/\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|mov)$/i.test(filename)) {
    if (!state.images.includes(filename)) {
      state.images.push(filename);
      state.images.sort();
      console.log(`[images] added: ${filename} (${state.images.length} total)`);
      broadcast({ type: 'images', images: state.images });
    }
  }
});

// File overwritten in place — tell browsers to bust their texture cache
watcher.on('change', (filePath) => {
  const filename = path.basename(filePath);
  if (/\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|mov)$/i.test(filename)) {
    console.log(`[images] changed: ${filename} — notifying clients to reload`);
    broadcast({ type: 'imageChanged', filename });
  }
});

watcher.on('unlink', (filePath) => {
  const filename = path.basename(filePath);
  const idx = state.images.indexOf(filename);
  if (idx !== -1) {
    state.images.splice(idx, 1);
    if (state.currentImageIndex >= state.images.length) {
      state.currentImageIndex = Math.max(0, state.images.length - 1);
    }
    console.log(`[images] removed: ${filename} (${state.images.length} total)`);
    broadcast({ type: 'images', images: state.images, currentImageIndex: state.currentImageIndex });
  }
});

// --- WebSocket ---
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  console.log('[ws] client connected');
  // Send full state on connect
  ws.send(JSON.stringify({ type: 'state', ...state }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleMessage(msg, ws);
    } catch (e) {
      console.error('[ws] bad message:', e.message);
    }
  });

  ws.on('close', () => console.log('[ws] client disconnected'));
});

function handleMessage(msg, ws) {
  if (msg.type === 'audio') {
    // Browser sends audio analysis data every few frames.
    // Store it so the agent can read via /api/audio.
    audio.bass = msg.bass || 0;
    audio.mid = msg.mid || 0;
    audio.high = msg.high || 0;
    audio.overall = msg.overall || 0;
    audio.beat = msg.beat || 0;
    audio.lastUpdate = Date.now();
    // Forward to other clients (multi-display sync)
    broadcast({ type: 'audio', ...msg });
  }
}

// --- REST API ---

// Valid effect names
const VALID_EFFECTS = ['feedback', 'glitch', 'colorshift', 'noise', 'kaleidoscope', 'vhs', 'pixelate', 'mirror'];

// Clamp a number to a range, returning defaultVal if input is not a number
function clampNum(val, min, max, defaultVal) {
  if (typeof val !== 'number' || isNaN(val)) return defaultVal;
  return Math.max(min, Math.min(max, val));
}

// Validate and sanitize a panel config object
function sanitizePanel(p, idx) {
  const panel = {
    id: typeof p.id === 'number' ? p.id : idx,
    rect: {
      x: clampNum(p.rect && p.rect.x, 0, 1, 0),
      y: clampNum(p.rect && p.rect.y, 0, 1, 0),
      w: clampNum(p.rect && p.rect.w, 0.01, 1, 1),
      h: clampNum(p.rect && p.rect.h, 0.01, 1, 1),
    },
    effect: VALID_EFFECTS.includes(p.effect) ? p.effect : 'feedback',
    source: (typeof p.source === 'string' || p.source === null) ? p.source : null,
  };
  if (typeof p.source2 === 'string' || p.source2 === null) panel.source2 = p.source2;
  if (p.sourceIndex !== undefined) panel.sourceIndex = clampNum(p.sourceIndex, -1, 999, -1);
  if (p.state && typeof p.state === 'object') {
    panel.state = {};
    if (p.state.intensity !== undefined) panel.state.intensity = clampNum(p.state.intensity, 0, 1, 0.5);
    if (p.state.feedbackAmount !== undefined) panel.state.feedbackAmount = clampNum(p.state.feedbackAmount, 0, 0.99, 0.85);
    if (p.state.rotation !== undefined) panel.state.rotation = clampNum(p.state.rotation, -0.1, 0.1, 0.002);
    if (p.state.zoom !== undefined) panel.state.zoom = clampNum(p.state.zoom, 0.9, 1.1, 1.002);
    if (p.state.colorShift !== undefined) panel.state.colorShift = clampNum(p.state.colorShift, 0, 1, 0);
    if (p.state.brightness !== undefined) panel.state.brightness = clampNum(p.state.brightness, 0, 2, 1.05);
    if (p.state.glitch !== undefined) panel.state.glitch = clampNum(p.state.glitch, 0, 1, 0);
    if (p.state.sourceMix !== undefined) panel.state.sourceMix = clampNum(p.state.sourceMix, 0, 1, 0.5);
    if (p.state.blend2 !== undefined) panel.state.blend2 = clampNum(p.state.blend2, 0, 1, 0);
    if (p.state.blendMode !== undefined) panel.state.blendMode = clampNum(p.state.blendMode, 0, 4, 0);
    if (p.state.opacity !== undefined) panel.state.opacity = clampNum(p.state.opacity, 0, 1, 1);
  }
  return panel;
}

// Auto-CoT: generate a readable description and broadcast it on screen.
// Every mutating API call goes through this so the audience sees what's happening.
function autoCot(text, style) {
  broadcast({ type: 'cot', text, style: style || 'action' });
}

// Describe param changes in a compact readable way
function describeParams(body) {
  const parts = [];
  if (body.intensity !== undefined) parts.push(`int:${body.intensity}`);
  if (body.feedbackAmount !== undefined) parts.push(`fb:${body.feedbackAmount}`);
  if (body.rotation !== undefined) parts.push(`rot:${body.rotation}`);
  if (body.zoom !== undefined) parts.push(`zm:${body.zoom}`);
  if (body.colorShift !== undefined) parts.push(`clr:${body.colorShift}`);
  return parts.join(' ');
}

// Get current state
app.get('/api/state', (req, res) => {
  res.json(state);
});

// Set effect
app.post('/api/effect', (req, res) => {
  const { name, intensity, feedbackAmount, rotation, zoom, colorShift } = req.body;
  if (name && VALID_EFFECTS.includes(name)) state.currentEffect = name;
  if (intensity !== undefined) state.intensity = clampNum(intensity, 0, 1, state.intensity);
  if (feedbackAmount !== undefined) state.feedbackAmount = clampNum(feedbackAmount, 0, 0.99, state.feedbackAmount);
  if (rotation !== undefined) state.rotation = clampNum(rotation, -0.1, 0.1, state.rotation);
  if (zoom !== undefined) state.zoom = clampNum(zoom, 0.9, 1.1, state.zoom);
  if (colorShift !== undefined) state.colorShift = clampNum(colorShift, 0, 1, state.colorShift);
  const params = describeParams(req.body);
  autoCot(`fx: ${state.currentEffect}${params ? ' | ' + params : ''}`);
  broadcast({ type: 'effect', ...state });
  res.json({ ok: true, state });
});

// Set image
app.post('/api/image', (req, res) => {
  const { index, name } = req.body;
  if (index !== undefined) {
    state.currentImageIndex = Math.max(0, Math.min(state.images.length - 1, index));
  } else if (name) {
    const idx = state.images.indexOf(name);
    if (idx !== -1) state.currentImageIndex = idx;
  }
  autoCot(`img: ${state.images[state.currentImageIndex] || '?'}`);
  broadcast({ type: 'image', currentImageIndex: state.currentImageIndex, images: state.images });
  res.json({ ok: true, currentImageIndex: state.currentImageIndex });
});

// Transition / preset
app.post('/api/transition', (req, res) => {
  const { preset, duration } = req.body;
  if (preset && PRESETS[preset]) {
    Object.assign(state, PRESETS[preset]);
    state.preset = preset;
    autoCot(`preset: ${preset}`);
    broadcast({ type: 'transition', preset, duration: duration || 1000, ...state });
    res.json({ ok: true, preset, state });
  } else {
    res.status(400).json({ error: 'Unknown preset', available: Object.keys(PRESETS) });
  }
});

// Flash (strobe) — triggers a 1.0 pulse that the browser decays locally.
// Server resets to 0 after broadcast so /api/state doesn't report stale flash.
app.post('/api/flash', (req, res) => {
  autoCot('flash');
  broadcast({ type: 'flash', flash: 1.0 });
  state.flash = 0; // browser handles decay; server stays clean
  res.json({ ok: true });
});

// Blackout toggle
app.post('/api/blackout', (req, res) => {
  const { enabled } = req.body;
  state.blackout = enabled !== undefined ? enabled : !state.blackout;
  autoCot(state.blackout ? 'blackout ON' : 'blackout OFF');
  broadcast({ type: 'blackout', blackout: state.blackout });
  res.json({ ok: true, blackout: state.blackout });
});

// Update a specific panel's state (for keyboard controls)
// PATCH /api/panel/:id { effect, state: { intensity, rotation, ... } }
// Merges incoming fields into the existing panel, then sanitizes the whole thing.
app.patch('/api/panel/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid panel id' });
  const idx = state.panels.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Panel not found' });
  const existing = state.panels[idx];
  // Merge incoming fields over existing panel, then sanitize
  const merged = {
    ...existing,
    ...req.body,
    id: existing.id, // don't allow id change
    rect: existing.rect, // don't allow rect change via PATCH
    state: { ...(existing.state || {}), ...(req.body.state || {}) },
  };
  state.panels[idx] = sanitizePanel(merged, idx);
  broadcast({ type: 'panels', panels: state.panels });
  res.json({ ok: true, panel: state.panels[idx] });
});

// Active panel (which panel keyboard targets)
app.post('/api/active-panel', (req, res) => {
  const { id } = req.body;
  if (id !== undefined) {
    state.activePanel = Math.max(0, Math.min(state.panels.length - 1, id));
  } else {
    // Cycle to next panel
    state.activePanel = (state.activePanel + 1) % state.panels.length;
  }
  broadcast({ type: 'activePanel', activePanel: state.activePanel });
  res.json({ ok: true, activePanel: state.activePanel });
});

// Mode
app.post('/api/mode', (req, res) => {
  const { mode } = req.body;
  if (['manual', 'autonomous', 'copilot'].includes(mode)) {
    state.mode = mode;
    broadcast({ type: 'mode', mode });
    // Start/stop autopilot based on mode
    if (mode === 'autonomous' || mode === 'copilot') {
      autopilot.start();
    } else if (mode === 'manual') {
      autopilot.stop();
    }
    res.json({ ok: true, mode });
  } else {
    res.status(400).json({ error: 'Unknown mode', available: ['manual', 'autonomous', 'copilot'] });
  }
});

// List images
app.get('/api/images', (req, res) => {
  res.json({ images: state.images, currentImageIndex: state.currentImageIndex });
});

// Audio levels (reported by browser, read by agent)
app.get('/api/audio', (req, res) => {
  res.json(audio);
});

// Chain of Thought: send text to the on-screen overlay
// Body: { text: "string", style: "thought"|"action"|"default" }
//   or: { lines: [{ text: "...", style: "..." }, ...] }
app.post('/api/cot', (req, res) => {
  broadcast({ type: 'cot', ...req.body });
  res.json({ ok: true });
});

// Panels: set multi-panel layout
// Body: { panels: [{ id, rect:{x,y,w,h}, effect, source, sourceIndex, state:{...} }, ...] }
// source can be: image/video filename, "color:#rrggbb", or null (use current image)
app.post('/api/panels', (req, res) => {
  const { panels: newPanels } = req.body;
  if (!Array.isArray(newPanels) || newPanels.length === 0) {
    return res.status(400).json({ error: 'panels must be a non-empty array' });
  }
  if (newPanels.length > 8) {
    return res.status(400).json({ error: 'max 8 panels' });
  }
  const sanitized = newPanels.map(sanitizePanel);
  state.panels = sanitized;
  // Describe panels compactly for CoT
  const desc = sanitized.map((p, i) => `${i}:${p.effect || '?'}/${(p.source || '?').replace(/\.(jpg|jpeg|png|mp4|webm)$/i, '').slice(0, 15)}`).join(' ');
  autoCot(`panels [${sanitized.length}]: ${desc}`);
  broadcast({ type: 'panels', panels: sanitized });
  res.json({ ok: true, panels: sanitized });
});

// Get panels
app.get('/api/panels', (req, res) => {
  res.json({ panels: state.panels });
});

// Preset layouts: named panel configurations.
// POST /api/layout { name: "quad-anchor", sources: ["bob_ross.mp4", "photo.jpg", ...], anchor: "bob_ross.mp4" }
// The layout defines the geometry, the caller fills in sources.
const LAYOUTS = {
  // Single fullscreen panel
  'full': (sources) => [
    { id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback', source: sources[0] || null }
  ],
  // Left/right split
  'split': (sources) => [
    { id: 0, rect: { x: 0, y: 0, w: 0.5, h: 1 }, effect: 'feedback', source: sources[0] || null },
    { id: 1, rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, effect: 'glitch', source: sources[1] || null },
  ],
  // Wide main + narrow sidebar
  'widescreen': (sources) => [
    { id: 0, rect: { x: 0, y: 0, w: 0.7, h: 1 }, effect: 'feedback', source: sources[0] || null },
    { id: 1, rect: { x: 0.7, y: 0, w: 0.3, h: 1 }, effect: 'colorshift', source: sources[1] || 'color:#0a0a1a' },
  ],
  // Quad grid with anchor in top-left
  'quad-anchor': (sources, anchor) => [
    { id: 0, rect: { x: 0, y: 0, w: 0.35, h: 0.5 }, effect: 'feedback', source: anchor || sources[0] || null,
      state: { intensity: 0.3, feedbackAmount: 0.8, rotation: 0.002, brightness: 0.95, sourceMix: 0.5 } },
    { id: 1, rect: { x: 0.35, y: 0, w: 0.65, h: 0.5 }, effect: 'glitch', source: sources[1] || null },
    { id: 2, rect: { x: 0, y: 0.5, w: 0.5, h: 0.5 }, effect: 'feedback', source: sources[2] || 'color:#0a0a1a' },
    { id: 3, rect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, effect: 'noise', source: sources[3] || null },
  ],
  // Three columns
  'triptych': (sources) => [
    { id: 0, rect: { x: 0, y: 0, w: 0.3, h: 1 }, effect: 'feedback', source: sources[0] || null },
    { id: 1, rect: { x: 0.3, y: 0, w: 0.4, h: 1 }, effect: 'feedback', source: sources[1] || null },
    { id: 2, rect: { x: 0.7, y: 0, w: 0.3, h: 1 }, effect: 'glitch', source: sources[2] || null },
  ],
  // Big center + color washes on sides
  'spotlight': (sources) => [
    { id: 0, rect: { x: 0, y: 0, w: 0.2, h: 1 }, effect: 'colorshift', source: sources[1] || 'color:#1a0a2e',
      state: { intensity: 0.3, feedbackAmount: 0.9, rotation: 0.001, brightness: 0.7, sourceMix: 0.1 } },
    { id: 1, rect: { x: 0.2, y: 0, w: 0.6, h: 1 }, effect: 'feedback', source: sources[0] || null },
    { id: 2, rect: { x: 0.8, y: 0, w: 0.2, h: 1 }, effect: 'colorshift', source: sources[2] || 'color:#0a1a0a',
      state: { intensity: 0.3, feedbackAmount: 0.9, rotation: -0.001, brightness: 0.7, sourceMix: 0.1 } },
  ],
  // Wide video top, photos bottom split
  'cinema': (sources, anchor) => [
    { id: 0, rect: { x: 0, y: 0, w: 1, h: 0.55 }, effect: 'feedback', source: anchor || sources[0] || null,
      state: { intensity: 0.35, feedbackAmount: 0.78, rotation: 0.002, brightness: 0.95, sourceMix: 0.5 } },
    { id: 1, rect: { x: 0, y: 0.55, w: 0.5, h: 0.45 }, effect: 'glitch', source: sources[1] || null },
    { id: 2, rect: { x: 0.5, y: 0.55, w: 0.5, h: 0.45 }, effect: 'feedback', source: sources[2] || null },
  ],
};

app.post('/api/layout', (req, res) => {
  const { name, sources, anchor, effects } = req.body;
  const layoutFn = LAYOUTS[name];
  if (!layoutFn) {
    return res.status(400).json({ error: 'Unknown layout', available: Object.keys(LAYOUTS) });
  }
  const panels = layoutFn(sources || [], anchor);
  // Optionally override effects per panel
  if (effects && Array.isArray(effects)) {
    effects.forEach((fx, i) => { if (fx && panels[i]) panels[i].effect = fx; });
  }
  state.panels = panels;
  const srcs = (sources || []).map(s => (s || '').replace(/\.(jpg|jpeg|png|mp4|webm)$/i, '').slice(0, 12)).join(', ');
  autoCot(`layout: ${name}${srcs ? ' | ' + srcs : ''}`);
  broadcast({ type: 'panels', panels });
  res.json({ ok: true, layout: name, panels });
});

app.get('/api/layouts', (req, res) => {
  res.json({ layouts: Object.keys(LAYOUTS) });
});

// (Layer API removed — use per-panel source2/blend2 via /api/panels instead)

// --- Autopilot ---
// Runs on boot, cycling through visual compositions with energy arcs.
// Stops when mode is switched to 'manual', resumes on 'autonomous' or 'copilot'.

const autopilot = {
  timer: null,
  stepIndex: 0,
  energy: 0, // 0-1 energy level, rises and falls over time
  energyDir: 1, // 1 = building, -1 = dropping
  anchorSource: null, // stays consistent across transitions

  scheduleNext() {
    // Copilot mode runs slower (15-25s) than autonomous (8-15s)
    const base = state.mode === 'copilot' ? 15000 : 8000;
    const jitter = state.mode === 'copilot' ? 10000 : 7000;
    this.timer = setTimeout(() => {
      this.step();
      if (this.timer) this.scheduleNext();
    }, base + Math.random() * jitter);
  },

  start() {
    if (this.timer) return;
    // Pick a video as anchor if available, otherwise first image
    const videos = state.images.filter(f => /\.(mp4|webm|mov)$/i.test(f));
    this.anchorSource = videos.length > 0
      ? videos[Math.floor(Math.random() * videos.length)]
      : state.images[0] || null;
    this.energy = 0.1;
    this.energyDir = 1;
    this.stepIndex = 0;
    console.log(`[autopilot] started (${state.mode}) — anchor: ${this.anchorSource}`);
    autoCot(`autopilot engaged (${state.mode})`, 'thought');
    this.step();
    this.scheduleNext();
  },

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      console.log('[autopilot] stopped');
    }
  },

  // Pick random images, excluding the anchor
  pickSources(count) {
    const pool = state.images.filter(f => f !== this.anchorSource);
    const picked = [];
    const shuffled = pool.sort(() => Math.random() - 0.5);
    for (let i = 0; i < count && i < shuffled.length; i++) {
      picked.push(shuffled[i]);
    }
    return picked;
  },

  // Pick an effect weighted by current energy
  pickEffect() {
    if (this.energy > 0.75) {
      return ['glitch', 'glitch', 'noise', 'feedback'][Math.floor(Math.random() * 4)];
    } else if (this.energy > 0.4) {
      return ['feedback', 'glitch', 'colorshift', 'noise'][Math.floor(Math.random() * 4)];
    } else {
      return ['feedback', 'feedback', 'colorshift', 'noise'][Math.floor(Math.random() * 4)];
    }
  },

  // Map energy to parameter ranges
  params() {
    const e = this.energy;
    return {
      intensity: 0.2 + e * 0.7,
      feedbackAmount: 0.7 + e * 0.22,
      rotation: (0.001 + e * 0.012) * (Math.random() > 0.5 ? 1 : -1),
      zoom: 1.0 + e * 0.008,
      colorShift: e > 0.5 ? e * 0.3 : 0,
      brightness: 0.8 + e * 0.35,
      sourceMix: 0.55 - e * 0.2,
      glitch: e > 0.6 ? (e - 0.6) * 0.5 : 0,
    };
  },

  step() {
    if (state.mode === 'manual') {
      this.stop();
      return;
    }

    // Evolve energy (copilot mode caps at 0.6 for gentler changes)
    const energyStep = state.mode === 'copilot' ? 0.05 + Math.random() * 0.08 : 0.08 + Math.random() * 0.12;
    const energyCap = state.mode === 'copilot' ? 0.6 : 1.0;
    this.energy += this.energyDir * energyStep;
    if (this.energy >= energyCap) {
      this.energy = energyCap;
      this.energyDir = -1; // start dropping
    } else if (this.energy <= 0.05) {
      this.energy = 0.1;
      this.energyDir = 1; // start building again
      // Pick a new anchor on each new cycle
      const videos = state.images.filter(f => /\.(mp4|webm|mov)$/i.test(f));
      if (videos.length > 0) {
        this.anchorSource = videos[Math.floor(Math.random() * videos.length)];
      }
    }

    const p = this.params();
    const scenes = this.getScenes(p);
    const scene = scenes[this.stepIndex % scenes.length];
    this.stepIndex++;

    state.panels = scene;
    broadcast({ type: 'panels', panels: scene });

    const desc = scene.map((pan, i) =>
      `${i}:${pan.effect}/${(pan.source || '?').replace(/\.(jpg|jpeg|png|mp4|webm)$/i, '').slice(0, 12)}`
    ).join(' ');
    const energyBar = '▓'.repeat(Math.round(this.energy * 10)) + '░'.repeat(10 - Math.round(this.energy * 10));
    autoCot(`auto [${energyBar}] ${desc}`, 'thought');
  },

  getScenes(p) {
    const sources = this.pickSources(4);
    const anchor = this.anchorSource;
    const darkColors = ['#1a0a2e', '#0a1a0a', '#0f0505', '#050510', '#0a0a1a'];
    const darkColor = 'color:' + darkColors[Math.floor(Math.random() * darkColors.length)];

    return [
      // Scene: Anchor fullscreen with gentle feedback + blended photo
      [
        { id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback', source: anchor,
          source2: sources[0] || null,
          state: { ...p, rotation: p.rotation * 0.5, sourceMix: 0.5, blend2: 0.25, blendMode: 0 } },
      ],

      // Scene: Split — anchor left, photo right
      [
        { id: 0, rect: { x: 0, y: 0, w: 0.5, h: 1 }, effect: 'feedback', source: anchor,
          state: { ...p, intensity: p.intensity * 0.7, sourceMix: 0.5 } },
        { id: 1, rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, effect: this.pickEffect(), source: sources[0] || null,
          state: p },
      ],

      // Scene: Cinema — anchor top, two photos bottom
      [
        { id: 0, rect: { x: 0, y: 0, w: 1, h: 0.55 }, effect: 'feedback', source: anchor,
          state: { ...p, intensity: p.intensity * 0.6, sourceMix: 0.5 } },
        { id: 1, rect: { x: 0, y: 0.55, w: 0.5, h: 0.45 }, effect: this.pickEffect(), source: sources[0] || null,
          state: p },
        { id: 2, rect: { x: 0.5, y: 0.55, w: 0.5, h: 0.45 }, effect: this.pickEffect(), source: sources[1] || darkColor,
          state: p },
      ],

      // Scene: Spotlight — dark sides, blended photo center
      [
        { id: 0, rect: { x: 0, y: 0, w: 0.2, h: 1 }, effect: 'colorshift', source: darkColor,
          state: { intensity: 0.3, feedbackAmount: 0.9, rotation: 0.001, brightness: 0.6, sourceMix: 0.1 } },
        { id: 1, rect: { x: 0.2, y: 0, w: 0.6, h: 1 }, effect: this.pickEffect(), source: sources[0] || anchor,
          source2: sources[1] || null,
          state: { ...p, blend2: this.energy > 0.5 ? 0.35 : 0, blendMode: Math.floor(Math.random() * 4) } },
        { id: 2, rect: { x: 0.8, y: 0, w: 0.2, h: 1 }, effect: 'colorshift', source: darkColor,
          state: { intensity: 0.3, feedbackAmount: 0.9, rotation: -0.001, brightness: 0.6, sourceMix: 0.1 } },
      ],

      // Scene: Quad — anchor top-left, others fill
      [
        { id: 0, rect: { x: 0, y: 0, w: 0.4, h: 0.5 }, effect: 'feedback', source: anchor,
          state: { ...p, intensity: p.intensity * 0.5, sourceMix: 0.5 } },
        { id: 1, rect: { x: 0.4, y: 0, w: 0.6, h: 0.5 }, effect: this.pickEffect(), source: sources[0] || null,
          state: p },
        { id: 2, rect: { x: 0, y: 0.5, w: 0.5, h: 0.5 }, effect: this.pickEffect(), source: sources[1] || darkColor,
          state: p },
        { id: 3, rect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, effect: this.pickEffect(), source: sources[2] || null,
          state: p },
      ],

      // Scene: Triptych
      [
        { id: 0, rect: { x: 0, y: 0, w: 0.3, h: 1 }, effect: 'feedback', source: anchor,
          state: { ...p, intensity: p.intensity * 0.6, sourceMix: 0.5 } },
        { id: 1, rect: { x: 0.3, y: 0, w: 0.4, h: 1 }, effect: this.pickEffect(), source: sources[0] || null,
          state: p },
        { id: 2, rect: { x: 0.7, y: 0, w: 0.3, h: 1 }, effect: this.pickEffect(), source: sources[1] || darkColor,
          state: p },
      ],

      // Scene: Widescreen — big left, ambient right
      [
        { id: 0, rect: { x: 0, y: 0, w: 0.7, h: 1 }, effect: this.pickEffect(), source: sources[0] || anchor,
          state: p },
        { id: 1, rect: { x: 0.7, y: 0, w: 0.3, h: 1 }, effect: 'noise', source: darkColor,
          state: { intensity: 0.4, feedbackAmount: 0.85, rotation: 0.002, brightness: 0.5, sourceMix: 0.15 } },
      ],

      // Scene: Full blast — two sources smashed together
      [
        { id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: this.pickEffect(), source: sources[0] || anchor,
          source2: sources[1] || sources[0] || null,
          state: { ...p, intensity: Math.min(p.intensity * 1.2, 1), glitch: p.glitch + 0.1,
            blend2: 0.4 + this.energy * 0.3, blendMode: [0, 1, 3, 4][Math.floor(Math.random() * 4)] } },
      ],
    ];
  },
};

// API to control autopilot
app.post('/api/autopilot', (req, res) => {
  const { action } = req.body;
  if (action === 'start') {
    state.mode = 'autonomous';
    broadcast({ type: 'mode', mode: 'autonomous' });
    autopilot.start();
    res.json({ ok: true, status: 'started' });
  } else if (action === 'stop') {
    state.mode = 'manual';
    broadcast({ type: 'mode', mode: 'manual' });
    autopilot.stop();
    res.json({ ok: true, status: 'stopped' });
  } else {
    res.status(400).json({ error: 'action must be start or stop' });
  }
});

// --- Start ---
server.listen(PORT, () => {
  console.log(`\n  🎛  VIJAY VJ System`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Images: ${IMAGES_DIR} (${state.images.length} loaded)`);
  console.log(`  → API: /api/state, /api/effect, /api/image, /api/transition`);
  console.log(`  → Autopilot: ON (mode: autonomous)\n`);

  // Start autopilot on boot
  state.mode = 'autonomous';
  autopilot.start();
});
