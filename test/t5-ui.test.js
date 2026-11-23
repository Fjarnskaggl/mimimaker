import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPLY_OPTIONS, setSupply, circuitSummaryModel } from '../src/ui/t5.js';
import { planCircuit, SUPPLIES } from '../src/lighting/circuit.js';

test('supply picker offers every supply', () => {
  assert.deepEqual(SUPPLY_OPTIONS.map(([id]) => id).sort(), Object.keys(SUPPLIES).sort());
  for (const [, label] of SUPPLY_OPTIONS) assert.ok(label.length > 3);
});

test('picking a supply keeps the older power kind in step', () => {
  const power = { kind: 'battery', wall: 'back' };
  setSupply(power, 'usb');
  assert.deepEqual(power, { kind: 'usb', supply: 'usb', wall: 'back' });
  setSupply(power, 'cr2032');
  assert.equal(power.kind, 'battery');
  assert.equal(power.supply, 'cr2032');
  setSupply(power, 'bogus');
  assert.equal(power.supply, 'aa2');
});

test('circuit summary: rows, status and the estimate label', () => {
  const m = circuitSummaryModel(planCircuit([{ color: 'warm' }, { color: 'warm' }], 'aa2'));
  assert.equal(m.status, 'ok');
  assert.match(m.title, /2×AA/);
  const row = (k) => m.rows.find(([label]) => label === k)?.[1];
  assert.match(row('LEDs'), /^2, wired in parallel$/);
  assert.match(row('Current'), /40 mA/);
  assert.match(row('Current'), /250 mA/);
  assert.match(row('Battery life'), /about 32 hours/);
  assert.match(row('Battery life'), /estimate/);
  assert.ok(m.load > 0 && m.load <= 1);
  assert.match(m.note, /estimate/i);

  const usb = circuitSummaryModel(planCircuit([{ color: 'warm' }], 'usb'));
  assert.match(usb.rows.find(([k]) => k === 'Battery life')[1], /plugged in/);
  assert.doesNotMatch(usb.rows.find(([k]) => k === 'Battery life')[1], /estimate/);

  const over = circuitSummaryModel(planCircuit(Array(4).fill({ color: 'warm' }), 'cr2032'));
  assert.equal(over.status, 'error');
  assert.equal(over.load, 1, 'meter is capped');
  assert.ok(over.messages.some((t) => /CR2032/.test(t)));
});

test('no circuit, no summary', () => {
  assert.equal(circuitSummaryModel(null), null);
  assert.equal(circuitSummaryModel(planCircuit([], 'aa2')), null);
});

import { EFFECT_OPTIONS, setEffect, effectFieldSpecs, MOUNT_OPTIONS, setMount } from '../src/ui/t5.js';
import { EFFECTS } from '../src/lighting/effects.js';

test('effect picker offers every effect; choosing one fills its defaults', () => {
  assert.deepEqual(EFFECT_OPTIONS.map(([id]) => id).sort(), Object.keys(EFFECTS).sort());
  const led = { mount: 'wall', color: 'warm' };
  setEffect(led, 'strip');
  assert.equal(led.effect, 'strip');
  assert.equal(led.lengthMm, EFFECTS.strip.defaults.lengthMm);
  assert.equal(led.ledsPerM, EFFECTS.strip.defaults.ledsPerM);
  led.lengthMm = 150;
  setEffect(led, 'strip');
  assert.equal(led.lengthMm, 150, 'keeps what the user typed');
  setEffect(led, 'fairy');
  assert.equal(led.bulbs, EFFECTS.fairy.defaults.bulbs);
  setEffect(led, 'steady');
  assert.equal(led.effect, undefined, 'steady is the default, stored as nothing');
  assert.equal(led.bulbs, undefined);
  assert.equal(led.lengthMm, undefined);
  setEffect(led, 'nope');
  assert.equal(led.effect, undefined);
});

test('each effect lists the fields it needs', () => {
  assert.deepEqual(effectFieldSpecs({}), []);
  assert.deepEqual(effectFieldSpecs({ effect: 'candle' }), []);
  assert.deepEqual(effectFieldSpecs({ effect: 'fairy' }).map((f) => f.key), ['bulbs', 'lengthMm']);
  assert.deepEqual(effectFieldSpecs({ effect: 'strip' }).map((f) => f.key), ['lengthMm', 'ledsPerM']);
  for (const f of effectFieldSpecs({ effect: 'strip' })) assert.ok(f.label && f.min > 0);
});

test('mount picker: outside or flush behind the wall', () => {
  assert.deepEqual(MOUNT_OPTIONS.map(([id]) => id), ['outside', 'flush']);
  const p = { kind: 'battery' };
  setMount(p, 'flush');
  assert.equal(p.mount, 'flush');
  setMount(p, 'outside');
  assert.equal(p.mount, undefined, 'outside is the default, stored as nothing');
  setMount(p, 'bogus');
  assert.equal(p.mount, undefined);
});

import { setCover } from '../src/ui/t5.js';

test('cover toggle: on adds the cover, off removes it from the kit', () => {
  const L = { enabled: true };
  setCover(L, true);
  assert.deepEqual(L.cover, { enabled: true });
  L.cover.frameMaterial = 'card110';
  setCover(L, true);
  assert.equal(L.cover.frameMaterial, 'card110', 'keeps chosen materials');
  setCover(L, false);
  assert.equal(L.cover, undefined, 'off is stored as nothing');
});
