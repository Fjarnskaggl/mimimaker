// Switch and USB-port cut-outs for a power box mounted flush behind a wall.
//
// With power.mount === 'flush' the battery box (or USB socket) sits behind
// the wall panel and only its switch / port shows through a cut-out. Sizes
// are real part sizes in mm plus a little clearance — they are NOT scaled.

import { rectPoly, ellipsePoly, bbox } from '../geometry.js';

export const CUTOUTS = {
  switch: { name: 'Slide-switch slot', w: 8.5, h: 4.5 }, // mini slide switch on battery boxes
  usb: { name: 'USB-C port', w: 9.6, h: 4 }, // panel-mount USB-C socket (8.9 × 3.3 mm body)
  button: { name: 'Push-switch hole', d: 6.5 }, // 6 mm panel push switch
};
const GAP = 4; // mm between the port and the switch

/**
 * @param power { face, u, v, supply, mount } — u, v in the wall's panel coordinates
 * @param ctx { t, Hi, wallInfo, openings }
 * @returns { cutouts: [{ kind, face, cx, cy, poly }], warnings: [string] }
 */
export function planCutouts(power, ctx) {
  const cutouts = [];
  const warnings = [];
  if (power.mount !== 'flush') return { cutouts, warnings };
  const { face, u, v } = power;
  if (power.supply === 'usb') {
    const { w, h } = CUTOUTS.usb;
    cutouts.push({ kind: 'usb', face, cx: u, cy: v, poly: rectPoly(u - w / 2, v - h / 2, w, h) });
    const r = CUTOUTS.button.d / 2;
    const bx = u + w / 2 + GAP + r;
    cutouts.push({ kind: 'button', face, cx: bx, cy: v, poly: ellipsePoly(bx, v, r, r, 24) });
  } else {
    const { w, h } = CUTOUTS.switch;
    cutouts.push({ kind: 'switch', face, cx: u, cy: v, poly: rectPoly(u - w / 2, v - h / 2, w, h) });
  }

  const wi = ctx.wallInfo[face];
  const b = bbox(cutouts.map((c) => c.poly));
  if (!wi || b.x0 < wi.u0 + 1 || b.x1 > wi.u0 + wi.len - 1 || b.y0 < ctx.t + 1 || b.y1 > ctx.t + ctx.Hi - 1) {
    warnings.push(`The power box's switch cut-out is off the ${face} wall — move the power box.`);
  }
  for (const o of ctx.openings || []) {
    if (o.wall !== face) continue;
    const ob = bbox([o.poly]);
    if (b.x1 > ob.x0 - 1 && b.x0 < ob.x1 + 1 && b.y1 > ob.y0 - 1 && b.y0 < ob.y1 + 1) {
      warnings.push('The power box\'s switch cut-out overlaps a window or door — move the power box.');
      break;
    }
  }
  return { cutouts, warnings };
}
