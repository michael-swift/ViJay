// Main Three.js engine — multi-panel render loop with per-panel feedback
window.VJ = window.VJ || {};

(function() {
  // --- Three.js setup ---
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.autoClear = false; // we manage clearing ourselves for multi-panel
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(quadGeo, null);
  scene.add(quad);

  const rtParams = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  };

  // Composite material (used per-panel in final pass)
  const compositeMaterial = new THREE.ShaderMaterial({
    vertexShader: SHADER_COMPOSITE.vertexShader,
    fragmentShader: SHADER_COMPOSITE.fragmentShader,
    uniforms: {
      tInput: { value: null },
      uBrightness: { value: 1.05 },
      uFlash: { value: 0.0 },
      uBlackout: { value: 0.0 },
      uOpacity: { value: 1.0 },
      uResolution: { value: new THREE.Vector2() },
    },
    depthTest: false,
    depthWrite: false,
  });

  // 1x1 black texture fallback
  const blackTexture = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat
  );
  blackTexture.needsUpdate = true;

  // --- Color textures for solid-color panel sources ---
  // When a panel's source is "color:#rrggbb", we create a tiny solid texture.
  const colorTextures = {};
  function getColorTexture(hex) {
    if (colorTextures[hex]) return colorTextures[hex];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const tex = new THREE.DataTexture(
      new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat
    );
    tex.needsUpdate = true;
    colorTextures[hex] = tex;
    return tex;
  }

  // --- Texture loader ---
  const loader = new THREE.TextureLoader();
  VJ.images.init(loader);

  // --- Panel system ---
  // Each panel has its own screen region, source, effect, feedback buffers, and params.
  // Default: one fullscreen panel.
  const DEFAULT_PANEL_STATE = {
    intensity: 0.5,
    feedbackAmount: 0.85,
    rotation: 0.002,
    zoom: 1.002,
    colorShift: 0.0,
    brightness: 1.05,
    glitch: 0.0,
    sourceMix: 0.5,
    opacity: 1.0,
    blend2: 0.0,
    blendMode: 0,
  };

  // Transition system: panels lerp from current to target values each frame.
  // LERP_SPEED controls how fast transitions are (higher = faster, 1.0 = instant).
  const LERP_SPEED = 0.025; // smooth transitions for effect params
  const OPACITY_FADE_PER_FRAME = 0.005; // linear opacity fade (~200 frames ≈ 3.3s)
  const LERPABLE_KEYS = ['intensity', 'feedbackAmount', 'rotation', 'zoom', 'colorShift', 'brightness', 'glitch', 'sourceMix', 'opacity', 'blend2'];
  // Keys that the drift engine oscillates around — everything lerpable except opacity and blendMode
  const DRIFTABLE_KEYS = ['intensity', 'feedbackAmount', 'rotation', 'zoom', 'colorShift', 'brightness', 'glitch', 'sourceMix', 'blend2'];

  // --- Drift engine ---
  // Drift config received from the server. Each key maps to { amp, freq, phase }.
  // The drift engine adds sine-wave offsets to panel.state to produce panel.renderState each frame.
  // This means panel.state stays clean for lerp/keyboard, and drift oscillates around it.
  let driftConfig = null;

  function applyDrift(time) {
    for (let pi = 0; pi < panels.length; pi++) {
      const panel = panels[pi];
      // Always start renderState from current (lerped) state
      if (!panel.renderState) panel.renderState = { ...panel.state };

      if (!driftConfig) {
        // No drift — renderState = state
        Object.assign(panel.renderState, panel.state);
        continue;
      }

      // Copy all state first (including non-driftable keys like opacity, blendMode)
      Object.assign(panel.renderState, panel.state);

      // Apply sine offsets per driftable key
      for (const key of DRIFTABLE_KEYS) {
        const cfg = driftConfig[key];
        if (!cfg) continue;
        const base = panel.state[key];
        if (base === undefined) continue;
        // Golden ratio phase offset per panel gives visual counterpoint
        const offset = cfg.amp * Math.sin(time * cfg.freq * 2 * Math.PI + cfg.phase + pi * 1.618);
        let val = base + offset;
        // Clamp to sane ranges
        if (key === 'feedbackAmount') val = Math.max(0, Math.min(0.99, val));
        else if (key === 'intensity') val = Math.max(0, Math.min(1, val));
        else if (key === 'brightness') val = Math.max(0, Math.min(2, val));
        else if (key === 'glitch') val = Math.max(0, Math.min(1, val));
        else if (key === 'sourceMix') val = Math.max(0, Math.min(1, val));
        else if (key === 'blend2') val = Math.max(0, Math.min(1, val));
        else if (key === 'colorShift') val = Math.max(0, Math.min(1, val));
        panel.renderState[key] = val;
      }
    }
  }

  function createPanel(id, rect, effect, source, opts) {
    const w = Math.max(1, Math.min(960, Math.floor(window.innerWidth * rect.w)));
    const h = Math.max(1, Math.min(540, Math.floor(window.innerHeight * rect.h)));
    const panel = {
      id: id,
      rect: { ...rect },
      effect: effect || 'feedback',
      source: source || null,
      source2: (opts && opts.source2) || null,
      sourceIndex: -1,
      rtA: new THREE.WebGLRenderTarget(w, h, rtParams),
      rtB: new THREE.WebGLRenderTarget(w, h, rtParams),
      state: { ...DEFAULT_PANEL_STATE, opacity: 0 },
      renderState: { ...DEFAULT_PANEL_STATE, opacity: 0 },
      targetState: { opacity: 1.0 },
      dying: false,
    };
    return panel;
  }

  // Lerp panel state + rect toward targets each frame
  function lerpPanels() {
    for (const panel of panels) {
      // Lerp state params
      if (panel.targetState) {
        let done = true;
        for (const key of LERPABLE_KEYS) {
          if (panel.targetState[key] !== undefined) {
            const diff = panel.targetState[key] - panel.state[key];
            if (Math.abs(diff) > 0.0001) {
              if (key === 'opacity') {
                panel.state[key] += (diff > 0 ? 1 : -1) * OPACITY_FADE_PER_FRAME;
                if (diff > 0 && panel.state[key] > panel.targetState[key]) panel.state[key] = panel.targetState[key];
                if (diff < 0 && panel.state[key] < panel.targetState[key]) panel.state[key] = panel.targetState[key];
              } else {
                panel.state[key] += diff * LERP_SPEED;
              }
              done = false;
            } else {
              panel.state[key] = panel.targetState[key];
            }
          }
        }
        if (done) {
          if (panel.targetState.blend2 !== undefined && panel.targetState.blend2 === 0) {
            panel.source2 = null;
          }
          panel.targetState = null;
        }
      }

    }

    // Remove fully faded-out dying panels
    const before = panels.length;
    panels = panels.filter(p => {
      if (p.dying && p.state.opacity < 0.01) {
        destroyPanel(p);
        return false;
      }
      return true;
    });
    if (panels.length < before) {
      activePanel = Math.min(activePanel, panels.length - 1);
    }
  }

  function destroyPanel(panel) {
    panel.rtA.dispose();
    panel.rtB.dispose();
  }

  // Start with one fullscreen panel
  let panels = [createPanel(0, { x: 0, y: 0, w: 1, h: 1 })];
  let activePanel = 0; // which panel keyboard controls target

  // Resolve a panel's source to a texture
  function getPanelSourceTexture(panel) {
    // Explicit source string
    if (panel.source) {
      // Solid color: "color:#ff0000"
      if (panel.source.startsWith('color:')) {
        return getColorTexture(panel.source.slice(6));
      }
      // Named image/video — set reverse mode and ensure playing
      VJ.images.setReverse(panel.source, !!panel.reverse);
      VJ.images.ensurePlaying(panel.source);
      const idx = VJ.images.getIndexByName(panel.source);
      if (idx >= 0) return VJ.images.getTextureByIndex(idx);
    }
    // sourceIndex
    if (panel.sourceIndex >= 0) {
      return VJ.images.getTextureByIndex(panel.sourceIndex);
    }
    // Fallback to the global current image
    return VJ.images.getCurrentTexture();
  }

  // Resolve a panel's second source to a texture (for two-source blending)
  function getPanelSourceTexture2(panel) {
    if (!panel.source2) return null;
    if (panel.source2.startsWith('color:')) {
      return getColorTexture(panel.source2.slice(6));
    }
    VJ.images.ensurePlaying(panel.source2);
    const idx = VJ.images.getIndexByName(panel.source2);
    if (idx >= 0) return VJ.images.getTextureByIndex(idx);
    return null;
  }

  // --- Global state (flash, blackout, mode, HUD — shared across panels) ---
  let state = {
    mode: 'manual',
    blackout: false,
    flash: 0,
    hudVisible: true,
  };

  const COLOR_PRESETS = {
    warm: { colorShift: 0.05, glitch: 0.0, brightness: 1.1 },
    cold: { colorShift: 0.55, glitch: 0.0, brightness: 0.95 },
    neon: { colorShift: 0.33, glitch: 0.15, brightness: 1.2 },
    void: { colorShift: 0.0, glitch: 0.0, brightness: 0.6 },
  };

  let frameCount = 0, lastFpsTime = performance.now(), fps = 0;

  // --- Init ---
  VJ.effects.init();
  let audioInited = false;
  function ensureAudio() {
    if (!audioInited) { VJ.audio.init(); audioInited = true; }
  }
  VJ.camera.init();

  // --- Helper: get the active panel ---
  function ap() { return panels[activePanel] || panels[0]; }

  // --- WebSocket handlers ---
  // These target panel 0 for backward compat with the existing API.
  VJ.connection.on('state', (msg) => {
    // Full state hydration on connect — sync everything from server
    if (msg.images) VJ.images.setImageList(msg.images);
    if (msg.currentImageIndex !== undefined) VJ.images.setCurrentIndex(msg.currentImageIndex);
    if (msg.mode) state.mode = msg.mode;
    if (msg.flash !== undefined) state.flash = msg.flash;
    if (msg.blackout !== undefined) state.blackout = msg.blackout;
    if (msg.activePanel !== undefined) activePanel = msg.activePanel;
    // Apply panels if sent (full layout from server)
    if (msg.panels) applyPanelConfig(msg.panels);
    // Legacy single-panel state (for backward compat with old server state)
    const p = panels[0];
    if (msg.currentEffect && p) p.effect = msg.currentEffect;
    if (p && p.state) {
      if (msg.intensity !== undefined) p.state.intensity = msg.intensity;
      if (msg.feedbackAmount !== undefined) p.state.feedbackAmount = msg.feedbackAmount;
      if (msg.rotation !== undefined) p.state.rotation = msg.rotation;
      if (msg.zoom !== undefined) p.state.zoom = msg.zoom;
      if (msg.colorShift !== undefined) p.state.colorShift = msg.colorShift;
    }
  });

  VJ.connection.on('effect', (msg) => {
    const p = panels[0];
    if (!p) return;
    if (msg.currentEffect) p.effect = msg.currentEffect;
    if (msg.intensity !== undefined) p.state.intensity = msg.intensity;
    if (msg.feedbackAmount !== undefined) p.state.feedbackAmount = msg.feedbackAmount;
    if (msg.rotation !== undefined) p.state.rotation = msg.rotation;
    if (msg.zoom !== undefined) p.state.zoom = msg.zoom;
    if (msg.colorShift !== undefined) p.state.colorShift = msg.colorShift;
  });

  VJ.connection.on('image', (msg) => {
    if (msg.images) VJ.images.setImageList(msg.images);
    if (msg.currentImageIndex !== undefined) VJ.images.setCurrentIndex(msg.currentImageIndex);
  });

  VJ.connection.on('images', (msg) => {
    if (msg.images) VJ.images.setImageList(msg.images);
  });

  VJ.connection.on('imageChanged', (msg) => {
    if (msg.filename) VJ.images.reloadTexture(msg.filename);
  });

  VJ.connection.on('transition', (msg) => {
    const p = panels[0];
    if (!p) return;
    if (msg.currentEffect) p.effect = msg.currentEffect;
    if (msg.intensity !== undefined) p.state.intensity = msg.intensity;
    if (msg.feedbackAmount !== undefined) p.state.feedbackAmount = msg.feedbackAmount;
    if (msg.rotation !== undefined) p.state.rotation = msg.rotation;
    if (msg.zoom !== undefined) p.state.zoom = msg.zoom;
    if (msg.colorShift !== undefined) p.state.colorShift = msg.colorShift;
  });

  VJ.connection.on('mode', (msg) => {
    if (msg.mode) state.mode = msg.mode;
  });

  // Panel config from server
  VJ.connection.on('panels', (msg) => {
    if (msg.panels) applyPanelConfig(msg.panels);
  });

  // Drift config from server — sets the sine-wave oscillation parameters
  VJ.connection.on('drift', (msg) => {
    if (msg.drift) {
      driftConfig = msg.drift;
      console.log('[engine] drift config received:', Object.keys(msg.drift).join(', '));
    } else {
      driftConfig = null;
      console.log('[engine] drift cleared');
    }
  });

  function applyPanelConfig(configs) {
    // Build a map of incoming panel IDs
    const incomingIds = new Set(configs.map((cfg, i) => cfg.id !== undefined ? cfg.id : i));
    // Build a map of existing non-dying panels by ID
    const existingById = {};
    for (const p of panels) {
      if (!p.dying) existingById[p.id] = p;
    }

    const updatedPanels = [];
    const existingIdsUsed = new Set();

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      const id = cfg.id !== undefined ? cfg.id : i;
      const existing = existingById[id];

      if (existing) {
        // --- In-place update: preserve feedback buffers (rtA/rtB) ---
        existingIdsUsed.add(id);
        if (cfg.source !== undefined) existing.source = cfg.source;
        if (cfg.source2 !== undefined) existing.source2 = cfg.source2;
        if (cfg.effect) existing.effect = cfg.effect;
        if (cfg.sourceIndex !== undefined) existing.sourceIndex = cfg.sourceIndex;
        if (cfg.reverse !== undefined) existing.reverse = cfg.reverse;
        if (cfg.rect) Object.assign(existing.rect, cfg.rect);
        // Set target state — lerp system will smoothly transition
        if (cfg.state) {
          existing.targetState = { ...cfg.state, opacity: cfg.state.opacity !== undefined ? cfg.state.opacity : 1.0 };
        }
        updatedPanels.push(existing);
        // console.log(`[engine] panel ${id} updated in-place`);
      } else {
        // --- New panel: create with fade-in ---
        const p = createPanel(
          id,
          cfg.rect || { x: 0, y: 0, w: 1, h: 1 },
          cfg.effect,
          cfg.source,
          { fadeIn: true, source2: cfg.source2 }
        );
        if (cfg.sourceIndex !== undefined) p.sourceIndex = cfg.sourceIndex;
        if (cfg.reverse !== undefined) p.reverse = cfg.reverse;
        if (cfg.state) {
          Object.assign(p.state, cfg.state);
          p.state.opacity = 0;
          p.targetState = { ...cfg.state, opacity: 1.0 };
        }
        updatedPanels.push(p);
        console.log(`[engine] panel ${id} created (fade-in)`);
      }
    }

    // Mark panels whose IDs are no longer in the incoming config as dying (fade out)
    for (const p of panels) {
      if (!p.dying && !incomingIds.has(p.id)) {
        p.dying = true;
        p.targetState = { opacity: 0 };
      }
    }

    // Combine: updated panels first, then any dying panels still fading out
    const dyingPanels = panels.filter(p => p.dying);
    panels = [...updatedPanels, ...dyingPanels];
    activePanel = Math.min(activePanel, updatedPanels.length - 1);

    const newCount = updatedPanels.filter(p => !existingById[p.id]).length;
    const reuseCount = updatedPanels.length - newCount;
    if (newCount > 0 || dyingPanels.length > 0) {
      console.log(`[engine] panel config: ${reuseCount} reused, ${newCount} new, ${dyingPanels.length} dying`);
    }
  }

  // --- Keyboard controls ---
  // All changes go through the server so state stays in sync.
  // We apply locally too for instant visual feedback (optimistic update).
  function serverPost(path, body) {
    fetch(path, {
      method: path.includes('PATCH') ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(err => console.error('[engine] server sync failed:', err));
  }
  function serverPatch(path, body) {
    fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(err => console.error('[engine] server sync failed:', err));
  }

  // Debounce panel state updates to avoid flooding the server
  let panelSyncTimer = null;
  function syncPanelState(panel) {
    if (panelSyncTimer) clearTimeout(panelSyncTimer);
    panelSyncTimer = setTimeout(() => {
      serverPatch(`/api/panel/${panel.id}`, {
        effect: panel.effect,
        state: panel.state,
      });
      panelSyncTimer = null;
    }, 50);
  }

  document.addEventListener('keydown', (e) => {
    ensureAudio();
    const key = e.key;
    const p = ap();
    const ps = p.state;

    // 0: cycle active panel
    if (key === '0') {
      serverPost('/api/active-panel', {});
      activePanel = (activePanel + 1) % panels.length; // optimistic
      console.log('[engine] active panel:', activePanel);
      return;
    }

    // 1-9: switch effect on active panel
    if (key >= '1' && key <= '9') {
      const names = VJ.effects.getEffectNames();
      const idx = parseInt(key) - 1;
      if (idx < names.length) {
        p.effect = names[idx]; // optimistic
        serverPatch(`/api/panel/${p.id}`, { effect: names[idx] });
      }
      return;
    }

    switch (key) {
      case ' ':
        e.preventDefault();
        VJ.audio.triggerBeat();
        break;

      case 'q': VJ.images.selectSlot(0); serverPost('/api/image', { index: VJ.images.getSlotIndex(0) }); break;
      case 'w': VJ.images.selectSlot(1); serverPost('/api/image', { index: VJ.images.getSlotIndex(1) }); break;
      case 'e': VJ.images.selectSlot(2); serverPost('/api/image', { index: VJ.images.getSlotIndex(2) }); break;
      case 'r': VJ.images.selectSlot(3); serverPost('/api/image', { index: VJ.images.getSlotIndex(3) }); break;

      case '=': case '+':
        ps.feedbackAmount = Math.min(0.99, ps.feedbackAmount + 0.02);
        syncPanelState(p); break;
      case '-':
        ps.feedbackAmount = Math.max(0.0, ps.feedbackAmount - 0.02);
        syncPanelState(p); break;

      case '[': ps.intensity = Math.max(0, ps.intensity - 0.05); syncPanelState(p); break;
      case ']': ps.intensity = Math.min(1, ps.intensity + 0.05); syncPanelState(p); break;

      case 'a': Object.assign(ps, COLOR_PRESETS.warm); syncPanelState(p); break;
      case 's': Object.assign(ps, COLOR_PRESETS.cold); syncPanelState(p); break;
      case 'd': Object.assign(ps, COLOR_PRESETS.neon); syncPanelState(p); break;
      case 'f': Object.assign(ps, COLOR_PRESETS.void); syncPanelState(p); break;

      case 'Tab':
        e.preventDefault();
        const modes = ['manual', 'autonomous', 'copilot'];
        const mIdx = modes.indexOf(state.mode);
        const newMode = modes[(mIdx + 1) % modes.length];
        state.mode = newMode; // optimistic
        serverPost('/api/mode', { mode: newMode });
        break;

      case 'Escape':
        serverPost('/api/blackout', { enabled: !state.blackout });
        state.blackout = !state.blackout; // optimistic
        break;
      case 'b':
        state.flash = 1.0; // optimistic
        serverPost('/api/flash', {});
        break;

      // Camera not yet wired to panel render path — C key reserved for future use

      case 'g':
        // Quick-save current scene
        fetch('/api/cues/scene/save-current', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).then(r => r.json()).then(d => {
          if (d.ok) console.log('[engine] scene saved:', d.scene.name);
        }).catch(err => console.error('[engine] save failed:', err));
        break;

      case 'h': state.hudVisible = !state.hudVisible; break;

      case 'ArrowLeft': ps.rotation -= 0.001; syncPanelState(p); break;
      case 'ArrowRight': ps.rotation += 0.001; syncPanelState(p); break;
      case 'ArrowUp': ps.zoom += 0.001; syncPanelState(p); break;
      case 'ArrowDown': ps.zoom = Math.max(0.99, ps.zoom - 0.001); syncPanelState(p); break;
    }
  });

  // Handle server-broadcast state for flash/blackout/activePanel
  VJ.connection.on('flash', (msg) => {
    state.flash = msg.flash || 1.0;
  });
  VJ.connection.on('blackout', (msg) => {
    state.blackout = msg.blackout;
  });
  VJ.connection.on('activePanel', (msg) => {
    activePanel = msg.activePanel;
  });

  // --- Resize ---
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    // Resize each panel's render targets proportionally
    panels.forEach(p => {
      const pw = Math.max(1, Math.floor(w * p.rect.w));
      const ph = Math.max(1, Math.floor(h * p.rect.h));
      p.rtA.setSize(pw, ph);
      p.rtB.setSize(pw, ph);
    });
  });

  // --- HUD ---
  const hud = document.getElementById('hud');
  const hudEls = {
    effect: document.getElementById('hud-effect'),
    intensity: document.getElementById('hud-intensity'),
    feedback: document.getElementById('hud-feedback'),
    image: document.getElementById('hud-image'),
    image2: document.getElementById('hud-image2'),
    blend: document.getElementById('hud-blend'),
    mode: document.getElementById('hud-mode'),
    camera: document.getElementById('hud-camera'),
    fps: document.getElementById('hud-fps'),
  };

  function updateHUD() {
    const p = ap();
    hud.className = state.hudVisible ? 'visible' : '';
    hudEls.effect.textContent = p.effect;
    hudEls.intensity.textContent = p.state.intensity.toFixed(2);
    hudEls.feedback.textContent = p.state.feedbackAmount.toFixed(2);
    hudEls.image.textContent = p.source || VJ.images.getCurrentName();
    hudEls.image2.textContent = panels.length > 1 ? `panel ${activePanel}/${panels.length}` : '-';
    hudEls.blend.textContent = panels.length > 1 ? panels.map((p, i) => `${i}:${p.effect.slice(0,3)}`).join(' ') : '-';
    hudEls.mode.textContent = state.mode;
    hudEls.camera.textContent = VJ.camera.isEnabled() ? 'on' : 'off';
    hudEls.fps.textContent = fps;
  }

  // --- Audio reporting ---
  let lastAudioReport = 0;
  function reportAudio(now) {
    if (!VJ.audio.isActive()) return;
    if (now - lastAudioReport < 200) return;
    lastAudioReport = now;
    VJ.connection.send({
      type: 'audio',
      bass: VJ.audio.getBass(),
      mid: VJ.audio.getMid(),
      high: VJ.audio.getHigh(),
      overall: VJ.audio.getOverall(),
      beat: VJ.audio.getBeat(),
    });
  }

  // (Autonomous behavior removed — server-side autopilot handles this via /api/autopilot)

  // --- Render loop ---
  const _resVec = new THREE.Vector2(); // reusable to avoid GC pressure
  let time = 0;
  let lastFrameTime = performance.now();

  function render() {
    requestAnimationFrame(render);
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    time += dt;

    VJ.audio.update();
    VJ.images.tick(dt);
    reportAudio(now);
    lerpPanels();
    applyDrift(time);

    // Flash decay (global)
    state.flash *= 0.85;
    if (state.flash < 0.01) state.flash = 0;

    // --- Per-panel effect passes ---
    // Each panel reads from its rtA, applies its effect, writes to rtB, then swaps.
    for (const panel of panels) {
      const source = getPanelSourceTexture(panel) || blackTexture;
      const source2 = getPanelSourceTexture2(panel) || blackTexture;
      const effectMat = VJ.effects.getMaterialByName(panel.effect);

      const rs = panel.renderState || panel.state;
      VJ.effects.updateUniformsOn(effectMat, {
        time: time,
        intensity: rs.intensity,
        feedback: rs.feedbackAmount,
        rotation: rs.rotation,
        zoom: rs.zoom,
        brightness: rs.brightness ?? 1.05,
        glitch: rs.glitch ?? 0.0,
        colorShift: rs.colorShift,
        beat: VJ.audio.getBeat(),
        sourceMix: rs.sourceMix ?? 0.5,
        prevTexture: panel.rtA.texture,
        sourceTexture: source,
        sourceTexture2: source2,
        blend2: rs.blend2 ?? 0.0,
        blendMode: rs.blendMode ?? 0,
        resolution: _resVec.set(panel.rtA.width, panel.rtA.height),
      });

      quad.material = effectMat;
      renderer.setRenderTarget(panel.rtB);
      renderer.render(scene, camera);

      // Swap ping-pong
      const tmp = panel.rtA;
      panel.rtA = panel.rtB;
      panel.rtB = tmp;
    }

    // --- Composite: draw each panel to its screen region ---
    renderer.setRenderTarget(null);
    renderer.clear();

    const W = window.innerWidth;
    const H = window.innerHeight;

    for (const panel of panels) {
      const r = panel.rect;
      // Convert normalized rect to pixel coords.
      // Three.js viewport origin is bottom-left, so flip Y.
      const px = Math.floor(r.x * W);
      const py = Math.floor((1 - r.y - r.h) * H); // flip Y
      const pw = Math.floor(r.w * W);
      const ph = Math.floor(r.h * H);

      renderer.setViewport(px, py, pw, ph);
      renderer.setScissor(px, py, pw, ph);
      renderer.setScissorTest(true);

      compositeMaterial.uniforms.tInput.value = panel.rtA.texture;
      // Brightness is already applied in the effect shader — composite pass stays neutral
      compositeMaterial.uniforms.uBrightness.value = 1.0;
      compositeMaterial.uniforms.uFlash.value = state.flash;
      compositeMaterial.uniforms.uBlackout.value = state.blackout ? 1.0 : 0.0;
      compositeMaterial.uniforms.uOpacity.value = crs.opacity !== undefined ? crs.opacity : 1.0;
      compositeMaterial.uniforms.uResolution.value.set(pw, ph);

      quad.material = compositeMaterial;
      renderer.render(scene, camera);
    }

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);

    // --- FPS counter ---
    frameCount++;
    if (now - lastFpsTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      lastFpsTime = now;
      updateHUD();
    }
  }

  // Expose panel API for console debugging
  VJ.panels = {
    get: () => panels,
    set: applyPanelConfig,
    active: () => activePanel,
  };

  console.log('[engine] starting render loop (multi-panel)');
  render();
})();
