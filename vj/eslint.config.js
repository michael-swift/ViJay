export default [
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        WebSocket: "readonly",
        location: "readonly",
        navigator: "readonly",
        // Three.js
        THREE: "readonly",
        // VJ globals (set by other scripts)
        VJ: "writable",
        SHADER_FEEDBACK: "writable",
        SHADER_GLITCH: "writable",
        SHADER_COLORSHIFT: "writable",
        SHADER_NOISE: "writable",
        SHADER_KALEIDOSCOPE: "writable",
        SHADER_VHS: "writable",
        SHADER_PIXELATE: "writable",
        SHADER_MIRROR: "writable",
        SHADER_COMPOSITE: "writable",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
