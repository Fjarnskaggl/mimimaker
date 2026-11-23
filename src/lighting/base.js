// Hidden base compartment for the battery box and switch (power.mount === 'base').
//
// Rolife-style book nooks hide the battery box in a shallow base under the
// scene, with a touch switch on the base's front or side, and run the LED
// wires down the back (behind the cable cover) into it. This plans that base:
//
//   - an open-topped box the size of the room's footprint; the room's floor
//     is its lid
//   - a hatch opening in its back panel with a friction-fit hatch and two
//     hatch stops glued inside, so the battery box slides out to change
//     batteries
//   - a wire hole beside the hatch where the LED wires come in
//   - a switch hole near the front corner of the front, left or right panel,
//     with a mount plate glued behind it that holds the switch
//
// Coordinates: the base box has x across (0..W), y front to back (0..D),
// z up (0..H). Panel (u, v) coordinates follow box.js FACES: back and front
// (x, z), left and right (y, z) with u = 0 at the front. Switch sizes are real
// part sizes in mm plus a little clearance; they are not scaled.

import { buildBox } from '../box.js';
import { rectPoly, ellipsePoly } from '../geometry.js';
import { CUTOUTS } from './cutouts.js';

export const BASE = {
  // battery box (or USB socket board) bodies lying flat: length, width, height
  box: { aa2: { l: 64, w: 36, h: 18 }, cr2032: { l: 32, w: 26, h: 10 }, usb: { l: 24, w: 14, h: 10 } },
  hatchExtra: 10, // mm the hatch opening is wider than the box (the stops take 3 mm each side)
  stopWidth: 6, // mm, a hatch stop strip
  stopOverlap: 3, // mm of each stop showing through the opening
  keepBottom: 1.5, // mm of board kept above the bottom joint, under the hatch
  keepTop: 3, // mm of board kept above the hatch
  hatchClearance: 0.15, // mm off each side of the hatch for a friction fit
  fingerR: 3.5, // mm, finger hole in the hatch
  cableR: 3, // mm, USB lead hole in the hatch
  wireR: 2.5, // mm, the hole the LED wires come in through
  wireGap: 8, // mm from the hatch edge to the wire hole's centre
  sideKeep: 3, // mm of board kept between a hole and a side panel
};

export const SWITCHES = {
  // capacitive touch module (TTP223-style, about 15 × 11 mm) behind a round window
  touch: { name: 'touch switch', hole: 10, pocket: [15.6, 11.6], plate: [22, 18] },
  // 6 mm latching push switch through a round hole, with a collar to thicken the panel
  push: { name: 'push switch', hole: CUTOUTS.button.d, pocket: null, plate: [16, 16] },
};
export const SWITCH_FACES = ['front', 'left', 'right'];

const kindOf = (k) => (SWITCHES[k] ? k : 'touch');
const faceOf = (f) => (SWITCH_FACES.includes(f) ? f : 'front');

/**
 * Where everything in the base goes.
 * @param o { supply, pos (real cm along the back wall, the battery box centre), switchAt, switchKind, W, D, t, s }
 * @returns { W, D, H, t, supply, box: {x, y, l, w, h}, hatch: {x0, z0, w, h}, entry: {x, z, r},
 *   switch: {face, kind, cx, cz, hole}, inRun (mm of wire inside the base), warnings }
 */
export function baseLayout({ supply = 'aa2', pos, switchAt, switchKind, W, D, t, s = 1 }) {
  const warnings = [];
  const box = BASE.box[supply] || BASE.box.aa2;
  const sw = SWITCHES[kindOf(switchKind)];
  const H = t + Math.max(BASE.keepBottom + box.h + 2 + BASE.keepTop, sw.plate[1] + 4);

  // hatch opening in the back panel, centred on the battery box
  const hw = box.l + BASE.hatchExtra;
  const z0 = t + BASE.keepBottom;
  const hh = Math.min(box.h + 2, H - BASE.keepTop - z0);
  const lo = t + BASE.sideKeep + BASE.stopOverlap + hw / 2;
  const hi = W - t - BASE.sideKeep - BASE.stopOverlap - hw / 2;
  const want = Number.isFinite(pos) ? t + pos * s : W / 2;
  const bx = lo <= hi ? Math.min(hi, Math.max(lo, want)) : W / 2;
  const hatch = { x0: bx - hw / 2, z0, w: hw, h: hh };

  // wire hole beside the hatch, on the side with more room
  const right = W - (hatch.x0 + hw) >= hatch.x0;
  const ex = right ? hatch.x0 + hw + BASE.wireGap : hatch.x0 - BASE.wireGap;
  const entry = { x: ex, z: (t + H) / 2, r: BASE.wireR };
  if (ex - BASE.wireR < t + BASE.sideKeep || ex + BASE.wireR > W - t - BASE.sideKeep || lo > hi) {
    warnings.push(`The room is too narrow for the hidden base's battery hatch and wire hole (it needs about ${Math.ceil(hw + 2 * (BASE.wireGap + BASE.wireR + BASE.sideKeep) + 2 * t)} mm across) — widen the room or use a smaller supply.`);
  }
  if (D - 2 * t < box.w + 6) {
    warnings.push(`The room is too shallow for the battery box in the hidden base (it needs about ${Math.ceil(box.w + 6 + 2 * t)} mm deep) — make the room deeper.`);
  }

  // switch near the front corner, centred in the base's height
  const face = faceOf(switchAt);
  const cx = t + 2 + sw.plate[0] / 2;
  const cz = (t + H) / 2;

  // battery box sits just inside the hatch
  const by = D - t - 3 - box.w / 2;
  // wire inside: entry to the switch (along the back, then to the front) and on to the box
  const swPoint = face === 'front' ? [cx, t] : [face === 'left' ? t : W - t, cx];
  const inRun = Math.abs(ex - swPoint[0]) + Math.abs(D - t - swPoint[1]) + Math.abs(swPoint[0] - bx) + Math.abs(swPoint[1] - by) + 20;

  return {
    W, D, H, t, supply,
    box: { x: bx, y: by, ...box },
    hatch, entry,
    switch: { face, kind: kindOf(switchKind), cx, cz, hole: sw.hole },
    inRun, warnings,
  };
}

