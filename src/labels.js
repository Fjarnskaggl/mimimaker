// Part number placement and a tiny single-stroke (7-segment) digit font so
// part numbers can be drawn with a Cricut pen.

import { pointInPolygon, distToPolys } from './geometry.js';

/** Find a spot well inside the part (away from edges and holes) for its label. */
export function labelAnchor(part, text = String(part.id)) {
  const [outer, ...holes] = part.polys;
  let best = null;
  const N = 13;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = [((i + 0.5) / N) * part.w, ((j + 0.5) / N) * part.h];
    if (!pointInPolygon(p, outer)) continue;
    if (holes.some((h) => pointInPolygon(p, h))) continue;
    const d = distToPolys(p, part.polys);
    // prefer central spots when distances tie
    const score = d - 0.001 * Math.hypot(p[0] - part.w / 2, p[1] - part.h / 2);
    if (!best || score > best.score) best = { x: p[0], y: p[1], d, score };
  }
  if (!best) best = { x: part.w / 2, y: part.h / 2, d: 2 };
  const chars = text.length;
  const size = Math.max(1.2, Math.min(5, best.d * 1.3, (1.8 * best.d) / (chars * 0.75)));
  return { x: best.x, y: best.y, size };
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
