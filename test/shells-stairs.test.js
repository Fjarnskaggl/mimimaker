// Straight stairs generator (src/shells/stairs.js) and the staircase shell:
// a nook with a stair up the left wall to a landing across the back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStairs } from '../src/shells/stairs.js';
import { buildShell, SHELLS } from '../src/shells/index.js';
import { findOverlaps, outsideEnvelope, partBox, partContains } from '../src/shells/fit.js';
import { checkJoints } from './shells-helpers.js';

const at = ({ o, U, V }, [u, v]) => [0, 1, 2].map((i) => o[i] + U[i] * u + V[i] * v);

/** Every rectangular slot in `holders` has a tab of one of `fillers` in it. */
function slotsFilled(holders, fillers, t) {
  let n = 0;
  for (const h of holders) {
    const th = h.thickness ?? t;
    for (const hole of h.polys.slice(1)) {
      if (hole.length !== 4) continue;
      n++;
      const c = hole.reduce(([a, b], [x, y]) => [a + x / 4, b + y / 4], [0, 0]);
      const p = at(h.plane, c).map((v, i) => v - h.plane.n[i] * (th / 2));
      assert.ok(fillers.some((f) => partContains(f, t, p)), `${h.key}: slot at ${c.map((v) => v.toFixed(1))} is filled`);
    }
  }
  return n;
}

const STAIRS = [
  { steps: 5, rise: 12, going: 16, width: 30, t: 2 },
  { steps: 8, rise: 10, going: 14, width: 25, t: 1.5, risers: false },
  { steps: 3, rise: 20, going: 25, width: 40, t: 2, topLanding: false },
];

test('stairs generator: stringers, slotted treads and risers that never collide', () => {
  for (const s of STAIRS) {
    const st = buildStairs(s);
    const { t } = s;
    assert.deepEqual(findOverlaps(st.parts, t), [], JSON.stringify(s));
    checkJoints(st, t);
    const stringers = st.parts.filter((p) => p.role === 'stringer');
    const treads = st.parts.filter((p) => p.role === 'tread');
    const risers = st.parts.filter((p) => p.role === 'riser');
    assert.equal(stringers.length, 2);
    assert.equal(treads.length, s.topLanding === false ? s.steps : s.steps - 1, 'a top landing replaces the last tread');
    assert.equal(risers.length, s.risers === false ? 0 : s.steps);
    assert.ok(slotsFilled(stringers, treads, t) >= 2 * treads.length, 'each tread is slotted into both stringers');
    // equal rises and goings: tread j's top is at (j+1)·rise, its front at j·going
    treads.forEach((p, j) => {
      const [, [y0, y1], [, z1]] = partBox(p, t);
      assert.ok(Math.abs(z1 - (j + 1) * s.rise) < 1e-9, `tread ${j} height`);
      assert.ok(Math.abs(y0 - j * s.going) < 1e-9 && Math.abs(y1 - y0 - s.going) < 1e-9, `tread ${j} going`);
    });
    // everything inside the stair's own box
    for (const p of st.parts) {
      const [[x0, x1], [y0], [z0, z1]] = partBox(p, t);
      assert.ok(x0 >= -1e-9 && x1 <= s.width + 1e-9 && y0 >= -1e-9 && z0 >= -1e-9 && z1 <= s.steps * s.rise + 1e-9, p.key);
    }
  }
});

test('stairs generator places itself at an origin', () => {
  const s = { steps: 4, rise: 10, going: 15, width: 20, t: 2 };
  const a = buildStairs(s), b = buildStairs({ ...s, origin: [5, 7, 3] });
  a.parts.forEach((p, i) => {
    const pa = partBox(p, 2), pb = partBox(b.parts[i], 2);
    pa.forEach(([lo, hi], k) => assert.ok(Math.abs(pb[k][0] - lo - [5, 7, 3][k]) < 1e-9 && Math.abs(pb[k][1] - hi - [5, 7, 3][k]) < 1e-9));
  });
});

const gap = { w: 100, h: 230, d: 180 };
const shellOf = (params = {}, t = 2, g = gap) => buildShell({ type: 'staircase', gap: g, clearance: 2, params }, { t });
const VARIANTS = [
  [{}, 2],
  [{ steps: 10 }, 1.5],
  [{ risers: false, rail: false }, 2],
  [{ landingHeight: 0.35, stairWidth: 35 }, 2],
  [{ landingHeight: 0.6, landingDepth: 70 }, 1.6],
];

