// Mirror shader — horizontal reflection with drifting axis, hall-of-mirrors, beat vertical flash
window.SHADER_MIRROR = {
  name: 'mirror',
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D tPrev;
    uniform sampler2D tSource;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uFeedback;
    uniform float uRotation;
    uniform float uZoom;
    uniform float uBeat;
    uniform vec2 uResolution;
    uniform float uSourceMix;
    uniform float uBrightness;
    uniform float uGlitch;
    uniform float uColorShift;
    uniform sampler2D tSource2;
    uniform float uBlend2;
    uniform int uBlendMode;

    void main() {
      vec2 uv = vUv;

      // --- Zoom toward mirror axis ---
      // uZoom pulls coordinates toward center (the mirror axis area)
      float zm = uZoom;
      vec2 center = vec2(0.5);
      uv = center + (uv - center) / zm;

      // --- Mirror axis drift ---
      // The axis position oscillates based on uRotation
      // uRotation controls the range of drift (0 = centered, higher = wider swing)
      float axisDrift = sin(uTime * 0.5) * uRotation * 2.0;
      float axis = 0.5 + axisDrift;

      // --- Horizontal mirror with repetitions ---
      // uIntensity controls how many mirror folds:
      //   low intensity (~0) = 1 fold (simple mirror)
      //   high intensity (1.0) = many folds (hall-of-mirrors)
      float folds = 1.0 + floor(uIntensity * 7.0); // 1 to 8 folds

      // Fold the x coordinate around the axis repeatedly
      float x = uv.x;
      // Normalize x relative to the axis, then fold
      // Each fold reflects around the axis
      float range = max(axis, 1.0 - axis); // use the larger half as the fold range
      float normalized = abs(x - axis) / range; // 0 at axis, 1 at edge

      // Apply multiple folds: triangle wave creates repeated reflections
      // Each fold halves the effective space
      for (float i = 0.0; i < 8.0; i++) {
        if (i >= folds) break;
        normalized = abs(normalized);
        // Triangle wave: fold back at 1.0
        normalized = 1.0 - abs(normalized - 1.0);
        // Each successive fold diminishes slightly for a "hall" feel
        normalized *= 0.999;
      }

      // Map back to UV space
      float mirroredX = axis + normalized * range;
      // Alternate direction based on which side of axis we started on
      if (x < axis) {
        mirroredX = axis - normalized * range;
      }
      vec2 mirrorUV = vec2(clamp(mirroredX, 0.0, 1.0), uv.y);

      // Sample the previous frame at the mirrored position
      vec4 color = texture2D(tPrev, mirrorUV);

      // --- Beat: vertical mirror flash overlay ---
      // On beat, briefly apply a vertical (top/bottom) mirror too
      if (uBeat > 0.01) {
        float mirroredY = uv.y;
        if (uv.y > 0.5) {
          mirroredY = 1.0 - uv.y;
        }
        vec2 vMirrorUV = vec2(mirrorUV.x, mirroredY);
        vec4 vMirrorColor = texture2D(tPrev, vMirrorUV);
        color = mix(color, vMirrorColor, uBeat * 0.7);
      }

      // --- Brightness ---
      color.rgb *= uBrightness;

      // --- Inject source ---
      vec4 source = texture2D(tSource, vUv);
      if (uBlend2 > 0.0) {
        vec4 src2 = texture2D(tSource2, vUv);
        if (uBlendMode == 0) source = mix(source, src2, uBlend2);
        else if (uBlendMode == 1) source = source + src2 * uBlend2;
        else if (uBlendMode == 2) source = mix(source, source * src2, uBlend2);
        else if (uBlendMode == 3) source = mix(source, 1.0 - (1.0 - source) * (1.0 - src2), uBlend2);
        else source = mix(source, abs(source - src2), uBlend2);
        source.a = 1.0;
      }
      float srcMix = uSourceMix * (1.0 - uFeedback) + uBeat * 0.2;
      color = mix(color * uFeedback, source, clamp(srcMix, 0.0, 1.0));

      color.a = 1.0;
      gl_FragColor = color;
    }
  `
};
