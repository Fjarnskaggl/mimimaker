// Geometry helpers behind the declarative shape and score vocabulary.
// Moved verbatim from the hand-written catalogue so pieces build the same
// floats they always did.

import { archPoly, ellipsePoly, rectPoly } from '../geometry.js';

export const ALL_FACES = ['bottom', 'top', 'front', 'back', 'left', 'right'];
// One export per statement: the single-file bundler only sees the first name
// of `export const a = …, b = …`.
export const X = [1, 0, 0];
export const Y = [0, 1, 0];
export const Z = [0, 0, 1];

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

/**
 * Leafy plant silhouette (a lobed star); `lobes` sets how many leaves.
 * With a stem (`stemW` wide, `stemH` > 0) the leaves start stemH up and a
 * stem tab runs from their underside down to y = 0, to stand in a slot.
 * `slit` cuts a cross-lap slit `|slit|` wide down the middle to the leaves'
 * centre: from the top when positive, from the bottom when negative.
 * A stem and a bottom slit can't be combined (the stem takes the lower middle).
 */
export function plantPoly(w, h, lobes = 3.5, stemW = 0, stemH = 0, slit = 0) {
  let pts = [];
  const cx = w / 2, n = 160;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.62 + 0.38 * Math.abs(Math.cos(lobes * a));
    pts.push([cx + Math.cos(a) * (w / 2) * r, h * 0.55 + Math.sin(a) * (h * 0.45) * r]);
  }
  const stem = stemW > 0 && stemH > 0;
  // with a stem or slit, the leaves' lowest point sits on y = stemH (0
  // without a stem) so slits in matching crowns meet; a plain plant is
  // left where it always was
  if (stem || slit) {
    const lift = Math.max(0, stemH) - Math.min(...pts.map((p) => p[1]));
    pts = pts.map(([x, y]) => [x, y + lift]);
  }
  const ys = pts.map((p) => p[1]);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  // replace the run of points in one half (lower: angles past π) that lies within half-width hw of the middle
  const splice = (lower, hw, make) => {
    const idx = [];
    pts.forEach(([x], i) => { if ((i >= n / 2) === lower && Math.abs(x - cx) <= hw) idx.push(i); });
    if (!idx.length) { const i = lower ? (3 * n) / 4 : n / 4; idx.push(i); }
    const i0 = idx[0], i1 = idx.at(-1);
    pts = [...pts.slice(0, i0), ...make(pts[i0][1], pts[i1][1]), ...pts.slice(i1 + 1)];
  };
  // A slit's mouth is cut square across SHOULDER either side, so the leaf
  // beside it never tapers to a sliver. Each slit runs SLIT_PAST beyond the
  // middle so the two halves meet with a hair of play. The lower half runs
  // left to right (angles π…2π), the upper half right to left (0…π); the
  // lower half goes first, so the upper half's indices hold. A stem takes the
  // lower middle, so a plant has a stem or a bottom slit, not both.
  const h2 = Math.abs(slit) / 2, band = h2 + SHOULDER;
  if (stem) splice(true, stemW / 2, (y0, y1) => [[cx - stemW / 2, y0], [cx - stemW / 2, 0], [cx + stemW / 2, 0], [cx + stemW / 2, y1]]);
  else if (slit < 0) splice(true, band, (y0, y1) => [[cx - band, y0], [cx - h2, y0], [cx - h2, mid + SLIT_PAST], [cx + h2, mid + SLIT_PAST], [cx + h2, y1], [cx + band, y1]]);
  if (slit > 0) splice(false, band, (y0, y1) => [[cx + band, y0], [cx + h2, y0], [cx + h2, mid - SLIT_PAST], [cx - h2, mid - SLIT_PAST], [cx - h2, y1], [cx - band, y1]]);
  return pts;
}

/** How far a cross-lap slit runs past the middle, and the square shoulder beside its mouth (mm). */
const SLIT_PAST = 0.1;
const SHOULDER = 1.5;

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
  plant: (w, h, lobes, stemW, stemH, slit) => plantPoly(w, h, lobes, stemW, stemH, slit),
  drape: (x0, pw, h) => drapePoly(x0, pw, h),
};

/** Score shapes: name → (...numbers) → list of segments. */
export const SCORE_FNS = {
  rect: (x, y, w, h) => loopScores(rectPoly(x, y, w, h)),
  circle: (cx, cy, r, seg = 20) => loopScores(ellipsePoly(cx, cy, r, r, seg)),
  ellipse: (cx, cy, rx, ry, seg) => loopScores(ellipsePoly(cx, cy, rx, ry, seg)),
};
