// Wire paths for the LEDs every whole-scene shell places (#16 follow-up):
// each runs square inside the shell, through no part, to a hole the shell
// cuts in its back wall that clears every other hole there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShell } from '../src/shells/index.js';
import { partContains } from '../src/shells/fit.js';
import { pointInPolygon } from '../src/geometry.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

const MATERIALS = defaultKit().materials;
const CASES = [
  ['alley', {}], ['alley', { buildings: 4, litRatio: 1 }],
  ['bookshop', {}], ['bookshop', { shelves: 5, counterHeight: 40 }], ['bookshop', { counter: false, sideShelves: false }],
  ['staircase', {}], ['staircase', { landingHeight: 0.7 }],
  ['greenhouse', {}], ['greenhouse', { bench: false }], ['greenhouse', { glazeBack: false, kneeHeight: 0.5 }],
  ['twostorey', {}], ['twostorey', { stairs: 'spiral' }], ['twostorey', { stairs: 'none', groundWall: false, floorHeight: 0.4 }],
  // review: a wall right beside the stair, and counter lights level with a shelf
  ['twostorey', { wallPos: 0.2 }], ['twostorey', { wallPos: 0.2, floorHeight: 0.65 }],
  ['bookshop', { shelves: 1, counterHeight: 80 }], ['bookshop', { shelves: 2, counterHeight: 43 }], ['bookshop', { shelves: 2, counterHeight: 44 }],
];
/** Board to leave between a wire hole and any other hole or panel edge (mm). */
const KEEP = 1.5;
const gapBetween = (a, b) => Math.max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3]);
const gap = { w: 110, h: 230, d: 180 };
const bbox = (poly) => {
  const xs = poly.map(([x]) => x), ys = poly.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const meets = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

for (const t of [3, 2, 1.5]) {
  test(`shell wires (t = ${t}): every light runs square, through no part, out of its own back-wall hole`, () => {
    for (const [type, params] of CASES) {
      const sh = buildShell({ type, gap, clearance: 2, params }, { t, materials: MATERIALS });
      const label = `${type} ${JSON.stringify(params)}`;
      const back = sh.parts.find((p) => p.key === 'shell-back');
      const holes = back.polys.slice(1);
      const Di = sh.dims.D - t;
      assert.ok(sh.lights.length > 0, label);
      for (const l of sh.lights) {
        assert.ok(l.wire, `${label}: ${l.name} has a wire`);
        assert.ok(l.name && l.where, `${label}: named`);
        const { path, exit } = l.wire;
        assert.deepEqual(path[0], l.p);
        const end = path.at(-1);
        assert.ok(Math.abs(end[1] - Di) < 1e-9, `${label}: ends on the back wall`);
        assert.deepEqual([end[0], end[2]], exit);
        for (let i = 1; i < path.length; i++) {
          const moved = path[i].filter((v, k) => Math.abs(v - path[i - 1][k]) > 1e-9).length;
          assert.ok(moved <= 1, `${label}: square runs`);
          // sample the run: never inside a part
          const len = Math.hypot(...path[i].map((v, k) => v - path[i - 1][k]));
          const n = Math.max(1, Math.ceil(len / 0.5));
          for (let s = 0; s <= n; s++) {
            const q = path[i - 1].map((v, k) => v + ((path[i][k] - v) * s) / n);
            const hit = sh.parts.find((p) => partContains(p, t, q));
            assert.ok(!hit, `${label}: ${l.name}'s wire passes through ${hit?.key} at ${q.map((v) => v.toFixed(1))}`);
          }
        }
        // its hole is cut, and clears every other hole in the back wall
        const mine = holes.filter((h) => pointInPolygon(exit, h));
        assert.equal(mine.length, 1, `${label}: ${l.name} exits through one hole`);
        const box = bbox(mine[0]);
        for (const h of holes) {
          if (h === mine[0]) continue;
          assert.ok(gapBetween(box, bbox(h)) >= KEEP - 1e-9, `${label}: ${l.name}'s hole leaves ${gapBetween(box, bbox(h)).toFixed(2)} mm to the next hole`);
        }
        assert.ok(box[0] >= t + KEEP && box[2] <= sh.dims.W - t - KEEP && box[1] >= t + KEEP && box[3] <= sh.dims.H - t - KEEP, `${label}: ${l.name}'s hole clears the joints`);
      }
    }
  });
}

test('shell wires: holes cut in other parts for a wire keep board round them', () => {
  for (const t of [3, 2]) {
    const sh = buildShell({ type: 'greenhouse', gap, clearance: 2, params: {} }, { t, materials: MATERIALS });
    const bench = sh.parts.find((p) => p.key === 'bench');
    const outline = bbox(bench.polys[0]);
    const wireHoles = bench.polys.slice(1);
    assert.ok(wireHoles.length >= 1, 'the roof wire passes the bench');
    for (const h of wireHoles) {
      const b = bbox(h);
      // the outline's tabs stick out t beyond its plain edges
      assert.ok(b[0] >= outline[0] + KEEP && b[1] >= outline[1] + KEEP && b[3] <= outline[3] - t - KEEP, `bench hole at ${b.map((v) => v.toFixed(1))}`);
    }
  }
});

test('shell wires: the default power box sits clear of windows and of boards slotted into the back wall', () => {
  for (const [type, params] of [['greenhouse', {}], ['greenhouse', { kneeHeight: 0.2 }], ['staircase', {}], ['twostorey', {}], ['twostorey', { floorHeight: 0.3 }], ['bookshop', {}], ['alley', {}]]) {
    const kit = { ...defaultKit(), shell: { type, gap, clearance: 2, params } };
    const r = compileKit(kit);
    const t = r.dims.t;
    const back = r.parts.find((p) => p.group === 'Shell' && p.name === 'Back wall');
    const [px, pz] = r.lighting.power.p;
    // a box of about 30 × 20 mm around its centre
    const boxB = [px - 15, pz - 10, px + 15, pz + 10];
    for (const h of back.polys.slice(1)) {
      const b = bbox(h);
      if ((b[2] - b[0]) * (b[3] - b[1]) < 12) continue; // wire holes are fine to cover
      assert.ok(!meets(boxB, b), `${type} ${JSON.stringify(params)}: power box at (${px.toFixed(0)}, ${pz.toFixed(0)}) covers a hole at ${b.map((v) => v.toFixed(0))}`);
    }
    assert.ok(pz - 10 >= t && pz + 10 <= r.dims.H - t, `${type}: box on the wall`);
  }
});

test('shell wires: outside routes that cross a greenhouse window are flagged', () => {
  const kit = { ...defaultKit(), shell: { type: 'greenhouse', gap, clearance: 2, params: {} } };
  kit.lighting = { ...kit.lighting, power: { ...kit.lighting.power, wall: 'back', pos: 100, elev: 170 } }; // in the glazing
  const r = compileKit(kit);
  assert.ok(r.warnings.some((w) => /power box/i.test(w.msg ?? w) && /window/i.test(w.msg ?? w)), JSON.stringify(r.warnings));
});

test('shell wires: each whole-scene shell compiles with its LEDs planned and no errors', () => {
  for (const [type, params] of CASES) {
    const kit = { ...defaultKit(), shell: { type, gap, clearance: 2, params } };
    const r = compileKit(kit);
    const label = `${type} ${JSON.stringify(params)}`;
    assert.ok(!r.warnings.some((w) => w.level === 'error'), `${label}: ${JSON.stringify(r.warnings)}`);
    assert.equal(r.lighting.leds.length, r.shell.lights.length, label);
    for (const led of r.lighting.leds) assert.ok(led.leadCm > 0 && led.where, label);
  }
});

test('shell wires: build steps and the guide describe holes in the back wall, not only cavities', () => {
  const kit = { ...defaultKit(), shell: { type: 'bookshop', gap, clearance: 2, params: {} } };
  const steps = compileKit(kit).groups.find((g) => g.title === 'Lighting').steps.join('\n');
  assert.match(steps, /back wall/);
  assert.match(steps, /dashed line/i);
});
