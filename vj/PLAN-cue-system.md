# Plan: Scene Cue System + Source Cross-Fading

## Context

The VJ autopilot currently has 8 hardcoded scene layouts in `getScenes()`. There's no way to save a look you like, recall it later, or build a library of scenes for a show. Sources change instantly with no cross-fade. We need:

1. A **two-level cue system**: templates (layouts with variable slots) and scenes (templates with specific source bindings)
2. **Source cross-fading** when panels switch images
3. Autopilot that **mixes saved cues with generative scenes**

## Data Model

### Templates (layout + effects + variable slots)

```json
{
  "name": "cinema",
  "panels": [
    { "id": 0, "rect": {"x":0,"y":0,"w":1,"h":0.55}, "effect": "feedback",
      "source": "$anchor",
      "state": { "intensity": 0.4, "feedbackAmount": 0.82, "sourceMix": 0.5 }
    },
    { "id": 1, "rect": {"x":0,"y":0.55,"w":0.5,"h":0.45}, "effect": "$effect",
      "source": "$random" },
    { "id": 2, "rect": {"x":0.5,"y":0.55,"w":0.5,"h":0.45}, "effect": "$effect",
      "source": "$random:photo" }
  ]
}
```

**Variable tokens** (resolved at recall time):
- `$anchor` — the current anchor video (autopilot picks one)
- `$random` — random image/video from library
- `$random:photo` — random photo only
- `$random:video` — random video only
- `$dark` — random dark color wash (`color:#0a0a1a`, etc.)
- `$effect` — pick an effect based on current energy level
- Literal strings (`"bob_ross.mp4"`, `"color:#1a0a2e"`) — used as-is

### Scenes (template + variable overrides)

```json
{
  "name": "bob cinema",
  "template": "cinema",
  "vars": {
    "$anchor": "bob_ross.mp4",
    "$effect": "glitch"
  }
}
```

When recalled, variables not in `vars` use their default resolution (e.g. `$random` still picks randomly).

### Energy inference

Automatically computed from a scene's panel states. Average of key parameters:
```
energy = avg(intensity, feedbackAmount - 0.7, glitch * 2, colorShift) clamped to 0-1
```
This tags each cue as low/mid/high without manual work.

## Storage

**File**: `vj/cues.json`
```json
{
  "templates": { "cinema": {...}, "spotlight": {...}, ... },
  "scenes": { "bob cinema": {...}, "chill intro": {...}, ... }
}
```

- Loaded at server startup
- Written on save operations
- The 8 existing hardcoded layouts become built-in templates (always available, not in cues.json)

## Source Cross-Fading

**Mechanism**: Reuse the existing `source2` + `blend2` infrastructure.

When `applyPanelConfig()` receives a panel with a different source than the current one:
1. Move current `source` → `source2` (the old image becomes the blend layer)
2. Set `source` to the new source
3. Set `blend2 = 1.0` in current state (still showing old image via source2)
4. Set `targetState.blend2 = 0.0` (lerp fades to new source)
5. `blend2` is already in `LERPABLE_KEYS` so it lerps automatically at `LERP_SPEED=0.06`

When the lerp completes (blend2 reaches 0), clear source2 to free the texture reference.

**Where**: Client-side in `applyPanelConfig()` (`engine.js:306-362`), specifically the existing-panel reuse path (line 315-330).

## API Endpoints

### Templates
- `GET /api/cues` — list all templates and scenes
- `POST /api/cues/template` — save a template: `{ name, panels[] }`
- `DELETE /api/cues/template/:name` — remove template

### Scenes
- `POST /api/cues/scene` — save a scene: `{ name, template, vars }` or `{ name, panels[] }` (direct, no template)
- `POST /api/cues/scene/save-current` — snapshot current panels as a scene: `{ name }`
- `DELETE /api/cues/scene/:name` — remove scene

### Recall
- `POST /api/cues/recall` — recall a scene or template: `{ name }`. Resolves variables, sanitizes panels, broadcasts.

### Keyboard
- `G` key — save current state as a scene (prompts for name via CoT overlay? Or auto-names: `scene-001`, `scene-002`...)
- Could also use Shift+1-9 to save to numbered slots, 1-9 in a cue mode to recall

## Autopilot Integration

The autopilot's `step()` method changes to:
1. Compute energy-based params (existing)
2. Build a **combined pool**: saved cues (templates resolved with current vars) + hardcoded generative scenes
3. Filter pool by energy proximity (auto-inferred energy within ±0.3 of current autopilot energy)
4. Pick randomly from filtered pool
5. If no saved cues match energy, fall back to generative scenes (current behavior)

The existing `getScenes()` becomes one source of scenes among several.

## Variable Resolution

A `resolveTemplate(template, vars, ctx)` function on the server:
- `ctx` = `{ anchor, images, energy }` (current autopilot context)
- Walks each panel, replaces `$tokens` in source/source2/effect fields
- Falls back to token's default behavior if not in `vars`
- Returns sanitized panel array ready for broadcast

## Files to Modify

- **`vj/server.js`** — Add cue storage, load/save, API endpoints, resolveTemplate(), modify autopilot step()
- **`vj/public/js/engine.js`** — Add cross-fade logic in applyPanelConfig(), add G key handler
- **`vj/cues.json`** — New file, created on first save (or with empty defaults)
- **`vj/test/api.test.js`** — Add tests for cue CRUD and variable resolution

## Implementation Order

1. **Cross-fade** in engine.js (small, self-contained, immediate visual improvement)
2. **Cue data model + storage** in server.js (load/save cues.json)
3. **Variable resolution** function
4. **API endpoints** for save/recall/list/delete
5. **Convert hardcoded layouts to built-in templates**
6. **Autopilot integration** — mixed pool selection
7. **Keyboard shortcut** for quick-save
8. **Tests**

## Verification

1. Restart server, verify cues.json loads (or creates empty)
2. Use API to save current state: `POST /api/cues/scene/save-current {"name":"test"}`
3. Change panels manually, then recall: `POST /api/cues/recall {"name":"test"}`
4. Verify panels cross-fade smoothly to the recalled scene
5. Save a template with `$random` tokens, recall multiple times — verify different sources each time
6. Run autopilot, verify it mixes saved cues with generative scenes
7. Run `npm test` — all existing + new tests pass
