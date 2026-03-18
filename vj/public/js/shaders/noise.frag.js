// Noise shader — Perlin-like noise overlay
window.SHADER_NOISE = {
  name: 'noise',
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
    uniform float uBeat;
    uniform vec2 uResolution;
    uniform float uSourceMix;

    // Simple 2D noise (value noise with smoothstep interpolation)
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f); // smoothstep

      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));

      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 5; i++) {
        v += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
      }
      return v;
    }

    void main() {
      vec4 prev = texture2D(tPrev, vUv);

      // Generate animated noise
      float n = fbm(vUv * 4.0 + uTime * 0.3);

      // Distort UV with noise
      float distort = uIntensity * 0.05 * (1.0 + uBeat * 3.0);
      vec2 distortedUv = vUv + vec2(
        fbm(vUv * 8.0 + uTime * 0.5) - 0.5,
        fbm(vUv * 8.0 + uTime * 0.5 + 100.0) - 0.5
      ) * distort;

      vec4 distorted = texture2D(tPrev, distortedUv);

      // Blend: original + noise color + distortion
      vec3 noiseColor = vec3(n * 0.3, n * 0.8, n) * uIntensity;
      vec3 result = mix(prev.rgb, distorted.rgb, uIntensity * 0.5);
      result += noiseColor * 0.3;

      // Inject source
      vec4 source = texture2D(tSource, vUv);
      float srcMix = uSourceMix * (1.0 - uFeedback) + uBeat * 0.2;
      vec4 color = vec4(result, 1.0);
      color = mix(color * uFeedback, source, clamp(srcMix, 0.0, 1.0));

      color.a = 1.0;
      gl_FragColor = color;
    }
  `
};
