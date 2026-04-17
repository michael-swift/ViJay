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
const CUES_FILE = path.join(__dirname, 'cues.json');

// --- Cue System ---
// Two-level cue system: templates (layouts with variable slots) and scenes (bound templates)
const cues = { templates: {}, scenes: {} };

function loadCues() {
  try {
    if (fs.existsSync(CUES_FILE)) {
      const data = JSON.parse(fs.readFileSync(CUES_FILE, 'utf8'));
      if (data.templates) cues.templates = data.templates;
      if (data.scenes) cues.scenes = data.scenes;
      console.log(`[cues] loaded ${Object.keys(cues.templates).length} templates, ${Object.keys(cues.scenes).length} scenes`);
    }
  } catch (e) {
    console.error('[cues] failed to load cues.json:', e.message);
  }
}

function saveCues() {
  try {
    fs.writeFileSync(CUES_FILE, JSON.stringify(cues, null, 2));
  } catch (e) {
    console.error('[cues] failed to save cues.json:', e.message);
  }
}

loadCues();

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
  intensity: 0.3,
  feedbackAmount: 0.7,
  rotation: 0.001,
  zoom: 1.001,
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

// --- Image scanning (recursive, stores relative paths like "videos/file.mp4") ---
const MEDIA_RE = /\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|mov)$/i;

function scanImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    return [];
  }
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (MEDIA_RE.test(entry.name)) {
        results.push(path.relative(IMAGES_DIR, full));
      }
    }
  }
  walk(IMAGES_DIR);
  return results.sort();
}

// --- Asset metadata ---
const METADATA_FILE = path.join(IMAGES_DIR, 'metadata.json');
let assetMetadata = {};
try {
  if (fs.existsSync(METADATA_FILE)) {
    assetMetadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
    console.log(`[metadata] loaded ${Object.keys(assetMetadata).length} asset descriptions`);
  }
} catch (e) { console.warn('[metadata] failed to load:', e.message); }

// Helper: get category from relative path (folder name)
function getCategory(relPath) {
  const parts = relPath.split('/');
  return parts.length > 1 ? parts[0] : 'uncategorized';
}

// Helper: get assets by category
function getAssetsByCategory(category) {
  return state.images.filter(f => getCategory(f) === category);
}

state.images = scanImages();

// Watch images directory (recursive)
const watcher = chokidar.watch(IMAGES_DIR, {
  ignoreInitial: true,
  ignored: /(^|[\/\\])\.|metadata\.json/,
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
});

watcher.on('add', (filePath) => {
  const relPath = path.relative(IMAGES_DIR, filePath);
  if (MEDIA_RE.test(relPath)) {
    if (!state.images.includes(relPath)) {
      state.images.push(relPath);
      state.images.sort();
      console.log(`[images] added: ${relPath} (${state.images.length} total)`);
      broadcast({ type: 'images', images: state.images });
    }
  }
});

watcher.on('change', (filePath) => {
  const relPath = path.relative(IMAGES_DIR, filePath);
  if (MEDIA_RE.test(relPath)) {
    console.log(`[images] changed: ${relPath} — notifying clients to reload`);
    broadcast({ type: 'imageChanged', filename: relPath });
  }
});

