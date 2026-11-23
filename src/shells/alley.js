// Alley shell: a book nook whose side walls become two rows of buildings
// facing a narrow street.
//
// Each side is a stack of facade layers standing off the shell wall on
// spacers. The gap behind the base layer is the light cavity: micro LEDs lie
// there and shine through the lit-window holes. Relief layers (one per
// building, inset a little more each layer) add depth, with window openings
// that grow a frame's width per layer so the windows read as deep reveals.
//
// Forced perspective: everything is drawn as if seen from the open front
// with the eye at `horizon`. At depth y the scale is s(y) = 1 / (1 + p·y/D),
// so buildings get shorter (length ∝ s), rooflines fall toward the horizon
// and windows shrink. A low skyline backdrop closes the far end.
//
// Facade coordinates: (y, v) with y the depth from the front and v the
// height above the floor. Left-side panels use them directly; right-side
// panels are mirrored so every drawn face points into the street.

import { nookWalls } from './nook.js';
import { rectPoly, archPoly, ellipsePoly, cleanPolygon } from '../geometry.js';

export const ALLEY_DEFAULTS = {
  buildings: 3, layers: 2, cavity: 6, perspective: 0.6, horizon: 0.4,
  windowW: 8, windowH: 12, litRatio: 0.6, seed: 1, backdrop: true, backCavity: 6,
};

export const ALLEY_PARAMS = [
  { key: 'buildings', label: 'Buildings per side', type: 'int', min: 1, max: 6 },
  { key: 'layers', label: 'Facade layers', type: 'int', min: 1, max: 4 },
  { key: 'cavity', label: 'Light cavity', type: 'num', min: 3, max: 15, step: 0.5, unit: 'mm' },
  { key: 'perspective', label: 'Forced perspective', type: 'num', min: 0.05, max: 1.5, step: 0.05 },
  { key: 'horizon', label: 'Eye height', type: 'num', min: 0.1, max: 0.6, step: 0.05 },
  { key: 'windowW', label: 'Window width (front)', type: 'num', min: 4, max: 20, step: 0.5, unit: 'mm' },
  { key: 'windowH', label: 'Window height (front)', type: 'num', min: 5, max: 30, step: 0.5, unit: 'mm' },
  { key: 'litRatio', label: 'Lit windows', type: 'num', min: 0, max: 1, step: 0.05 },
  { key: 'seed', label: 'Variation', type: 'int', min: 1, max: 9999 },
  { key: 'backdrop', label: 'Skyline backdrop', type: 'bool' },
  { key: 'backCavity', label: 'Backdrop cavity', type: 'num', min: 3, max: 15, step: 0.5, unit: 'mm' },
];

/** Relief layers step in by this much (mm) per layer… */
const INSET = 1;
/** …and their window openings grow by this much per layer. */
const FRAME = 1.2;
/** Board left around every hole, and between neighbouring holes (mm). */
const EDGE = 1.5, BRIDGE = 2;
/** Smallest hole the Knife Blade cuts cleanly (mm). */
const MIN_HOLE = 3;
/** Wire notch at the foot of each cavity spacer (mm). */
const NOTCH_W = 3, NOTCH_H = 6;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));

function windowPoly(win, grow = 0) {
  const x = win.u0 - grow, y = win.v0 - grow, w = win.w + 2 * grow, h = win.h + 2 * grow;
  return win.shape === 'arch' ? archPoly(x, y, w, h, w / 2, 12) : rectPoly(x, y, w, h);
}

const edgesOf = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);

/**
 * Lay out a grid of windows on a building face whose roof runs linearly
 * from (a, roofA) to (b, roofB). `scaleAt(u)` gives the perspective scale,
 * `vAt(vTrue, s)` maps a true height to the drawn one. Returns windows
 * {u0, v0, w, h} that keep `side`/`roof` clearance and `bridge` spacing.
 */
