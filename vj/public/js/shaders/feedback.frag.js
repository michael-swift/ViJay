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
    uniform sampler2D tSource2;    // second source for blending
    uniform float uBlend2;         // how much second source to blend in (0-1)
    uniform int uBlendMode;        // 0=mix, 1=add, 2=multiply, 3=screen, 4=diff
    uniform float uMode;           // 0=classic camera feedback, 1=reaction-diffusion, fractional=morph
    uniform float uDiffusion;      // RD blur radius in pixels (0-3)
    uniform float uReaction;       // RD non-linearity strength (0-1)

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
      // feedbackAmount scales rotation/zoom — higher = more aggressive transformation = more abstract
      float rot = uRotation * uFeedback * (1.0 + uBeat * 3.0);
      float zm = 1.0 + (uZoom - 1.0) * uFeedback + uBeat * 0.01;
      vec2 fbUv = rotateUV(vUv, rot);
      fbUv = zoomUV(fbUv, zm);

      // Sample previous frame with transformed UVs.
      // Classic path = single tap (camera-at-CRT aesthetic).
      // Reaction-diffusion path = 5-tap blur + unsharp mask + s-curve on the blurred
      // result, producing self-organizing Turing-style edges. uMode morphs between them.
      vec4 classicPrev = texture2D(tPrev, fbUv);
      vec4 prev = classicPrev;
      if (uMode > 0.001) {
        vec2 texel = uDiffusion / uResolution;
        vec4 n = texture2D(tPrev, fbUv + vec2(0.0, texel.y));
        vec4 s = texture2D(tPrev, fbUv - vec2(0.0, texel.y));
        vec4 e = texture2D(tPrev, fbUv + vec2(texel.x, 0.0));
        vec4 w = texture2D(tPrev, fbUv - vec2(texel.x, 0.0));
        vec4 blur = (classicPrev + n + s + e + w) * 0.2;
        vec3 sharp = classicPrev.rgb + (classicPrev.rgb - blur.rgb) * 2.0;
        vec3 curved = smoothstep(vec3(0.3), vec3(0.7), sharp);
        vec3 rd = mix(blur.rgb, curved, uReaction);
        prev = vec4(mix(classicPrev.rgb, rd, uMode), 1.0);
      }

      // Sample source image (straight, no transform)
      vec4 source = texture2D(tSource, vUv);

      // Two-source blending
      if (uBlend2 > 0.0) {
        vec4 src2 = texture2D(tSource2, vUv);
        if (uBlendMode == 0) source = mix(source, src2, uBlend2);
        else if (uBlendMode == 1) source = source + src2 * uBlend2;
        else if (uBlendMode == 2) source = mix(source, source * src2, uBlend2);
        else if (uBlendMode == 3) source = mix(source, 1.0 - (1.0 - source) * (1.0 - src2), uBlend2);
        else source = mix(source, abs(source - src2), uBlend2);
        source.a = 1.0;
      }

      // Glitch: hue shift on random condition
      if (uGlitch > 0.0) {
        float n = fract(sin(dot(vUv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
        if (n < uGlitch) {
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

      // Energy-conserving mix: prev and source blend without luminance loss.
      // sourceMix controls "image vs texture" — low = trails dominate, high = source visible.
      // feedbackAmount scales rotation/zoom effect (handled above via uRotation/uZoom),
      // and here it slightly decays the trail portion to prevent infinite accumulation.
      float srcMix = clamp(uSourceMix + uBeat * 0.3, 0.0, 1.0);
      vec4 trail = prev * uBrightness;
      vec4 result = mix(trail, source, srcMix);

      result.a = 1.0;
      gl_FragColor = result;
    }
  `
};
