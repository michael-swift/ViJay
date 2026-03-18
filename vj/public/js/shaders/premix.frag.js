// Pre-mix shader — composites two source textures.
// Source A = background (fullscreen, goes through effects, gets trippy)
// Source B = foreground photo, positioned/scaled so it stays recognizable
window.SHADER_PREMIX = {
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

    uniform sampler2D tSourceA;     // background (video, texture, etc.)
    uniform sampler2D tSourceB;     // foreground photo
    uniform float uBlend;           // foreground opacity (0-1)
    uniform float uTime;
    uniform int uMode;              // 0=mix, 1=add, 2=multiply, 3=screen, 4=diff

    // Position and scale of the foreground photo.
    // uFgPos = center position (0-1 in UV space). (0.5, 0.5) = centered.
    // uFgScale = size as fraction of screen. 0.4 = 40% of screen width/height.
    uniform vec2 uFgPos;
    uniform float uFgScale;

    // Layout mode:
    // 0 = fullscreen blend (original behavior — both sources fill the screen)
    // 1 = inset (source B is positioned/scaled as a floating photo over source A)
    // 2 = side-by-side (A on left, B on right)
    // 3 = picture-in-picture (B is a small inset in corner)
    uniform int uLayout;

    // Soft edge around the foreground photo (0 = hard, 0.05 = soft)
    float softEdge(vec2 uv, float feather) {
      vec2 edge = smoothstep(vec2(0.0), vec2(feather), uv) *
                  smoothstep(vec2(0.0), vec2(feather), 1.0 - uv);
      return edge.x * edge.y;
    }

    vec4 blendColors(vec4 a, vec4 b, float blend, int mode) {
      vec4 result;
      if (mode == 0) {
        result = mix(a, b, blend);
      } else if (mode == 1) {
        result = a + b * blend;
      } else if (mode == 2) {
        result = mix(a, a * b, blend);
      } else if (mode == 3) {
        result = mix(a, 1.0 - (1.0 - a) * (1.0 - b), blend);
      } else {
        result = mix(a, abs(a - b), blend);
      }
      result.a = 1.0;
      return result;
    }

    void main() {
      vec4 bg = texture2D(tSourceA, vUv);

      if (uLayout == 0) {
        // Fullscreen blend (original behavior)
        vec4 fg = texture2D(tSourceB, vUv);
        gl_FragColor = blendColors(bg, fg, uBlend, uMode);
        return;
      }

      if (uLayout == 1) {
        // Inset: source B is a floating photo at uFgPos with uFgScale size
        // Map screen UV to photo UV based on position and scale
        vec2 photoUv = (vUv - uFgPos) / uFgScale + 0.5;

        if (photoUv.x >= 0.0 && photoUv.x <= 1.0 &&
            photoUv.y >= 0.0 && photoUv.y <= 1.0) {
          vec4 fg = texture2D(tSourceB, photoUv);
          float mask = softEdge(photoUv, 0.03) * uBlend;
          gl_FragColor = blendColors(bg, fg, mask, uMode);
        } else {
          gl_FragColor = bg;
        }
        return;
      }

      if (uLayout == 2) {
        // Side by side: A on left half, B on right half
        // The split point is controlled by uBlend (0.5 = even split)
        float split = 1.0 - uBlend; // higher blend = more B
        if (vUv.x < split) {
          // Left side: stretch source A to fill
          vec2 uvA = vec2(vUv.x / split, vUv.y);
          gl_FragColor = texture2D(tSourceA, uvA);
        } else {
          // Right side: stretch source B to fill
          vec2 uvB = vec2((vUv.x - split) / (1.0 - split), vUv.y);
          vec4 fg = texture2D(tSourceB, uvB);
          // Slight blend at the seam
          float seam = smoothstep(split - 0.01, split + 0.01, vUv.x);
          gl_FragColor = mix(texture2D(tSourceA, vUv), fg, seam);
        }
        return;
      }

      if (uLayout == 3) {
        // Picture-in-picture: B is a small box at uFgPos
        float pipScale = uFgScale * 0.6; // PIP is smaller
        vec2 pipUv = (vUv - uFgPos) / pipScale + 0.5;

        if (pipUv.x >= 0.0 && pipUv.x <= 1.0 &&
            pipUv.y >= 0.0 && pipUv.y <= 1.0) {
          vec4 fg = texture2D(tSourceB, pipUv);
          // Slight border
          float border = softEdge(pipUv, 0.02);
          gl_FragColor = mix(bg, fg, border * uBlend);
        } else {
          gl_FragColor = bg;
        }
        return;
      }

      gl_FragColor = bg;
    }
  `
};