function layoutWindows({ a, b, roofA, roofB, side, roof, bottom, bridge, winW, winH, scaleAt, vAt }) {
  const roofAt = (u) => roofA + ((roofB - roofA) * (u - a)) / (b - a);
  // clearance to a sloped roof is measured square to it
  const slope = (roofB - roofA) / (b - a);
  const roofGap = roof * Math.sqrt(1 + slope * slope);
  const end = b - side;
  const cols = [];
  let cur = a + side;
  for (;;) {
    const s = scaleAt(cur + (winW * scaleAt(cur)) / 2);
    const w = winW * s;
    if (cur + w > end + 1e-9) break;
    cols.push({ u0: cur, w, s });
    cur += w + Math.max(bridge, winW * 0.9 * s);
  }
  if (!cols.length) return { windows: [], skipped: 0 };
  // centre the columns on the face
  const shift = (end - (cols[cols.length - 1].u0 + cols[cols.length - 1].w)) / 2;
  const windows = [];
  let skipped = 0;
  for (const col of cols) {
    const u0 = col.u0 + shift;
    const h = winH * col.s;
    if (col.w < MIN_HOLE || h < MIN_HOLE) { skipped++; continue; }
    const top = Math.min(roofAt(u0), roofAt(u0 + col.w)) - roofGap;
    const pitch = winH * 1.8;
    let lastTop = -Infinity;
    for (let k = 0; ; k++) {
      const vc = vAt(pitch * (1.2 + k), col.s);
      const v0 = vc - h / 2;
      if (v0 + h > top + 1e-9) break;
      if (v0 < bottom || v0 < lastTop + bridge) continue;
      windows.push({ u0, v0, w: col.w, h });
      lastTop = v0 + h;
    }
  }
  return { windows, skipped };
}

