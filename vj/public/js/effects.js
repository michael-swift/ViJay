// Effect chain manager — manages shader materials and switching
window.VJ = window.VJ || {};

VJ.effects = (function() {
  // All registered shader definitions
  const shaderDefs = {};
  let currentEffect = 'feedback';
  let materials = {};

  // Common uniforms shared by all effect shaders
  function makeUniforms() {
    return {
      tPrev: { value: null },
      tSource: { value: null },
      uTime: { value: 0 },
      uIntensity: { value: 0.5 },
      uFeedback: { value: 0.85 },
      uRotation: { value: 0.002 },
      uZoom: { value: 1.002 },
      uBrightness: { value: 1.05 },
      uGlitch: { value: 0.0 },
      uColorShift: { value: 0.0 },
      uBeat: { value: 0.0 },
      uSourceMix: { value: 0.5 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    };
  }

  function register(shaderDef) {
    shaderDefs[shaderDef.name] = shaderDef;
    materials[shaderDef.name] = new THREE.ShaderMaterial({
      vertexShader: shaderDef.vertexShader,
      fragmentShader: shaderDef.fragmentShader,
      uniforms: makeUniforms(),
      depthTest: false,
      depthWrite: false,
    });
  }

  function init() {
    // Register all shaders from globals
    if (window.SHADER_FEEDBACK) register(window.SHADER_FEEDBACK);
    if (window.SHADER_GLITCH) register(window.SHADER_GLITCH);
    if (window.SHADER_KALEIDOSCOPE) register(window.SHADER_KALEIDOSCOPE);
    if (window.SHADER_COLORSHIFT) register(window.SHADER_COLORSHIFT);
    if (window.SHADER_NOISE) register(window.SHADER_NOISE);

    console.log('[effects] registered:', Object.keys(shaderDefs).join(', '));
  }

  function setEffect(name) {
    if (materials[name]) {
      currentEffect = name;
      console.log('[effects] switched to:', name);
    }
  }

  function getMaterial() {
    return materials[currentEffect];
  }

  function getCurrentName() {
    return currentEffect;
  }

  // Get material by name (for multi-panel — each panel picks its own effect)
  function getMaterialByName(name) {
    return materials[name] || materials['feedback'];
  }

  // Update uniforms on a given material
  function updateUniformsOn(mat, params) {
    if (!mat) return;
    const u = mat.uniforms;
    if (params.time !== undefined) u.uTime.value = params.time;
    if (params.intensity !== undefined) u.uIntensity.value = params.intensity;
    if (params.feedback !== undefined) u.uFeedback.value = params.feedback;
    if (params.rotation !== undefined) u.uRotation.value = params.rotation;
    if (params.zoom !== undefined) u.uZoom.value = params.zoom;
    if (params.brightness !== undefined) u.uBrightness.value = params.brightness;
    if (params.glitch !== undefined) u.uGlitch.value = params.glitch;
    if (params.colorShift !== undefined) u.uColorShift.value = params.colorShift;
    if (params.beat !== undefined) u.uBeat.value = params.beat;
    if (params.sourceMix !== undefined) u.uSourceMix.value = params.sourceMix;
    if (params.prevTexture !== undefined) u.tPrev.value = params.prevTexture;
    if (params.sourceTexture !== undefined) u.tSource.value = params.sourceTexture;
    if (params.resolution !== undefined) u.uResolution.value.copy(params.resolution);
  }

  // Update uniforms on the current material (backward compat)
  function updateUniforms(params) {
    const mat = materials[currentEffect];
    if (!mat) return;
    const u = mat.uniforms;
    if (params.time !== undefined) u.uTime.value = params.time;
    if (params.intensity !== undefined) u.uIntensity.value = params.intensity;
    if (params.feedback !== undefined) u.uFeedback.value = params.feedback;
    if (params.rotation !== undefined) u.uRotation.value = params.rotation;
    if (params.zoom !== undefined) u.uZoom.value = params.zoom;
    if (params.brightness !== undefined) u.uBrightness.value = params.brightness;
    if (params.glitch !== undefined) u.uGlitch.value = params.glitch;
    if (params.colorShift !== undefined) u.uColorShift.value = params.colorShift;
    if (params.beat !== undefined) u.uBeat.value = params.beat;
    if (params.sourceMix !== undefined) u.uSourceMix.value = params.sourceMix;
    if (params.prevTexture !== undefined) u.tPrev.value = params.prevTexture;
    if (params.sourceTexture !== undefined) u.tSource.value = params.sourceTexture;
    if (params.resolution !== undefined) u.uResolution.value.copy(params.resolution);
  }

  // Get list of effect names (for cycling with number keys)
  function getEffectNames() {
    return Object.keys(materials);
  }

  function setEffectByIndex(idx) {
    const names = getEffectNames();
    if (idx >= 0 && idx < names.length) {
      setEffect(names[idx]);
    }
  }

  return { init, setEffect, getMaterial, getMaterialByName, getCurrentName, updateUniforms, updateUniformsOn, getEffectNames, setEffectByIndex };
})();
