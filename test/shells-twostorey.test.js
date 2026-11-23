// Two-storey shell: an upper floor slotted into the walls, an optional
// straight stair up through a stairwell, and internal walls (with doorways)
// that split each storey into two rooms, tabbed into the floors above and below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShell, SHELLS } from '../src/shells/index.js';
import { findOverlaps, outsideEnvelope, partBox, partContains } from '../src/shells/fit.js';
import { checkJoints } from './shells-helpers.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

const gap = { w: 120, h: 230, d: 180 };
const house = (params = {}, t = 2, g = gap) => buildShell({ type: 'twostorey', gap: g, clearance: 2, params }, { t });
const at = ({ o, U, V }, [u, v]) => [0, 1, 2].map((i) => o[i] + U[i] * u + V[i] * v);

/** Every rectangular slot in `holders` holds a tab of one of `fillers`. */
function slotsFilled(holders, fillers, t) {
  let n = 0;
  for (const h of holders) {
    for (const hole of h.polys.slice(1)) {
      if (hole.length !== 4) continue;
      const c = hole.reduce(([a, b], [x, y]) => [a + x / 4, b + y / 4], [0, 0]);
      const p = at(h.plane, c).map((v, i) => v - h.plane.n[i] * (t / 2));
      if (fillers.some((f) => partContains(f, t, p))) n++;
      else assert.fail(`${h.key}: slot at ${c.map((v) => v.toFixed(1))} is empty`);
    }
  }
  return n;
}

const VARIANTS = [
  [{}, 2],
  [{ stairs: 'none' }, 2],
  [{ groundWall: false, upperWall: false }, 2],
  [{ floorHeight: 0.4, wallPos: 0.75, steps: 7 }, 1.5],
  [{ floorHeight: 0.6, stairWidth: 30, risers: false, rail: false }, 2],
];

test('two-storey: registered, whole-scene, with its controls', () => {
  const def = SHELLS.twostorey;
  assert.ok(def, 'twostorey shell type');
  assert.equal(def.furnishable, false);
  const keys = def.params.map((p) => p.key);
  for (const k of ['floorHeight', 'stairs', 'groundWall', 'upperWall', 'wallPos']) assert.ok(keys.includes(k), k);
  const stairs = def.params.find((p) => p.key === 'stairs');
  assert.equal(stairs.type, 'choice');
  assert.deepEqual(stairs.options.map(([v]) => v).slice(0, 2), ['none', 'straight']);
});

test('two-storey: no parts collide, all inside the shell, everything joined', () => {
  for (const [params, t] of VARIANTS) {
    const sh = house(params, t);
    const label = JSON.stringify(params);
    assert.deepEqual(findOverlaps(sh.parts, t), [], label);
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), [], label);
    checkJoints(sh, t);
  }
});

test('two-storey: the upper floor sits at the chosen height, slotted into the walls', () => {
  for (const [params, t] of VARIANTS) {
    const sh = house(params, t);
    const { H } = sh.dims, Hi = H - 2 * t;
    const floors = sh.parts.filter((p) => p.role === 'floor');
    assert.ok(floors.length >= 1);
    const want = t + (params.floorHeight ?? 0.5) * Hi;
    for (const f of floors) assert.ok(Math.abs(partBox(f, t)[2][1] - want) < 1e-9, `${f.key} top at ${want}`);
    const walls = sh.parts.filter((p) => ['shell-left', 'shell-right', 'shell-back'].includes(p.key));
    assert.ok(slotsFilled(walls, floors, t) >= 4, 'floor tabs fill wall slots');
  }
});

test('two-storey: the stair climbs from the ground floor to the upper floor through a stairwell', () => {
  const t = 2;
  const sh = house({}, t);
  const st = sh.twostorey;
  assert.ok(st.stair && st.stair.steps >= 2);
  const treads = sh.parts.filter((p) => p.role === 'tread');
  assert.equal(treads.length, st.stair.steps - 1);
  // equal rises that end exactly on the upper floor
  assert.ok(Math.abs(st.stair.rise * st.stair.steps - (st.floorTop - t)) < 1e-9);
  // the stairwell: nothing of the upper floor above the stair
  const stairBox = sh.parts.filter((p) => p.group === 'Stairs').map((p) => partBox(p, t));
  const x1 = Math.max(...stairBox.map((b) => b[0][1])), y1 = Math.max(...stairBox.map((b) => b[1][1]));
  for (const f of sh.parts.filter((p) => p.role === 'floor')) {
    const [[fx0, fx1], [fy0, fy1]] = partBox(f, t);
    const over = fx0 < x1 - 1e-9 && fy0 < y1 - 1e-9 && fx1 > t && fy1 > 0;
    // only the landing strip behind the stair top may meet it
    if (over) assert.ok(fy0 >= st.stair.run - 1e-9, `${f.key} leaves the stairwell open`);
  }
  // headroom over every tread
  for (const tr of treads) {
    const [, , [, z1]] = partBox(tr, t);
    assert.ok(sh.dims.H - t - z1 > 20);
  }
  // no stair: one whole upper floor
  const flat = house({ stairs: 'none' }, t);
  assert.equal(flat.parts.filter((p) => p.role === 'floor').length, 1);
  assert.equal(flat.parts.filter((p) => p.group === 'Stairs').length, 0);
});

test('two-storey: internal walls split each storey, tabbed into the floors, with a doorway', () => {
  const t = 2;
  const sh = house({}, t);
  const walls = sh.parts.filter((p) => p.role === 'partition');
  assert.equal(walls.length, 2);
  for (const w of walls) {
    assert.ok(w.polys.length >= 2, `${w.key} has a doorway`);
    assert.ok(w.doorway.h >= 30 && w.doorway.w >= 12, 'a doorway a figure can pass');
  }
  // tabs fill slots in the shell floor (ground wall), the upper floor and the roof (upstairs wall)
  const holders = sh.parts.filter((p) => ['shell-bottom', 'shell-top'].includes(p.key) || p.role === 'floor');
  assert.ok(slotsFilled(holders, walls, t) >= 6);
  // both walls clear of the stair
  const stairX1 = Math.max(...sh.parts.filter((p) => p.group === 'Stairs').map((p) => partBox(p, t)[0][1]));
  for (const w of walls) assert.ok(partBox(w, t)[0][0] >= stairX1 + 10);
  // and they can be left out
  assert.equal(house({ groundWall: false }, t).parts.filter((p) => p.role === 'partition').length, 1);
});

test('two-storey: a light in every room, and steps for every group', () => {
  const sh = house({}, 2);
  assert.equal(sh.lights.length, 4, 'two rooms on each storey');
  const groups = new Set(sh.parts.map((p) => p.group));
  for (const g of groups) assert.ok(sh.steps.some((s) => s.group === g), `steps for ${g}`);
  assert.equal(house({ groundWall: false, upperWall: false }, 2).lights.length, 2);
});

test('two-storey: too short a gap is refused with a clear message', () => {
  assert.throws(() => house({}, 2, { w: 120, h: 70, d: 180 }), /headroom|taller/);
});

test('two-storey: compiles as a kit with no errors', () => {
  const kit = { ...defaultKit(), shell: { type: 'twostorey', gap, clearance: 2, params: {} } };
  const r = compileKit(kit);
  assert.ok(!r.warnings.some((w) => w.level === 'error'), JSON.stringify(r.warnings));
  const groups = new Set(r.parts.map((p) => p.group));
  for (const g of ['Shell', 'Upper floor', 'Stairs', 'Internal walls']) assert.ok(groups.has(g), g);
});
