// Bookshop corner shell: a nook with a slotted bookcase across the back,
// an optional run of shelves down the left wall, and a counter on the right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShell, SHELLS } from '../src/shells/index.js';
import { findOverlaps, outsideEnvelope, partBox, partContains } from '../src/shells/fit.js';
import { checkJoints } from './shells-helpers.js';

const gap = { w: 100, h: 230, d: 180 };
const shop = (params = {}, t = 2, g = gap) => buildShell({ type: 'bookshop', gap: g, clearance: 2, params }, { t });

const VARIANTS = [
  [{}, 2],
  [{ shelves: 6 }, 1.5],
  [{ sideShelves: false }, 2],
  [{ counter: false, shelves: 3 }, 2],
  [{ backDepth: 30, sideDepth: 25, counterHeight: 60 }, 1.6],
];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = ({ o, U, V }, [u, v]) => [0, 1, 2].map((i) => o[i] + U[i] * u + V[i] * v);

test('bookshop is registered as a whole-scene shell', () => {
  assert.ok(SHELLS.bookshop?.label);
  assert.equal(SHELLS.bookshop.furnishable, false);
  for (const p of SHELLS.bookshop.params) assert.ok(p.key in SHELLS.bookshop.defaults, p.key);
});

test('bookshop parts never share space and stay inside the shell', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shop(params, t);
    assert.deepEqual(findOverlaps(sh.parts, t), [], JSON.stringify(params));
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), [], JSON.stringify(params));
    checkJoints(sh, t);
  }
});

test('every wall slot holds a shelf tab, and every shelf is slotted into the walls', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shop(params, t);
    const shelves = sh.parts.filter((p) => p.role === 'shelf');
    assert.ok(shelves.length > 0);
    let slots = 0;
    for (const wall of sh.parts.filter((p) => p.role === 'shell')) {
      for (const hole of wall.polys.slice(1)) {
        if (hole.length !== 4) continue; // slots are rectangles; wire holes are round
        slots++;
        const c = hole.reduce(([a, b], [x, y]) => [a + x / 4, b + y / 4], [0, 0]);
        // centre of the slot, half a board into the wall
        const p = at(wall.plane, c).map((v, i) => v - wall.plane.n[i] * (t / 2));
        assert.ok(shelves.some((s) => partContains(s, t, p)), `${wall.key}: slot at ${c.map((v) => v.toFixed(1))} is filled`);
      }
    }
    assert.ok(slots > 0);
    for (const s of shelves) {
      assert.ok(sh.joints.some((j) => j.kind === 'slot' && [j.a, j.b].includes(s.key)), `${s.key} is slotted in`);
    }
  }
});

test('shelves leave room for books and stay under the roof', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shop(params, t);
    const { inner } = sh.dims;
    const back = sh.parts.filter((p) => p.role === 'shelf' && p.run === 'back').map((p) => partBox(p, t)[2]);
    assert.equal(back.length, params.shelves ?? SHELLS.bookshop.defaults.shelves);
    back.sort((a, b) => a[0] - b[0]);
    let below = inner.z0;
    for (const [z0, z1] of back) {
      assert.ok(z0 - below >= 12, `≥ 12 mm of books under each shelf (got ${(z0 - below).toFixed(1)})`);
      below = z1;
    }
    assert.ok(inner.z0 + inner.H - below >= 12, 'room above the top shelf');
  }
});

test('the side run meets the back bookcase at the corner, only when asked for', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shop(params, t);
    const side = sh.parts.filter((p) => p.role === 'shelf' && p.run === 'side');
    const back = sh.parts.filter((p) => p.role === 'shelf' && p.run === 'back');
    if (params.sideShelves === false) { assert.equal(side.length, 0); continue; }
    assert.equal(side.length, back.length);
    for (const s of side) {
      const [, [, sy1], [sz0]] = partBox(s, t);
      const b = back.find((q) => Math.abs(partBox(q, t)[2][0] - sz0) < 1e-9);
      assert.ok(b, 'side shelves line up with back shelves');
      // back shelf's front edge (without tabs) is where the side shelf ends
      const frontY = b.plane.o[1];
      assert.ok(Math.abs(sy1 - frontY) < 1e-9, 'meets the back shelf');
      assert.ok(sh.joints.some((j) => j.kind === 'flat' && [j.a, j.b].includes(s.key) && [j.a, j.b].includes(b.key)));
    }
  }
});

test('the counter stands on the floor against the right wall and leaves a walkway', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shop(params, t);
    const counter = sh.parts.filter((p) => p.role === 'counter');
    if (params.counter === false) { assert.equal(counter.length, 0); continue; }
    assert.ok(counter.length >= 4);
    const boxes = counter.map((p) => partBox(p, t));
    const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[k][0])));
    const hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[k][1])));
    const { W, inner } = sh.dims;
    assert.ok(Math.abs(lo[2] - inner.z0) < 1e-9, 'on the floor');
    assert.ok(Math.abs(hi[0] - (W - t)) < 1e-9, 'against the right wall');
    // clear of every shelf (in plan) and of the back bookcase's depth
    for (const s of sh.parts.filter((p) => p.role === 'shelf')) {
      const [[sx0, sx1], [sy0, sy1], [sz0]] = partBox(s, t);
      const planOverlap = Math.min(hi[0], sx1) - Math.max(lo[0], sx0) > 1e-9 && Math.min(hi[1], sy1) - Math.max(lo[1], sy0) > 1e-9;
      assert.ok(!planOverlap || sz0 >= hi[2] - 1e-9, `${s.key} is clear of the counter`);
    }
    // a walkway: free floor between the side run (or left wall) and the counter
    const sideX = Math.max(inner.x0, ...sh.parts.filter((p) => p.run === 'side').map((p) => partBox(p, t)[0][1]));
    assert.ok(lo[0] - sideX >= inner.W * 0.3, `walkway ${(lo[0] - sideX).toFixed(1)} mm`);
  }
});

test('bookshop suggests LEDs under the top shelf and over the counter, and has steps for every group', () => {
  const sh = shop();
  assert.ok(sh.lights.length >= 2);
  for (const l of sh.lights) assert.ok(l.p.every((v, i) => v > 0 && v < [sh.dims.W, sh.dims.D, sh.dims.H][i]));
  const groups = new Set(sh.parts.map((p) => p.group));
  for (const g of groups) assert.ok(sh.steps.some((s) => s.group === g), `steps for ${g}`);
});

test('a gap too small for a bookshop is refused clearly', () => {
  assert.throws(() => shop({ shelves: 12 }, 2, { w: 100, h: 90, d: 180 }), /shelves/i);
});
