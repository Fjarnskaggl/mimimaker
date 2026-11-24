// Round-trip properties: a choice switched away and back must give back what
// the person had set, not the new choice's defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MATERIALS, switchBlade, TOOL_NAMES } from '../src/materials.js';
import { setEffect } from '../src/ui/t5.js';
import { EFFECTS } from '../src/lighting/effects.js';

test('a material switched to another blade and back keeps its own cut settings', () => {
  for (const preset of DEFAULT_MATERIALS) {
    for (const tool of Object.keys(TOOL_NAMES)) {
      if (tool === preset.tool) continue;
      const m = structuredClone(preset);
      m.passes = 7; // a setting the person tuned
      const want = structuredClone(m);
      switchBlade(m, tool);
      assert.equal(m.tool, tool);
      switchBlade(m, preset.tool);
      assert.deepEqual(m, want, `${preset.id}: ${preset.tool} → ${tool} → ${preset.tool}`);
    }
  }
});

test('a new blade still starts from that blade\'s own settings', () => {
  const m = structuredClone(DEFAULT_MATERIALS.find((x) => x.tool === 'knife'));
  switchBlade(m, 'fine');
  assert.notEqual(m.cricut, DEFAULT_MATERIALS.find((x) => x.tool === 'knife').cricut);
});

test('a light switched to another effect and back keeps the sizes typed for it', () => {
  const ids = Object.keys(EFFECTS);
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const led = { mount: 'wall', color: 'warm' };
      setEffect(led, a);
      for (const k of Object.keys(EFFECTS[a].defaults || {})) led[k] = EFFECTS[a].defaults[k] + 3;
      const want = structuredClone(led);
      setEffect(led, b);
      setEffect(led, a);
      assert.deepEqual(led, want, `${a} → ${b} → ${a}`);
    }
  }
});

test('an untouched effect leaves nothing behind when switched away and back', () => {
  const led = { mount: 'wall', color: 'warm' };
  setEffect(led, 'fairy');
  setEffect(led, 'steady');
  assert.deepEqual(led, { mount: 'wall', color: 'warm' });
});

import { setGableRoof } from '../src/ui/t2.js';
test('a gable roof switched off and on again keeps its pitch; off and on from nothing leaves nothing', () => {
  const room = { width: 200 };
  setGableRoof(room, true);
  room.roof.pitch = 55;
  setGableRoof(room, false);
  assert.notEqual(room.roof?.type, 'gable', 'off means no roof is built');
  setGableRoof(room, true);
  assert.deepEqual(room.roof, { type: 'gable', pitch: 55 });
  const plain = { width: 200 };
  setGableRoof(plain, true);
  setGableRoof(plain, false);
  assert.deepEqual(plain, { width: 200 });
});
