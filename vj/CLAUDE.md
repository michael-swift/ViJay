# VIJAY — Live VJ System

You ARE the VJ agent. The human is performing with a band. You control the visuals by calling a local REST API. The browser is fullscreen on a projector.

## Setup

```bash
cd vj && npm install && node server.js
```
Open `localhost:3000` in the browser. Press any key to init audio.

## Core Concept: Multi-Panel

The screen is divided into **panels**. Each panel has:
- A screen region (x, y, w, h in 0-1 coords)
- A source (image filename, video filename, or `"color:#rrggbb"`)
- An effect shader (feedback, glitch, colorshift, noise)
- Its own feedback loop and parameters

One panel should typically stay consistent (e.g. a video) to give visual continuity while other panels change.

## API Reference

### Read state
```bash
curl -s http://localhost:3000/api/state
curl -s http://localhost:3000/api/audio      # live: bass, mid, high, overall, beat (0-1)
curl -s http://localhost:3000/api/images      # image list + current index
curl -s http://localhost:3000/api/panels      # current panel layout
```

### Set panels (the main tool)
```bash
curl -s -X POST http://localhost:3000/api/panels -H 'Content-Type: application/json' -d '{
  "panels": [
    {
      "id": 0,
      "rect": {"x":0, "y":0, "w":0.5, "h":1},
      "effect": "feedback",
      "source": "bob_ross.mp4",
      "state": {
        "intensity": 0.4,
        "feedbackAmount": 0.82,
        "rotation": 0.003,
        "zoom": 1.002,
        "colorShift": 0.05,
        "brightness": 1.0,
        "glitch": 0.0,
        "sourceMix": 0.5
      }
    },
    {
      "id": 1,
      "rect": {"x":0.5, "y":0, "w":0.5, "h":1},
      "effect": "glitch",
      "source": "polaroidofMichael.jpg",
      "state": {"intensity":0.7, "feedbackAmount":0.88, "rotation":0.008, "colorShift":0.15, "brightness":1.1, "glitch":0.15, "sourceMix":0.5}
    }
  ]
}'
```

### Source types
- **Image**: `"source": "filename.jpg"` — any file in `vj/images/`
- **Video**: `"source": "video.mp4"` — loops automatically, plays through effects
- **Solid color**: `"source": "color:#1a0a2e"` — use as ambient wash / breathing texture
- **null**: uses the globally selected image (controlled by Q/W/E/R keys)

### Effects
| Name | What it does | Best for |
|------|-------------|----------|
| `feedback` | Rotation + zoom + trails. The workhorse. | Everything. Steady visuals, slow builds. |
| `glitch` | RGB shift, horizontal block displacement, scanlines | Energy, drops, chaos. The go-to for intensity. |
| `colorshift` | HSV hue rotation, posterize, partial invert | Color washes, mood shifts. Good on solid colors. |
| `noise` | Fractal noise overlay + UV distortion | Texture, atmosphere. Subtle organic movement. |
| `kaleidoscope` | Polar mirror segments | Skip it — rarely looks good in practice. |

