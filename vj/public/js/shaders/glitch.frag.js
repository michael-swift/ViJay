// Glitch shader — RGB shift, scanlines, block displacement
window.SHADER_GLITCH = {
  name: 'glitch',
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
    uniform float uBrightness;
    uniform float uBeat;
    uniform vec2 uResolution;
    uniform float uSourceMix;
    uniform sampler2D tSource2;
    uniform float uBlend2;
    uniform int uBlendMode;

    // Pseudo-random
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      float amt = uIntensity * (1.0 + uBeat * 2.0);

      // Block displacement: shift horizontal blocks
      float blockY = floor(vUv.y * 20.0) / 20.0;
      float blockRand = rand(vec2(blockY, floor(uTime * 8.0)));
      float displaceX = 0.0;
      if (blockRand > (1.0 - amt * 0.3)) {
        displaceX = (rand(vec2(blockY, uTime)) - 0.5) * amt * 0.15;
      }

      vec2 uv = vUv + vec2(displaceX, 0.0);

      // RGB channel shift
      float shift = amt * 0.01;
      float r = texture2D(tPrev, uv + vec2(shift, 0.0)).r;
      float g = texture2D(tPrev, uv).g;
      float b = texture2D(tPrev, uv - vec2(shift, 0.0)).b;
      vec4 color = vec4(r, g, b, 1.0);

      // Scanlines
      float scanline = sin(vUv.y * uResolution.y * 1.5) * 0.5 + 0.5;
      color.rgb *= 1.0 - (scanline * amt * 0.15);

      // Inject source
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
      float srcMix = clamp(uSourceMix + uBeat * 0.2, 0.0, 1.0);
      color = mix(color * uBrightness, source, srcMix);

      color.a = 1.0;
      gl_FragColor = color;
    }
  `
};
