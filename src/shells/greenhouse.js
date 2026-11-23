// Greenhouse shell: the open-front nook glazed above a solid knee wall.
//
// The roof, the side walls and the back each get a grid of window openings
// (glazing bars at least 3 mm wide, a border clear of the finger joints).
// One clear pane per glazed panel is glued behind its grid on the inside;
// panes are cut from the kit's acetate when it has one, otherwise the
// assembly steps list their sizes for cutting by hand. A potting bench is
// slotted into both side walls and the back, just under the glazing.

import { nookWalls } from './nook.js';
import { wiredLight, wireHole, under, WIRE_R, WIRE_KEEP } from './wire.js';
import { panelOutline, profilePlain, profileTabs, rectPoly } from '../geometry.js';

export const GREENHOUSE_DEFAULTS = {
  glazeRoof: true, glazeSides: true, glazeBack: true, kneeHeight: 0.3, paneSize: 30, barWidth: 3,
  bench: true, glazingMaterial: 'acetate',
};

export const GREENHOUSE_PARAMS = [
  { key: 'glazeRoof', label: 'Glass roof', type: 'bool' },
  { key: 'glazeSides', label: 'Glass side walls', type: 'bool' },
  { key: 'glazeBack', label: 'Glass back wall', type: 'bool' },
  { key: 'kneeHeight', label: 'Knee wall (share of the inside)', type: 'num', min: 0.1, max: 0.6, step: 0.05 },
  { key: 'paneSize', label: 'Pane size', type: 'num', min: 8, max: 60, step: 1, unit: 'mm' },
  { key: 'barWidth', label: 'Glazing bar width', type: 'num', min: 3, max: 8, step: 0.5, unit: 'mm' },
  { key: 'bench', label: 'Potting bench', type: 'bool' },
  { key: 'glazingMaterial', label: 'Panes cut from', type: 'material' },
];

/** Panes overlap their windows by this much all round, for glue (mm). */
const OVERLAP = 2;
const CLEAR = 0.1;
const MIN_HOLE = 3;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));
const tabCount = (L) => (L > 50 ? 2 : 1);
const tabsOf = (profile) => profile.filter((s) => s.d < 0);

/** A grid of rectangular openings filling [u0,u1]×[v0,v1] with `bar`-wide bars. */
function windowGrid(u0, u1, v0, v1, size, bar) {
  const fit = (span) => {
    let n = Math.max(1, Math.round(span / size));
    while (n > 1 && (span - (n - 1) * bar) / n < MIN_HOLE) n--;
    return n;
  };
  const du = u1 - u0, dv = v1 - v0;
  if (du < MIN_HOLE || dv < MIN_HOLE) return [];
  const cols = fit(du), rows = fit(dv);
  const cw = (du - (cols - 1) * bar) / cols, ch = (dv - (rows - 1) * bar) / rows;
  const holes = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    holes.push(rectPoly(u0 + c * (cw + bar), v0 + r * (ch + bar), cw, ch));
  }
  return holes;
}

