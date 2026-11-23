// Spiral stairs generator for board.
//
// Wedge-shaped treads with a round hub are threaded on a bought dowel post
// (or a bamboo skewer) through a hole at the centre. Each tread turns `turn`
// degrees on from the one below and is held at its outer end by a small
// baluster standing on the tread below (the first on the floor), so the
// heights come from the cut parts, not from measuring on the post. Like the
// straight stair, the last rise ends on the floor above: one tread fewer than
// rises.
//
// Coordinates are world mm (x, y across, z up); treads are drawn directly in
// x/y around `center`. Parts follow the shell convention: material runs t
// along −n from `plane`. Angles are degrees, counter-clockwise from +x.

import { cleanPolygon, ellipsePoly, rectPoly } from '../geometry.js';

/** Baluster width (mm) and how far its outer face sits inside the tread edge. */
const BAL_W = 3, BAL_IN = 1;
/** Dowel post (mm): diameter, and a hole this much bigger all round. */
export const POST_D = 4;
const POST_CLEAR = 0.1;
/** Board left round the post hole (mm). */
const HUB = 2.5;

const rad = (d) => (d * Math.PI) / 180;
const arc = (cx, cy, r, a0, a1, segs) => Array.from({ length: segs + 1 }, (_, i) => {
  const a = rad(a0 + ((a1 - a0) * i) / segs);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});

/**
 * @param {object} o
 * @param {number} o.steps number of rises (the floor above is the last step)
 * @param {number} o.rise height of each rise (mm)
 * @param {number} o.radius tread radius (mm)
 * @param {number} o.t board thickness (mm)
 * @param {number[]} o.center [x, y] of the post
 * @param {number} [o.z0=0] floor level the stair stands on
 * @param {number} [o.turn=30] degrees each tread turns on from the last
 * @param {number} [o.endAngle=90] direction the top tread points (toward the landing)
 * @param {string} [o.key='spiral'] part key prefix
 * @param {string} [o.group='Stairs']
 * @param {string} [o.baseKey='floor'] the part the first baluster stands on
 */
export function buildSpiralStairs({ steps: n, rise: h, radius: R, t, center, z0 = 0, turn = 30, endAngle = 90, key = 'spiral', group = 'Stairs', baseKey = 'floor' }) {
  const hub = POST_D / 2 + POST_CLEAR + HUB;
  const rb = R - BAL_IN; // baluster outer face
  if (!(n >= 2 && h - t >= 3 && R >= hub + BAL_W + t + 6 && turn > 0 && turn * (n - 1) <= 360)) {
    throw new Error(`This spiral can't be cut: ${n} steps of ${h.toFixed(1)} mm rise, ${R.toFixed(1)} mm radius, in ${t} mm board — use fewer, taller steps or a wider stair.`);
  }
  const [cx, cy] = center;
  const nt = n - 1;
  // each tread overlaps the next by enough to stand a baluster under both
  const halfBal = ((BAL_W / 2 + 1.5) / (rb - t)) * (180 / Math.PI);
  const width = turn + 2 * halfBal;
  const parts = [], joints = [];
  const link = (a, b, kind) => joints.push({ a, b, kind });
  const k = (s) => `${key}-${s}`;
  const segs = Math.max(6, Math.ceil(width / 4));

  for (let j = 0; j < nt; j++) {
    const mid = endAngle - (nt - 1 - j) * turn; // tread j points this way
    const a0 = mid - width / 2, a1 = mid + width / 2;
    // the wedge, closed round the back by the hub
    const outline = cleanPolygon([
      ...arc(0, 0, R, a0, a1, segs),
      ...arc(0, 0, hub, a1, a0 + 360, Math.ceil((360 - width) / 10)),
    ]);
    const top = z0 + (j + 1) * h;
    parts.push({
      key: k(`tread-${j}`), name: `Spiral tread ${j + 1}`, group, role: 'tread', angle: mid, scores: [],
      polys: [outline, ellipsePoly(0, 0, POST_D / 2 + POST_CLEAR, POST_D / 2 + POST_CLEAR, 20)],
      plane: { o: [cx, cy, top], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] },
    });
    // baluster under its back edge, where it overlaps the tread below
    const al = rad(mid - turn / 2);
    const nrm = [Math.cos(al), Math.sin(al), 0], U = [-Math.sin(al), Math.cos(al), 0];
    const bottom = j === 0 ? z0 : top - h;
    parts.push({
      key: k(`baluster-${j}`), name: `Spiral baluster ${j + 1}`, group, role: 'baluster', scores: [],
      polys: [rectPoly(0, 0, BAL_W, h - t)],
      plane: { o: [cx + rb * nrm[0] - (BAL_W / 2) * U[0], cy + rb * nrm[1] - (BAL_W / 2) * U[1], bottom], U, V: [0, 0, 1], n: nrm },
    });
    link(k(`baluster-${j}`), k(`tread-${j}`), 'flat');
    link(k(`baluster-${j}`), j === 0 ? baseKey : k(`tread-${j - 1}`), 'flat');
  }
  const length = nt * h + 15; // up past the top tread, as a newel
  return {
    parts, joints, rise: h, steps: n, turn, radius: R, center,
    post: { diameter: POST_D, length, at: [cx, cy, z0] },
  };
}
