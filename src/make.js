// Making: fit-test coupons for calibrating board thickness, and cut-time
// estimates from path length, passes and speed.

import { strokeText } from './labels.js';
import { withMaterialDefaults } from './materials.js';

export const COUPON_STEPS = [-0.2, -0.1, 0, 0.1, 0.2];
const SLOT_DEPTH = 8, SLOT_PITCH = 14, END = 9, HEIGHT = 22;

/**
 * A comb with one slot per step around the material's nominal thickness.
 * Slots are notches in the top edge; push a scrap of the board into each and
 * the first one that holds without forcing is the true thickness.
 */
export function fitCoupon(material, { steps = COUPON_STEPS } = {}) {
  const t = material.thickness;
  const w = 2 * END + (steps.length - 1) * SLOT_PITCH, h = HEIGHT;
  const slots = steps.map((d, i) => ({ index: i + 1, x: END + i * SLOT_PITCH, width: Math.max(0.2, t + d), depth: SLOT_DEPTH }));
  // counter-clockwise: bottom edge, right edge, then the notched top edge right-to-left
  const pts = [[0, 0], [w, 0], [w, h]];
  for (const s of [...slots].reverse()) {
    const a = s.x + s.width / 2, b = s.x - s.width / 2;
    pts.push([a, h], [a, h - s.depth], [b, h - s.depth], [b, h]);
  }
  pts.push([0, h]);
  return { polys: [pts], slots, w, h };
}

const f = (v) => String(Math.round(v * 1000) / 1000);

/** Cricut-ready SVG of the coupon: black cut outline, blue pen slot numbers. */
export function couponSVG(material) {
  const c = fitCoupon(material);
  const m = 5, W = c.w + 2 * m, H = c.h + 2 * m;
  const T = ([x, y]) => [x + m, m + c.h - y]; // y-up → SVG y-down
  const cut = 'M' + c.polys[0].map((p) => T(p).map(f).join(' ')).join('L') + 'Z';
  const draw = c.slots.flatMap((s) => strokeText(String(s.index), s.x, c.h - s.depth - 5, 3.2))
    .map((seg) => 'M' + seg.map((p) => T(p).map(f).join(' ')).join('L')).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">
<title>Fit test – ${material.name} (slots ${c.slots.map((s) => s.width.toFixed(2)).join(' / ')} mm)</title>
<g id="cut" fill="none" stroke="#000000" stroke-width="0.25"><path d="${cut}"/></g>
<g id="draw" fill="none" stroke="#1e63c6" stroke-width="0.3" stroke-linecap="round"><path d="${draw}"/></g>
</svg>
`;
}

/** A copy of the material with its thickness set from the snug slot. */
export function calibrate(material, slotWidth) {
  return { ...material, thickness: Math.round(slotWidth * 100) / 100, calibrated: true };
}

const perimeter = (poly) => poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length];
  return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
}, 0);
const segLength = (seg) => seg.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - seg[i][0], p[1] - seg[i][1]), 0);

/** Total cut and score path length of a part (mm). */
export function cutLength(part) {
  return {
    cut: part.polys.reduce((s, poly) => s + perimeter(poly), 0),
    score: (part.scores || []).reduce((s, seg) => s + segLength(seg), 0),
  };
}

const SCORE_SPEED = 60; // mm/s
const LOAD_MINUTES = 1; // loading, blade travel, unloading

/** Rough minutes to cut one sheet on a Cricut. */
export function estimateCutMinutes(sheet) {
  const m = withMaterialDefaults(sheet.material);
  let seconds = 0;
  for (const pl of sheet.placements) {
    const { cut, score } = cutLength(pl.part);
    seconds += (cut * m.passes) / m.speed + score / SCORE_SPEED;
  }
  return LOAD_MINUTES + seconds / 60;
}

export function formatMinutes(min) {
  const m = Math.max(1, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
