// Part number placement and a tiny single-stroke (7-segment) digit font so
// part numbers can be drawn with a Cricut pen.

import { distToSegment } from './geometry.js';

/**
 * Work done by labelAnchor, for the compile-speed budget (test/perf-budget):
 * point–edge tests, counted the same way whether they test "inside?" or measure
 * a distance. Deterministic, unlike a timing.
 */
export const labelWork = { edgeTests: 0 };

/**
 * Find a spot well inside the part (away from edges and holes) for its label.
 * Tries a 13×13 grid and keeps the point farthest from any edge, preferring
 * central spots when distances tie. This runs for every part on every
 * compile, so it is written for speed: grid points are tried centre-first and
 * a point stops measuring as soon as it can no longer win. The answer is the
 * same as measuring every point fully in row order.
 */
export function labelAnchor(part, text = String(part.id)) {
  const segs = edgeList(part.polys);
  const N = 13;
  const xs = Array.from({ length: N }, (_, i) => ((i + 0.5) / N) * part.w);
  const ys = Array.from({ length: N }, (_, j) => ((j + 0.5) / N) * part.h);
  const inside = insideGrid(part.polys, xs, ys);
  const cx = part.w / 2, cy = part.h / 2;
  let best = null;
  for (const k of centreFirst(N)) {
    if (!inside[k]) continue;
    const p = [xs[Math.floor(k / N)], ys[k % N]];
    const centrePull = 0.001 * Math.hypot(p[0] - cx, p[1] - cy);
    // score = d - centrePull; ties go to the earlier point in row order
    const d = distAtLeast(p, segs, best ? best.score + centrePull : -Infinity);
    if (d < 0) continue;
    const score = d - centrePull;
    if (!best || score > best.score || (score === best.score && k < best.k)) best = { x: p[0], y: p[1], d, score, k };
  }
  if (!best) best = { x: part.w / 2, y: part.h / 2, d: 2 };
  const chars = text.length;
  const size = Math.max(1.2, Math.min(5, best.d * 1.3, (1.8 * best.d) / (chars * 0.75)));
  return { x: best.x, y: best.y, size };
}

/**
 * Which grid points (index i * ys.length + j) are inside the outline and
 * outside its holes: pointInPolygon() for each, but one pass per row.
 */
function insideGrid([outer, ...holes], xs, ys) {
  const n = ys.length;
  const out = new Uint8Array(xs.length * n);
  const crossings = (poly, y) => {
    const c = [];
    labelWork.edgeTests += poly.length;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y) c.push(((xj - xi) * (y - yi)) / (yj - yi) + xi); // as pointInPolygon()
    }
    return c;
  };
  const odd = (c, x) => { labelWork.edgeTests += c.length; let k = 0; for (const v of c) if (x < v) k++; return k % 2 === 1; };
  for (let j = 0; j < n; j++) {
    const y = ys[j];
    const o = crossings(outer, y);
    if (!o.length) continue;
    const hs = holes.map((h) => crossings(h, y)).filter((c) => c.length);
    for (let i = 0; i < xs.length; i++) {
      if (odd(o, xs[i]) && !hs.some((c) => odd(c, xs[i]))) out[i * n + j] = 1;
    }
  }
  return out;
}

/** Every edge of the outlines as [ax, ay, bx, by, …]. */
function edgeList(polys) {
  let n = 0;
  for (const poly of polys) n += poly.length;
  const out = new Float64Array(n * 4);
  let o = 0;
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out[o++] = a[0]; out[o++] = a[1]; out[o++] = b[0]; out[o++] = b[1];
  }
  return out;
}

/** Grid indexes (i * n + j) ordered by distance from the middle: good spots are found first. */
const orders = new Map();
function centreFirst(n) {
  if (!orders.has(n)) {
    const m = (n - 1) / 2;
    const ks = Array.from({ length: n * n }, (_, k) => k);
    const r = (k) => (Math.floor(k / n) - m) ** 2 + ((k % n) - m) ** 2;
    orders.set(n, ks.sort((a, b) => r(a) - r(b) || a - b));
  }
  return orders.get(n);
}

const segDist2 = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
};

/**
 * Distance from p to the nearest edge, exactly as distToPolys measures it, or
 * -1 once it is certain to be below `floor` (the point can't win then).
 */
function distAtLeast([px, py], segs, floor) {
  // squared distances are cheap; stop early with a margin so rounding can't
  // reject a point that hypot() would have scored at or above the floor
  const stop = floor > 0 ? floor * floor * (1 - 1e-9) : -1;
  let min2 = Infinity;
  for (let o = 0; o < segs.length; o += 4) {
    const d2 = segDist2(px, py, segs[o], segs[o + 1], segs[o + 2], segs[o + 3]);
    if (d2 < min2) {
      min2 = d2;
      if (min2 < stop) { labelWork.edgeTests += o / 4 + 1; return -1; }
    }
  }
  // the exact value: hypot() of the nearest edges, as distToPolys() reports it
  labelWork.edgeTests += segs.length / 2; // both passes
  let d = Infinity;
  const near = min2 * (1 + 1e-9) + 1e-300;
  for (let o = 0; o < segs.length; o += 4) {
    if (segDist2(px, py, segs[o], segs[o + 1], segs[o + 2], segs[o + 3]) <= near) {
      d = Math.min(d, distToSegment([px, py], [segs[o], segs[o + 1]], [segs[o + 2], segs[o + 3]]));
    }
  }
  return d;
}

const SEG = {
  a: [[0, 1], [1, 1]], b: [[1, 1], [1, 0.5]], c: [[1, 0.5], [1, 0]], d: [[0, 0], [1, 0]],
  e: [[0, 0], [0, 0.5]], f: [[0, 0.5], [0, 1]], g: [[0, 0.5], [1, 0.5]],
};
const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/** Line segments (y-up) for `text` (digits only) centred on (cx, cy), `size` mm tall. */
export function strokeText(text, cx, cy, size) {
  const cw = size * 0.5, gap = size * 0.28;
  const total = text.length * cw + (text.length - 1) * gap;
  let x = cx - total / 2;
  const y = cy - size / 2;
  const out = [];
  for (const ch of text) {
    for (const s of DIGITS[ch] || '') out.push(SEG[s].map(([u, v]) => [x + u * cw, y + v * size]));
    x += cw + gap;
  }
  return out;
}
