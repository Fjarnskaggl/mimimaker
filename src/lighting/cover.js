// Wire channels and a hidden cable cover for the back wall.
//
// With lighting.cover.enabled the kit gains:
//   - frame strips round the outside edge of the back wall (board). They hold
//     the cover off the wall so the wires run in the gap; wherever a wire
//     route crosses the back wall's edge the strip is split, leaving a channel
//     for the wire to pass.
//   - one cover panel the size of the back wall (card), with holes for the
//     back-wall windows and doors, and for the power box (or its flush
//     switch / port cut-outs) so they stay reachable.
// Coordinates are the back wall's panel / net coordinates (x right, y up,
// origin at its outer bottom-left corner), the same ones addPart receives.

import { rectPoly, bbox } from '../geometry.js';

export const COVER = {
  frameWidth: 5, // mm, strip width
  gap: 4, // mm, channel left in a strip where a wire crosses
  // power box footprints (real sizes plus clearance)
  box: { aa2: { w: 64, h: 36 }, cr2032: { w: 32, h: 26 }, usb: { w: 10, h: 10 } },
};
const EPS = 1e-6;
const MIN_STRIP = COVER.frameWidth;

/**
 * @param o { cover, leds (with net-coordinate routes), power, openings, W, H, s, t } — s: mm per real cm, t: wall thickness
 * @returns { parts: [{ name, role, material, polys }], steps: [string], warnings: [string] }
 */
export function planCover({ cover, leds, power, openings, W, H, s = 1, t = 0 }) {
  const out = { parts: [], steps: [], warnings: [] };
  if (!cover?.enabled || !leds.length) return out;
  const fw = COVER.frameWidth;

  // where routes cross the back wall's edges
  const gaps = { bottom: [], top: [], left: [], right: [] };
  const inside = ([x, y]) => x >= -EPS && x <= W + EPS && y >= -EPS && y <= H + EPS;
  const edgeOf = ([x, y]) => (Math.abs(x) < EPS ? ['left', y] : Math.abs(x - W) < EPS ? ['right', y]
    : Math.abs(y) < EPS ? ['bottom', x] : Math.abs(y - H) < EPS ? ['top', x] : null);
  for (const led of leds) {
    const pts = led.route || [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      if (inside(a) === inside(b)) continue;
      const e = edgeOf(inside(a) ? a : b);
      if (e) gaps[e[0]].push(e[1]);
    }
  }

  // frame strips, split at the crossings
  const strips = [
    { side: 'bottom', from: 0, to: W, rect: (s, e) => rectPoly(s, 0, e - s, fw) },
    { side: 'top', from: 0, to: W, rect: (s, e) => rectPoly(s, H - fw, e - s, fw) },
    { side: 'left', from: fw, to: H - fw, rect: (s, e) => rectPoly(0, s, fw, e - s) },
    { side: 'right', from: fw, to: H - fw, rect: (s, e) => rectPoly(W - fw, s, fw, e - s) },
  ];
  for (const st of strips) {
    const pieces = splitInterval(st.from, st.to, gaps[st.side].map((c) => [c - COVER.gap / 2, c + COVER.gap / 2]));
    pieces.forEach(([s, e], i) => out.parts.push({
      name: `Cable cover frame – ${st.side}${pieces.length > 1 ? ` ${i + 1}` : ''}`,
      role: 'frame', material: cover.frameMaterial, polys: [st.rect(s, e)],
    }));
  }

  // cover panel with holes
  const holes = openings.filter((o) => o.wall === 'back').map((o) => o.poly);
  let reach = '';
  if (power.face === 'back') {
    if (power.mount === 'flush') {
      holes.push(...(power.cutouts || []).filter((c) => c.face === 'back').map((c) => c.poly));
      reach = ' and the switch cut-out';
    } else {
      const box = COVER.box[power.supply] || COVER.box.aa2;
      const hole = rectPoly(power.u - box.w / 2, power.v - box.h / 2, box.w, box.h);
      const hb = bbox([hole]);
      if (hb.x0 < fw || hb.y0 < fw || hb.x1 > W - fw || hb.y1 > H - fw) {
        // where the box would fit, in the same real-world cm the power box fields use
        const fix = [];
        if (hb.y0 < fw || hb.y1 > H - fw) fix.push(`a height between ${Math.ceil((fw + box.h / 2 - t) / s)} and ${Math.floor((H - fw - box.h / 2 - t) / s)} cm`);
        if (hb.x0 < fw || hb.x1 > W - fw) fix.push(`between ${Math.ceil((fw + box.w / 2 - t) / s)} and ${Math.floor((W - fw - box.w / 2 - t) / s)} cm along the wall`);
        out.warnings.push(`The power box is too close to the edge of the back wall for the cable cover — move it to ${fix.join(' and ')}, or put it on another wall.`);
      } else {
        holes.push(hole);
        reach = ' and the power box';
      }
    }
  }
  out.parts.push({ name: 'Cable cover panel', role: 'panel', material: cover.panelMaterial, polys: [rectPoly(0, 0, W, H), ...holes] });

  out.steps.push(
    'Cable cover: lay each wire on the outside of the back wall along its route on the LED map. Where a wire leaves the back wall it passes through a gap between the frame strips.',
    'Glue the cable cover frame strips round the outside edge of the back wall, leaving those gaps open; the wires sit inside the frame.',
    `Glue the cover panel onto the frame. Its holes line up with the back-wall windows and doors${reach}.`,
  );
  return out;
}

/** [from, to] minus the cut intervals, dropping pieces shorter than a strip is wide. */
function splitInterval(from, to, cuts) {
  const sorted = cuts.map(([a, b]) => [Math.max(from, a), Math.min(to, b)]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const pieces = [];
  let s = from;
  for (const [a, b] of sorted) {
    if (a > s) pieces.push([s, a]);
    s = Math.max(s, b);
  }
  if (to > s) pieces.push([s, to]);
  return pieces.filter(([a, b]) => b - a >= MIN_STRIP - EPS);
}
