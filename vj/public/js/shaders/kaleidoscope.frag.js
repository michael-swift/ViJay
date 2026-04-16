// Kaleidoscope shader — polar mirror segments
window.SHADER_KALEIDOSCOPE = {
  name: 'kaleidoscope',
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
    uniform float uRotation;
    uniform float uBeat;
    uniform vec2 uResolution;
    uniform float uSourceMix;
    uniform sampler2D tSource2;
    uniform float uBlend2;
    uniform int uBlendMode;

    #define PI 3.14159265359

    void main() {
      vec2 center = vec2(0.5);
      vec2 pos = vUv - center;

      // Convert to polar
      float r = length(pos);
      float angle = atan(pos.y, pos.x);

      // Number of segments scales with intensity
      float segments = floor(3.0 + uIntensity * 9.0);

      // Mirror the angle within each segment
      float segAngle = PI * 2.0 / segments;
      angle = mod(angle + uTime * uRotation * 10.0, segAngle);
      if (angle > segAngle * 0.5) {
        angle = segAngle - angle;
      }

      // Back to cartesian
      vec2 kaleidUv = center + vec2(cos(angle), sin(angle)) * r;

      // Sample feedback with kaleidoscope UVs
      vec4 prev = texture2D(tPrev, kaleidUv);

      // Beat: pulse zoom
      float beatZoom = 1.0 + uBeat * 0.1;
      vec2 zoomedUv = center + (kaleidUv - center) / beatZoom;
      vec4 prevZoomed = texture2D(tPrev, zoomedUv);
      prev = mix(prev, prevZoomed, uBeat);

      // Inject source
      vec4 source = texture2D(tSource, kaleidUv);
      if (uBlend2 > 0.0) {
        vec4 src2 = texture2D(tSource2, kaleidUv);
        if (uBlendMode == 0) source = mix(source, src2, uBlend2);
        else if (uBlendMode == 1) source = source + src2 * uBlend2;
        else if (uBlendMode == 2) source = mix(source, source * src2, uBlend2);
        else if (uBlendMode == 3) source = mix(source, 1.0 - (1.0 - source) * (1.0 - src2), uBlend2);
        else source = mix(source, abs(source - src2), uBlend2);
        source.a = 1.0;
      }
      float srcMix = clamp(uSourceMix + uBeat * 0.2, 0.0, 1.0);
      vec4 result = mix(prev * uBrightness, source, srcMix);

      result.a = 1.0;
      gl_FragColor = result;
    }
  `
};
