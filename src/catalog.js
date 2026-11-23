// Furniture and decor templates. Parameters are real-world centimetres; the
// kit's scale converts them to model millimetres before `build` is called.
//
// build(p, ctx) returns components in item-local model coordinates
// (x = width, y = depth with the front at y=0, z = up):
//   { kind: 'box', name, size: [W, D, H], faces, shelves?, scores?, at: [x, y, z] }
//   { kind: 'flat', name, polys, w, h, plane: { o, U, V, n } }

import { archPoly, ellipsePoly, rectPoly } from './geometry.js';
import { DEFAULT_MATERIALS } from './materials.js';

const ALL = ['bottom', 'top', 'front', 'back', 'left', 'right'];
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

const num = (key, label, min, max, step = 1) => ({ key, label, type: 'number', min, max, step, unit: 'cm' });
const cnt = (key, label, min, max) => ({ key, label, type: 'number', min, max, step: 1 });
const sel = (key, label, options) => ({ key, label, type: 'select', options });

function evenShelves(n, H, t, hasTop = true) {
  const top = hasTop ? H - t : H;
  const inner = top - t;
  return Array.from({ length: n }, (_, k) => t + ((k + 1) * inner) / (n + 1) - t / 2);
}

function frontScores(style, count, W, H, t) {
  const lines = [];
  const m = t + 0.6;
  if (style === 'drawers' && count > 1) {
    for (let k = 1; k < count; k++) {
      const v = t + (k * (H - 2 * t)) / count;
      lines.push([[m, v], [W - m, v]]);
    }
  }
  if (style === 'doors' && count > 1) {
    for (let k = 1; k < count; k++) {
      const u = (k * W) / count;
      lines.push([[u, m], [u, H - m]]);
    }
  }
  return lines;
}

