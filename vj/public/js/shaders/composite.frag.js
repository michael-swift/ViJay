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
    uniform vec2 uResolution;

    void main() {
      vec4 color = texture2D(tInput, vUv);

      // Brightness
      color.rgb *= uBrightness;

      // Vignette
      vec2 center = vUv - 0.5;
      float vignette = 1.0 - dot(center, center) * 0.5;
      color.rgb *= vignette;

      // Strobe flash: additive white
      color.rgb += vec3(uFlash);

      // Blackout
      color.rgb *= (1.0 - uBlackout);

      // Clamp
      color.rgb = clamp(color.rgb, 0.0, 1.0);
      color.a = 1.0;

      gl_FragColor = color;
    }
  `
};