test('staircase is registered as a whole-scene shell', () => {
  assert.ok(SHELLS.staircase?.label);
  assert.equal(SHELLS.staircase.furnishable, false);
  for (const p of SHELLS.staircase.params) assert.ok(p.key in SHELLS.staircase.defaults, p.key);
});

test('staircase parts never share space, stay inside, and hang together', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shellOf(params, t);
    assert.deepEqual(findOverlaps(sh.parts, t), [], JSON.stringify(params));
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), [], JSON.stringify(params));
    checkJoints(sh, t);
  }
});

test('every slot is filled: treads in the stringers, the landing in the walls', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shellOf(params, t);
    const walls = sh.parts.filter((p) => p.role === 'shell');
    const landing = sh.parts.filter((p) => p.role === 'landing');
    assert.equal(landing.length, 1);
    assert.ok(slotsFilled(walls, landing, t) >= 3, 'landing slotted into both side walls and the back');
    const stringers = sh.parts.filter((p) => p.role === 'stringer');
    const treads = sh.parts.filter((p) => p.role === 'tread');
    assert.ok(slotsFilled(stringers, treads, t) >= 2 * treads.length);
  }
});

test('the stair climbs evenly from the floor to the landing top at a comfortable pitch', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shellOf(params, t);
    const { rise, going, steps } = sh.staircase;
    const { inner } = sh.dims;
    if (params.steps) assert.equal(steps, params.steps);
    const [, , [, landTop]] = partBox(sh.parts.find((p) => p.role === 'landing'), t);
    assert.ok(Math.abs(landTop - (inner.z0 + steps * rise)) < 1e-9, 'last rise lands on the landing');
    const treads = sh.parts.filter((p) => p.role === 'tread').map((p) => partBox(p, t)[2][1]).sort((a, b) => a - b);
    treads.forEach((z, j) => assert.ok(Math.abs(z - (inner.z0 + (j + 1) * rise)) < 1e-9));
    if (!params.steps) assert.ok(rise / going >= 0.5 && rise / going <= 0.9, `pitch ${(rise / going).toFixed(2)}`);
    // headroom above the landing and under it
    assert.ok(inner.z0 + inner.H - landTop >= 25, 'room to stand on the landing');
    assert.ok(landTop - t - inner.z0 >= 25, 'room under the landing');
  }
});

test('the stair hugs the left wall and leaves the floor beside it free', () => {
  for (const [params, t] of VARIANTS) {
    const sh = shellOf(params, t);
    const stair = sh.parts.filter((p) => ['stringer', 'tread', 'riser'].includes(p.role)).map((p) => partBox(p, t));
    const x0 = Math.min(...stair.map((b) => b[0][0])), x1 = Math.max(...stair.map((b) => b[0][1]));
    const { inner, W } = sh.dims;
    assert.ok(Math.abs(x0 - inner.x0) < 1e-9, 'against the left wall');
    assert.ok(W - t - x1 >= inner.W * 0.4, `free floor ${(W - t - x1).toFixed(1)} mm`);
    assert.ok(sh.joints.some((j) => [j.a, j.b].includes('shell-left') && /stringer/.test(j.a + j.b)), 'left stringer glued to the wall');
  }
});

test('the rail guards the landing edge beside the stair, with baluster gaps', () => {
  const t = 2;
  const sh = shellOf({}, t);
  const rail = sh.parts.find((p) => p.role === 'rail');
  assert.ok(rail);
  assert.ok(rail.polys.length > 2, 'gaps between balusters');
  const [[rx0], , [rz0]] = partBox(rail, t);
  const stairX1 = Math.max(...sh.parts.filter((p) => p.role === 'stringer').map((p) => partBox(p, t)[0][1]));
  assert.ok(rx0 >= stairX1 - 1e-9, 'leaves the top of the stair open');
  const [, , [, landTop]] = partBox(sh.parts.find((p) => p.role === 'landing'), t);
  assert.ok(Math.abs(rz0 - landTop) < 1e-9, 'stands on the landing');
  assert.equal(shellOf({ rail: false }).parts.filter((p) => p.role === 'rail').length, 0);
});

test('staircase suggests LEDs and has steps for every group; impossible sizes are refused', () => {
  const sh = shellOf();
  assert.ok(sh.lights.length >= 2);
  for (const l of sh.lights) assert.ok(l.p.every((v, i) => v > 0 && v < [sh.dims.W, sh.dims.D, sh.dims.H][i]));
  for (const g of new Set(sh.parts.map((p) => p.group))) assert.ok(sh.steps.some((s) => s.group === g), g);
  assert.throws(() => shellOf({}, 2, { w: 100, h: 60, d: 180 }), /landing|headroom/i);
});
