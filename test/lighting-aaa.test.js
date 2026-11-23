// Rolife-style parts measured from shop listings: a 2×AAA battery box
// (Adafruit 4191: 62.5 × 25.3 × 15.4 mm) and a touch breakout board
// (Adafruit AT42QT1012, 20 × 29.35 mm) for the hidden base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPLIES, planCircuit, supplyFor } from '../src/lighting/circuit.js';
import { BASE, SWITCHES, baseLayout, buildBase } from '../src/lighting/base.js';
import { COVER } from '../src/lighting/cover.js';
import { shoppingList } from '../src/lighting/shopping.js';
import { SUPPLY_OPTIONS } from '../src/ui/t5.js';
import { SWITCH_KIND_OPTIONS } from '../src/ui/t5.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { ledMapSVG } from '../src/ledmap.js';
import { bbox } from '../src/geometry.js';

function kitWith(power) {
  const kit = defaultKit();
  kit.openings = [];
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, kind: 'battery', ...power };
  kit.lighting.leds = [{ mount: 'wall', wall: 'back', pos: 60, elev: 150, color: 'warm' }];
  return kit;
}

test('2×AAA supply: 3 V, less capacity and headroom than 2×AA', () => {
  const s = SUPPLIES.aaa2;
  assert.ok(s);
  assert.equal(s.volts, 3);
  assert.ok(s.capacityMAh < SUPPLIES.aa2.capacityMAh && s.capacityMAh > SUPPLIES.cr2032.capacityMAh);
  assert.ok(s.maxMA < SUPPLIES.aa2.maxMA);
  assert.equal(supplyFor({ supply: 'aaa2' }), 'aaa2');
  const c = planCircuit(Array(20).fill({ color: 'warm' }), 'aaa2');
  assert.match(c.warnings.map((w) => w.msg).join(' '), /2×AA battery box/, 'suggests the bigger box when overloaded');
});

test('2×AAA box sizes follow the measured part', () => {
  assert.deepEqual(BASE.box.aaa2, { l: 63, w: 26, h: 16 });
  assert.deepEqual(COVER.box.aaa2, { w: 64, h: 27 });
  const L = baseLayout({ supply: 'aaa2', W: 200, D: 120, t: 2 });
  assert.ok(L.hatch.h >= 16 && L.H < baseLayout({ supply: 'aa2', W: 200, D: 120, t: 2 }).H, 'a slimmer base than 2×AA');
});

test('2×AAA in the UI, shopping list and LED map', () => {
  assert.ok(SUPPLY_OPTIONS.some(([id]) => id === 'aaa2'));
  const r = compileKit(kitWith({ supply: 'aaa2' }));
  const list = shoppingList(r.lighting);
  assert.ok(list.items.some((i) => i.id === 'box-aaa2'));
  assert.equal(list.items.find((i) => i.id === 'cells-aaa').qty, 2);
  assert.match(ledMapSVG(r), /2×AAA/);
});

test('touch breakout board: a pocket for the 20 × 29.35 mm board behind a 13 mm window', () => {
  const sw = SWITCHES.board;
  assert.ok(sw);
  assert.equal(sw.hole, 13);
  assert.ok(sw.pocket[0] >= 29.35 && sw.pocket[1] >= 20, 'board lies on its side');
  const L = baseLayout({ supply: 'aaa2', W: 200, D: 120, t: 2, switchKind: 'board' });
  assert.ok(L.H - L.t >= sw.plate[1] + 4, 'base tall enough for the mount plate');
  const b = buildBase(L, { fingerWidth: 6 });
  const mount = b.parts.find((p) => p.key === 'mount');
  const pocket = bbox([mount.polys[1]]);
  assert.ok(Math.abs(pocket.w - sw.pocket[0]) < 1e-6);
  const front = b.panels.find((p) => p.face === 'front');
  assert.ok(Math.abs(bbox([front.polys[1]]).w - 13) < 0.1);
  assert.ok(SWITCH_KIND_OPTIONS.some(([id]) => id === 'board'));
});

test('touch breakout board in the kit: steps and shopping list name it', () => {
  const r = compileKit(kitWith({ supply: 'aaa2', mount: 'base', switch: 'board' }));
  const steps = r.groups.find((g) => g.title === 'Hidden base').steps.join('\n');
  assert.match(steps, /touch breakout/);
  const list = shoppingList(r.lighting);
  assert.ok(list.items.some((i) => i.id === 'touch-board'));
});