export const CATALOG = {
  bookshelf: {
    label: 'Bookshelf',
    group: 'Furniture',
    placement: 'floor',
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
    label: 'Cabinet / dresser',
    group: 'Furniture',
    placement: 'floor',
    params: [num('w', 'Width', 10, 300), num('d', 'Depth', 10, 100), num('h', 'Height', 10, 250), sel('style', 'Front', ['drawers', 'doors', 'plain']), cnt('count', 'Drawers / doors', 1, 8)],
    defaults: { w: 90, d: 45, h: 85, style: 'drawers', count: 3 },
    build: (p, { t }) => [{
      kind: 'box', name: 'Cabinet', size: [p.w, p.d, p.h], faces: ALL, at: [0, 0, 0],
      scores: { front: frontScores(p.style, Math.round(p.count), p.w, p.h, t) },
    }],
    note: 'Score lines on the front panel mark drawer or door gaps; glue on tiny bead handles if you like.',
  },
  nightstand: {
    label: 'Nightstand',
    group: 'Furniture',
    placement: 'floor',
    params: [num('w', 'Width', 10, 120), num('d', 'Depth', 10, 80), num('h', 'Height', 10, 120), cnt('count', 'Drawers', 1, 4)],
    defaults: { w: 45, d: 40, h: 55, count: 2 },
    build: (p, { t }) => [{
      kind: 'box', name: 'Nightstand', size: [p.w, p.d, p.h], faces: ALL, at: [0, 0, 0],
      scores: { front: frontScores('drawers', Math.round(p.count), p.w, p.h, t) },
    }],
  },
  wardrobe: {
    label: 'Wardrobe',
    group: 'Furniture',
    placement: 'floor',
    params: [num('w', 'Width', 30, 300), num('d', 'Depth', 20, 100), num('h', 'Height', 60, 280), cnt('count', 'Doors', 1, 4)],
    defaults: { w: 100, d: 60, h: 200, count: 2 },
    build: (p, { t }) => [{
      kind: 'box', name: 'Wardrobe', size: [p.w, p.d, p.h], faces: ALL, at: [0, 0, 0],
      scores: { front: frontScores('doors', Math.round(p.count), p.w, p.h, t) },
    }],
  },
  table: {
    label: 'Table',
    group: 'Furniture',
    placement: 'floor',
    params: [num('w', 'Width', 20, 300), num('d', 'Depth', 20, 200), num('h', 'Height', 20, 120)],
    defaults: { w: 120, d: 70, h: 75 },
    build: (p) => [{ kind: 'box', name: 'Table', size: [p.w, p.d, p.h], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  desk: {
    label: 'Desk',
    group: 'Furniture',
    placement: 'floor',
    params: [num('w', 'Width', 30, 250), num('d', 'Depth', 20, 120), num('h', 'Height', 30, 120)],
    defaults: { w: 120, d: 60, h: 75 },
    build: (p) => [{ kind: 'box', name: 'Desk', size: [p.w, p.d, p.h], faces: ['top', 'left', 'right', 'back'], at: [0, 0, 0] }],
  },
  bench: {
    label: 'Bench / coffee table',
    group: 'Furniture',
    placement: 'floor',
    params: [num('w', 'Width', 20, 300), num('d', 'Depth', 15, 120), num('h', 'Height', 10, 80)],
    defaults: { w: 100, d: 40, h: 45 },
    build: (p) => [{ kind: 'box', name: 'Bench', size: [p.w, p.d, p.h], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  bed: {
    label: 'Bed',
    group: 'Furniture',
    placement: 'floor',
    params: [num('w', 'Width', 60, 220), num('d', 'Length', 120, 240), num('h', 'Base height', 15, 80), num('head', 'Headboard height', 40, 160)],
    defaults: { w: 140, d: 200, h: 45, head: 100 },
    build: (p, { t }) => [
      { kind: 'box', name: 'Bed base', size: [p.w, p.d - t, p.h], faces: ALL, at: [0, 0, 0] },
      {
        kind: 'flat', name: 'Headboard', polys: [archPoly(0, 0, p.w, p.head, Math.min(p.w * 0.12, p.head * 0.3))],
        plane: { o: [0, p.d - t, 0], U: X, V: Z, n: [0, -1, 0] },
      },
    ],
    note: 'Glue the headboard flat against the back of the base, bottom edges flush.',
  },
  chair: {
    label: 'Chair / armchair',
    group: 'Furniture',
    placement: 'floor',
    params: [num('w', 'Width', 30, 120), num('d', 'Depth', 30, 120), num('seat', 'Seat height', 20, 70), num('back', 'Back height', 50, 140)],
    defaults: { w: 50, d: 50, seat: 45, back: 90 },
    build: (p, { t }) => [
      { kind: 'box', name: 'Seat', size: [p.w, p.d - t, p.seat], faces: ['top', 'left', 'right'], at: [0, 0, 0] },
      {
        kind: 'flat', name: 'Backrest', polys: [archPoly(0, 0, p.w, p.back, p.w * 0.25)],
        plane: { o: [0, p.d - t, 0], U: X, V: Z, n: [0, -1, 0] },
      },
    ],
    note: 'Glue the backrest against the back edges of the seat sides.',
  },
  rug: {
    label: 'Rug',
    group: 'Decor',
    placement: 'floor',
    params: [num('w', 'Width', 10, 400), num('d', 'Depth', 10, 400), sel('shape', 'Shape', ['oval', 'rect', 'round'])],
    defaults: { w: 140, d: 90, shape: 'oval' },
    build: (p) => {
      const poly = p.shape === 'rect' ? rectPoly(0, 0, p.w, p.d)
        : p.shape === 'round' ? ellipsePoly(p.w / 2, p.w / 2, p.w / 2, p.w / 2, 64)
        : ellipsePoly(p.w / 2, p.d / 2, p.w / 2, p.d / 2, 64);
      return [{ kind: 'flat', name: 'Rug', polys: [poly], plane: { o: [0, 0, 0.05], U: X, V: Y, n: [0, 0, 1] }, surface: true }];
    },
  },
  frame: {
    label: 'Picture frame',
    group: 'Decor',
    placement: 'wall',
    params: [num('w', 'Width', 5, 200), num('h', 'Height', 5, 200), num('border', 'Border', 1, 30)],
    defaults: { w: 40, h: 50, border: 5 },
    build: (p) => {
      const b = Math.min(p.border, p.w / 2 - 0.5, p.h / 2 - 0.5);
      return [{ kind: 'flat', name: 'Frame', polys: [rectPoly(0, 0, p.w, p.h), rectPoly(b, b, p.w - 2 * b, p.h - 2 * b)], wall: true, surface: true }];
    },
    note: 'Glue a printed picture behind the frame, then glue it to the wall.',
  },
  mirror: {
    label: 'Round mirror / clock',
    group: 'Decor',
    placement: 'wall',
    params: [num('w', 'Diameter', 5, 150), num('border', 'Rim', 1, 20)],
    defaults: { w: 45, border: 4 },
    build: (p) => {
      const r = p.w / 2;
      const b = Math.min(p.border, r - 0.5);
      return [{ kind: 'flat', name: 'Mirror rim', polys: [ellipsePoly(r, r, r, r, 64), ellipsePoly(r, r, r - b, r - b, 64)], wall: true, surface: true }];
    },
    note: 'Back the rim with mirror card or a printed clock face.',
  },
};

/** Item dimensions (model mm) that matter for placement: [w, d, h]. */
export function itemSize(type, p) {
  switch (type) {
    case 'chair': return [p.w, p.d, Math.max(p.seat, p.back)];
    case 'bed': return [p.w, p.d, Math.max(p.h, p.head)];
    case 'rug': return p.shape === 'round' ? [p.w, p.w, 0] : [p.w, p.d, 0];
    case 'mirror': return [p.w, 0, p.w];
    case 'frame': return [p.w, 0, p.h];
    default: return [p.w, p.d, p.h];
  }
}

/** Default room template — a cozy 1:24 reading nook. */
export function defaultKit() {
  return {
    version: 1,
    name: 'Cozy Reading Nook',
    scale: 24,
    machine: 'maker',
    fingerWidth: 0,
    tabWidth: 5,
    drawLabels: false,
    materials: structuredClone(DEFAULT_MATERIALS),
    room: {
      width: 300, depth: 220, height: 260, ceiling: false, material: 'chip2',
      wallpaper: { enabled: true, material: 'paper' },
      floor: { enabled: true, material: 'card65' },
      trimMaterial: 'card110',
    },
    openings: [
      { wall: 'back', kind: 'arch', pos: 175, sill: 90, width: 80, height: 120, trim: true },
      { wall: 'right', kind: 'archdoor', pos: 130, sill: 0, width: 85, height: 210, trim: true },
    ],
    items: [
      { type: 'bookshelf', params: { w: 80, d: 30, h: 180, shelves: 3 }, material: 'bass16', x: 15, y: 0, rot: 0 },
      { type: 'chair', params: { w: 55, d: 55, seat: 45, back: 95 }, material: 'chip15', x: 150, y: 70, rot: 0 },
      { type: 'nightstand', params: { w: 45, d: 40, h: 55, count: 2 }, material: 'card110', x: 230, y: 10, rot: 0 },
      { type: 'rug', params: { w: 150, d: 100, shape: 'oval' }, material: 'felt', x: 110, y: 50, rot: 0 },
      { type: 'frame', params: { w: 40, h: 55, border: 5 }, material: 'card110', wall: 'back', pos: 260, elev: 160 },
    ],
  };
}
