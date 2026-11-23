import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPLIES, ledSpec, planCircuit, batteryLifeHours, formatLife, supplyFor } from '../src/lighting/circuit.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

const leds = (n, color = 'warm') => Array.from({ length: n }, () => ({ color }));

test('supplies: 2×AA, CR2032 and USB with conservative budgets', () => {
  assert.deepEqual(Object.keys(SUPPLIES).sort(), ['aa2', 'cr2032', 'usb']);
  for (const s of Object.values(SUPPLIES)) {
    assert.ok(s.volts > 0 && s.name);
    assert.ok(s.recommendedMA > 0 && s.recommendedMA < s.maxMA, `${s.name} recommended < max`);
  }
  assert.equal(SUPPLIES.usb.capacityMAh, null, 'USB has no battery');
  // a coin cell can't take what two AAs can
  assert.ok(SUPPLIES.cr2032.recommendedMA < SUPPLIES.aa2.recommendedMA / 5);
});

test('old power kinds map onto a supply', () => {
  assert.equal(supplyFor({ kind: 'battery' }), 'aa2');
  assert.equal(supplyFor({ kind: 'usb' }), 'usb');
  assert.equal(supplyFor({ kind: 'battery', supply: 'cr2032' }), 'cr2032');
  assert.equal(supplyFor({ kind: 'usb', supply: 'nonsense' }), 'usb');
  assert.equal(supplyFor(undefined), 'aa2');
});

test('LED specs: worst-case current and colour forward voltage', () => {
  for (const c of ['warm', 'cool', 'amber', 'pink', 'green']) {
    const s = ledSpec(c);
    assert.ok(s.mA >= 20, `${c} assumes at least 20 mA (worst case)`);
    assert.ok(s.vf >= 1.8 && s.vf <= 3.3);
  }
  assert.ok(ledSpec('amber').vf < ledSpec('warm').vf, 'amber needs less voltage than white');
  assert.deepEqual(ledSpec('mystery'), ledSpec('warm'));
});

test('parallel LEDs add up their current', () => {
  const c = planCircuit(leds(3), 'aa2');
  assert.equal(c.wiring, 'parallel');
  assert.equal(c.totalMA, 3 * ledSpec('warm').mA);
  assert.equal(c.supply.id, 'aa2');
  assert.ok(c.load > 0 && c.load < 1);
  assert.equal(c.status, 'ok');
  assert.match(c.estimateNote, /estimate/i);
});

test('current budget warns, then errors, as LEDs are added', () => {
  const coin = SUPPLIES.cr2032;
  const n = (mA) => Math.ceil(mA / ledSpec('warm').mA);
  assert.equal(planCircuit(leds(1), 'cr2032').status, 'ok');
  const over = planCircuit(leds(n(coin.recommendedMA) + 1), 'cr2032');
  assert.equal(over.status, 'warn');
  assert.ok(over.warnings.some((w) => w.level === 'warn' && /CR2032/.test(w.msg) && /2×AA/.test(w.msg)), 'suggests a bigger supply');
  const way = planCircuit(leds(n(coin.maxMA) + 1), 'cr2032');
  assert.equal(way.status, 'error');
  assert.ok(way.warnings.some((w) => w.level === 'error'));
  // USB has headroom for a lot, but not unlimited
  assert.equal(planCircuit(leds(10), 'usb').status, 'ok');
  assert.equal(planCircuit(leds(n(SUPPLIES.usb.maxMA) + 1), 'usb').status, 'error');
});

test('no LEDs: nothing to budget', () => {
  const c = planCircuit([], 'aa2');
  assert.equal(c.totalMA, 0);
  assert.equal(c.lifeHours, null);
  assert.deepEqual(c.warnings, []);
});

test('battery life is conservative and shrinks with load', () => {
  const one = batteryLifeHours('aa2', 20);
  const five = batteryLifeHours('aa2', 100);
  assert.ok(one >= five * 5, 'more LEDs, less time (and lower draw derates less)');
  assert.ok(five < SUPPLIES.aa2.capacityMAh / 100, 'derated below the nominal capacity');
  // a coin cell at 20 mA runs only a few hours
  const coin = batteryLifeHours('cr2032', 20);
  assert.ok(coin > 1 && coin < 10, `coin cell ${coin} h`);
  assert.equal(batteryLifeHours('usb', 100), null);
  assert.equal(batteryLifeHours('aa2', 0), null);
  // effects that are dark part of the time (duty < 1) last longer
  const c = planCircuit([{ color: 'warm', duty: 0.5 }], 'aa2');
  assert.equal(c.averageMA, ledSpec('warm').mA * 0.5);
  assert.equal(c.totalMA, ledSpec('warm').mA, 'peak current still counts in the budget');
  assert.ok(c.lifeHours > planCircuit(leds(1), 'aa2').lifeHours);
});

test('battery life reads as a rounded-down estimate', () => {
  assert.equal(formatLife(null), 'runs while plugged in');
  assert.equal(formatLife(0.6), 'under 1 hour');
  assert.equal(formatLife(4.9), 'about 4 hours');
  assert.equal(formatLife(1.2), 'about 1 hour');
  assert.equal(formatLife(57), 'about 2 days');
  assert.equal(formatLife(30), 'about 30 hours');
});

test('voltage notes: USB needs 5 V parts, white LEDs dim on tired batteries', () => {
  const usb = planCircuit(leds(2), 'usb');
  assert.ok(usb.warnings.some((w) => /5 V/.test(w.msg)));
  const white = planCircuit(leds(2, 'cool'), 'aa2');
  assert.ok(white.warnings.some((w) => w.level === 'info' && /dim/.test(w.msg)));
  const amber = planCircuit(leds(2, 'amber'), 'aa2');
  assert.ok(!amber.warnings.some((w) => /dim/.test(w.msg)));
});

test('compileKit carries the circuit summary and its warnings', () => {
  const kit = defaultKit();
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, kind: 'battery', supply: 'cr2032' };
  kit.lighting.leds = Array.from({ length: 6 }, (_, i) => ({ mount: 'wall', wall: 'back', pos: 20 + i * 30, elev: 150, color: 'warm' }));
  const r = compileKit(kit);
  assert.equal(r.lighting.circuit.supply.id, 'cr2032');
  assert.equal(r.lighting.circuit.totalMA, 6 * ledSpec('warm').mA);
  assert.ok(r.warnings.some((w) => /CR2032/.test(w.msg) && w.level !== 'info'));
});

test('the circuit counts only LEDs that are actually placed', () => {
  const kit = defaultKit();
  kit.room.ceiling = false;
  kit.lighting.enabled = true;
  kit.lighting.leds = [
    { mount: 'wall', wall: 'back', pos: 50, elev: 150, color: 'warm' },
    { mount: 'ceiling', x: 100, y: 100, color: 'warm' }, // skipped: no ceiling
  ];
  const r = compileKit(kit);
  assert.equal(r.lighting.leds.length, 1);
  assert.equal(r.lighting.circuit.count, 1);
  assert.equal(r.lighting.circuit.totalMA, ledSpec('warm').mA);
});
