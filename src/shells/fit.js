// Fit checks for shells: every part is a flat panel of thickness t whose
// visible face lies on `plane` ({o, U, V, n}, U/V unit axes of the panel's
// 2D coordinates) and whose material runs t along −n. These helpers turn a
// part into its 3D solid so tests (and warnings) can prove that no two parts
// claim the same space and that everything stays inside the shell.

import { partArea, pointInPolygon } from '../geometry.js';

const EPS = 1e-9;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A part's own thickness (e.g. a thin relief layer), else the shell board's. */
const thick = (part, t) => part.thickness ?? t;

/** Size a shell to slide into a shelf gap: W and H lose `clearance`, D is capped at the shelf. */
export function shellSize({ gap, clearance = 2, depth }) {
  const W = gap.w - clearance, H = gap.h - clearance;
  const D = Math.min(depth ?? gap.d, gap.d);
  if (!(W >= 20 && H >= 20 && D >= 20)) {
    throw new Error(`The shelf gap (${gap.w} × ${gap.h} × ${gap.d} mm) is too small for a shell — it needs at least 20 mm each way after clearance.`);
  }
  return { W, H, D };
}

/** Material volume of a part (mm³). */
export function partVolume(part, t) {
  return partArea(part.polys) * thick(part, t);
}

/** Axis-aligned bounds [[x0,x1],[y0,y1],[z0,z1]] of a part's solid. */
export function partBox(part, t) {
  const { o, U, V, n } = part.plane;
  t = thick(part, t);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const [u, v] of part.polys[0]) {
    const p = add(o, add(mul(U, u), mul(V, v)));
    for (const q of [p, add(p, mul(n, -t))]) {
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
    }
  }
  return lo.map((a, i) => [a + 0, hi[i] + 0]);
}

/** Is point p strictly inside the part's solid? (even-odd over outline + holes) */
export function partContains(part, t, p) {
  const { o, U, V, n } = part.plane;
  const d = sub(p, o);
  const w = -dot(d, n);
  if (w <= 0 || w >= thick(part, t)) return false;
  const uv = [dot(d, U), dot(d, V)];
  let inside = false;
  for (const poly of part.polys) if (pointInPolygon(uv, poly)) inside = !inside;
  return inside;
}

/**
 * Pairs of parts whose solids overlap. Samples a grid over each pair's
 * bounding-box overlap (so joints are checked exactly where they meet);
 * parts that only touch have no overlap volume and are skipped.
 */
export function findOverlaps(parts, t, { step = 0.4 } = {}) {
  const boxes = parts.map((p) => partBox(p, t));
  const out = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const ov = boxes[i].map(([a0, a1], k) => [Math.max(a0, boxes[j][k][0]), Math.min(a1, boxes[j][k][1])]);
    if (ov.some(([a, b]) => b - a <= 1e-6)) continue;
    const n = ov.map(([a, b]) => Math.max(2, Math.ceil((b - a) / step)));
    const h = ov.map(([a, b], k) => (b - a) / n[k]);
    // odd fractional offset so samples never sit on joint boundaries
    const at = (k, m) => ov[k][0] + (m + 0.5 + 0.0137) * h[k];
    let hits = 0;
    for (let a = 0; a < n[0]; a++) for (let b = 0; b < n[1]; b++) for (let c = 0; c < n[2]; c++) {
      const p = [at(0, a), at(1, b), at(2, c)];
      if (partContains(parts[i], t, p) && partContains(parts[j], t, p)) hits++;
    }
    if (hits) out.push({ keys: [parts[i].key, parts[j].key], volume: hits * h[0] * h[1] * h[2] });
  }
  return out;
}

/** Keys of parts that stick out of the [0,W]×[0,D]×[0,H] envelope. */
export function outsideEnvelope(parts, t, { W, D, H }) {
  const lim = [W, D, H];
  return parts.filter((p) => partBox(p, t).some(([a, b], k) => a < -EPS || b > lim[k] + EPS)).map((p) => p.key);
}
