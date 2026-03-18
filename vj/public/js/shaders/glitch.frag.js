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
    uniform float uBeat;
    uniform vec2 uResolution;
    uniform float uSourceMix;

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
      float srcMix = uSourceMix * (1.0 - uFeedback) + uBeat * 0.2;
      color = mix(color * uFeedback, source, clamp(srcMix, 0.0, 1.0));

      color.a = 1.0;
      gl_FragColor = color;
    }
  `
};
