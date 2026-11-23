// Furniture and decor templates, grouped into themed sets. Parameters are
// real-world centimetres; the kit's scale converts them to model millimetres
// before `build` is called.
//
// build(p, ctx) returns components in item-local model coordinates
// (x = width, y = depth with the front at y=0, z = up):
//   { kind: 'box', name, size: [W, D, H], faces, shelves?, scores?, holes?, at: [x, y, z] }
//   { kind: 'flat', name, polys, scores?, plane: { o, U, V, n } }   (floor items)
//   { kind: 'flat', name, polys, wall: true, surface: true }        (wall items)
//
// Wall-placed items hang with their back against the wall; `elev` is the
// height of their centre above the floor.

import { archPoly, ellipsePoly, rectPoly } from './geometry.js';
import { DEFAULT_MATERIALS } from './materials.js';
import { LIBRARY_KIT } from './templates.js';

const ALL = ['bottom', 'top', 'front', 'back', 'left', 'right'];
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

const num = (key, label, min, max, step = 1) => ({ key, label, type: 'number', min, max, step, unit: 'cm' });
const cnt = (key, label, min, max) => ({ key, label, type: 'number', min, max, step: 1 });
const sel = (key, label, options) => ({ key, label, type: 'select', options });

/** Theme groups, in picker order. */
export const THEMES = ['Basics', 'Living room', 'Bedroom', 'Kitchen', 'Bathroom', 'Café', 'Library', 'Decor'];

// ----------------------------------------------------------------- helpers
function evenShelves(n, H, t, hasTop = true) {
  const top = hasTop ? H - t : H;
  const inner = top - t;
  return Array.from({ length: n }, (_, k) => t + ((k + 1) * inner) / (n + 1) - t / 2);
}

function frontScores(style, count, W, H, t, { from = t, to = H - t } = {}) {
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
function loopScores(pts) {
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
}
const circleScores = (cx, cy, r, seg = 20) => loopScores(ellipsePoly(cx, cy, r, r, seg));
const rectScores = (x, y, w, h) => loopScores(rectPoly(x, y, w, h));

/** Plain front-facing vertical flat at depth y (floor items). */
const uprightAt = (y, z = 0) => ({ o: [0, y, z], U: X, V: Z, n: [0, -1, 0] });

/** Leafy plant silhouette (a lobed star) sitting on y=0. */
function plantPoly(w, h) {
  const pts = [];
  const cx = w / 2, cy = h * 0.55, n = 160;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.62 + 0.38 * Math.abs(Math.cos(3.5 * a));
    pts.push([cx + Math.cos(a) * (w / 2) * r, cy + Math.sin(a) * (h * 0.45) * r]);
  }
  return pts;
}

function sofaBuild(p, { t }) {
  const arm = Math.min(p.arm, p.w / 3);
  const d = p.d - t;
  return [
    { kind: 'box', name: 'Seat', size: [p.w - 2 * arm, d, p.seat], faces: ALL, at: [arm, 0, 0] },
    { kind: 'box', name: 'Left arm', size: [arm, d, p.armh], faces: ALL, at: [0, 0, 0] },
    { kind: 'box', name: 'Right arm', size: [arm, d, p.armh], faces: ALL, at: [p.w - arm, 0, 0] },
    { kind: 'flat', name: 'Back', polys: [archPoly(0, 0, p.w, p.back, Math.min(p.w * 0.08, p.back * 0.3))], plane: uprightAt(d) },
  ];
}

function cabinetBuild(name, p, t, extra = {}) {
  return [{
    kind: 'box', name, size: [p.w, p.d, p.h], faces: ALL, at: [0, 0, 0],
    scores: { front: frontScores(p.style || 'doors', Math.round(p.count ?? 2), p.w, p.h, t), ...(extra.scores || {}) },
    holes: extra.holes,
  }];
}

const sizeWDH = (p) => [p.w, p.d, p.h];

