// Composite shader — final pass: vignette, brightness, flash
window.SHADER_COMPOSITE = {
  name: 'composite',
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

    uniform sampler2D tInput;
    uniform float uBrightness;
    uniform float uFlash;        // 0-1, strobe flash
    uniform float uBlackout;     // 0 or 1
    uniform float uOpacity;      // panel fade in/out (0-1)
    uniform vec2 uResolution;

    void main() {
      vec4 color = texture2D(tInput, vUv);

      // Brightness
      color.rgb *= uBrightness;

      // Strobe flash: additive white
      color.rgb += vec3(uFlash);

      // Blackout
      color.rgb *= (1.0 - uBlackout);

      // Clamp
      color.rgb = clamp(color.rgb, 0.0, 1.0);

      // Panel opacity as alpha — enables proper layering of overlapping panels
      color.a = uOpacity;

      gl_FragColor = color;
    }
  `
};
