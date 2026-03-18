// Main Three.js engine — multi-panel render loop with per-panel feedback
window.VJ = window.VJ || {};

(function() {
  // --- Three.js setup ---
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
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
  const LERP_SPEED = 0.06; // ~0.5 second to reach target
  const LERPABLE_KEYS = ['intensity', 'feedbackAmount', 'rotation', 'zoom', 'colorShift', 'brightness', 'glitch', 'sourceMix', 'opacity', 'blend2'];

  function createPanel(id, rect, effect, source, opts) {
    const w = Math.max(1, Math.floor(window.innerWidth * rect.w));
    const h = Math.max(1, Math.floor(window.innerHeight * rect.h));
    const fadeIn = opts && opts.fadeIn;
    const panel = {
      id: id,
      rect: rect,             // { x, y, w, h } in 0-1 normalized coords
      targetRect: { ...rect }, // lerp target for rect (smooth resize/reposition)
      effect: effect || 'feedback',
      source: source || null,  // image/video name, "color:#hex", or null (= use current image)
      source2: (opts && opts.source2) || null, // second source for blending
      sourceIndex: -1,         // resolved index, -1 = use source string
      rtA: new THREE.WebGLRenderTarget(w, h, rtParams),
      rtB: new THREE.WebGLRenderTarget(w, h, rtParams),
      state: { ...DEFAULT_PANEL_STATE },
      targetState: null,       // when set, state lerps toward this each frame
      dying: false,            // marked for fade-out removal
    };
    if (fadeIn) {
      panel.state.opacity = 0;
      panel.targetState = { opacity: 1.0 };
    }
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
              panel.state[key] += diff * LERP_SPEED;
              done = false;
            } else {
              panel.state[key] = panel.targetState[key];
            }
          }
        }
        if (done) panel.targetState = null;
      }
      // Lerp rect (smooth panel resize/move)
      if (panel.targetRect) {
        for (const key of ['x', 'y', 'w', 'h']) {
          const diff = panel.targetRect[key] - panel.rect[key];
          if (Math.abs(diff) > 0.001) {
            panel.rect[key] += diff * LERP_SPEED;
          } else {
            panel.rect[key] = panel.targetRect[key];
          }
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
      // Named image/video — also ensure video is playing
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
    const p = panels[0];
    if (msg.currentEffect && p) p.effect = msg.currentEffect;
    if (p && p.state) {
      if (msg.intensity !== undefined) p.state.intensity = msg.intensity;
      if (msg.feedbackAmount !== undefined) p.state.feedbackAmount = msg.feedbackAmount;
      if (msg.rotation !== undefined) p.state.rotation = msg.rotation;
      if (msg.zoom !== undefined) p.state.zoom = msg.zoom;
      if (msg.colorShift !== undefined) p.state.colorShift = msg.colorShift;
    }
    if (msg.images) VJ.images.setImageList(msg.images);
    if (msg.currentImageIndex !== undefined) VJ.images.setCurrentIndex(msg.currentImageIndex);
    if (msg.mode) state.mode = msg.mode;
    // Apply panels if sent
    if (msg.panels) applyPanelConfig(msg.panels);
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

  function applyPanelConfig(configs) {
    // Build a map of existing panels by ID for reuse (skip dying panels)
    const oldById = {};
    panels.forEach(p => { if (!p.dying) oldById[p.id] = p; });

    const newPanels = configs.map((cfg, i) => {
      const id = cfg.id !== undefined ? cfg.id : i;
      const existing = oldById[id];

      if (existing) {
        // Panel with this ID already exists — lerp to new values instead of recreating.
        // This preserves the feedback buffer (no visual reset) and smoothly transitions.
        delete oldById[id]; // mark as reused

        // Update source + effect immediately (can't lerp these)
        if (cfg.effect) existing.effect = cfg.effect;
        if (cfg.source !== undefined) existing.source = cfg.source;
        if (cfg.source2 !== undefined) existing.source2 = cfg.source2;
        if (cfg.sourceIndex !== undefined) existing.sourceIndex = cfg.sourceIndex;

        // Set lerp targets for rect and state
        if (cfg.rect) existing.targetRect = { ...cfg.rect };
        if (cfg.state) existing.targetState = { ...cfg.state };

        return existing;
      }

      // New panel — create fresh with fade-in
      const p = createPanel(
        id,
        cfg.rect || { x: 0, y: 0, w: 1, h: 1 },
        cfg.effect,
        cfg.source,
        { fadeIn: true, source2: cfg.source2 }
      );
      if (cfg.sourceIndex !== undefined) p.sourceIndex = cfg.sourceIndex;
      if (cfg.state) {
        Object.assign(p.state, cfg.state);
        // Keep opacity at 0 for fade-in even if state specifies otherwise
        p.state.opacity = 0;
        p.targetState = { ...cfg.state, opacity: 1.0 };
      }
      return p;
    });

    // Fade out removed panels instead of instant destroy
    Object.values(oldById).forEach(p => {
      p.dying = true;
      p.targetState = { opacity: 0 };
    });

    // Keep dying panels in the list so they continue rendering during fade-out
    const dyingPanels = panels.filter(p => p.dying);
    panels = [...newPanels, ...dyingPanels];
    activePanel = Math.min(activePanel, newPanels.length - 1);
    console.log('[engine] panels updated:', newPanels.length, 'active +', dyingPanels.length, 'fading out');
  }

  // --- Keyboard controls ---
  // All param changes target the active panel. Global stuff (flash, blackout, mode) is shared.
  document.addEventListener('keydown', (e) => {
    ensureAudio();
    const key = e.key;
    const p = ap();
    const ps = p.state;

    // 0: cycle active panel
    if (key === '0') {
      activePanel = (activePanel + 1) % panels.length;
      console.log('[engine] active panel:', activePanel);
      return;
    }

    // 1-9: switch effect on active panel
    if (key >= '1' && key <= '9') {
      const names = VJ.effects.getEffectNames();
      const idx = parseInt(key) - 1;
      if (idx < names.length) p.effect = names[idx];
      return;
    }

    switch (key) {
      case ' ':
        e.preventDefault();
        VJ.audio.triggerBeat();
        break;

      case 'q': VJ.images.selectSlot(0); break;
      case 'w': VJ.images.selectSlot(1); break;
      case 'e': VJ.images.selectSlot(2); break;
      case 'r': VJ.images.selectSlot(3); break;

      case '=': case '+':
        ps.feedbackAmount = Math.min(0.99, ps.feedbackAmount + 0.02); break;
      case '-':
        ps.feedbackAmount = Math.max(0.0, ps.feedbackAmount - 0.02); break;

      case '[': ps.intensity = Math.max(0, ps.intensity - 0.05); break;
      case ']': ps.intensity = Math.min(1, ps.intensity + 0.05); break;

      case 'a': Object.assign(ps, COLOR_PRESETS.warm); break;
      case 's': Object.assign(ps, COLOR_PRESETS.cold); break;
      case 'd': Object.assign(ps, COLOR_PRESETS.neon); break;
      case 'f': Object.assign(ps, COLOR_PRESETS.void); break;

      case 'Tab':
        e.preventDefault();
        const modes = ['manual', 'autonomous', 'copilot'];
        const mIdx = modes.indexOf(state.mode);
        state.mode = modes[(mIdx + 1) % modes.length];
        break;

      case 'Escape': state.blackout = !state.blackout; break;
      case 'b': state.flash = 1.0; break;

      case 'c':
        VJ.camera.toggle();
        break;

      case 'h': state.hudVisible = !state.hudVisible; break;

      case 'ArrowLeft': ps.rotation -= 0.001; break;
      case 'ArrowRight': ps.rotation += 0.001; break;
      case 'ArrowUp': ps.zoom += 0.001; break;
      case 'ArrowDown': ps.zoom = Math.max(0.99, ps.zoom - 0.001); break;
    }
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

  // --- Autonomous behavior (targets active panel) ---
  let autoTimer = 0, autoImageTimer = 0, autoEffectTimer = 0;
  let driftTarget = { rotation: 0.002, zoom: 1.002, colorShift: 0 };

  function autonomousTick(dt) {
    if (state.mode === 'manual') return;
    const ps = ap().state;
    const beat = VJ.audio.getBeat();
    const overall = VJ.audio.getOverall();
    const high = VJ.audio.getHigh();
    autoTimer += dt;

    if (beat > 0.8 && state.flash < 0.1) state.flash = 0.6 + beat * 0.4;

    if (state.mode === 'autonomous') {
      if (autoTimer > 3.0) {
        autoTimer = 0;
        driftTarget.rotation = ps.rotation + (Math.random() - 0.5) * 0.004 * (1 + overall);
        driftTarget.zoom = 1.0 + Math.random() * 0.008;
        driftTarget.colorShift = ps.colorShift + (Math.random() - 0.5) * 0.1 * high;
      }
      ps.rotation += (driftTarget.rotation - ps.rotation) * 0.02;
      ps.zoom += (driftTarget.zoom - ps.zoom) * 0.02;
      ps.colorShift += (driftTarget.colorShift - ps.colorShift) * 0.02;
      ps.feedbackAmount += (Math.min(0.95, 0.7 + overall * 0.25) - ps.feedbackAmount) * 0.05;
      ps.intensity += (Math.min(0.9, 0.3 + (high + VJ.audio.getMid()) * 0.3) - ps.intensity) * 0.05;

      if (beat > 0.9) ps.glitch = 0.3;
      else ps.glitch = (ps.glitch || 0) * 0.92;

      autoImageTimer += dt;
      if (autoImageTimer > 8.0 && overall > 0.4) { autoImageTimer = 0; VJ.images.nextImage(); }
      autoEffectTimer += dt;
      if (autoEffectTimer > 20.0 + Math.random() * 10) {
        autoEffectTimer = 0;
        const names = VJ.effects.getEffectNames();
        ap().effect = names[Math.floor(Math.random() * names.length)];
      }
    }

    if (state.mode === 'copilot') {
      if (autoTimer > 5.0) {
        autoTimer = 0;
        driftTarget.rotation = ps.rotation + (Math.random() - 0.5) * 0.002;
        driftTarget.zoom = 1.0 + Math.random() * 0.004;
      }
      ps.rotation += (driftTarget.rotation - ps.rotation) * 0.01;
      ps.zoom += (driftTarget.zoom - ps.zoom) * 0.01;
    }
  }

  // --- Render loop ---
  let time = 0;
  let lastFrameTime = performance.now();

  function render() {
    requestAnimationFrame(render);
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    time += dt;

    VJ.audio.update();
    reportAudio(now);
    autonomousTick(dt);
    lerpPanels();

    // Flash decay (global)
    state.flash *= 0.85;
    if (state.flash < 0.01) state.flash = 0;

    // --- Per-panel effect passes ---
    // Each panel reads from its rtA, applies its effect, writes to rtB, then swaps.
    for (const panel of panels) {
      const source = getPanelSourceTexture(panel) || blackTexture;
      const source2 = getPanelSourceTexture2(panel) || blackTexture;
      const effectMat = VJ.effects.getMaterialByName(panel.effect);

      VJ.effects.updateUniformsOn(effectMat, {
        time: time,
        intensity: panel.state.intensity,
        feedback: panel.state.feedbackAmount,
        rotation: panel.state.rotation,
        zoom: panel.state.zoom,
        brightness: panel.state.brightness || 1.05,
        glitch: panel.state.glitch || 0.0,
        colorShift: panel.state.colorShift,
        beat: VJ.audio.getBeat(),
        sourceMix: panel.state.sourceMix || 0.5,
        prevTexture: panel.rtA.texture,
        sourceTexture: source,
        sourceTexture2: source2,
        blend2: panel.state.blend2 || 0.0,
        blendMode: panel.state.blendMode || 0,
        resolution: new THREE.Vector2(panel.rtA.width, panel.rtA.height),
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
      compositeMaterial.uniforms.uBrightness.value = panel.state.brightness || 1.05;
      compositeMaterial.uniforms.uFlash.value = state.flash;
      compositeMaterial.uniforms.uBlackout.value = state.blackout ? 1.0 : 0.0;
      compositeMaterial.uniforms.uOpacity.value = panel.state.opacity !== undefined ? panel.state.opacity : 1.0;
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
