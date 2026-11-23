// Geometry helpers behind the declarative shape and score vocabulary.
// Moved verbatim from the hand-written catalogue so pieces build the same
// floats they always did.

import { archPoly, ellipsePoly, rectPoly } from '../geometry.js';

export const ALL_FACES = ['bottom', 'top', 'front', 'back', 'left', 'right'];
export const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

/** Heights of n evenly spaced shelves inside a box of height H. */
export function evenShelves(n, H, t, hasTop = true) {
  const top = hasTop ? H - t : H;
  const inner = top - t;
  return Array.from({ length: n }, (_, k) => t + ((k + 1) * inner) / (n + 1) - t / 2);
}

/** Drawer (horizontal) or door (vertical) gap lines across a W×H front. */
export function frontScores(style, count, W, H, t, { from = t, to = H - t } = {}) {
  const lines = [];
  const m = t + 0.6;
  if (style === 'drawers' && count > 1) {
    for (let k = 1; k < count; k++) {
      const v = from + (k * (to - from)) / count;
      lines.push([[m, v], [W - m, v]]);
    }
  }
  if (style === 'doors' && count > 1) {
    for (let k = 1; k < count; k++) {
      const u = (k * W) / count;
      lines.push([[u, from + 0.6], [u, to - 0.6]]);
    }
  }
  return lines;
}

/** A closed polyline as score segments. */
export function loopScores(pts) {
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
}

/** Leafy plant silhouette (a lobed star) sitting on y=0. */
export function plantPoly(w, h) {
  const pts = [];
  const cx = w / 2, cy = h * 0.55, n = 160;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.62 + 0.38 * Math.abs(Math.cos(3.5 * a));
    pts.push([cx + Math.cos(a) * (w / 2) * r, cy + Math.sin(a) * (h * 0.45) * r]);
  }
  return pts;
}

/** Curtain panel of width pw and drop h with a gently wavy inner edge. */
export function drapePoly(x0, pw, h) {
  const pts = [[x0, 0], [x0 + pw, 0]];
  for (let i = 1; i <= 8; i++) pts.push([x0 + pw - (i % 2) * pw * 0.06, (i / 8) * h]);
  pts.push([x0, h]);
  return pts;
}

/** Cut shapes: name → (...numbers) → polygon. */
export const SHAPE_FNS = {
  rect: (x, y, w, h) => rectPoly(x, y, w, h),
  arch: (x, y, w, h, r, seg) => archPoly(x, y, w, h, r, seg),
  ellipse: (cx, cy, rx, ry, seg) => ellipsePoly(cx, cy, rx, ry, seg),
  circle: (cx, cy, r, seg) => ellipsePoly(cx, cy, r, r, seg),
  plant: (w, h) => plantPoly(w, h),
  drape: (x0, pw, h) => drapePoly(x0, pw, h),
};

/** Score shapes: name → (...numbers) → list of segments. */
export const SCORE_FNS = {
  rect: (x, y, w, h) => loopScores(rectPoly(x, y, w, h)),
  circle: (cx, cy, r, seg = 20) => loopScores(ellipsePoly(cx, cy, r, r, seg)),
  ellipse: (cx, cy, rx, ry, seg) => loopScores(ellipsePoly(cx, cy, rx, ry, seg)),
};
