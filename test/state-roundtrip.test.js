// Round-trip properties for controls with side effects: switching something
// on and back off again (or to another choice and back) must leave the kit as
// it was, so the control agrees with Undo. Same class of bug as the cable
// cover's power box (#131).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit } from '../src/catalog.js';
import { applyRoomType, ROOM_TYPES } from '../src/templates.js';
import { setShellType } from '../src/ui/t2.js';
import { SHELLS } from '../src/shells/index.js';

const clone = (x) => structuredClone(x);

test('starting from a room type replaces a book nook shell too, so the room is the room type\'s', () => {
  for (const type of Object.keys(SHELLS)) {
    const kit = defaultKit();
    setShellType(kit, type);
    const next = applyRoomType(kit, 'kitchen');
    assert.ok(!next.shell, `${type}: the kitchen should not stay inside the ${type} shell`);
    assert.deepEqual(next.room, ROOM_TYPES.find((r) => r.id === 'kitchen').kit.room, `${type}: the kitchen's own room`);
  }
});

test('every shell switched on and off again leaves the room and the power box as they were', () => {
  for (const type of Object.keys(SHELLS)) {
    for (const power of [{ wall: 'left', pos: 40, elev: 120, kind: 'battery' }, { wall: 'back', pos: 900, elev: 700, kind: 'battery' }]) {
      const kit = defaultKit();
      kit.lighting.power = clone(power);
      const room = clone(kit.room);
      setShellType(kit, type);
      setShellType(kit, '');
      assert.deepEqual(kit.room, room, `${type}: room`);
      assert.deepEqual(kit.lighting.power, power, `${type}: power box at ${JSON.stringify(power)}`);
    }
  }
});

test('switching to another shell and back keeps the first shell\'s settings', () => {
  const kit = defaultKit();
  setShellType(kit, 'alley');
  kit.shell.params = { buildings: 5, layers: 3 };
  kit.shell.gap = { w: 120, h: 250, d: 200 };
  setShellType(kit, 'greenhouse');
  setShellType(kit, 'alley');
  assert.deepEqual(kit.shell.params, { buildings: 5, layers: 3 });
  assert.deepEqual(kit.shell.gap, { w: 120, h: 250, d: 200 });
});
