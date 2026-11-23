// Gable roofs for boxes, cut from flat board with no bevels.
//
// The ridge runs front to back (along y), so an open-front box shows the
// attic's A-frame. A triangular gable stands on the back wall; the two roof
// slopes rest on the side walls' top inner corners (board is cut square, so
// the eave end is square to the slope and stays inside the wall's width) and
// are finger-jointed
// into the gable's sloped edges: the joint strip (between each slope's outer
// and inner surface, through the gable's thickness) is split into fingers,
// the gable keeping the even ones and the slope's back edge carrying the odd
// ones as tabs. The tabs run along the slope's own plane, so nothing needs a
// bevel. At the ridge the left slope runs to the apex and the right slope is
// cut just short so it butts under it.
//
// Axes as in box.js (x width, y depth with the front at y = 0, z up); the
// roof sits on a box whose top is at z0.

import { cleanPolygon, fingerCount, panelOutline, profilePlain } from '../geometry.js';
import { autoFingerWidth } from '../box.js';

/** Rise of a gable roof over a box `W` wide in board `t` at `pitch` degrees. */
export function gableRise(W, t, pitch) {
  const th = (pitch * Math.PI) / 180;
  return (W / 2 - t) * Math.tan(th) + t / Math.cos(th);
}

// separating-axis test for two convex polygons (touching is not overlap)
function convexOverlap(a, b, eps = 1e-9) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      const nx = y2 - y1, ny = x1 - x2;
      const proj = (p) => p.map(([x, y]) => x * nx + y * ny);
      const pa = proj(a), pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
    }
  }
  return true;
}

/**
 * @param {object} o
 * @param {number} o.W box width (outer)  @param {number} o.D box depth (outer)
 * @param {number} o.t board thickness    @param {number} o.pitch degrees (20–60)
 * @param {number} o.z0 height of the box top
 * @param {number} [o.fingerWidth] 0 = auto
 */
export function buildGableRoof({ W, D, t, pitch, z0, fingerWidth = 0 }) {
  const th = (pitch * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const rise = gableRise(W, t, pitch);
  const fw = fingerWidth > 0 ? fingerWidth : autoFingerWidth(t);

  // cross-section (x, z): each slope's inner corner sits on its wall's top inner
  // corner; A is the eave's outer corner, a runs up the slope, n points inward
  const sides = {
    left: { A: [t - t * s, z0 + t * c], a: [c, s], n: [s, -c] },
    right: { A: [W - t + t * s, z0 + t * c], a: [-c, s], n: [-s, -c] },
  };
  const at = (sd, u, d = 0) => [sd.A[0] + sd.a[0] * u + sd.n[0] * d, sd.A[1] + sd.a[1] * u + sd.n[1] * d];
  const rect = (sd, L) => [at(sd, 0), at(sd, L), at(sd, L, t), at(sd, 0, t)];

  // left slope runs to the apex; the right one is as long as it can be without overlapping it
  const Lleft = (W / 2 - sides.left.A[0]) / c;
  let lo = 0, hi = Lleft;
  const leftRect = rect(sides.left, Lleft);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (convexOverlap(rect(sides.right, mid), leftRect)) hi = mid; else lo = mid;
  }
  const Lright = lo;
  sides.left.L = Lleft;
  sides.right.L = Lright;
  const ridgeGap = convexOverlap(rect(sides.right, Lright + 0.3), leftRect) ? hi - lo : 0.3;

  // fingers along each slope's back edge: the gable keeps the even ones (and both ends)
  for (const sd of Object.values(sides)) {
    const n = fingerCount(sd.L, fw);
    sd.segs = Array.from({ length: n }, (_, k) => ({ u0: (k * sd.L) / n, u1: ((k + 1) * sd.L) / n, tab: k % 2 === 1 }));
    sd.minFinger = sd.L / n;
  }

  // gable: on the back wall, up to the outer roof lines, notched where the tabs pass through
  const gpts = [[0, z0], [W, z0]];
  for (const sg of sides.right.segs) gpts.push(at(sides.right, sg.u0, sg.tab ? t : 0), at(sides.right, sg.u1, sg.tab ? t : 0));
  // round the apex along the left slope's underside and square end, so the
  // gable fills the left joint strip right up to the ridge
  gpts.push(at(sides.left, Lleft, t), at(sides.left, Lleft)); // apex
  for (const sg of [...sides.left.segs].reverse()) gpts.push(at(sides.left, sg.u1, sg.tab ? t : 0), at(sides.left, sg.u0, sg.tab ? t : 0));
  const gable = cleanPolygon(gpts.map(([x, z]) => [x, z - z0]));

  // slopes: L along the slope × (D − t) deep, tabs out of the back edge through the gable
  const slope = (sd) => {
    const Dp = D - t;
    const top = [...sd.segs].reverse().map((sg) => ({ a0: sd.L - sg.u1, a1: sd.L - sg.u0, d: sg.tab ? -t : 0 }));
    return panelOutline(sd.L, Dp, [profilePlain(sd.L), profilePlain(Dp), top, profilePlain(Dp)]);
  };
  const parts = [
    { key: 'roof-gable', name: 'Gable', group: 'Roof', role: 'roof', polys: [gable], scores: [],
      plane: { o: [0, D - t, z0], U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] } },
    { key: 'roof-left', name: 'Left roof', group: 'Roof', role: 'roof', polys: [slope(sides.left)], scores: [],
      plane: { o: [sides.left.A[0], 0, sides.left.A[1]], U: [c, 0, s], V: [0, 1, 0], n: [-s, 0, c] } },
    { key: 'roof-right', name: 'Right roof', group: 'Roof', role: 'roof', polys: [slope(sides.right)], scores: [],
      plane: { o: [sides.right.A[0], 0, sides.right.A[1]], U: [-c, 0, s], V: [0, 1, 0], n: [s, 0, c] } },
  ];
  const joints = [
    { a: 'roof-left', b: 'roof-gable', kind: 'finger' },
    { a: 'roof-right', b: 'roof-gable', kind: 'finger' },
    { a: 'roof-left', b: 'roof-right', kind: 'flat' },
  ];
  const strips = Object.entries(sides).map(([side, sd]) => ({ side, from: sd.A, dir: sd.a, inward: sd.n, length: sd.L }));
  return {
    parts, joints, rise, ridgeGap, pitch,
    strips, minFinger: Math.min(sides.left.minFinger, sides.right.minFinger),
  };
}
