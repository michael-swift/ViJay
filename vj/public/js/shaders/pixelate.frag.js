// Pixelate shader — mosaic / pixel art with color quantization and beat pulse
window.SHADER_PIXELATE = {
  name: 'pixelate',
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
      // --- Grid size from intensity ---
      // Low intensity = subtle (many cells, ~200 across)
      // High intensity = chunky (few cells, ~8 across)
      // We interpolate exponentially so the range feels natural
      float minCells = 8.0;
      float maxCells = 200.0;
      // Invert: high intensity = fewer cells = bigger pixels
      float cells = mix(maxCells, minCells, uIntensity * uIntensity);

      // On beat: briefly halve the cell count (double the pixel size)
      cells *= mix(1.0, 0.5, uBeat);

      // Compute cell size in UV space, maintaining aspect ratio
      float aspect = uResolution.x / uResolution.y;
      float cellsX = cells;
      float cellsY = cells / aspect;

      // Snap UVs to grid — find the center of each cell
      vec2 cellUV;
      cellUV.x = (floor(vUv.x * cellsX) + 0.5) / cellsX;
      cellUV.y = (floor(vUv.y * cellsY) + 0.5) / cellsY;

      // Sample previous frame at cell center
      vec4 color = texture2D(tPrev, cellUV);

      // --- Color quantization: reduce color depth ---
      // At low intensity: 64 levels per channel (barely noticeable)
      // At high intensity: 4 levels per channel (very posterized)
      float maxLevels = 64.0;
      float minLevels = 4.0;
      float levels = mix(maxLevels, minLevels, uIntensity);
      // Smooth quantization: round each channel to nearest level
      color.rgb = floor(color.rgb * levels + 0.5) / levels;

      // --- Brightness ---
      color.rgb *= uBrightness;

      // --- Inject source ---
      // Sample source at same pixelated UV so it matches the grid
      vec4 source = texture2D(tSource, cellUV);
      if (uBlend2 > 0.0) {
        vec4 src2 = texture2D(tSource2, cellUV);
        if (uBlendMode == 0) source = mix(source, src2, uBlend2);
        else if (uBlendMode == 1) source = source + src2 * uBlend2;
        else if (uBlendMode == 2) source = mix(source, source * src2, uBlend2);
        else if (uBlendMode == 3) source = mix(source, 1.0 - (1.0 - source) * (1.0 - src2), uBlend2);
        else source = mix(source, abs(source - src2), uBlend2);
        source.a = 1.0;
      }
      float srcMix = clamp(uSourceMix + uBeat * 0.2, 0.0, 1.0);
      color = mix(color * uBrightness, source, srcMix);

      color.a = 1.0;
      gl_FragColor = color;
    }
  `
};
