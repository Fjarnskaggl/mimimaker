// Wiring review (Light step): every toggle in the Power section undoes itself
// when toggled back, the same as Undo, and the kit keeps what was set when it
// is reloaded, opened from a file or restored by undo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setCover, coverMoveText, setEffect } from '../src/ui/t5.js';
import { normalizeLighting } from '../src/lighting.js';
import { EFFECTS } from '../src/lighting/effects.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

const range = { pos: [80, 270], elev: [50, 200] };

test('cover on then off puts a moved power box back where it was', () => {
  const L = { power: { wall: 'back', pos: 300, elev: 25 } };
  const on = setCover(L, true, range);
  assert.deepEqual([L.power.pos, L.power.elev], [270, 50], 'moved into the cover');
  assert.deepEqual(on, { from: [300, 25], to: [270, 50] });
  const off = setCover(L, false, range);
  assert.deepEqual([L.power.pos, L.power.elev], [300, 25], 'back where it was');
  assert.deepEqual(off, { from: [270, 50], to: [300, 25] });
  assert.equal(L.cover, undefined, 'off is stored as nothing');
  // and again: the same toggle gives the same result every time
  setCover(L, true, range);
  setCover(L, false, range);
  assert.deepEqual([L.power.pos, L.power.elev], [300, 25]);
});

test('cover off leaves a box the user moved after turning it on', () => {
  const L = { power: { wall: 'back', pos: 300, elev: 25 } };
  setCover(L, true, range);
  L.power.pos = 120;
  assert.equal(setCover(L, false, range), null);
  assert.deepEqual([L.power.pos, L.power.elev], [120, 50]);
  const wall = { power: { wall: 'back', pos: 300, elev: 25 } };
  setCover(wall, true, range);
  wall.power.wall = 'left';
  setCover(wall, false, range);
  assert.deepEqual([wall.power.pos, wall.power.elev], [270, 50], 'nor one moved to another wall');
});

test('a box with no position yet goes back to where it was drawn (0, 0), not to nowhere', () => {
  const L = { power: { wall: 'back' } };
  setCover(L, true, range);
  assert.deepEqual([L.power.pos, L.power.elev], [80, 50]);
  setCover(L, false, range);
  assert.deepEqual([L.power.pos, L.power.elev], [0, 0]);
});

test('the cover move reads as a sentence for the toast', () => {
  assert.equal(coverMoveText(null, true), null);
  assert.match(coverMoveText({ from: [300, 25], to: [270, 50] }, true), /Moved the power box to 270 cm along, 50 cm up/);
  assert.match(coverMoveText({ from: [270, 50], to: [300, 25] }, false), /back to 300 cm along, 25 cm up/);
});

test('reloading, opening or undoing a kit keeps its cable cover', () => {
  const L = { enabled: true, holeDiameter: 2, power: { wall: 'back', pos: 150, elev: 60, kind: 'battery' }, leds: [], cover: { enabled: true, moved: { from: [300, 25], to: [270, 50] } } };
  const back = normalizeLighting(JSON.parse(JSON.stringify(L)));
  assert.deepEqual(back.cover, L.cover);
  assert.equal(back.holeDiameter, 2);
  const empty = normalizeLighting({});
  assert.deepEqual(empty, { enabled: false, holeDiameter: 3, power: { wall: 'back', pos: 20, elev: 20, kind: 'battery' }, leds: [] });
  // and the cover parts are still cut after the round trip
  const kit = defaultKit();
  kit.lighting = normalizeLighting(JSON.parse(JSON.stringify({ ...kit.lighting, enabled: true, cover: { enabled: true } })));
  assert.ok(compileKit(kit).parts.some((p) => p.name === 'Cable cover panel'));
});

test('a new effect starts from its own sizes, not the last effect\'s', () => {
  const led = { mount: 'wall' };
  setEffect(led, 'fairy');
  led.lengthMm = 800;
  setEffect(led, 'strip');
  assert.equal(led.lengthMm, EFFECTS.strip.defaults.lengthMm, 'a strip is not as long as the fairy string was');
  const fan = { mount: 'ceiling' };
  setEffect(fan, 'fan');
  fan.sizeMm = 120;
  setEffect(fan, 'turntable');
  assert.equal(fan.sizeMm, EFFECTS.turntable.defaults.sizeMm);
  fan.sizeMm = 90;
  setEffect(fan, 'turntable');
  assert.equal(fan.sizeMm, 90, 'picking the same effect again keeps what was typed');
});
