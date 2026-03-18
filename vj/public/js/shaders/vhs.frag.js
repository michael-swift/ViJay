// VHS shader — analog tape degradation: chromatic aberration, tracking lines, noise, color bleed, warping
window.SHADER_VHS = {
  name: 'vhs',
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

    // Pseudo-random
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Hash-based noise for grain
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = rand(i);
      float b = rand(i + vec2(1.0, 0.0));
      float c = rand(i + vec2(0.0, 1.0));
      float d = rand(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    void main() {
      float amt = uIntensity;

      // --- Tape warping: sinusoidal horizontal displacement ---
      // Varies with Y position and time, simulating tape wobble
      float warpFreq = 3.0 + sin(uTime * 0.7) * 2.0;
      float warpAmt = amt * 0.008 * (1.0 + uBeat * 1.5);
      float warp = sin(vUv.y * warpFreq + uTime * 2.0) * warpAmt;
      // Add a second higher-frequency wobble for realism
      warp += sin(vUv.y * 15.0 + uTime * 5.0) * warpAmt * 0.3;

      vec2 uv = vUv + vec2(warp, 0.0);

      // --- Chromatic aberration: VERTICAL RGB offset (not horizontal like glitch) ---
      float chromaShift = amt * 0.006 * (1.0 + uBeat * 2.0);
      float r = texture2D(tPrev, uv + vec2(0.0, chromaShift)).r;
      float g = texture2D(tPrev, uv).g;
      float b = texture2D(tPrev, uv - vec2(0.0, chromaShift)).b;
      vec4 color = vec4(r, g, b, 1.0);

      // --- Color bleed: horizontal smear on bright areas ---
      // Sample a few pixels to the right and blend if bright
      float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float bleedAmt = amt * 0.004 * smoothstep(0.5, 1.0, luminance);
      vec4 bleedSample = texture2D(tPrev, uv + vec2(bleedAmt, 0.0));
      color.rgb = mix(color.rgb, bleedSample.rgb, bleedAmt * 40.0 * amt);

      // --- Tracking lines: horizontal bands that drift over time ---
      // These simulate the tracking error bars you see on old VHS tapes
      float trackPos = fract(uTime * 0.1); // slowly scrolling position
      float trackY = fract(vUv.y - trackPos);
      // Main tracking band
      float trackLine = smoothstep(0.0, 0.02, trackY) * (1.0 - smoothstep(0.02, 0.06, trackY));
      // Secondary thinner lines
      float trackLine2 = smoothstep(0.0, 0.005, fract(trackY * 5.0)) *
                          (1.0 - smoothstep(0.005, 0.015, fract(trackY * 5.0)));
      float trackStrength = amt * 0.6 * (trackLine + trackLine2 * 0.3);
      // Tracking distorts color and shifts horizontally
      color.rgb += vec3(trackStrength * 0.8, trackStrength * 0.6, trackStrength * 0.9);
      // Slight horizontal shift in tracking region
      vec2 trackShiftUV = uv + vec2(trackLine * amt * 0.03, 0.0);
      vec4 trackColor = texture2D(tPrev, trackShiftUV);
      color.rgb = mix(color.rgb, trackColor.rgb, trackLine * amt * 0.4);

      // --- Noise grain overlay ---
      float grainStrength = amt * 0.15 * (1.0 + uBeat * 0.5);
      float grain = rand(vUv * uResolution + vec2(uTime * 100.0, 0.0)) - 0.5;
      color.rgb += vec3(grain * grainStrength);

      // --- Desaturation: VHS has muted colors ---
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float desatAmount = amt * 0.3; // partial desaturation
      color.rgb = mix(color.rgb, vec3(lum), desatAmount);

      // --- Warm color shift: VHS tapes tend toward warm tones ---
      color.r += amt * 0.03;
      color.g += amt * 0.01;
      color.b -= amt * 0.02;

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
