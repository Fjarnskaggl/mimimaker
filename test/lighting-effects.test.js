import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, effectOf, effectLoad, effectWarnings } from '../src/lighting/effects.js';
import { planCircuit, ledSpec } from '../src/lighting/circuit.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

test('effect catalogue: steady, candle flicker, fairy string, LED strip', () => {
  assert.deepEqual(Object.keys(EFFECTS).sort(), ['candle', 'fairy', 'steady', 'strip']);
  for (const e of Object.values(EFFECTS)) assert.ok(e.name && e.blurb, 'named and described');
  assert.equal(effectOf({}), 'steady', 'old kits are steady LEDs');
  assert.equal(effectOf({ effect: 'nope' }), 'steady');
  assert.equal(effectOf({ effect: 'candle' }), 'candle');
});

test('loads: candle flickers below full power, strings and strips add up per bulb', () => {
  const steady = effectLoad({ color: 'warm' });
  assert.deepEqual(steady, { color: 'warm', mA: ledSpec('warm').mA, duty: 1, bulbs: 1, needs5V: false });

  const candle = effectLoad({ effect: 'candle', color: 'amber' });
  assert.equal(candle.mA, ledSpec('amber').mA, 'peak is a full LED');
  assert.ok(candle.duty > 0.3 && candle.duty < 1, 'average is lower');

  const fairy = effectLoad({ effect: 'fairy', bulbs: 10 });
  assert.equal(fairy.bulbs, 10);
  assert.equal(fairy.mA, 10 * EFFECTS.fairy.mAPerBulb);
  assert.ok(EFFECTS.fairy.mAPerBulb >= 3, 'conservative per-bulb current');
  assert.equal(effectLoad({ effect: 'fairy' }).bulbs, EFFECTS.fairy.defaults.bulbs);

  const strip = effectLoad({ effect: 'strip', lengthMm: 100, ledsPerM: 60 });
  assert.equal(strip.bulbs, 6);
  assert.equal(strip.mA, 6 * EFFECTS.strip.mAPerLed);
  assert.equal(strip.needs5V, true);
});

test('the circuit takes effect loads: peak for the budget, duty for battery life', () => {
  const loads = [effectLoad({ effect: 'candle' }), effectLoad({ effect: 'fairy', bulbs: 10 })];
  const c = planCircuit(loads, 'aa2');
  assert.equal(c.count, 2, 'two lights');
  assert.equal(c.bulbs, 11);
  assert.equal(c.totalMA, loads[0].mA + loads[1].mA);
  assert.ok(c.averageMA < c.totalMA);
  // ten fairy bulbs on a coin cell is more than it handles comfortably
  assert.equal(planCircuit([effectLoad({ effect: 'fairy', bulbs: 10 })], 'cr2032').status, 'warn');
});

test('LED strips need 5 V: an error on batteries, fine on USB', () => {
  const strip = effectLoad({ effect: 'strip', lengthMm: 50 });
  const bat = planCircuit([strip], 'aa2');
  assert.equal(bat.status, 'error');
  assert.ok(bat.warnings.some((w) => w.level === 'error' && /strip/i.test(w.msg) && /USB/.test(w.msg)));
  assert.notEqual(planCircuit([strip], 'usb').status, 'error');
});

// placement: { face, mount, start (mm along the run), span (mm available on that face) }
test('placement rules', () => {
  const wall = { face: 'back', mount: 'wall', start: 20, span: 125 };
  assert.deepEqual(effectWarnings({}, wall, 'L1'), []);
  // candles stand up: not on the ceiling
  assert.ok(effectWarnings({ effect: 'candle' }, { ...wall, face: 'top', mount: 'ceiling' }, 'L1').some((w) => /ceiling/i.test(w.msg)));
  assert.deepEqual(effectWarnings({ effect: 'candle' }, wall, 'L1'), []);
  // strips must fit their wall from where they start
  const tooLong = effectWarnings({ effect: 'strip', lengthMm: 150 }, wall, 'L2');
  assert.ok(tooLong.some((w) => w.level === 'warn' && /L2/.test(w.msg) && /past the end/.test(w.msg)));
  assert.ok(!effectWarnings({ effect: 'strip', lengthMm: 50 }, wall, 'L2').some((w) => /past the end/.test(w.msg)));
  // strips are cut only at their cut marks
  const odd = effectWarnings({ effect: 'strip', lengthMm: 60, ledsPerM: 60 }, wall, 'L2');
  assert.ok(odd.some((w) => w.level === 'info' && /cut/i.test(w.msg) && /50 mm/.test(w.msg)));
  // a very long fairy string gets a coiling hint
  assert.ok(effectWarnings({ effect: 'fairy', lengthMm: 1000 }, wall, 'L3').some((w) => w.level === 'info' && /coil/i.test(w.msg)));
  assert.deepEqual(effectWarnings({ effect: 'fairy', lengthMm: 150 }, wall, 'L3'), []);
});

test('compileKit: effects reach the circuit and the warnings', () => {
  const kit = defaultKit();
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, kind: 'battery', supply: 'aa2' };
  kit.lighting.leds = [
    { name: 'Candle', effect: 'candle', mount: 'wall', wall: 'back', pos: 60, elev: 120, color: 'amber' },
    { name: 'Shelf strip', effect: 'strip', lengthMm: 50, mount: 'wall', wall: 'left', pos: 40, elev: 150, color: 'warm' },
  ];
  const r = compileKit(kit);
  assert.equal(r.lighting.leds[0].effect, 'candle');
  assert.equal(r.lighting.leds[1].effect, 'strip');
  assert.equal(r.lighting.circuit.count, 2);
  assert.ok(r.lighting.circuit.averageMA < r.lighting.circuit.totalMA, 'candle flicker credited');
  assert.ok(r.warnings.some((w) => w.level === 'error' && /strip/i.test(w.msg)), 'strip on batteries flagged');
  kit.lighting.power = { ...kit.lighting.power, kind: 'usb', supply: 'usb' };
  assert.ok(!compileKit(kit).warnings.some((w) => w.level === 'error'));
});
