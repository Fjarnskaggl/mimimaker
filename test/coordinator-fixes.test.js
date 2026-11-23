// Coordinator follow-ups: the flush power box in the guide, and new pieces
// landing in a free spot on the floor plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { collisions, findFreeSpot, footprint } from '../src/plan.js';

const lightingSteps = (kit) => compileKit(kit).groups.find((g) => g.title === 'Lighting')?.steps.join('\n') || '';

test('the guide says to fit a flush power box behind the wall, not glue it outside', () => {
  const kit = defaultKit();
  kit.lighting.enabled = true;
  assert.match(lightingSteps(kit), /Glue the power box to the outside/, 'the outside box keeps its wording');
  kit.lighting.power = { ...kit.lighting.power, mount: 'flush' };
  const steps = lightingSteps(kit);
  assert.doesNotMatch(steps, /to the outside of the/);
  assert.match(steps, /behind the \w+ wall/);
  assert.match(steps, /cut-out/);
});

test('findFreeSpot puts a new floor piece where it overlaps nothing', () => {
  const kit = defaultKit();
  const item = { type: 'table', params: {}, x: 0, y: 0, rot: 0 };
  const spot = findFreeSpot(kit, item, { step: 5 });
  assert.ok(spot, 'the default room has room for a table');
  kit.items.push({ ...item, ...spot });
  assert.deepEqual(collisions(kit).filter((pair) => pair.includes(kit.items.length - 1)), []);
  const f = footprint(kit.items.at(-1));
  assert.ok(f.x0 >= 0 && f.y0 >= 0 && f.x1 <= kit.room.width && f.y1 <= kit.room.depth, 'inside the room');
  assert.equal(spot.x % 5, 0);
  assert.equal(spot.y % 5, 0);
});

test('findFreeSpot returns null when the floor is full', () => {
  const kit = defaultKit();
  kit.room.width = 60; kit.room.depth = 50;
  kit.items = [{ type: 'table', params: { w: 60, d: 50 }, x: 0, y: 0, rot: 0 }];
  assert.equal(findFreeSpot(kit, { type: 'chair', params: {}, rot: 0 }), null);
});