watcher.on('unlink', (filePath) => {
  const relPath = path.relative(IMAGES_DIR, filePath);
  const idx = state.images.indexOf(relPath);
  if (idx !== -1) {
    state.images.splice(idx, 1);
    if (state.currentImageIndex >= state.images.length) {
      state.currentImageIndex = Math.max(0, state.images.length - 1);
    }
    console.log(`[images] removed: ${relPath} (${state.images.length} total)`);
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
  res.json({
    images: state.images,
    currentImageIndex: state.currentImageIndex,
    metadata: assetMetadata,
    byCategory: {
      videos: getAssetsByCategory('videos'),
      textures: getAssetsByCategory('textures'),
      photos: getAssetsByCategory('photos'),
    },
  });
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
  state.activePanel = Math.min(state.activePanel, sanitized.length - 1);
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
  const rawPanels = layoutFn(sources || [], anchor);
  // Optionally override effects per panel
  if (effects && Array.isArray(effects)) {
    effects.forEach((fx, i) => { if (fx && rawPanels[i]) rawPanels[i].effect = fx; });
  }
  const panels = rawPanels.map(sanitizePanel);
  state.panels = panels;
  state.activePanel = Math.min(state.activePanel, panels.length - 1);
  const srcs = (sources || []).map(s => (s || '').replace(/\.(jpg|jpeg|png|mp4|webm)$/i, '').slice(0, 12)).join(', ');
  autoCot(`layout: ${name}${srcs ? ' | ' + srcs : ''}`);
  broadcast({ type: 'panels', panels });
  res.json({ ok: true, layout: name, panels });
});

app.get('/api/layouts', (req, res) => {
  res.json({ layouts: Object.keys(LAYOUTS) });
});

// (Layer API removed — use per-panel source2/blend2 via /api/panels instead)

// --- Variable Resolution ---
// Resolves $tokens in template panels to concrete values.
function resolveToken(token, vars, ctx) {
  // Check explicit overrides first
  if (vars && vars[token] !== undefined) return vars[token];

  switch (token) {
    case '$anchor':
      return ctx.anchor || null;
    case '$random':
      return ctx.images.length > 0
        ? ctx.images[Math.floor(Math.random() * ctx.images.length)]
        : null;
    case '$random:photo': {
      const photos = getAssetsByCategory('photos');
      return photos.length > 0 ? photos[Math.floor(Math.random() * photos.length)] : null;
    }
    case '$random:video': {
      const videos = getAssetsByCategory('videos');
      return videos.length > 0 ? videos[Math.floor(Math.random() * videos.length)] : null;
    }
    case '$random:texture': {
      const textures = getAssetsByCategory('textures');
      return textures.length > 0 ? textures[Math.floor(Math.random() * textures.length)] : null;
    }
    case '$dark': {
      const darkColors = ['#1a0a2e', '#0a1a0a', '#0f0505', '#050510', '#0a0a1a'];
      return 'color:' + darkColors[Math.floor(Math.random() * darkColors.length)];
    }
    case '$effect': {
      const e = ctx.energy || 0.5;
      if (e > 0.75) return ['glitch', 'noise', 'feedback'][Math.floor(Math.random() * 3)];
      if (e > 0.4) return ['feedback', 'glitch', 'colorshift'][Math.floor(Math.random() * 3)];
      return ['feedback', 'colorshift'][Math.floor(Math.random() * 2)];
    }
    default:
      return token; // literal string, return as-is
  }
}

function resolveTemplate(template, vars, ctx) {
  return template.panels.map((panel, i) => {
    const resolved = { ...panel };
    // Resolve source tokens
    if (typeof resolved.source === 'string' && resolved.source.startsWith('$')) {
      resolved.source = resolveToken(resolved.source, vars, ctx);
    }
    if (typeof resolved.source2 === 'string' && resolved.source2.startsWith('$')) {
      resolved.source2 = resolveToken(resolved.source2, vars, ctx);
    }
    // Resolve effect tokens
    if (typeof resolved.effect === 'string' && resolved.effect.startsWith('$')) {
      resolved.effect = resolveToken(resolved.effect, vars, ctx);
    }
    return sanitizePanel(resolved, i);
  });
}

// Infer energy level from a scene's panel states
function inferEnergy(panels) {
  if (!panels || panels.length === 0) return 0.5;
  let total = 0;
  let count = 0;
  for (const p of panels) {
    const s = p.state || {};
    if (s.intensity !== undefined) { total += s.intensity; count++; }
    if (s.feedbackAmount !== undefined) { total += Math.max(0, s.feedbackAmount - 0.7); count++; }
    if (s.glitch !== undefined) { total += s.glitch * 2; count++; }
    if (s.colorShift !== undefined) { total += s.colorShift; count++; }
  }
  return count > 0 ? Math.max(0, Math.min(1, total / count)) : 0.5;
}

// --- Cue API Endpoints ---

// List all templates and scenes
app.get('/api/cues', (req, res) => {
  // Include built-in templates (from LAYOUTS) alongside saved templates
  const builtinTemplates = {};
  for (const [name, fn] of Object.entries(LAYOUTS)) {
    builtinTemplates[name] = { name, builtin: true, panels: fn([], null).map(sanitizePanel) };
  }
  res.json({
    templates: { ...builtinTemplates, ...cues.templates },
    scenes: cues.scenes,
  });
});

// Save a template
app.post('/api/cues/template', (req, res) => {
  const { name, panels: templatePanels } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!Array.isArray(templatePanels) || templatePanels.length === 0) {
    return res.status(400).json({ error: 'panels must be a non-empty array' });
  }
  cues.templates[name] = { name, panels: templatePanels };
  saveCues();
  autoCot(`template saved: ${name}`);
  res.json({ ok: true, template: cues.templates[name] });
});