// ------------------------------------------------------------------ catalog
export const CATALOG = {
  // Basics ------------------------------------------------------------------
  bookshelf: {
    label: 'Bookshelf', group: 'Basics', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 10, 300), num('d', 'Depth', 10, 100), num('h', 'Height', 20, 300), cnt('shelves', 'Shelves', 0, 8)],
    defaults: { w: 80, d: 30, h: 180, shelves: 3 },
    build: (p, { t }) => [{
      kind: 'box', name: 'Bookshelf', size: [p.w, p.d, p.h],
      faces: ['bottom', 'top', 'left', 'right', 'back'],
      shelves: evenShelves(Math.round(p.shelves), p.h, t), at: [0, 0, 0],
    }],
    note: 'Slide the shelves into their slots before closing the second side panel.',
  },
  cabinet: {
    label: 'Cabinet / dresser', group: 'Basics', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 10, 300), num('d', 'Depth', 10, 100), num('h', 'Height', 10, 250), sel('style', 'Front', ['drawers', 'doors', 'plain']), cnt('count', 'Drawers / doors', 1, 8)],
    defaults: { w: 90, d: 45, h: 85, style: 'drawers', count: 3 },
    build: (p, { t }) => cabinetBuild('Cabinet', p, t),
    note: 'Score lines on the front mark drawer or door gaps; glue on tiny bead handles if you like.',
  },
  table: {
    label: 'Table', group: 'Basics', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 20, 300), num('d', 'Depth', 20, 200), num('h', 'Height', 20, 120)],
    defaults: { w: 120, d: 70, h: 75 },
    build: (p) => [{ kind: 'box', name: 'Table', size: [p.w, p.d, p.h], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  chair: {
    label: 'Chair', group: 'Basics', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 30, 120), num('d', 'Depth', 30, 120), num('seat', 'Seat height', 20, 70), num('back', 'Back height', 50, 140)],
    defaults: { w: 45, d: 45, seat: 45, back: 90 },
    size: (p) => [p.w, p.d, Math.max(p.seat, p.back)],
    build: (p, { t }) => [
      { kind: 'box', name: 'Seat', size: [p.w, p.d - t, p.seat], faces: ['top', 'left', 'right'], at: [0, 0, 0] },
      { kind: 'flat', name: 'Backrest', polys: [archPoly(0, 0, p.w, p.back, p.w * 0.25)], plane: uprightAt(p.d - t) },
    ],
    note: 'Glue the backrest against the back edges of the seat sides.',
  },
  bench: {
    label: 'Bench / coffee table', group: 'Basics', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 20, 300), num('d', 'Depth', 15, 120), num('h', 'Height', 10, 80)],
    defaults: { w: 100, d: 40, h: 45 },
    build: (p) => [{ kind: 'box', name: 'Bench', size: [p.w, p.d, p.h], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  desk: {
    label: 'Desk', group: 'Basics', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 30, 250), num('d', 'Depth', 20, 120), num('h', 'Height', 30, 120)],
    defaults: { w: 120, d: 60, h: 75 },
    build: (p) => [{ kind: 'box', name: 'Desk', size: [p.w, p.d, p.h], faces: ['top', 'left', 'right', 'back'], at: [0, 0, 0] }],
  },

  // Living room -------------------------------------------------------------
  sofa: {
    label: 'Sofa', group: 'Living room', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 80, 320), num('d', 'Depth', 50, 120), num('seat', 'Seat height', 25, 60), num('back', 'Back height', 50, 120), num('arm', 'Arm width', 8, 40), num('armh', 'Arm height', 40, 90)],
    defaults: { w: 200, d: 85, seat: 42, back: 82, arm: 18, armh: 60 },
    size: (p) => [p.w, p.d, Math.max(p.back, p.armh)],
    build: sofaBuild,
    note: 'Glue the arms to the seat ends, then the back across all three. Felt or fabric scraps make good cushions.',
  },
  armchair: {
    label: 'Armchair', group: 'Living room', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 50, 140), num('d', 'Depth', 50, 120), num('seat', 'Seat height', 25, 60), num('back', 'Back height', 50, 130), num('arm', 'Arm width', 8, 30), num('armh', 'Arm height', 40, 90)],
    defaults: { w: 90, d: 85, seat: 42, back: 90, arm: 16, armh: 62 },
    size: (p) => [p.w, p.d, Math.max(p.back, p.armh)],
    build: sofaBuild,
    note: 'Glue the arms to the seat, then the back on behind.',
  },
  fireplace: {
    label: 'Fireplace', group: 'Living room', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 60, 220), num('d', 'Depth', 20, 70), num('h', 'Height', 60, 160)],
    defaults: { w: 120, d: 35, h: 105 },
    size: (p) => [p.w, p.d, p.h + 4],
    build: (p, { t }) => {
      const ow = p.w * 0.56, oh = p.h * 0.58;
      const ov = Math.min(p.w * 0.05, 6);
      return [
        { kind: 'box', name: 'Fireplace', size: [p.w, p.d, p.h], faces: ALL, at: [0, 0, 0], holes: { front: [archPoly((p.w - ow) / 2, t + 1, ow, oh)] } },
        { kind: 'box', name: 'Mantel', size: [p.w + 2 * ov, p.d + ov, Math.max(3 * t, p.h * 0.05)], faces: ALL, at: [-ov, -ov, p.h] },
      ];
    },
    note: 'Put an amber LED on the floor inside the opening for a glowing fire. Glue the mantel on top, overhanging the front and sides.',
  },
  tvstand: {
    label: 'TV / media unit', group: 'Living room', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 60, 250), num('d', 'Depth', 25, 60), num('h', 'Height', 30, 90), cnt('shelves', 'Shelves', 0, 2)],
    defaults: { w: 150, d: 40, h: 50, shelves: 1 },
    build: (p, { t }) => [{ kind: 'box', name: 'Media unit', size: [p.w, p.d, p.h], faces: ['bottom', 'top', 'left', 'right', 'back'], shelves: evenShelves(Math.round(p.shelves), p.h, t), at: [0, 0, 0] }],
  },
  floorlamp: {
    label: 'Floor lamp', group: 'Living room', placement: 'floor', mat: 'card',
    params: [num('w', 'Shade width', 20, 60), num('h', 'Height', 80, 200), num('shade', 'Shade height', 15, 50)],
    defaults: { w: 35, h: 160, shade: 28 },
    size: (p) => [p.w, p.w, p.h],
    build: (p) => {
      const base = p.w * 0.7, pole = Math.max(1.5, p.w * 0.08);
      const poleH = p.h - p.shade * 0.6;
      return [
        { kind: 'box', name: 'Base', size: [base, base, Math.max(2, p.h * 0.03)], faces: ALL, at: [(p.w - base) / 2, (p.w - base) / 2, 0] },
        { kind: 'flat', name: 'Pole', polys: [rectPoly(0, 0, pole, poleH)], plane: { o: [(p.w - pole) / 2, p.w / 2, 0], U: X, V: Z, n: [0, -1, 0] } },
        { kind: 'box', name: 'Shade', size: [p.w, p.w, p.shade], faces: ['front', 'back', 'left', 'right'], at: [0, 0, p.h - p.shade] },
      ];
    },
    note: 'Pair it with a floor LED: thread the wire up the pole and tuck the bulb inside the shade. Use vellum or thin paper for a softer glow.',
  },

  // Bedroom -----------------------------------------------------------------
  bed: {
    label: 'Bed', group: 'Bedroom', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 60, 220), num('d', 'Length', 120, 240), num('h', 'Base height', 15, 80), num('head', 'Headboard height', 40, 160)],
    defaults: { w: 140, d: 200, h: 45, head: 100 },
    size: (p) => [p.w, p.d, Math.max(p.h, p.head)],
    build: (p, { t }) => [
      { kind: 'box', name: 'Bed base', size: [p.w, p.d - t, p.h], faces: ALL, at: [0, 0, 0] },
      { kind: 'flat', name: 'Headboard', polys: [archPoly(0, 0, p.w, p.head, Math.min(p.w * 0.12, p.head * 0.3))], plane: uprightAt(p.d - t) },
    ],
    note: 'Glue the headboard flat against the back of the base, bottom edges flush. A felt rectangle makes a quick blanket.',
  },
  nightstand: {
    label: 'Nightstand', group: 'Bedroom', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 10, 120), num('d', 'Depth', 10, 80), num('h', 'Height', 10, 120), cnt('count', 'Drawers', 1, 4)],
    defaults: { w: 45, d: 40, h: 55, count: 2 },
    build: (p, { t }) => cabinetBuild('Nightstand', { ...p, style: 'drawers' }, t),
  },
  dresser: {
    label: 'Chest of drawers', group: 'Bedroom', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 40, 200), num('d', 'Depth', 25, 70), num('h', 'Height', 40, 140), cnt('count', 'Drawers', 2, 7)],
    defaults: { w: 100, d: 45, h: 95, count: 4 },
    build: (p, { t }) => cabinetBuild('Dresser', { ...p, style: 'drawers' }, t),
  },
  wardrobe: {
    label: 'Wardrobe', group: 'Bedroom', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 30, 300), num('d', 'Depth', 20, 100), num('h', 'Height', 60, 280), cnt('count', 'Doors', 1, 4)],
    defaults: { w: 100, d: 60, h: 200, count: 2 },
    build: (p, { t }) => cabinetBuild('Wardrobe', { ...p, style: 'doors' }, t),
  },

  // Kitchen -----------------------------------------------------------------
  counter: {
    label: 'Base cabinet', group: 'Kitchen', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 30, 300), num('d', 'Depth', 40, 80), num('h', 'Height', 70, 110), cnt('count', 'Doors', 1, 6)],
    defaults: { w: 100, d: 60, h: 90, count: 2 },
    build: (p, { t }) => cabinetBuild('Base cabinet', { ...p, style: 'doors' }, t, { scores: { top: [] } }),
  },
  sink: {
    label: 'Sink unit', group: 'Kitchen', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 50, 200), num('d', 'Depth', 40, 80), num('h', 'Height', 70, 110)],
    defaults: { w: 80, d: 60, h: 90 },
    build: (p, { t }) => cabinetBuild('Sink unit', { ...p, style: 'doors', count: 2 }, t, {
      holes: { top: [archPoly(p.w * 0.22, p.d * 0.25, p.w * 0.56, p.d * 0.5, Math.min(p.w, p.d) * 0.08)] },
    }),
    note: 'Glue a scrap of silver card under the top for the basin, and a bent paperclip for the tap.',
  },
  stove: {
    label: 'Stove', group: 'Kitchen', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 45, 120), num('d', 'Depth', 45, 80), num('h', 'Height', 70, 110)],
    defaults: { w: 60, d: 60, h: 90 },
    build: (p, { t }) => {
      const r = Math.min(p.w, p.d) * 0.14;
      const top = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].flatMap(([a, b]) => circleScores(p.w * a, p.d * b, r));
      const front = [...rectScores(p.w * 0.12, p.h * 0.12, p.w * 0.76, p.h * 0.58), [[t + 0.6, p.h * 0.8], [p.w - t - 0.6, p.h * 0.8]]];
      return [{ kind: 'box', name: 'Stove', size: [p.w, p.d, p.h], faces: ALL, at: [0, 0, 0], scores: { top, front } }];
    },
    note: 'Score lines mark the burners and oven door; colour them in with a fine pen.',
  },
  fridge: {
    label: 'Fridge', group: 'Kitchen', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 45, 100), num('d', 'Depth', 45, 80), num('h', 'Height', 80, 210)],
    defaults: { w: 70, d: 65, h: 180 },
    build: (p, { t }) => [{
      kind: 'box', name: 'Fridge', size: [p.w, p.d, p.h], faces: ALL, at: [0, 0, 0],
      scores: { front: [[[t + 0.6, p.h * 0.64], [p.w - t - 0.6, p.h * 0.64]], [[p.w * 0.85, p.h * 0.5], [p.w * 0.85, p.h * 0.6]], [[p.w * 0.85, p.h * 0.68], [p.w * 0.85, p.h * 0.78]]] },
    }],
  },
  uppercabinet: {
    label: 'Wall cabinet', group: 'Kitchen', placement: 'wall', mat: 'board',
    params: [num('w', 'Width', 30, 200), num('d', 'Depth', 20, 45), num('h', 'Height', 30, 100), cnt('count', 'Doors', 1, 4)],
    defaults: { w: 80, d: 35, h: 70, count: 2 },
    build: (p, { t }) => cabinetBuild('Wall cabinet', { ...p, style: 'doors' }, t),
    note: 'Glue it to the wall with its back flat against the wallpaper; hold it for a minute while the glue grabs.',
  },
  wallshelf: {
    label: 'Open wall shelf', group: 'Kitchen', placement: 'wall', mat: 'board',
    params: [num('w', 'Width', 30, 200), num('d', 'Depth', 10, 40), num('h', 'Height', 20, 100), cnt('shelves', 'Shelves', 0, 4)],
    defaults: { w: 80, d: 30, h: 60, shelves: 1 },
    build: (p, { t }) => [{ kind: 'box', name: 'Wall shelf', size: [p.w, p.d, p.h], faces: ['bottom', 'top', 'left', 'right', 'back'], shelves: evenShelves(Math.round(p.shelves), p.h, t), at: [0, 0, 0] }],
  },

  // Bathroom ----------------------------------------------------------------
  bathtub: {
    label: 'Bathtub', group: 'Bathroom', placement: 'floor', mat: 'board',
    params: [num('w', 'Length', 100, 200), num('d', 'Width', 55, 100), num('h', 'Height', 40, 70)],
    defaults: { w: 170, d: 75, h: 55 },
    build: (p) => [{ kind: 'box', name: 'Bathtub', size: [p.w, p.d, p.h], faces: ['bottom', 'front', 'back', 'left', 'right'], at: [0, 0, 0] }],
    note: 'Paint the inside white, or line it with white card. A layer of clear glue makes convincing water.',
  },
  vanity: {
    label: 'Vanity', group: 'Bathroom', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 40, 160), num('d', 'Depth', 30, 60), num('h', 'Height', 60, 100)],
    defaults: { w: 80, d: 45, h: 85 },
    build: (p, { t }) => cabinetBuild('Vanity', { ...p, style: 'doors', count: 2 }, t, {
      holes: { top: [ellipsePoly(p.w / 2, p.d * 0.5, p.w * 0.25, p.d * 0.27, 32)] },
    }),
  },
  toilet: {
    label: 'Toilet', group: 'Bathroom', placement: 'floor', mat: 'card',
    params: [num('w', 'Width', 30, 50), num('d', 'Depth', 50, 80), num('h', 'Height', 60, 90)],
    defaults: { w: 40, d: 68, h: 78 },
    size: (p) => [p.w, p.d, p.h],
    build: (p) => {
      const tank = p.d * 0.28, seat = p.h * 0.52;
      const bw = p.w * 0.9, bd = p.d - tank;
      return [
        { kind: 'box', name: 'Bowl', size: [bw, bd, seat], faces: ALL, at: [(p.w - bw) / 2, 0, 0], scores: { top: loopScores(ellipsePoly(bw / 2, bd / 2, bw * 0.38, bd * 0.4, 24)) } },
        { kind: 'box', name: 'Tank', size: [p.w, tank, p.h], faces: ALL, at: [0, bd, 0] },
      ];
    },
  },

  // Café --------------------------------------------------------------------
  cafecounter: {
    label: 'Shop counter', group: 'Café', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 60, 300), num('d', 'Depth', 40, 90), num('h', 'Height', 80, 120), cnt('count', 'Front panels', 1, 8)],
    defaults: { w: 180, d: 60, h: 100, count: 4 },
    build: (p, { t }) => cabinetBuild('Counter', { ...p, style: 'doors' }, t),
    note: 'Glue a tiny cash register (a scrap block) and a cake stand (a button on a bead) on top.',
  },
  stool: {
    label: 'Bar stool', group: 'Café', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 25, 50), num('d', 'Depth', 25, 50), num('h', 'Height', 40, 85)],
    defaults: { w: 35, d: 35, h: 75 },
    build: (p) => [{ kind: 'box', name: 'Stool', size: [p.w, p.d, p.h], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  cafetable: {
    label: 'Café table', group: 'Café', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 40, 100), num('d', 'Depth', 40, 100), num('h', 'Height', 60, 80)],
    defaults: { w: 60, d: 60, h: 75 },
    build: (p) => [{ kind: 'box', name: 'Café table', size: [p.w, p.d, p.h], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  displayshelf: {
    label: 'Display shelving', group: 'Café', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 40, 200), num('d', 'Depth', 20, 60), num('h', 'Height', 80, 240), cnt('shelves', 'Shelves', 1, 6)],
    defaults: { w: 80, d: 35, h: 200, shelves: 4 },
    build: (p, { t }) => CATALOG.bookshelf.build(p, { t }).map((c) => ({ ...c, name: 'Display shelving' })),
  },
  chalkboard: {
    label: 'Menu board', group: 'Café', placement: 'wall', mat: 'card',
    params: [num('w', 'Width', 20, 200), num('h', 'Height', 20, 150), num('border', 'Frame', 1, 15)],
    defaults: { w: 90, h: 60, border: 4 },
    size: (p) => [p.w, 0, p.h],
    build: (p) => {
      const b = Math.min(p.border, p.w / 3, p.h / 3);
      return [{ kind: 'flat', name: 'Menu board', polys: [rectPoly(0, 0, p.w, p.h)], scores: rectScores(b, b, p.w - 2 * b, p.h - 2 * b), wall: true, surface: true }];
    },
    note: 'Cut it from black card and write the menu with a white gel pen.',
  },

  // Library -----------------------------------------------------------------
  ladder: {
    label: 'Library ladder', group: 'Library', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 25, 70), num('h', 'Height', 80, 260), cnt('rungs', 'Rungs', 3, 12)],
    defaults: { w: 45, h: 200, rungs: 7 },
    size: (p) => [p.w, Math.max(2, p.w * 0.1), p.h],
    build: (p) => {
      const rail = Math.max(2, p.w * 0.14), n = Math.round(p.rungs);
      const rung = Math.max(1.5, p.h * 0.02);
      const gap = (p.h - (n + 1) * rung) / n;
      const holes = Array.from({ length: n }, (_, k) => rectPoly(rail, rung + k * (gap + rung), p.w - 2 * rail, gap));
      return [{ kind: 'flat', name: 'Ladder', polys: [rectPoly(0, 0, p.w, p.h), ...holes], plane: uprightAt(0) }];
    },
    note: 'Lean the ladder against the bookshelf; cut two and glue them back to back if it feels flimsy.',
  },
  books: {
    label: 'Book stack', group: 'Library', placement: 'floor', mat: 'card',
    params: [num('w', 'Width', 10, 60), num('d', 'Depth', 8, 40), num('h', 'Book thickness', 2, 10), cnt('count', 'Books', 1, 6)],
    defaults: { w: 30, d: 22, h: 4, count: 3 },
    size: (p) => [p.w, p.d, p.h * Math.round(p.count)],
    build: (p) => Array.from({ length: Math.round(p.count) }, (_, k) => {
      const shrink = 1 - 0.08 * (k % 3);
      return { kind: 'box', name: `Book ${k + 1}`, size: [p.w * shrink, p.d * shrink, p.h], faces: ALL, at: [(p.w * (1 - shrink)) / 2, (p.d * (1 - shrink)) / 2, k * p.h] };
    }),
  },

  // Decor -------------------------------------------------------------------
  rug: {
    label: 'Rug', group: 'Decor', placement: 'floor', mat: 'fabric',
    params: [num('w', 'Width', 10, 400), num('d', 'Depth', 10, 400), sel('shape', 'Shape', ['oval', 'rect', 'round'])],
    defaults: { w: 140, d: 90, shape: 'oval' },
    size: (p) => (p.shape === 'round' ? [p.w, p.w, 0] : [p.w, p.d, 0]),
    build: (p) => {
      const poly = p.shape === 'rect' ? rectPoly(0, 0, p.w, p.d)
        : p.shape === 'round' ? ellipsePoly(p.w / 2, p.w / 2, p.w / 2, p.w / 2, 64)
        : ellipsePoly(p.w / 2, p.d / 2, p.w / 2, p.d / 2, 64);
      return [{ kind: 'flat', name: 'Rug', polys: [poly], plane: { o: [0, 0, 0.05], U: X, V: Y, n: [0, 0, 1] }, surface: true }];
    },
  },
  plant: {
    label: 'Potted plant', group: 'Decor', placement: 'floor', mat: 'card',
    params: [num('w', 'Pot width', 10, 60), num('h', 'Pot height', 10, 60), num('leaf', 'Plant height', 20, 150)],
    defaults: { w: 30, h: 30, leaf: 70 },
    size: (p) => [p.w, p.w, p.h + p.leaf * 0.9],
    build: (p) => {
      const lw = p.w * 1.8;
      return [
        { kind: 'box', name: 'Pot', size: [p.w, p.w, p.h], faces: ['bottom', 'front', 'back', 'left', 'right'], at: [0, 0, 0] },
        { kind: 'flat', name: 'Leaves', polys: [plantPoly(lw, p.leaf)], plane: { o: [(p.w - lw) / 2, p.w / 2, p.h * 0.5], U: X, V: Z, n: [0, -1, 0] } },
      ];
    },
    note: 'Cut the leaves from green card; slot the bottom into the pot and fill it with glue and "soil" (coffee grounds).',
  },
  frame: {
    label: 'Picture frame', group: 'Decor', placement: 'wall', mat: 'card',
    params: [num('w', 'Width', 5, 200), num('h', 'Height', 5, 200), num('border', 'Border', 1, 30)],
    defaults: { w: 40, h: 50, border: 5 },
    size: (p) => [p.w, 0, p.h],
    build: (p) => {
      const b = Math.min(p.border, p.w / 2 - 0.5, p.h / 2 - 0.5);
      return [{ kind: 'flat', name: 'Frame', polys: [rectPoly(0, 0, p.w, p.h), rectPoly(b, b, p.w - 2 * b, p.h - 2 * b)], wall: true, surface: true }];
    },
    note: 'Glue a printed picture behind the frame, then glue it to the wall.',
  },
  mirror: {
    label: 'Round mirror / clock', group: 'Decor', placement: 'wall', mat: 'card',
    params: [num('w', 'Diameter', 5, 150), num('border', 'Rim', 1, 20)],
    defaults: { w: 45, border: 4 },
    size: (p) => [p.w, 0, p.w],
    build: (p) => {
      const r = p.w / 2;
      const b = Math.min(p.border, r - 0.5);
      return [{ kind: 'flat', name: 'Mirror rim', polys: [ellipsePoly(r, r, r, r, 64), ellipsePoly(r, r, r - b, r - b, 64)], wall: true, surface: true }];
    },
    note: 'Back the rim with mirror card or a printed clock face.',
  },
  tv: {
    label: 'Wall TV', group: 'Decor', placement: 'wall', mat: 'card',
    params: [num('w', 'Width', 40, 200), num('h', 'Height', 25, 120)],
    defaults: { w: 100, h: 60 },
    size: (p) => [p.w, 0, p.h],
    build: (p) => {
      const b = Math.max(1, Math.min(p.w, p.h) * 0.05);
      return [{ kind: 'flat', name: 'TV', polys: [rectPoly(0, 0, p.w, p.h)], scores: rectScores(b, b, p.w - 2 * b, p.h - 2 * b), wall: true, surface: true }];
    },
    note: 'Black card works best; glue a printed screen inside the score line.',
  },
  curtains: {
    label: 'Curtains', group: 'Decor', placement: 'wall', mat: 'card',
    params: [num('w', 'Window width', 30, 250), num('h', 'Drop', 40, 250)],
    defaults: { w: 110, h: 150 },
    size: (p) => [p.w, 0, p.h],
    build: (p) => {
      const pw = p.w * 0.3;
      const panel = (x0) => {
        const pts = [[x0, 0], [x0 + pw, 0]];
        for (let i = 1; i <= 8; i++) pts.push([x0 + pw - (i % 2) * pw * 0.06, (i / 8) * p.h]);
        pts.push([x0, p.h]);
        return pts;
      };
      return [
        { kind: 'flat', name: 'Left curtain', polys: [panel(0)], wall: true, surface: true },
        { kind: 'flat', name: 'Right curtain', polys: [panel(p.w - pw)], wall: true, surface: true },
      ];
    },
    note: 'Centre the curtains on a window; fabric-backed paper or thin felt drapes nicely.',
  },
};

/** Item dimensions (model mm) that matter for placement: [w, d, h]. */
export function itemSize(type, p) {
  const def = CATALOG[type];
  return (def?.size || sizeWDH)(p);
}

/** Pick a sensible material id for a new item of this type. */
export function defaultMaterialFor(def, materials) {
  const want = def.mat || 'board';
  const pref = { board: ['chip15', 'bass16', 'chip2'], card: ['card110', 'card65'], fabric: ['felt'] }[want] || [];
  for (const id of pref) if (materials.some((m) => m.id === id)) return id;
  return (materials.find((m) => m.kind === want) || materials[0]).id;
}

/** Default kit — the reading nook room type. */
export function defaultKit() {
  return {
    version: 1,
    scale: 24,
    machine: 'maker',
    fingerWidth: 0,
    tabWidth: 5,
    drawLabels: false,
    materials: structuredClone(DEFAULT_MATERIALS),
    ...structuredClone(LIBRARY_KIT),
  };
}
