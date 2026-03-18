// Colorshift shader — HSV rotation, posterize, invert
window.SHADER_COLORSHIFT = {
  name: 'colorshift',
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
    uniform float uColorShift;
    uniform float uBeat;
    uniform vec2 uResolution;
    uniform float uSourceMix;

    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      vec4 prev = texture2D(tPrev, vUv);

      // HSV rotation
      vec3 hsv = rgb2hsv(prev.rgb);
      hsv.x = fract(hsv.x + uColorShift + uTime * 0.01 + uBeat * 0.15);
      // Saturation boost on beat
      hsv.y = clamp(hsv.y * (1.0 + uBeat * 0.5), 0.0, 1.0);
      vec3 shifted = hsv2rgb(hsv);

      // Posterize based on intensity
      float levels = mix(256.0, 4.0, uIntensity);
      shifted = floor(shifted * levels) / levels;

      // Partial invert on high intensity
      if (uIntensity > 0.8) {
        float invertAmt = (uIntensity - 0.8) * 5.0; // 0 to 1
        shifted = mix(shifted, 1.0 - shifted, invertAmt * 0.5);
      }

      vec4 color = vec4(shifted, 1.0);

      // Inject source
      vec4 source = texture2D(tSource, vUv);
      float srcMix = uSourceMix * (1.0 - uFeedback) + uBeat * 0.2;
      color = mix(color * uFeedback, source, clamp(srcMix, 0.0, 1.0));

      color.a = 1.0;
      gl_FragColor = color;
    }
  `
};
