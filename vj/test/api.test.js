// API validation and scene replication tests
// Run: node --test test/api.test.js
// Requires server running on localhost:3000

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const BASE = 'http://localhost:3000';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: await res.json() };
}

describe('API validation', () => {
  it('GET /api/state returns valid state', async () => {
    const { status, data } = await get('/api/state');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.panels));
    assert.ok(data.panels.length > 0);
    assert.strictEqual(typeof data.mode, 'string');
    assert.strictEqual(typeof data.flash, 'number');
    assert.strictEqual(typeof data.blackout, 'boolean');
    assert.strictEqual(typeof data.activePanel, 'number');
  });

  it('POST /api/panels rejects empty array', async () => {
    const { status, data } = await post('/api/panels', { panels: [] });
    assert.strictEqual(status, 400);
    assert.ok(data.error);
  });

  it('POST /api/panels rejects non-array', async () => {
    const { status } = await post('/api/panels', { panels: 'bad' });
    assert.strictEqual(status, 400);
  });

  it('POST /api/panels rejects >8 panels', async () => {
    const panels = Array.from({ length: 9 }, (_, i) => ({
      id: i, rect: { x: 0, y: 0, w: 0.1, h: 0.1 }, effect: 'feedback',
    }));
    const { status, data } = await post('/api/panels', { panels });
    assert.strictEqual(status, 400);
    assert.ok(data.error.includes('8'));
  });

  it('POST /api/panels clamps out-of-range rect values', async () => {
    const { data } = await post('/api/panels', {
      panels: [{ id: 0, rect: { x: -5, y: 99, w: 0, h: -1 }, effect: 'feedback' }],
    });
    assert.ok(data.ok);
    const p = data.panels[0];
    assert.strictEqual(p.rect.x, 0);
    assert.strictEqual(p.rect.y, 1);
    assert.ok(p.rect.w >= 0.01);
    assert.ok(p.rect.h >= 0.01);
  });

  it('POST /api/panels replaces invalid effect with feedback', async () => {
    const { data } = await post('/api/panels', {
      panels: [{ id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'doesnotexist' }],
    });
    assert.strictEqual(data.panels[0].effect, 'feedback');
  });

  it('POST /api/panels clamps state values', async () => {
    const { data } = await post('/api/panels', {
      panels: [{
        id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'glitch',
        state: { intensity: 999, rotation: 50, feedbackAmount: -5, brightness: 100 },
      }],
    });
    const s = data.panels[0].state;
    assert.strictEqual(s.intensity, 1);
    assert.strictEqual(s.rotation, 0.1);
    assert.strictEqual(s.feedbackAmount, 0);
    assert.strictEqual(s.brightness, 2);
  });

  it('POST /api/panels returns sanitized data (not raw input)', async () => {
    const { data } = await post('/api/panels', {
      panels: [{ id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'INVALID' }],
    });
    // Server state should match the response
    const { data: stateData } = await get('/api/state');
    assert.strictEqual(stateData.panels[0].effect, data.panels[0].effect);
    assert.strictEqual(data.panels[0].effect, 'feedback');
  });
});

