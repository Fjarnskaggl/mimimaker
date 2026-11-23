// The furniture and decor catalogue. Pieces are plain JSON data in
// src/pieces/ (format: src/pieces/README.md); the loader turns each into a
// catalogue entry with build(p, ctx) and size(p). Parameters are real-world
// centimetres; the kit's scale converts them to model millimetres before
// `build` is called.
//
// build(p, ctx) returns components in item-local model coordinates
// (x = width, y = depth with the front at y=0, z = up):
//   { kind: 'box', name, size: [W, D, H], faces, shelves?, scores?, holes?, at: [x, y, z] }
//   { kind: 'flat', name, polys, scores?, plane: { o, U, V, n } }   (floor items)
//   { kind: 'flat', name, polys, wall: true, surface: true }        (wall items)
//
// Wall-placed items hang with their back against the wall; `elev` is the
// height of their centre above the floor.

import { DEFAULT_MATERIALS } from './materials.js';
import { LIBRARY_KIT } from './templates.js';
import { PIECES } from './pieces/index.js';
import { loadPiece } from './pieces/load.js';

/** Theme groups, in picker order. */
export const THEMES = ['Basics', 'Living room', 'Bedroom', 'Kitchen', 'Bathroom', 'Café', 'Library', 'Decor', 'Accessories'];

/** Catalogue entries keyed by piece id, in picker order. */
export const CATALOG = Object.fromEntries(PIECES.map((p) => [p.id, loadPiece(p)]));

const sizeWDH = (p) => [p.w, p.d, p.h];

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
