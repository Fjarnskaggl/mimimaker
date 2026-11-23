// Moving and sound parts on the light circuit: a ceiling fan or turntable
// on a geared micro motor, a vibration disc, and a looping sound board.
// They need no controller: each is one more load on the battery box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, effectLoad, effectWarnings } from '../src/lighting/effects.js';
import { MOTION, fanRotor, turntableDisc, effectHoles } from '../src/lighting/motion.js';
import { planCircuit } from '../src/lighting/circuit.js';
import { shoppingList } from '../src/lighting/shopping.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { bbox, pointInPolygon } from '../src/geometry.js';
import { EFFECT_OPTIONS, effectFieldSpecs, setEffect } from '../src/ui/t5.js';

function kitWith(leds, power = {}) {
  const kit = defaultKit();
  kit.openings = [];
  kit.room.ceiling = true;
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, kind: 'battery', supply: 'aa2', ...power };
  kit.lighting.leds = leds;
  return kit;
}
const wall = (o = {}) => ({ mount: 'wall', wall: 'back', pos: 80, elev: 150, color: 'warm', ...o });
const fan = { mount: 'ceiling', x: 150, y: 100, effect: 'fan', sizeMm: 60 };
const table = { mount: 'floor', x: 100, y: 100, effect: 'turntable', sizeMm: 50 };

test('effects: fan, turntable, vibration and sound are on the list, each a device with no LED', () => {
  for (const id of ['fan', 'turntable', 'vibe', 'sound']) {
    assert.ok(EFFECTS[id], id);
    const load = effectLoad({ effect: id });
    assert.equal(load.device, true);
    assert.equal(load.bulbs, 0);
    assert.ok(load.mA > 0);
    assert.ok(EFFECT_OPTIONS.some(([k]) => k === id));
  }
  assert.ok(effectLoad({ effect: 'sound' }).duty < 1, 'sound is loud part of the time');
});

test('circuit: devices count as parts, not LEDs, and motors note their start-up surge', () => {
  const c = planCircuit([{ color: 'warm' }, effectLoad({ effect: 'fan' })], 'aa2');
  assert.equal(c.bulbs, 1);
  const msgs = c.warnings.map((w) => w.msg).join(' ');
  assert.match(msgs, /start/i);
  const only = planCircuit([effectLoad({ effect: 'vibe' })], 'aa2');
  assert.doesNotMatch(only.warnings.map((w) => w.msg).join(' '), /White, pink and green/, 'no LED dimming note without LEDs');
  const coin = planCircuit([effectLoad({ effect: 'fan' })], 'cr2032');
  assert.equal(coin.status, 'error', 'a coin cell cannot run a motor');
});

test('placement: a fan belongs on the ceiling, a turntable on the floor', () => {
  const place = { face: 'back', mount: 'wall', start: 10, span: 200 };
  assert.match(effectWarnings({ effect: 'fan' }, place, 'L1').map((w) => w.msg).join(' '), /ceiling/);
  assert.match(effectWarnings({ effect: 'turntable' }, place, 'L1').map((w) => w.msg).join(' '), /floor/);
  assert.deepEqual(effectWarnings({ effect: 'fan' }, { ...place, face: 'top', mount: 'ceiling' }, 'L1'), []);
});

test('fan rotor: one outline with blades out to the size, and a shaft hole at the hub', () => {
  const polys = fanRotor(0, 0, 60);
  assert.equal(polys.length, 2);
  const b = bbox([polys[0]]);
  assert.ok(Math.abs(b.w - 60) < 2 && Math.abs(b.h - 60) < 2);
  assert.ok(pointInPolygon([0, 0], polys[1]), 'shaft hole in the middle');
  assert.ok(!pointInPolygon([0, 25], polys[0]) || !pointInPolygon([25 * Math.SQRT1_2, 25 * Math.SQRT1_2], polys[0]), 'gaps between blades');
});

test('turntable disc: round, with a shaft hole', () => {
  const polys = turntableDisc(10, 10, 50);
  const b = bbox([polys[0]]);
  assert.ok(Math.abs(b.w - 50) < 0.5);
  assert.ok(pointInPolygon([10, 10], polys[1]));
});

test('holes: motors get a shaft hole, sound gets a speaker grille', () => {
  assert.equal(effectHoles('fan', 0, 0, 1.5).length, 1);
  assert.ok(Math.abs(bbox(effectHoles('fan', 0, 0, 1.5)).w - MOTION.shaftHole) < 0.1);
  const grille = effectHoles('sound', 0, 0, 1.5);
  assert.ok(grille.length >= 7);
  assert.ok(bbox(grille).w <= MOTION.speaker.d, 'grille inside the speaker');
  assert.equal(effectHoles('vibe', 0, 0, 1.5).length, 1);
  assert.equal(effectHoles('steady', 0, 0, 1.5).length, 1);
});

test('kit: a ceiling fan cuts its blades and motor mount, with steps, and draws the rotor in 3D', () => {
  const r = compileKit(kitWith([fan]));
  const L = r.lighting;
  const names = L.parts.map((p) => p.name);
  assert.ok(names.some((n) => /fan blades/i.test(n)));
  assert.ok(names.some((n) => /motor mount/i.test(n)));
  const steps = L.steps.join('\n');
  assert.match(steps, /motor/i);
  const blades = r.parts.find((p) => /fan blades/i.test(p.name));
  assert.ok(blades && Math.abs(blades.w - 60) < 2);
  assert.ok(!r.warnings.some((w) => /White, pink/.test(w.msg || w)));
});

test('kit: a turntable cuts its disc; sound and vibration add no cut parts', () => {
  const r = compileKit(kitWith([table, wall({ effect: 'sound' }), wall({ effect: 'vibe', pos: 40 })]));
  const names = r.lighting.parts.map((p) => p.name);
  assert.ok(names.some((n) => /turntable/i.test(n)));
  assert.equal(names.filter((n) => /sound|vibration/i.test(n)).length, 0);
  assert.match(r.lighting.steps.join('\n'), /T00HOLDL/);
});

test('shopping list: motors, vibration disc and the sound board with amp and speaker', () => {
  const list = shoppingList(compileKit(kitWith([fan, table, wall({ effect: 'vibe' }), wall({ effect: 'sound', pos: 40 })])).lighting);
  const ids = list.items.map((i) => i.id);
  assert.equal(list.items.find((i) => i.id === 'gear-motor').qty, 2);
  for (const id of ['vibe-disc', 'audio-fx', 'audio-amp', 'speaker']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.some((id) => id.startsWith('led-')), 'no LEDs bought for devices');
});

test('UI: fan and turntable have a size field; switching away drops it', () => {
  assert.deepEqual(effectFieldSpecs({ effect: 'fan' }).map((f) => f.key), ['sizeMm']);
  const led = { mount: 'ceiling' };
  setEffect(led, 'fan');
  assert.equal(led.sizeMm, EFFECTS.fan.defaults.sizeMm);
  setEffect(led, 'steady');
  assert.equal(led.sizeMm, undefined);
});