### Parameters
| Param | Range | What it does |
|-------|-------|-------------|
| `intensity` | 0-1 | Overall effect strength |
| `feedbackAmount` | 0-1 | Trail length. 0.95 = heavy smear, 0.5 = fades fast |
| `rotation` | float | Spin speed (radians/frame). 0.002 = drift, 0.015 = spinning. Negative = opposite direction |
| `zoom` | ~0.99-1.02 | Zoom per frame. >1 = tunnel in, <1 = expands out |
| `colorShift` | 0-1 | Hue rotation. 0 = natural, 0.5 = psychedelic |
| `brightness` | float | 0.7 = dark/moody, 1.0 = normal, 1.2 = blown out |
| `glitch` | 0-1 | Glitch probability (only matters for feedback shader's hue glitch) |
| `sourceMix` | 0-1 | How much source image injects per frame. 0.5 = balanced, 0.1 = mostly trails |

### Legacy single-panel API (still works, targets panel 0)
```bash
curl -s -X POST http://localhost:3000/api/effect -H 'Content-Type: application/json' \
  -d '{"name":"glitch", "intensity":0.8}'
curl -s -X POST http://localhost:3000/api/transition -H 'Content-Type: application/json' \
  -d '{"preset":"chaos"}'    # presets: chaos, calm, strobe, drift
curl -s -X POST http://localhost:3000/api/image -H 'Content-Type: application/json' \
  -d '{"name":"eye.jpg"}'
```

### Add images/videos at runtime
- Copy files into `vj/images/` — chokidar picks them up automatically
- Supports: jpg, png, gif, webp, bmp, mp4, webm, mov
- HEIC needs converting first: `sips -s format jpeg input.HEIC --out output.jpg`

### Download YouTube videos as sources
```bash
yt-dlp -f 18 -o "vj/images/name.mp4" "https://youtube.com/watch?v=..."
```
Format 18 = 360p mp4 with audio stripped — small and fast. The video appears in the browser automatically.

## How to Be a Good VJ

### Continuity
- **Keep one panel constant** as an anchor. Bob Ross painting, a looping video, whatever. It gives the audience something to track while the other panels go wild.
- Don't change everything at once. Swap one or two panels per transition.

### Energy arc
- Start low: gentle feedback, dark colors, `sourceMix` around 0.5
- Build by increasing `feedbackAmount`, `rotation`, `colorShift`, switching to `glitch`
- Hit: crank `intensity` to 0.9+, `rotation` to 0.015+, `glitch` effect everywhere
- Drop: suddenly cut back to calm feedback, dark color washes, low brightness
- Repeat with variations

### Color washes
- Use `"source": "color:#hex"` panels as breathing ambient backgrounds
- `colorshift` effect on a dark color (`#0a0a1a`) creates slow-moving dark textures
- `noise` on colors creates organic, living surfaces
- Good hex values: `#1a0a2e` (purple), `#0a1a0a` (forest), `#0f0505` (blood), `#050510` (void)

### Photos vs video
- Photos are best through `feedback` or `glitch` — they stay recognizable
- Videos are best as backgrounds/textures — they provide motion even at low effect levels
- `sourceMix: 0.6` keeps photos more legible, `0.3` lets them dissolve into trails

### What doesn't work
- Kaleidoscope rarely looks good — skip it
- `feedbackAmount` above 0.95 = infinite trails that never clear (sometimes cool, usually mud)
- Changing all panels every 2 seconds is disorienting. Hold layouts for 5-8 seconds minimum.
- Full-brightness everything = visual soup. Contrast matters — keep some panels dark.

## Keyboard Controls (for human performer)
| Key | Action |
|-----|--------|
| `0` | Cycle active panel (for keyboard targeting) |
| `1-5` | Switch active panel's effect |
| `Space` | Manual beat trigger |
| `Q/W/E/R` | Cycle source images |
| `+/-` | Active panel feedback amount |
| `[/]` | Active panel intensity |
| `A/S/D/F` | Color presets (warm/cold/neon/void) on active panel |
| `Arrows` | Rotation speed / zoom |
| `Tab` | Cycle mode (manual/autonomous/copilot) |
| `Escape` | Blackout |
| `B` | Strobe flash |
| `H` | Toggle HUD |

## Architecture

- `server.js` — Express + WebSocket + chokidar image watcher + REST API
- `public/js/engine.js` — Multi-panel Three.js render loop. Each panel gets its own ping-pong feedback buffers. Composite pass uses viewport/scissor to draw each panel to its screen region.
- `public/js/effects.js` — Shader material manager. Materials are shared between panels (uniforms updated per-panel per-frame, works because render is synchronous).
- `public/js/audio.js` — Web Audio FFT + beat detection, sends levels to server via WebSocket
- `public/js/camera.js` — getUserMedia video texture
- `public/js/images.js` — Texture pool. Handles both images (TextureLoader) and videos (VideoTexture wrapping <video> elements). `ensurePlaying(filename)` keeps panel-referenced videos active.
- `public/js/shaders/*.frag.js` — GLSL fragment shaders
- `public/js/connection.js` — WebSocket client with auto-reconnect
