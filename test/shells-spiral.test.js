// Spiral stairs generator (src/shells/spiral.js) and the two-storey shell's
// spiral option: wedge treads threaded on a dowel post, each held at its
// outer end by a baluster standing on the tread below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpiralStairs } from '../src/shells/spiral.js';
import { buildShell, SHELLS } from '../src/shells/index.js';
import { findOverlaps, outsideEnvelope, partBox, partContains } from '../src/shells/fit.js';
import { checkJoints } from './shells-helpers.js';

const SPIRALS = [
  { steps: 8, rise: 13, radius: 22, t: 2, center: [30, 30], z0: 2 },
  { steps: 12, rise: 10, radius: 18, t: 1.5, center: [25, 25], z0: 0, turn: 25 },
  { steps: 4, rise: 20, radius: 30, t: 2, center: [40, 40], z0: 2 },
];

test('spiral stairs: treads, balusters and nothing colliding', () => {
  for (const s of SPIRALS) {
    const sp = buildSpiralStairs(s);
    const { t } = s;
    const label = JSON.stringify(s);
    assert.deepEqual(findOverlaps(sp.parts, t), [], label);
    const treads = sp.parts.filter((p) => p.role === 'tread');
    const posts = sp.parts.filter((p) => p.role === 'baluster');
    assert.equal(treads.length, s.steps - 1, 'the floor above is the last step');
    assert.equal(posts.length, treads.length, 'one baluster under each tread');
    // equal rises: tread j's top at z0 + (j+1)·rise
    treads.forEach((p, j) => assert.ok(Math.abs(partBox(p, t)[2][1] - (s.z0 + (j + 1) * s.rise)) < 1e-9, `tread ${j}`));
    // every tread has the post hole at the centre, and stays within the radius
    for (const p of treads) {
      assert.equal(p.polys.length, 2, 'outline + post hole');
      const [[x0, x1], [y0, y1]] = partBox(p, t);
      const [cx, cy] = s.center;
      assert.ok(x0 >= cx - s.radius - 1e-6 && x1 <= cx + s.radius + 1e-6 && y0 >= cy - s.radius - 1e-6 && y1 <= cy + s.radius + 1e-6);
      const mid = [cx, cy, partBox(p, t)[2][1] - t / 2];
      assert.ok(!partContains(p, t, mid), 'the post passes through the hole');
    }
    // the treads turn: each starts where the last one was, one step on
    const ang = treads.map((p) => p.angle);
    for (let j = 1; j < ang.length; j++) assert.ok(Math.abs(ang[j] - ang[j - 1] - sp.turn) < 1e-9);
    // each baluster stands on the tread below (or the floor) and carries the one above
    posts.forEach((b, j) => {
      const [, , [z0, z1]] = partBox(b, t);
      const below = j === 0 ? s.z0 : partBox(treads[j - 1], t)[2][1];
      const above = partBox(treads[j], t)[2][0];
      assert.ok(Math.abs(z0 - below) < 1e-9 && Math.abs(z1 - above) < 1e-9, `baluster ${j} spans ${z0}–${z1}`);
      // under both treads: a point just above and below it lies inside them
      const c = b.plane.o.map((v, k) => v + b.plane.U[k] * 1.5 - b.plane.n[k] * (t / 2));
      assert.ok(partContains(treads[j], t, [c[0], c[1], above + t / 2]), `tread ${j} rests on baluster ${j}`);
      if (j > 0) assert.ok(partContains(treads[j - 1], t, [c[0], c[1], below - t / 2]), `baluster ${j} stands on tread ${j - 1}`);
    });
    checkJoints({ ...sp, joints: sp.joints.filter((jn) => jn.b !== 'floor') }, t);
    assert.ok(sp.post.diameter > 0 && sp.post.length > (s.steps - 1) * s.rise, 'a post long enough');
  }
});

test('spiral stairs: refuses rises too short for a baluster', () => {
  assert.throws(() => buildSpiralStairs({ steps: 8, rise: 3, radius: 20, t: 2, center: [25, 25], z0: 0 }), /rise|steps/);
});

