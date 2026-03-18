// Feedback shader — port of tools/feedback.js to GLSL
// Rotates, zooms, and blends the previous frame with a source image
window.SHADER_FEEDBACK = {
  name: 'feedback',
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

    uniform sampler2D tPrev;       // previous frame (feedback buffer)
    uniform sampler2D tSource;     // source image
    uniform float uTime;
    uniform float uFeedback;       // how much previous frame bleeds through (0-1)
    uniform float uRotation;       // rotation speed (radians/frame)
    uniform float uZoom;           // zoom factor per frame (1.0 = none)
    uniform float uIntensity;      // overall effect intensity
    uniform float uBrightness;     // brightness boost
    uniform float uGlitch;         // glitch probability
    uniform vec2 uResolution;
    uniform float uSourceMix;      // how much source image to inject (0-1)
    uniform float uBeat;           // beat pulse (0-1, decays)

    // Rotate UV around center
    vec2 rotateUV(vec2 uv, float angle) {
      vec2 center = vec2(0.5);
      vec2 d = uv - center;
      float s = sin(angle);
      float c = cos(angle);
      return center + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
    }

    // Zoom UV toward center
    vec2 zoomUV(vec2 uv, float amount) {
      vec2 center = vec2(0.5);
      return center + (uv - center) / amount;
    }

    void main() {
      // Transform UVs for feedback sampling
      float rot = uRotation * (1.0 + uBeat * 3.0);
      float zm = uZoom + uBeat * 0.01;
      vec2 fbUv = rotateUV(vUv, rot);
      fbUv = zoomUV(fbUv, zm);

      // Sample previous frame with transformed UVs
      vec4 prev = texture2D(tPrev, fbUv);

      // Sample source image (straight, no transform)
      vec4 source = texture2D(tSource, vUv);

      // Brightness boost on feedback
      prev.rgb *= uBrightness;

      // Glitch: hue shift on random condition
      if (uGlitch > 0.0) {
        float n = fract(sin(dot(vUv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
        if (n < uGlitch) {
          // Rotate hue by shifting RGB channels
          float shift = n * 6.28318;
          float cs = cos(shift), sn = sin(shift);
          vec3 c = prev.rgb;
          prev.rgb = vec3(
            c.r * (0.333 + 0.667 * cs) + c.g * (0.333 - 0.333 * cs - 0.577 * sn) + c.b * (0.333 - 0.333 * cs + 0.577 * sn),
            c.r * (0.333 - 0.333 * cs + 0.577 * sn) + c.g * (0.333 + 0.667 * cs) + c.b * (0.333 - 0.333 * cs - 0.577 * sn),
            c.r * (0.333 - 0.333 * cs - 0.577 * sn) + c.g * (0.333 - 0.333 * cs + 0.577 * sn) + c.b * (0.333 + 0.667 * cs)
          );
        }
      }

      // Mix: feedback with source injection
      float srcMix = uSourceMix * (1.0 - uFeedback) + uBeat * 0.3;
      vec4 result = mix(prev * uFeedback, source, clamp(srcMix, 0.0, 1.0));

      // Keep alpha solid
      result.a = 1.0;

      gl_FragColor = result;
    }
  `
};