describe('PATCH /api/panel/:id', () => {
  before(async () => {
    // Set up a known panel
    await post('/api/panels', {
      panels: [{ id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback', state: { intensity: 0.5 } }],
    });
  });

  it('rejects invalid panel id', async () => {
    const { status } = await patch('/api/panel/abc', { effect: 'glitch' });
    assert.strictEqual(status, 400);
  });

  it('returns 404 for non-existent panel', async () => {
    const { status } = await patch('/api/panel/99', { effect: 'glitch' });
    assert.strictEqual(status, 404);
  });

  it('updates effect via sanitization', async () => {
    const { data } = await patch('/api/panel/0', { effect: 'glitch' });
    assert.ok(data.ok);
    assert.strictEqual(data.panel.effect, 'glitch');
  });

  it('rejects invalid effect', async () => {
    const { data } = await patch('/api/panel/0', { effect: 'badeffect' });
    // Should keep previous valid effect, not set to badeffect
    assert.notStrictEqual(data.panel.effect, 'badeffect');
  });

  it('clamps state values via sanitizePanel', async () => {
    const { data } = await patch('/api/panel/0', {
      state: { intensity: 999, rotation: -999 },
    });
    assert.strictEqual(data.panel.state.intensity, 1);
    assert.strictEqual(data.panel.state.rotation, -0.1);
  });

  it('preserves existing state fields not in patch', async () => {
    await patch('/api/panel/0', { state: { intensity: 0.7 } });
    const { data } = await patch('/api/panel/0', { state: { rotation: 0.005 } });
    // intensity should still be 0.7 (not reset)
    assert.strictEqual(data.panel.state.intensity, 0.7);
    assert.strictEqual(data.panel.state.rotation, 0.005);
  });

  it('does not allow id or rect change', async () => {
    const { data } = await patch('/api/panel/0', {
      id: 99,
      rect: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
    });
    assert.strictEqual(data.panel.id, 0);
    assert.strictEqual(data.panel.rect.x, 0);
  });
});

describe('Scene replication', () => {
  it('/api/state matches after /api/panels POST', async () => {
    const panels = [
      { id: 0, rect: { x: 0, y: 0, w: 0.5, h: 1 }, effect: 'feedback', source: null },
      { id: 1, rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, effect: 'glitch', source: 'color:#ff0000' },
    ];
    await post('/api/panels', { panels });
    const { data } = await get('/api/state');
    assert.strictEqual(data.panels.length, 2);
    assert.strictEqual(data.panels[0].effect, 'feedback');
    assert.strictEqual(data.panels[1].effect, 'glitch');
    assert.strictEqual(data.panels[1].source, 'color:#ff0000');
  });

  it('/api/state matches after PATCH', async () => {
    await patch('/api/panel/0', { effect: 'noise', state: { intensity: 0.3 } });
    const { data } = await get('/api/state');
    assert.strictEqual(data.panels[0].effect, 'noise');
    assert.strictEqual(data.panels[0].state.intensity, 0.3);
  });

  it('flash is ephemeral in /api/state', async () => {
    await post('/api/flash', {});
    const { data } = await get('/api/state');
    assert.strictEqual(data.flash, 0);
  });

  it('blackout toggles correctly', async () => {
    await post('/api/blackout', { enabled: true });
    let { data } = await get('/api/state');
    assert.strictEqual(data.blackout, true);
    await post('/api/blackout', { enabled: false });
    ({ data } = await get('/api/state'));
    assert.strictEqual(data.blackout, false);
  });

  it('mode changes propagate to state', async () => {
    await post('/api/mode', { mode: 'manual' });
    let { data } = await get('/api/state');
    assert.strictEqual(data.mode, 'manual');
    await post('/api/mode', { mode: 'autonomous' });
    ({ data } = await get('/api/state'));
    assert.strictEqual(data.mode, 'autonomous');
  });
});

async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  return { status: res.status, data: await res.json() };
}

describe('Cue system — templates', () => {
  const templateName = '__test_template__';

  after(async () => {
    // Clean up
    await del(`/api/cues/template/${templateName}`);
  });

  it('GET /api/cues returns templates and scenes', async () => {
    const { status, data } = await get('/api/cues');
    assert.strictEqual(status, 200);
    assert.ok(data.templates);
    assert.ok(data.scenes);
    // Built-in templates from LAYOUTS should be present
    assert.ok(data.templates['full'], 'built-in "full" template should exist');
    assert.ok(data.templates['cinema'], 'built-in "cinema" template should exist');
  });

  it('POST /api/cues/template saves a template', async () => {
    const { status, data } = await post('/api/cues/template', {
      name: templateName,
      panels: [
        { id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback', source: '$anchor' },
      ],
    });
    assert.strictEqual(status, 200);
    assert.ok(data.ok);
    assert.strictEqual(data.template.name, templateName);
  });

  it('saved template appears in GET /api/cues', async () => {
    const { data } = await get('/api/cues');
    assert.ok(data.templates[templateName]);
  });

  it('POST /api/cues/template rejects missing name', async () => {
    const { status } = await post('/api/cues/template', {
      panels: [{ id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback' }],
    });
    assert.strictEqual(status, 400);
  });

  it('POST /api/cues/template rejects missing panels', async () => {
    const { status } = await post('/api/cues/template', { name: 'bad' });
    assert.strictEqual(status, 400);
  });

  it('DELETE /api/cues/template removes it', async () => {
    // Save one first
    await post('/api/cues/template', {
      name: '__to_delete__',
      panels: [{ id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback' }],
    });
    const { status, data } = await del('/api/cues/template/__to_delete__');
    assert.strictEqual(status, 200);
    assert.ok(data.ok);
    // Verify gone
    const { data: cuesData } = await get('/api/cues');
    assert.ok(!cuesData.templates['__to_delete__']);
  });

  it('DELETE /api/cues/template returns 404 for non-existent', async () => {
    const { status } = await del('/api/cues/template/__does_not_exist__');
    assert.strictEqual(status, 404);
  });
});

describe('Cue system — scenes', () => {
  const sceneName = '__test_scene__';

  after(async () => {
    await del(`/api/cues/scene/${sceneName}`);
    await del('/api/cues/scene/__saved_current__');
  });

  it('POST /api/cues/scene saves a direct scene', async () => {
    const { status, data } = await post('/api/cues/scene', {
      name: sceneName,
      panels: [
        { id: 0, rect: { x: 0, y: 0, w: 0.5, h: 1 }, effect: 'feedback', source: null },
        { id: 1, rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, effect: 'glitch', source: 'color:#ff0000' },
      ],
    });
    assert.strictEqual(status, 200);
    assert.ok(data.ok);
    assert.strictEqual(data.scene.name, sceneName);
  });

  it('POST /api/cues/scene saves a template-based scene', async () => {
    // First save a template
    await post('/api/cues/template', {
      name: '__tmpl_for_scene__',
      panels: [
        { id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: '$effect', source: '$anchor' },
      ],
    });
    const { status, data } = await post('/api/cues/scene', {
      name: '__tmpl_scene__',
      template: '__tmpl_for_scene__',
      vars: { '$anchor': 'color:#00ff00' },
    });
    assert.strictEqual(status, 200);
    assert.ok(data.ok);
    assert.strictEqual(data.scene.template, '__tmpl_for_scene__');

    // Clean up
    await del('/api/cues/scene/__tmpl_scene__');
    await del('/api/cues/template/__tmpl_for_scene__');
  });

  it('POST /api/cues/scene rejects missing name', async () => {
    const { status } = await post('/api/cues/scene', {
      panels: [{ id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback' }],
    });
    assert.strictEqual(status, 400);
  });

  it('POST /api/cues/scene rejects missing template and panels', async () => {
    const { status } = await post('/api/cues/scene', { name: 'bad' });
    assert.strictEqual(status, 400);
  });

  it('POST /api/cues/scene/save-current snapshots current panels', async () => {
    // Set up known panels first
    await post('/api/panels', {
      panels: [{ id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback', source: null }],
    });
    const { status, data } = await post('/api/cues/scene/save-current', { name: '__saved_current__' });
    assert.strictEqual(status, 200);
    assert.ok(data.ok);
    assert.strictEqual(data.scene.name, '__saved_current__');
    assert.ok(Array.isArray(data.scene.panels));
    assert.strictEqual(data.scene.panels.length, 1);
  });

  it('POST /api/cues/scene/save-current auto-names when no name given', async () => {
    const { data } = await post('/api/cues/scene/save-current', {});
    assert.ok(data.ok);
    assert.ok(data.scene.name.startsWith('scene-'));
    // Clean up
    await del(`/api/cues/scene/${data.scene.name}`);
  });

  it('DELETE /api/cues/scene removes it', async () => {
    await post('/api/cues/scene', {
      name: '__to_delete_scene__',
      panels: [{ id: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, effect: 'feedback' }],
    });
    const { status } = await del('/api/cues/scene/__to_delete_scene__');
    assert.strictEqual(status, 200);
  });

  it('DELETE /api/cues/scene returns 404 for non-existent', async () => {
    const { status } = await del('/api/cues/scene/__nope__');
    assert.strictEqual(status, 404);
  });
});

describe('Cue system — recall', () => {
  before(async () => {
    // Set up a direct scene and a template for recall tests
    await post('/api/cues/scene', {
      name: '__recall_direct__',
      panels: [
        { id: 0, rect: { x: 0, y: 0, w: 0.6, h: 1 }, effect: 'glitch', source: 'color:#aabbcc',
          state: { intensity: 0.8 } },
        { id: 1, rect: { x: 0.6, y: 0, w: 0.4, h: 1 }, effect: 'noise', source: null },
      ],
    });
    await post('/api/cues/template', {
      name: '__recall_tmpl__',
      panels: [
        { id: 0, rect: { x: 0, y: 0, w: 1, h: 0.5 }, effect: 'feedback', source: '$dark' },
        { id: 1, rect: { x: 0, y: 0.5, w: 1, h: 0.5 }, effect: '$effect', source: '$dark' },
      ],
    });
  });

  after(async () => {
    await del('/api/cues/scene/__recall_direct__');
    await del('/api/cues/template/__recall_tmpl__');
  });

  it('POST /api/cues/recall recalls a direct scene', async () => {
    const { status, data } = await post('/api/cues/recall', { name: '__recall_direct__' });
    assert.strictEqual(status, 200);
    assert.ok(data.ok);
    assert.strictEqual(data.panels.length, 2);
    assert.strictEqual(data.panels[0].effect, 'glitch');
    assert.strictEqual(data.panels[0].source, 'color:#aabbcc');
    // Verify state was applied
    const { data: stateData } = await get('/api/state');
    assert.strictEqual(stateData.panels.length, 2);
    assert.strictEqual(stateData.panels[0].effect, 'glitch');
  });

  it('POST /api/cues/recall recalls a template with variable resolution', async () => {
    const { status, data } = await post('/api/cues/recall', { name: '__recall_tmpl__' });
    assert.strictEqual(status, 200);
    assert.ok(data.ok);
    assert.strictEqual(data.panels.length, 2);
    // $dark should have resolved to a color:# value
    assert.ok(data.panels[0].source.startsWith('color:#'), `expected color source, got: ${data.panels[0].source}`);
    assert.ok(data.panels[1].source.startsWith('color:#'));
    // $effect should have resolved to a valid effect name
    const validEffects = ['feedback', 'glitch', 'colorshift', 'noise', 'kaleidoscope', 'vhs', 'pixelate', 'mirror'];
    assert.ok(validEffects.includes(data.panels[1].effect), `unexpected effect: ${data.panels[1].effect}`);
  });

  it('POST /api/cues/recall recalls a built-in layout by name', async () => {
    const { status, data } = await post('/api/cues/recall', { name: 'spotlight' });
    assert.strictEqual(status, 200);
    assert.ok(data.ok);
    assert.strictEqual(data.panels.length, 3);
  });

  it('POST /api/cues/recall returns 404 for non-existent cue', async () => {
    const { status } = await post('/api/cues/recall', { name: '__nope__' });
    assert.strictEqual(status, 404);
  });

  it('POST /api/cues/recall rejects missing name', async () => {
    const { status } = await post('/api/cues/recall', {});
    assert.strictEqual(status, 400);
  });
});
