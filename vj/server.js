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
  secondImageIndex: -1, // -1 = no layer, >= 0 = overlay this source
  layerBlend: 0.8,
  layerMode: 0, // 0=mix, 1=add, 2=multiply, 3=screen, 4=diff
  layerLayout: 1, // 0=fullscreen, 1=inset, 2=side-by-side, 3=pip
  fgPosX: 0.5,
  fgPosY: 0.5,
  fgScale: 0.5,
  preset: null,
  panels: [
    { id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback', source: null }
  ],
  cameraEnabled: false,
  cameraBlend: 0.0, // 0 = all folder image, 1 = all camera
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

// Get current state
app.get('/api/state', (req, res) => {
  res.json(state);
});

// Set effect
app.post('/api/effect', (req, res) => {
  const { name, intensity, feedbackAmount, rotation, zoom, colorShift } = req.body;
  if (name) state.currentEffect = name;
  if (intensity !== undefined) state.intensity = Math.max(0, Math.min(1, intensity));
  if (feedbackAmount !== undefined) state.feedbackAmount = Math.max(0, Math.min(1, feedbackAmount));
  if (rotation !== undefined) state.rotation = rotation;
  if (zoom !== undefined) state.zoom = zoom;
  if (colorShift !== undefined) state.colorShift = colorShift;
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
  broadcast({ type: 'image', currentImageIndex: state.currentImageIndex, images: state.images });
  res.json({ ok: true, currentImageIndex: state.currentImageIndex });
});

// Transition / preset
app.post('/api/transition', (req, res) => {
  const { preset, duration } = req.body;
  if (preset && PRESETS[preset]) {
    Object.assign(state, PRESETS[preset]);
    state.preset = preset;
    broadcast({ type: 'transition', preset, duration: duration || 1000, ...state });
    res.json({ ok: true, preset, state });
  } else {
    res.status(400).json({ error: 'Unknown preset', available: Object.keys(PRESETS) });
  }
});

// Camera control
app.post('/api/camera', (req, res) => {
  const { enabled, blend } = req.body;
  if (enabled !== undefined) state.cameraEnabled = enabled;
  if (blend !== undefined) state.cameraBlend = Math.max(0, Math.min(1, blend));
  broadcast({ type: 'camera', cameraEnabled: state.cameraEnabled, cameraBlend: state.cameraBlend });
  res.json({ ok: true, cameraEnabled: state.cameraEnabled, cameraBlend: state.cameraBlend });
});

// Mode
app.post('/api/mode', (req, res) => {
  const { mode } = req.body;
  if (['manual', 'autonomous', 'copilot'].includes(mode)) {
    state.mode = mode;
    broadcast({ type: 'mode', mode });
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

// Panels: set multi-panel layout
// Body: { panels: [{ id, rect:{x,y,w,h}, effect, source, sourceIndex, state:{...} }, ...] }
// source can be: image/video filename, "color:#rrggbb", or null (use current image)
app.post('/api/panels', (req, res) => {
  const { panels: newPanels } = req.body;
  if (!Array.isArray(newPanels) || newPanels.length === 0) {
    return res.status(400).json({ error: 'panels must be a non-empty array' });
  }
  state.panels = newPanels;
  broadcast({ type: 'panels', panels: newPanels });
  res.json({ ok: true, panels: newPanels });
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
  broadcast({ type: 'panels', panels });
  res.json({ ok: true, layout: name, panels });
});

app.get('/api/layouts', (req, res) => {
  res.json({ layouts: Object.keys(LAYOUTS) });
});

// Layer: set second source and blend
app.post('/api/layer', (req, res) => {
  const { index, name, blend, mode, layout, fgPosX, fgPosY, fgScale, clear } = req.body;
  if (clear) {
    state.secondImageIndex = -1;
  } else if (index !== undefined) {
    state.secondImageIndex = Math.max(-1, Math.min(state.images.length - 1, index));
  } else if (name) {
    const idx = state.images.indexOf(name);
    if (idx !== -1) state.secondImageIndex = idx;
  }
  if (blend !== undefined) state.layerBlend = Math.max(0, Math.min(1, blend));
  if (mode !== undefined) state.layerMode = Math.max(0, Math.min(4, mode));
  if (layout !== undefined) state.layerLayout = Math.max(0, Math.min(3, layout));
  if (fgPosX !== undefined) state.fgPosX = fgPosX;
  if (fgPosY !== undefined) state.fgPosY = fgPosY;
  if (fgScale !== undefined) state.fgScale = Math.max(0.1, Math.min(1.0, fgScale));
  broadcast({
    type: 'layer',
    secondImageIndex: state.secondImageIndex,
    layerBlend: state.layerBlend,
    layerMode: state.layerMode,
    layerLayout: state.layerLayout,
    fgPosX: state.fgPosX,
    fgPosY: state.fgPosY,
    fgScale: state.fgScale,
  });
  res.json({ ok: true, secondImageIndex: state.secondImageIndex, layerBlend: state.layerBlend, layerMode: state.layerMode, layerLayout: state.layerLayout, fgScale: state.fgScale });
});

// --- Start ---
server.listen(PORT, () => {
  console.log(`\n  🎛  VIJAY VJ System`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Images: ${IMAGES_DIR} (${state.images.length} loaded)`);
  console.log(`  → API: /api/state, /api/effect, /api/image, /api/transition\n`);
});
