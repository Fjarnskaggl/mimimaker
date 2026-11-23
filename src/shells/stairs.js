// Straight stairs generator for board.
//
// Two closed-string stringers (side boards whose band follows the pitch)
// carry the treads, which are tabbed into slots cut through the stringers.
// Optional risers close the backs of the steps and are glued between treads.
// With `topLanding` the last rise ends on something else (a landing or an
// upper floor), so there is one tread fewer than risers.
//
// Local axes: x across the stair (0 … width), y along the run (0 at the
// first riser), z up from the floor; `origin` moves the whole stair. Parts
// follow the shell convention: material runs t along −n from `plane`.

import { cleanPolygon, panelOutline, profilePlain, profileTabs, rectPoly } from '../geometry.js';

/** Stringer band: how far below the inner corners and above the nosings it runs (mm, beyond t). */
const BELOW = 3, ABOVE = 3;
/** Slots are this much bigger than their tabs all round (mm). */
const CLEAR = 0.1;

const tabsOf = (profile) => profile.filter((s) => s.d < 0);

/**
 * @param {object} o
 * @param {number} o.steps number of rises
 * @param {number} o.rise height of each rise (mm)
 * @param {number} o.going depth of each tread (mm)
 * @param {number} o.width overall width, stringers included (mm)
 * @param {number} o.t board thickness (mm)
 * @param {boolean} [o.risers=true]
 * @param {boolean} [o.topLanding=true] the last rise ends on a landing (no top tread)
 * @param {number[]} [o.origin=[0,0,0]]
 * @param {string} [o.key='stair'] part key prefix
 * @param {string} [o.group='Stairs']
 */
export function buildStairs({ steps: n, rise: h, going: g, width: w, t, risers = true, topLanding = true, origin = [0, 0, 0], key = 'stair', group = 'Stairs' }) {
  if (!(n >= 1 && h >= t + 2 && g >= 3 * t && w > 2 * t + 6)) {
    throw new Error(`These stairs can't be cut: ${n} steps of ${h.toFixed(1)} mm rise and ${g.toFixed(1)} mm going, ${w.toFixed(1)} mm wide, in ${t} mm board.`);
  }
  const [ox, oy, oz] = origin;
  const nt = topLanding ? n - 1 : n; // treads
  const run = nt * g;
  const parts = [], joints = [];
  const link = (a, b, kind) => joints.push({ a, b, kind });
  const k = (s) => `${key}-${s}`;

  // ------------------------------------------------------------ stringers
  const b = t + BELOW, m = ABOVE;
  const cap = topLanding ? n * h : n * h + m;
  const lower = (y) => (y * h) / g - b;
  const upper = (y) => (y * h) / g + h + m;
  const pts = [[0, 0]];
  const yb = (b * g) / h; // where the lower edge meets the floor
  if (yb < run) pts.push([yb, 0], [run, lower(run)]);
  else pts.push([run, 0]);
  pts.push([run, Math.min(upper(run), cap)]);
  if (upper(run) > cap) {
    const yc = ((cap - h - m) * g) / h;
    if (yc > 0) pts.push([yc, cap]);
  }
  pts.push([0, Math.min(upper(0), cap)]);
  const stringer = cleanPolygon(pts);

  const tabs = profileTabs(g, t, 1);
  const slots = [];
  for (let j = 0; j < nt; j++) {
    for (const s of tabsOf(tabs)) {
      slots.push(rectPoly(j * g + s.a0 - CLEAR, (j + 1) * h - t - CLEAR, s.a1 - s.a0 + 2 * CLEAR, t + 2 * CLEAR));
    }
  }
  parts.push(
    { key: k('stringer-left'), name: 'Left stringer', group, role: 'stringer', side: 'left', polys: [stringer, ...slots], scores: [],
      plane: { o: [ox + t, oy, oz], U: [0, 1, 0], V: [0, 0, 1], n: [1, 0, 0] } },
    { key: k('stringer-right'), name: 'Right stringer', group, role: 'stringer', side: 'right', polys: [stringer, ...slots], scores: [],
      plane: { o: [ox + w - t, oy, oz], U: [0, 1, 0], V: [0, 0, 1], n: [-1, 0, 0] } },
  );

  // --------------------------------------------------------------- treads
  const tw = w - 2 * t;
  const tread = panelOutline(tw, g, [profilePlain(tw), tabs, profilePlain(tw), tabs]);
  for (let j = 0; j < nt; j++) {
    parts.push({
      key: k(`tread-${j}`), name: `Tread ${j + 1}`, group, role: 'tread', polys: [tread], scores: [],
      plane: { o: [ox + t, oy + j * g, oz + (j + 1) * h], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] },
    });
    link(k(`tread-${j}`), k('stringer-left'), 'slot');
    link(k(`tread-${j}`), k('stringer-right'), 'slot');
  }

  // --------------------------------------------------------------- risers
  if (risers) {
    for (let i = 0; i < n; i++) {
      const rk = k(`riser-${i}`);
      parts.push({
        key: rk, name: `Riser ${i + 1}`, group, role: 'riser', polys: [rectPoly(0, 0, tw, h - t)], scores: [],
        plane: { o: [ox + t, oy + i * g, oz + i * h], U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] },
      });
      if (i < nt) link(rk, k(`tread-${i}`), 'flat'); // the tread above
      if (i > 0) link(rk, k(`tread-${i - 1}`), 'flat'); // the tread behind it
      if (i < nt) { link(rk, k('stringer-left'), 'flat'); link(rk, k('stringer-right'), 'flat'); }
    }
  }

  return { parts, joints, rise: h, going: g, steps: n, run };
}
