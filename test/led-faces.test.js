// Each light's glow in the 3D preview carries its index in kit.lighting.leds,
// so a click on a bulb selects the right light even when some lights don't
// get built (a ceiling light in a room without a ceiling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

test('glow faces carry the light’s kit index, skipping lights that are not built', () => {
  const kit = defaultKit();
  kit.room.ceiling = false;
  kit.lighting.enabled = true;
  kit.lighting.leds = [
    { mount: 'ceiling', x: 100, y: 100, color: 'warm' },
    { mount: 'wall', wall: 'back', pos: 60, elev: 150, color: 'warm' },
    { mount: 'wall', wall: 'left', pos: 60, elev: 150, color: 'cool' },
  ];
  const { faces3d } = compileKit(kit);
  const tagged = [...new Set(faces3d.filter((f) => f.glow).map((f) => f.led))].sort();
  assert.deepEqual(tagged, [1, 2]);
});
