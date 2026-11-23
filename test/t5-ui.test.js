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