/**
 * Cut parts and steps for the base.
 * @param L a baseLayout
 * @param o { fingerWidth, minFeature } for the box joints
 * @returns { panels: [{ face, name, polys }], parts: [{ key, name, polys, view? }], steps: [string with {base} {stops} {hatch} {mount} {all}], minFinger }
 */
export function buildBase(L, { fingerWidth, minFeature = 0 } = {}) {
  const { W, D, H, t, hatch, entry } = L;
  const sw = SWITCHES[L.switch.kind];
  const swHole = ellipsePoly(L.switch.cx, L.switch.cz, sw.hole / 2, sw.hole / 2, 32);
  const holes = {
    back: [rectPoly(hatch.x0, hatch.z0, hatch.w, hatch.h), ellipsePoly(entry.x, entry.z, entry.r, entry.r, 20)],
    [L.switch.face]: [swHole],
  };
  const res = buildBox({ W, D, H, t, faces: ['bottom', 'front', 'back', 'left', 'right'], holes, fingerWidth, minFeature });
  const NAMES = { bottom: 'Base bottom', front: 'Base front', back: 'Base back (hatch)', left: 'Base left', right: 'Base right' };
  const panels = res.panels.map((p) => ({ face: p.face, name: NAMES[p.face], polys: [p.outline, ...p.holes] }));

  const c = BASE.hatchClearance;
  const hatchPolys = [rectPoly(hatch.x0 + c, hatch.z0 + c, hatch.w - 2 * c, hatch.h - 2 * c)];
  const midX = hatch.x0 + hatch.w / 2;
  hatchPolys.push(ellipsePoly(midX, hatch.z0 + hatch.h * 0.62, BASE.fingerR, BASE.fingerR, 20));
  if (L.supply === 'usb') hatchPolys.push(ellipsePoly(midX + hatch.w / 4, hatch.z0 + hatch.h / 2, BASE.cableR, BASE.cableR, 20));

  const stop = (x) => rectPoly(x - BASE.stopWidth / 2, hatch.z0, BASE.stopWidth, hatch.h);
  const [pw, ph] = sw.plate;
  const plate = rectPoly(L.switch.cx - pw / 2, L.switch.cz - ph / 2, pw, ph);
  const mountHole = sw.pocket
    ? rectPoly(L.switch.cx - sw.pocket[0] / 2, L.switch.cz - sw.pocket[1] / 2, sw.pocket[0], sw.pocket[1])
    : swHole;
  const parts = [
    { key: 'hatch', name: 'Battery hatch', polys: hatchPolys, view: { face: 'back' } },
    { key: 'stop', name: 'Hatch stop 1', polys: [stop(hatch.x0)] },
    { key: 'stop', name: 'Hatch stop 2', polys: [stop(hatch.x0 + hatch.w)] },
    { key: 'mount', name: `Switch mount (${sw.name})`, polys: [plate, mountHole] },
  ];

  const where = { front: 'front', left: 'left side', right: 'right side' }[L.switch.face];
  const power = L.supply === 'usb' ? 'USB lead' : 'battery box';
  const steps = [
    `Hidden base: glue the base box together ({base}). It has no lid — the room's floor closes it. Leave the hatch out.`,
    'Glue the hatch stops ({stops}) inside the base back, one at each side of the hatch opening, so half of each shows through the opening. The hatch rests against them.',
    L.switch.kind === 'touch'
      ? `Glue the switch mount {mount} inside the base ${where}, over the round switch hole, and press the touch switch module into its pocket with its touch pad facing out through the hole.`
      : `Glue the switch mount {mount} inside the base ${where}, over the switch hole, and fit the push switch through both.`,
    'Glue the room onto the base, edges flush all round.',
    `Run every LED wire down the back to the base and in through the wire hole beside the hatch. Inside, join them: ${power} + (red) to one switch lead, the other switch lead to every LED +, and every LED − to the ${power} − (black). Insulate the joins. A battery box's own switch stays on: the ${sw.name} turns the lights on and off.`,
    L.supply === 'usb'
      ? 'Lay the USB socket board just inside the hatch, pass the USB lead through the hole in the hatch {hatch} and push the hatch in.'
      : `Slide the battery box in through the hatch — don't glue it, so it comes out to change batteries — and push the hatch {hatch} in. To change batteries, pull the hatch out by its finger hole.`,
  ];
  return { panels, parts, steps, minFinger: res.minFinger };
}