export function buildGreenhouse({ W, D, H, t, fingerWidth, holes = {}, materials }, params) {
  const P = { ...GREENHOUSE_DEFAULTS, ...params };
  const Wi = W - 2 * t, Di = D - t, Hi = H - 2 * t;
  const parts = [], joints = [], lights = [], warnings = [];
  const link = (a, b, kind) => joints.push({ a, b, kind });
  const bar = clamp(P.barWidth, 3, 8);
  const size = clamp(P.paneSize, 8, 60);
  const kneeZ = t + clamp(P.kneeHeight, 0.1, 0.6) * Hi; // top of the knee wall (world z = wall panel v)
  const m = 2 * t + 3; // window border from every panel edge, clear of the finger joints

  // ------------------------------------------------------------- windows
  // panel coordinates: side walls (u = y, v = z), back (u = x, v = z), roof (u = x, v = y)
  const windows = { top: [], back: [], left: [], right: [] };
  if (P.glazeSides) {
    windows.left = windowGrid(m, D - m, kneeZ, H - m, size, bar);
    windows.right = windowGrid(m, D - m, kneeZ, H - m, size, bar);
  }
  if (P.glazeBack) windows.back = windowGrid(m, W - m, kneeZ, H - m, size, bar);
  if (P.glazeRoof) windows.top = windowGrid(m, W - m, m, D - m, size, bar);

  const wallHoles = { ...holes };
  for (const f of ['left', 'right', 'back', 'top']) wallHoles[f] = [...(holes[f] || []), ...windows[f]];

  // --------------------------------------------------------------- bench
  let benchTop = null;
  if (P.bench) {
    const bd = Math.min(30, Di * 0.25);
    benchTop = kneeZ - 4;
    const zUnder = benchTop - t;
    if (benchTop - t >= 15) {
      const side = profileTabs(bd, t, 1), back = profileTabs(Wi, t, tabCount(Wi));
      const yB = Di - bd;
      parts.push({
        key: 'bench', name: 'Potting bench', group: 'Bench', role: 'bench', scores: [],
        polys: [panelOutline(Wi, bd, [profilePlain(Wi), side, back, side])],
        plane: { o: [t, yB, benchTop], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] },
      });
      const slot = (u0, u1) => rectPoly(u0 - CLEAR, zUnder - CLEAR, u1 - u0 + 2 * CLEAR, t + 2 * CLEAR);
      for (const s of tabsOf(side)) { wallHoles.left.push(slot(yB + s.a0, yB + s.a1)); wallHoles.right.push(slot(yB + s.a0, yB + s.a1)); }
      for (const s of tabsOf(back)) wallHoles.back.push(slot(t + s.a0, t + s.a1));
      for (const w of ['left', 'right', 'back']) link('bench', `shell-${w}`, 'slot');
      lights.push(wiredLight({ p: [W / 2, yB + bd / 2, zUnder - 2], name: 'Under the bench', where: 'Under the bench', backHoles: wallHoles.back, via: [[W / 2, yB + bd / 2, under(zUnder)], [W / 2, Di, under(zUnder)]] }));
    } else {
      benchTop = null;
      warnings.push({ level: 'info', msg: 'The knee wall is too low for a potting bench, so it was left out — raise the knee wall to fit one.' });
    }
  }

  // ------------------------------------------------------------- glazing
  const glass = (materials || []).find((mt) => mt.id === P.glazingMaterial && mt.kind !== 'fabric');
  const panes = []; // { face, u0, u1, v0, v1 } in panel coordinates
  for (const face of ['top', 'back', 'left', 'right']) {
    const ws = windows[face];
    if (!ws.length) continue;
    const us = ws.flat().map(([u]) => u), vs = ws.flat().map(([, v]) => v);
    panes.push({ face, u0: Math.min(...us) - OVERLAP, u1: Math.max(...us) + OVERLAP, v0: Math.min(...vs) - OVERLAP, v1: Math.max(...vs) + OVERLAP });
  }
  const NAMES = { top: 'Roof', back: 'Back', left: 'Left side', right: 'Right side' };
  if (glass) {
    const tp = glass.thickness;
    const planeOf = {
      left: { o: [t + tp, 0, 0], U: [0, 1, 0], V: [0, 0, 1], n: [1, 0, 0] },
      right: { o: [W - t - tp, 0, 0], U: [0, 1, 0], V: [0, 0, 1], n: [-1, 0, 0] },
      back: { o: [0, D - t - tp, 0], U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] },
      top: { o: [0, 0, H - t - tp], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, -1] },
    };
    for (const p of panes) {
      const key = `pane-${p.face}`;
      parts.push({
        key, name: `${NAMES[p.face]} pane`, group: 'Glazing', role: 'glazing', face: p.face,
        material: glass.id, thickness: tp, scores: [],
        polys: [rectPoly(p.u0, p.v0, p.u1 - p.u0, p.v1 - p.v0)], plane: planeOf[p.face],
      });
      link(key, `shell-${p.face}`, 'flat');
    }
  } else if (panes.length) {
    warnings.push({ level: 'info', msg: `There's no clear acetate in this kit's materials, so the greenhouse panes aren't on the cut sheets — the assembly guide lists their sizes to cut by hand.` });
  }
  // the roof light's wire runs back under the roof, then down the back-left
  // corner, clear of the panes (they start a frame's width in), through a hole
  // in the bench if there is one, and out low in the solid knee wall
  {
    const k = WIRE_R + WIRE_KEEP;
    const zr = H - t - 3, xc = t + k, yc = Di - k;
    const bench = parts.find((p) => p.key === 'bench');
    const zx = bench ? under(benchTop - t) : kneeZ - OVERLAP - k;
    if (bench) bench.polys.push(wireHole(xc - t, yc - bench.plane.o[1]));
    lights.unshift(wiredLight({
      p: [W / 2, D / 2, zr], name: 'Under the roof', where: 'Roof', backHoles: wallHoles.back,
      via: [[W / 2, yc, zr], [xc, yc, zr], [xc, yc, zx], [xc, Di, zx]],
    }));
  }

  // --------------------------------------------------------------- shell
  const shell = nookWalls({ W, D, H, t, fingerWidth, holes: wallHoles });
  parts.unshift(...shell.parts);
  joints.unshift(...shell.joints);

  const paneList = panes.map((p) => `${NAMES[p.face].toLowerCase()} ${Math.round(p.u1 - p.u0)} × ${Math.round(p.v1 - p.v0)} mm`).join(', ');
  const steps = [
    { group: 'Shell', text: 'Dry-fit the floor, back and side walls. Handle the glazed walls gently: the bars are thin until the panes are glued on.' },
    ...(benchTop !== null ? [{ group: 'Bench', text: 'Before the second side wall goes on, push the potting bench\'s tabs into the slots in the back wall and the first side wall, then close up and glue the shell.' }] : []),
    glass
      ? { group: 'Glazing', text: 'Glue each acetate pane to the inside of its wall or roof with a thin line of clear glue on the bars only — keep glue off the openings. Do the roof last.' }
      : { group: 'Shell', text: `Cut clear acetate panes (${paneList}) and glue each to the inside of its wall or roof, glue on the bars only.` },
    { group: 'Shell', text: 'Add plants and pots, an LED under the roof and one under the bench, then glue the roof on.' },
  ];
  if (!panes.length) steps.splice(steps.findIndex((s) => /acetate/.test(s.text)), 1);

  return {
    parts, joints, lights, steps, warnings, minFinger: shell.minFinger,
    greenhouse: { windows, knee: kneeZ, bench: benchTop, panes },
  };
}