test('two-storey: a spiral stair in the corner, up through the stairwell', () => {
  assert.ok(SHELLS.twostorey.params.find((p) => p.key === 'stairs').options.some(([v]) => v === 'spiral'));
  for (const [params, t] of [[{ stairs: 'spiral' }, 2], [{ stairs: 'spiral', floorHeight: 0.4, spiralRadius: 25 }, 1.5], [{ stairs: 'spiral', steps: 10, upperWall: false }, 2]]) {
    const sh = buildShell({ type: 'twostorey', gap: { w: 120, h: 230, d: 180 }, clearance: 2, params }, { t });
    const label = JSON.stringify(params);
    assert.deepEqual(findOverlaps(sh.parts, t), [], label);
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), [], label);
    checkJoints(sh, t);
    const st = sh.twostorey.stair;
    assert.equal(st.kind, 'spiral');
    assert.ok(Math.abs(st.rise * st.steps - (sh.twostorey.floorTop - t)) < 1e-9, 'the last rise lands on the upper floor');
    // nothing of the upper floor over the spiral
    const R = st.radius, [cx, cy] = st.center;
    for (const f of sh.parts.filter((p) => p.role === 'floor')) {
      const [[x0, x1], [y0, y1]] = partBox(f, t);
      const nx = Math.max(x0, Math.min(cx, x1)), ny = Math.max(y0, Math.min(cy, y1));
      assert.ok(Math.hypot(nx - cx, ny - cy) >= R - 1e-6, `${f.key} clears the stairwell`);
    }
    assert.ok(sh.rods.some((r) => r.group === 'Stairs' && r.stock === 'dowel' && r.d > 0), 'the post to buy is listed as a dowel');
  }
});

const twoStorey = (params, g = { w: 120, h: 230, d: 180 }, t = 2) => buildShell({ type: 'twostorey', gap: g, clearance: 2, params: { stairs: 'spiral', ...params } }, { t });

test('review: the auto radius always fits a cuttable spiral, with a real landing and a real floor', () => {
  for (const g of [{ w: 72, h: 230, d: 180 }, { w: 120, h: 230, d: 75 }, { w: 120, h: 230, d: 180 }]) {
    for (const spiralRadius of [0, 50]) {
      const sh = twoStorey({ spiralRadius }, g);
      const st = sh.twostorey.stair;
      const Di = sh.dims.D - 2, Wi = sh.dims.W - 4;
      assert.ok(Di - st.run >= 25 - 1e-9, `landing ${(Di - st.run).toFixed(1)} mm in ${JSON.stringify(g)}`);
      assert.ok(Wi - st.width >= 30 - 1e-9, `floor beside the stairwell in ${JSON.stringify(g)}`);
    }
  }
  // too small for any spiral: a clear message, not a broken floor
  assert.throws(() => twoStorey({}, { w: 50, h: 230, d: 180 }), /spiral|straight|wider/i);
});

test('review: the post stands in a locating hole at the centre of the spiral', () => {
  const sh = twoStorey({});
  const [cx, cy] = sh.twostorey.stair.center;
  const floor = sh.parts.find((p) => p.key === 'shell-bottom');
  assert.ok(floor.polys.slice(1).some((h) => {
    const xs = h.map(([x]) => x), ys = h.map(([, y]) => y);
    return Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - cx) < 0.01 && Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - cy) < 0.01;
  }), 'a hole in the floor at the post');
  const step = sh.steps.find((s) => /\bpost\b/i.test(s.text)).text;
  assert.match(step, /hole/i);
  assert.doesNotMatch(step, /first baluster's tread points/);
  // and it ends below the roof
  assert.ok(sh.twostorey.stair.post.length <= sh.dims.H - 2 * 2);
});

test('review: stair controls say which stair they apply to', () => {
  const label = (k) => SHELLS.twostorey.params.find((p) => p.key === k).label;
  assert.match(label('stairWidth'), /straight/i);
  assert.match(label('risers'), /straight/i);
  assert.match(label('spiralRadius'), /spiral/i);
});