export function buildAlley({ W, D, H, t, fingerWidth, holes = {} }, params) {
  const P = { ...ALLEY_DEFAULTS, ...params };
  const nb = clampInt(P.buildings, 1, 6);
  const layers = clampInt(P.layers, 1, 4);
  const c = clamp(P.cavity, 1, 40);
  const cb = clamp(P.backCavity, 1, 40);
  const persp = clamp(P.perspective, 0.01, 3);
  const litRatio = clamp(P.litRatio, 0, 1);
  const warnings = [];
  const Di = D - t, Hi = H - 2 * t;
  const sx0 = t + c + layers * t, sx1 = W - sx0;
  const street = sx1 - sx0;
  if (street < 20) {
    throw new Error(`The street between the facades is only ${street.toFixed(1)} mm wide — make the shelf gap wider, or use fewer layers or a thinner light cavity.`);
  }
  if (c < 4) warnings.push({ level: 'warn', msg: `The light cavity is only ${c} mm deep — micro LEDs need about 4 mm behind the facade.` });

  const rng = mulberry32(P.seed);
  const Vz = clamp(P.horizon, 0.1, 0.6) * Hi;
  const sAt = (y) => 1 / (1 + (persp * y) / Di);
  const vAt = (vTrue, s) => Vz + (vTrue - Vz) * s;
  const backdrop = !!P.backdrop;
  const Lv = backdrop ? Di - cb - t : Di; // facade length seen from the front

  // margins that leave room for every relief layer's inset and frame
  const relief = layers - 1;
  const grow = relief * (INSET + FRAME);
  const sideGap = t + EDGE + grow + 0.5;
  const roofGap = EDGE + grow + 0.5;
  const bridge = BRIDGE + 2 * FRAME * relief;

  // building lengths shrink geometrically with depth, ending at Lv
  const r = Math.pow(sAt(Lv), 1 / nb);
  const weights = Array.from({ length: nb }, (_, j) => Math.pow(r, j));
  const wsum = weights.reduce((a, b) => a + b, 0);

  const parts = [], lights = [], steps = [], joints = [];
  const glue = (a, b) => joints.push({ a, b, kind: 'flat' });
  const buildings = [];
  const groupOf = { left: 'Left facade', right: 'Right facade' };
  let skippedTotal = 0;
  const backHoles = [];
  const wireHole = (x) => ellipsePoly(x, t + NOTCH_H / 2 + 0.5, 1.5, 1.5, 16);

  for (const side of ['left', 'right']) {
    const blds = [];
    let y = 0;
    for (let j = 0; j < nb; j++) {
      const y0 = y, y1 = j === nb - 1 ? Lv : y + (Lv * weights[j]) / wsum;
      y = y1;
      const R = Hi * (0.72 + 0.25 * rng());
      const shape = rng() < 0.5 ? 'rect' : 'arch';
      const roofFront = vAt(R, sAt(y0)), roofBack = vAt(R, sAt(y1));
      const { windows, skipped } = layoutWindows({
        a: y0, b: y1, roofA: roofFront, roofB: roofBack, side: sideGap, roof: roofGap,
        bottom: EDGE + grow + 0.5, bridge, winW: P.windowW, winH: P.windowH, scaleAt: sAt, vAt,
      });
      skippedTotal += skipped;
      blds.push({
        id: `${side}-${j}`, side, index: j, y0, y1, roofFront, roofBack, shape,
        windows: windows.map((w) => ({
          ...w, shape, lit: rng() < litRatio,
          y: w.u0 + w.w / 2, z: t + w.v0 + w.h / 2,
        })),
      });
    }
    buildings.push(...blds);
    const roofAt = (b, yy) => b.roofFront + ((b.roofBack - b.roofFront) * (yy - b.y0)) / (b.y1 - b.y0);

    // map facade (y, v) polygons onto this side's panels
    const mirror = side === 'right';
    const toPanel = (poly) => (mirror ? poly.map(([yy, v]) => [Di - yy, v]).reverse() : poly);
    const facePlane = (L) => {
      const x = t + c + (L + 1) * t;
      return mirror
        ? { o: [W - x, Di, t], U: [0, -1, 0], V: [0, 0, 1], n: [-1, 0, 0] }
        : { o: [x, 0, t], U: [0, 1, 0], V: [0, 0, 1], n: [1, 0, 0] };
    };
    const group = groupOf[side];
    const sideName = side === 'left' ? 'Left' : 'Right';

    // base layer: one panel the full depth, roofline stepping per building
    const last = blds[nb - 1];
    const outline = [[0, 0], [Di, 0], [Di, last.roofBack]];
    for (let j = nb - 1; j >= 0; j--) outline.push([blds[j].y1, blds[j].roofBack], [blds[j].y0, blds[j].roofFront]);
    const wins = blds.flatMap((b) => b.windows);
    const baseHoles = wins.filter((w) => w.lit).map((w) => toPanel(windowPoly(w)));
    const baseScores = wins.filter((w) => !w.lit).flatMap((w) => edgesOf(toPanel(windowPoly(w))));
    parts.push({
      key: `${side}-base`, name: `${sideName} facade`, group, role: 'layer', side, layer: 0,
      polys: [toPanel(cleanPolygon(outline)), ...baseHoles], scores: baseScores, plane: facePlane(0),
    });
    glue(`${side}-base`, 'shell-bottom');

    // relief layers: one panel per building per layer
    for (let L = 1; L < layers; L++) {
      for (const b of blds) {
        const ya = b.y0 + L * INSET, yb = b.y1 - L * INSET;
        const poly = [[ya, 0], [yb, 0], [yb, roofAt(b, yb) - L * INSET], [ya, roofAt(b, ya) - L * INSET]];
        parts.push({
          key: `${side}-relief${L}-${b.index}`, name: `${sideName} relief ${L} · building ${b.index + 1}`, group,
          role: 'layer', side, layer: L, building: b.id,
          polys: [toPanel(poly), ...b.windows.map((w) => toPanel(windowPoly(w, L * FRAME)))], scores: [], plane: facePlane(L),
        });
        glue(`${side}-relief${L}-${b.index}`, L === 1 ? `${side}-base` : `${side}-relief${L - 1}-${b.index}`);
      }
    }

    // cavity spacers: at the front, between buildings and at the back wall
    const spacerYs = [0, ...blds.slice(0, -1).map((b) => b.y1 - t / 2), Di - t];
    const baseTop = (yy) => {
      const b = blds.find((q) => yy <= q.y1 + 1e-9) || last;
      return yy > Lv ? last.roofBack : roofAt(b, Math.min(yy, b.y1));
    };
    const notch = c - NOTCH_W >= 2;
    spacerYs.forEach((ys, k) => {
      const hs = Math.min(baseTop(ys), baseTop(ys + t)) - 1;
      const a = (c - NOTCH_W) / 2;
      const poly = notch
        ? [[0, 0], [a, 0], [a, NOTCH_H], [a + NOTCH_W, NOTCH_H], [a + NOTCH_W, 0], [c, 0], [c, hs], [0, hs]]
        : rectPoly(0, 0, c, hs);
      const x = side === 'left' ? t : W - t - c;
      parts.push({
        key: `${side}-spacer${k}`, name: `${sideName} spacer ${k + 1}`, group, role: 'spacer', side,
        polys: [poly], scores: [], plane: { o: [x, ys, t], U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] },
      });
      const key = `${side}-spacer${k}`;
      glue(key, `shell-${side}`);
      glue(key, `${side}-base`);
      glue(key, 'shell-bottom');
      if (k === spacerYs.length - 1) glue(key, 'shell-back');
    });
    backHoles.push(wireHole(side === 'left' ? t + c / 2 : W - t - c / 2));

    // one LED in the cavity behind each building with lit windows
    const cx = side === 'left' ? t + c / 2 : W - t - c / 2;
    for (const b of blds) {
      const lit = b.windows.filter((w) => w.lit);
      if (!lit.length) continue;
      const mean = (f) => lit.reduce((s, w) => s + f(w), 0) / lit.length;
      lights.push({ building: b.id, side, p: [cx, mean((w) => w.y), mean((w) => w.z)], color: 'warm' });
    }
  }

  // ------------------------------------------------------------- backdrop
  let back = null;
  if (backdrop) {
    const s = sAt(Di) * 0.8;
    const k = street > 60 ? 3 : 2;
    const cuts = [0];
    for (let i = 1; i < k; i++) cuts.push((street * (i + (rng() - 0.5) * 0.4)) / k);
    cuts.push(street);
    const blocks = [];
    for (let i = 0; i < k; i++) {
      const R = Hi * (0.65 + 0.3 * rng());
      const roof = Math.min(vAt(R, s), Hi);
      const shape = rng() < 0.5 ? 'rect' : 'arch';
      const { windows, skipped } = layoutWindows({
        a: cuts[i], b: cuts[i + 1], roofA: roof, roofB: roof,
        side: (i === 0 || i === k - 1 ? t : 0) + EDGE + 0.5, roof: EDGE + 0.5, bottom: EDGE + 0.5,
        bridge: BRIDGE, winW: P.windowW, winH: P.windowH, scaleAt: () => s, vAt,
      });
      skippedTotal += skipped;
      blocks.push({ u0: cuts[i], u1: cuts[i + 1], roof, windows: windows.map((w) => ({ ...w, shape, lit: rng() < litRatio })) });
    }
    // keep windows clear of the steps between blocks
    for (let i = 0; i < k; i++) {
      blocks[i].windows = blocks[i].windows.filter((w) => w.u0 >= blocks[i].u0 + EDGE + 0.5 && w.u0 + w.w <= blocks[i].u1 - EDGE - 0.5);
    }
    const outline = [[0, 0], [street, 0]];
    for (let i = k - 1; i >= 0; i--) outline.push([blocks[i].u1, blocks[i].roof], [blocks[i].u0, blocks[i].roof]);
    const wins = blocks.flatMap((bk) => bk.windows);
    const y0 = Di - cb - t;
    parts.push({
      key: 'backdrop', name: 'Skyline backdrop', group: 'Backdrop', role: 'backdrop',
      polys: [cleanPolygon(outline), ...wins.filter((w) => w.lit).map((w) => windowPoly(w))],
      scores: wins.filter((w) => !w.lit).flatMap((w) => edgesOf(windowPoly(w))),
      plane: { o: [sx0, y0, t], U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] },
    });
    const hb = Math.min(blocks[0].roof, blocks[k - 1].roof) - 1;
    parts.push(
      { key: 'backdrop-spacer0', name: 'Backdrop spacer 1', group: 'Backdrop', role: 'spacer', side: 'back', polys: [rectPoly(0, 0, cb, hb)], scores: [],
        plane: { o: [sx0 + t, Di - cb, t], U: [0, 1, 0], V: [0, 0, 1], n: [1, 0, 0] } },
      { key: 'backdrop-spacer1', name: 'Backdrop spacer 2', group: 'Backdrop', role: 'spacer', side: 'back', polys: [rectPoly(0, 0, cb, hb)], scores: [],
        plane: { o: [sx1 - t, Di, t], U: [0, -1, 0], V: [0, 0, 1], n: [-1, 0, 0] } },
    );
    glue('backdrop', 'shell-bottom');
    for (const key of ['backdrop-spacer0', 'backdrop-spacer1']) {
      glue(key, 'shell-back');
      glue(key, 'backdrop');
      glue(key, 'shell-bottom');
    }
    backHoles.push(wireHole(W / 2));
    const lit = wins.filter((w) => w.lit);
    if (lit.length) {
      const mean = (f) => lit.reduce((sum, w) => sum + f(w), 0) / lit.length;
      lights.push({ building: 'backdrop', side: 'back', p: [sx0 + mean((w) => w.u0 + w.w / 2), Di - cb / 2, t + mean((w) => w.v0 + w.h / 2)], color: 'warm' });
    }
    back = { blocks, y: y0, cavity: cb };
  }

  // ---------------------------------------------------------------- shell
  const shell = nookWalls({ W, D, H, t, fingerWidth, holes: { ...holes, back: [...(holes.back || []), ...backHoles] } });
  parts.unshift(...shell.parts);
  joints.unshift(...shell.joints);

  if (skippedTotal) {
    warnings.push({ level: 'info', msg: `${skippedTotal} window column${skippedTotal > 1 ? 's were' : ' was'} too small to cut at the back of the alley and left out — raise the window size or lower the perspective.` });
  }

  const ids = (pred) => parts.filter(pred).map((p) => p.key);
  steps.push(
    { group: 'Shell', text: 'Dry-fit the floor, back wall and both side walls — the fingers only go together one way — then glue them, checking the corners are square. Leave the roof off until the lights work.' },
    { group: 'Shell', text: 'The small holes low in the back wall are for the LED wires: one behind each facade cavity and one behind the backdrop.' },
  );
  for (const side of ['left', 'right']) {
    const group = groupOf[side];
    steps.push(
      { group, text: `Glue the ${side} spacers upright against the ${side} wall, notch down, first one flush with the front edge and the last one against the back wall (${ids((p) => p.side === side && p.role === 'spacer').length} spacers). The notches make a wire channel along the floor.` },
      { group, text: `Lay one micro LED in the ${side} cavity behind each building with lit windows (the 3D view shows where), feed the wires along the channel and out of the back wall. Glue vellum or tracing paper behind the base facade's window holes to diffuse the light.` },
      { group, text: layers > 1
        ? `Glue the ${side} base facade onto the spacers, then stack the relief layers on it building by building, matching each window frame to its window.`
        : `Glue the ${side} base facade onto the spacers.` },
    );
  }
  if (back) {
    steps.push({ group: 'Backdrop', text: 'Glue the two backdrop spacers against the back wall at the ends of the street, add its LED and vellum, then glue the skyline backdrop to the spacers.' });
  }
  steps.push({ group: 'Shell', text: 'Test the lights, then glue the roof on. Paint the back wall above the skyline as sky.' });

  return {
    parts, joints, lights, steps, warnings, minFinger: shell.minFinger,
    alley: { layers, cavity: c, horizon: Vz, street: { x0: sx0, x1: sx1 }, buildings, backdrop: back },
  };
}