// Delete a template
app.delete('/api/cues/template/:name', (req, res) => {
  const { name } = req.params;
  if (!cues.templates[name]) {
    return res.status(404).json({ error: 'Template not found' });
  }
  delete cues.templates[name];
  saveCues();
  res.json({ ok: true });
});

// Save a scene
app.post('/api/cues/scene', (req, res) => {
  const { name, template, vars, panels: scenePanels } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (template) {
    // Template-based scene
    cues.scenes[name] = { name, template, vars: vars || {} };
  } else if (Array.isArray(scenePanels) && scenePanels.length > 0) {
    // Direct scene (no template)
    cues.scenes[name] = { name, panels: scenePanels };
  } else {
    return res.status(400).json({ error: 'Either template or panels is required' });
  }
  saveCues();
  autoCot(`scene saved: ${name}`);
  res.json({ ok: true, scene: cues.scenes[name] });
});

// Save current state as a scene
app.post('/api/cues/scene/save-current', (req, res) => {
  const { name } = req.body;
  const sceneName = name || `scene-${String(Object.keys(cues.scenes).length + 1).padStart(3, '0')}`;
  cues.scenes[sceneName] = {
    name: sceneName,
    panels: state.panels.map(p => ({ ...p })),
  };
  saveCues();
  autoCot(`scene saved: ${sceneName}`);
  res.json({ ok: true, scene: cues.scenes[sceneName] });
});

// Delete a scene
app.delete('/api/cues/scene/:name', (req, res) => {
  const { name } = req.params;
  if (!cues.scenes[name]) {
    return res.status(404).json({ error: 'Scene not found' });
  }
  delete cues.scenes[name];
  saveCues();
  res.json({ ok: true });
});

// Recall a scene or template by name
app.post('/api/cues/recall', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const ctx = {
    anchor: autopilot.anchorSource,
    images: state.images,
    energy: autopilot.energy,
  };

  let resolvedPanels;

  // Check scenes first, then templates, then built-in layouts
  const scene = cues.scenes[name];
  if (scene) {
    if (scene.template) {
      // Template-based scene — find the template
      const tmpl = cues.templates[scene.template] || getBuiltinTemplate(scene.template);
      if (!tmpl) return res.status(404).json({ error: `Template "${scene.template}" not found` });
      resolvedPanels = resolveTemplate(tmpl, scene.vars || {}, ctx);
    } else if (scene.panels) {
      resolvedPanels = scene.panels.map(sanitizePanel);
    } else {
      return res.status(400).json({ error: 'Scene has no template or panels' });
    }
  } else {
    // Try templates
    const tmpl = cues.templates[name] || getBuiltinTemplate(name);
    if (tmpl) {
      resolvedPanels = resolveTemplate(tmpl, {}, ctx);
    } else {
      return res.status(404).json({ error: 'Cue not found' });
    }
  }

  state.panels = resolvedPanels;
  state.activePanel = Math.min(state.activePanel, resolvedPanels.length - 1);
  autoCot(`recall: ${name}`);
  broadcast({ type: 'panels', panels: resolvedPanels });
  res.json({ ok: true, panels: resolvedPanels });
});

// Helper to get a built-in template from LAYOUTS
function getBuiltinTemplate(name) {
  const fn = LAYOUTS[name];
  if (!fn) return null;
  return { name, panels: fn([], null).map(sanitizePanel) };
}

// --- Autopilot ---
// Runs on boot, cycling through visual compositions with energy arcs.
// Stops when mode is switched to 'manual', resumes on 'autonomous' or 'copilot'.

const autopilot = {
  vibeTimer: null,
  sourceTimer: null,
  energy: 0,
  energyDir: 1,
  anchorSource: null,
  cycleStart: 0,       // timestamp when the current energy cycle began
  cycleDuration: 0,    // how long this cycle lasts (ms)
  livePanel: 0,        // which panel ID is currently visible (0 or 1)
  transitioning: false, // true during a crossfade between panels

  start() {
    if (this.vibeTimer || this.sourceTimer) return;
    // Pick an anchor source — prefer videos, fall back to any image
    const pool = this.getSourcePool();
    this.anchorSource = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : null;
    this.energy = 0.1;
    this.energyDir = 1;
    this.cycleStart = Date.now();
    // Full energy cycle: 6-15 minutes
    this.cycleDuration = (360 + Math.random() * 540) * 1000;
    console.log(`[autopilot] started (${state.mode}) — anchor: ${this.anchorSource}, cycle: ${Math.round(this.cycleDuration/1000)}s`);
    autoCot(`autopilot engaged (${state.mode})`, 'thought');

    // Initial layout + vibe
    this.setLayout();
    this.pushVibe();
    this.scheduleVibeTimer();
    this.scheduleSourceTimer();
  },

  stop() {
    if (this.vibeTimer) { clearTimeout(this.vibeTimer); this.vibeTimer = null; }
    if (this.sourceTimer) { clearTimeout(this.sourceTimer); this.sourceTimer = null; }
    // Clear drift on clients
    broadcast({ type: 'drift', drift: null });
    console.log('[autopilot] stopped');
  },

  // --- Timers ---

  scheduleVibeTimer() {
    const base = state.mode === 'copilot' ? 50000 : 45000;
    const jitter = state.mode === 'copilot' ? 45000 : 45000;
    this.vibeTimer = setTimeout(() => {
      this.vibeTimer = null; // clear stale ID — timer has fired
      if (state.mode === 'manual') return; // cancelled while waiting
      this.evolveEnergy();
      this.pushVibe();
      this.scheduleVibeTimer();
    }, base + Math.random() * jitter);
  },

  scheduleSourceTimer() {
    const base = 20000;
    const jitter = 20000;
    this.sourceTimer = setTimeout(() => {
      this.sourceTimer = null; // clear stale ID — timer has fired
      if (state.mode === 'manual') return;
      this.evolveSource();
      this.scheduleSourceTimer();
    }, base + Math.random() * jitter);
  },

  // --- Energy arc ---
  // Smooth sinusoidal energy over the cycle duration, with some noise

  evolveEnergy() {
    if (state.mode === 'manual') { this.stop(); return; }

    const elapsed = Date.now() - this.cycleStart;
    const progress = elapsed / this.cycleDuration;

    if (progress >= 1.0) {
      // Cycle complete — reset
      this.energy = 0.1;
      this.energyDir = 1;
      this.cycleStart = Date.now();
      this.cycleDuration = (360 + Math.random() * 540) * 1000;
      // New anchor for new cycle
      const pool = this.getSourcePool();
      if (pool.length > 0) {
        this.anchorSource = pool[Math.floor(Math.random() * pool.length)];
      }
      // Hard layout change at cycle boundary
      this.setLayout();
      console.log(`[autopilot] new cycle — anchor: ${this.anchorSource}, duration: ${Math.round(this.cycleDuration/1000)}s`);
      return;
    }

    // Sinusoidal energy: rises to peak at 60% through cycle, then drops
    const peakAt = 0.6;
    let baseEnergy;
    if (progress < peakAt) {
      baseEnergy = 0.1 + 0.9 * Math.sin((progress / peakAt) * Math.PI * 0.5);
    } else {
      baseEnergy = Math.cos(((progress - peakAt) / (1 - peakAt)) * Math.PI * 0.5);
    }
    // Add a little noise so it's not perfectly smooth
    baseEnergy += (Math.random() - 0.5) * 0.08;

    const cap = state.mode === 'copilot' ? 0.6 : 1.0;
    this.energy = Math.max(0.05, Math.min(cap, baseEnergy));
  },

  // --- Layout ---
  // Two fullscreen panels: one "live" (visible), one "cooking" (invisible, building texture).
  // Source transitions crossfade between the two cooked streams.

  setLayout() {
    const pool = this.getSourcePool();
    const nextSource = pool.filter(f => f !== this.anchorSource);
    const cookingSource = nextSource.length > 0
      ? nextSource[Math.floor(Math.random() * nextSource.length)]
      : this.anchorSource;

    this.livePanel = 0;
    this.transitioning = false;

    const panels = [
      {
        id: 0,
        rect: { x: 0, y: 0, w: 1, h: 1 },
        effect: 'feedback',
        source: this.anchorSource,
        reverse: true,
        state: { ...this.generateBaseState(this.energy), opacity: 1.0 },
      },
      {
        id: 1,
        rect: { x: 0, y: 0, w: 1, h: 1 },
        effect: this.pickOverlayEffect(),
        source: cookingSource,
        reverse: true,
        // Cooking panel: opacity 0 but running its own feedback loop, building texture
        state: { ...this.generateBaseState(this.energy), opacity: 0.0 },
      },
    ];

    const sanitized = panels.map(sanitizePanel);
    state.panels = sanitized;
    broadcast({ type: 'panels', panels: sanitized });

    const desc = sanitized.map((p, i) =>
      `${i}:${p.effect}/${(p.source || '?').replace(/\.(jpg|jpeg|png|mp4|webm)$/i, '').slice(0, 12)}`
    ).join(' ');
    console.log(`[autopilot] layout: ${desc} (live=${this.livePanel})`);
  },

  // --- Vibe: generates base state + drift config, broadcasts both ---

  pushVibe() {
    if (state.mode === 'manual') { this.stop(); return; }

    const e = this.energy;
    const baseState = this.generateBaseState(e);
    const drift = this.generateDrift(e);

    // Update server-side panel states — preserve each panel's opacity role
    for (const panel of state.panels) {
      const currentOpacity = panel.state ? panel.state.opacity : 0;
      panel.state = { ...panel.state, ...baseState, opacity: currentOpacity };
    }

    // Occasionally swap the cooking panel's effect for texture variety
    const cookingId = this.livePanel === 0 ? 1 : 0;
    if (Math.random() < 0.33) {
      const cookingPanel = state.panels.find(p => p.id === cookingId);
      if (cookingPanel) cookingPanel.effect = this.pickOverlayEffect();
    }

    // Broadcast updated panels (in-place update — no flash) and drift
    broadcast({ type: 'panels', panels: state.panels });
    broadcast({ type: 'drift', drift });

    const energyBar = '▓'.repeat(Math.round(e * 10)) + '░'.repeat(10 - Math.round(e * 10));
    autoCot(`vibe [${energyBar}] e=${e.toFixed(2)}`, 'thought');
  },

  // --- Source evolution via crossfade ---
  // The cooking panel has been running its feedback loop invisibly at opacity 0,
  // building up texture. Now we crossfade: bring it up, fade the live panel down.
  // Once done, the old live panel becomes the new cooking panel with a fresh source.

  evolveSource() {
    if (state.mode === 'manual') return;
    if (this.transitioning) return; // already mid-crossfade

    const liveId = this.livePanel;
    const cookingId = liveId === 0 ? 1 : 0;
    const live = state.panels.find(p => p.id === liveId);
    const cooking = state.panels.find(p => p.id === cookingId);
    if (!live || !cooking) return;

    this.transitioning = true;

    // Crossfade: bring cooking panel up to 1.0, fade live panel down to 0.0
    // The client's lerp system handles the smooth transition over ~3.3s
    cooking.state.opacity = 1.0;
    live.state.opacity = 0.0;
    broadcast({ type: 'panels', panels: state.panels });

    const oldSource = live.source;
    console.log(`[autopilot] crossfade: panel ${cookingId} fading in, panel ${liveId} fading out`);

    // After the crossfade completes (~5s to be safe), swap roles
    setTimeout(() => {
      this.livePanel = cookingId;
      this.transitioning = false;

      // The old live panel is now invisible — assign it a new source to cook
      const pool = this.getSourcePool();
      const available = pool.filter(f => f !== cooking.source);
      const newSource = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : pool[0] || null;

      live.source = newSource;
      live.reverse = true;
      live.effect = this.pickOverlayEffect();
      // Reset its state so it cooks fresh texture at opacity 0
      live.state = { ...this.generateBaseState(this.energy), opacity: 0.0 };

      this.anchorSource = cooking.source;
      broadcast({ type: 'panels', panels: state.panels });
      console.log(`[autopilot] roles swapped: live=${cookingId} cooking=${liveId} (${(newSource||'?').slice(0,15)})`);
    }, 5000);
  },

  // --- Generators ---

  generateBaseState(e) {
    return {
      intensity: 0.35 + e * 0.15,
      feedbackAmount: 0.65 + e * 0.15,
      rotation: (0.001 + e * 0.003) * (Math.random() > 0.5 ? 1 : -1),
      zoom: 1.0 + e * 0.001,
      colorShift: 0.02 + e * 0.1,     // always some color drift, more at high energy
      brightness: 1.05 + e * 0.1,     // above 1.0 = colors over-saturate in feedback loop
      sourceMix: 0.55 - e * 0.1,
      glitch: 0.02 + e * 0.08,        // always a little glitch, ramps with energy
      blend2: 0.25 + e * 0.15,
      blendMode: Math.floor(Math.random() * 4),
    };
  },

  generateDrift(e) {
    // Amplitude scales 0.5x-1.5x with energy
    const ampScale = 0.5 + e;
    // Frequencies are SLOW — full cycles over 60-200 seconds for gradual transformation
    const freqScale = 0.8 + e * 0.4;

    return {
      rotation:       { amp: 0.004 * ampScale, freq: 0.03 * freqScale, phase: Math.random() * Math.PI * 2 },
      zoom:           { amp: 0.002 * ampScale, freq: 0.02 * freqScale, phase: Math.random() * Math.PI * 2 },
      // feedbackAmount + sourceMix: moderate oscillation = image ↔ texture over ~60-90s
      feedbackAmount: { amp: 0.12 * ampScale,  freq: 0.015 * freqScale, phase: Math.random() * Math.PI * 2 },
      sourceMix:      { amp: 0.15 * ampScale,  freq: 0.012 * freqScale, phase: Math.random() * Math.PI * 2 },
      // colorShift: slow hue wander creates psychedelic color banding
      colorShift:     { amp: 0.08 * ampScale,  freq: 0.02 * freqScale, phase: Math.random() * Math.PI * 2 },
      blend2:         { amp: 0.12 * ampScale,  freq: 0.013 * freqScale, phase: Math.random() * Math.PI * 2 },
      // brightness oscillates above 1.0 — peaks push colors to clipping = oversaturation
      brightness:     { amp: 0.08 * ampScale,  freq: 0.018 * freqScale, phase: Math.random() * Math.PI * 2 },
      intensity:      { amp: 0.06 * ampScale,  freq: 0.016 * freqScale, phase: Math.random() * Math.PI * 2 },
      glitch:         { amp: 0.04 * ampScale,  freq: 0.035 * freqScale, phase: Math.random() * Math.PI * 2 },
    };
  },

  // Get the pool of sources to pick from — prefer textures, then videos, fall back to all
  getSourcePool() {
    const textures = getAssetsByCategory('textures');
    if (textures.length > 0) return textures;
    const videos = getAssetsByCategory('videos');
    if (videos.length > 0) return videos;
    return state.images;
  },

  pickOverlayEffect() {
    return ['feedback', 'feedback', 'noise', 'colorshift'][Math.floor(Math.random() * 4)];
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
