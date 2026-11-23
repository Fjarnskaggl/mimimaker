// Floor-plan geometry in real-world centimetres. Interior origin is the
// back-left corner; x runs right, y runs toward the open front.

import { CATALOG, itemSize } from './catalog.js';

const EPS = 1e-6;

/** The item's parameters in real cm, with defaults filled in. */
export function itemParams(item) {
  const def = CATALOG[item.type];
  const p = {};
  for (const prm of def.params) p[prm.key] = item.params?.[prm.key] ?? def.defaults[prm.key];
  return p;
}

function size(item) {
  const [w, d, h] = itemSize(item.type, itemParams(item));
  const rot = (((Number(item.rot) || 0) % 360) + 360) % 360;
  return rot % 180 ? { fw: d, fd: w, h } : { fw: w, fd: d, h };
}

/** Floor footprint {x0, y0, x1, y1}, or null for wall-mounted items. */
export function footprint(item) {
  const def = CATALOG[item.type];
  if (!def || def.placement !== 'floor') return null;
  const { fw, fd } = size(item);
  const x = item.x ?? 0, y = item.y ?? 0;
  return { x0: x, y0: y, x1: x + fw, y1: y + fd };
}

/** Index pairs of floor items that overlap (flat items like rugs are ignored). */
export function collisions(kit) {
  const boxes = kit.items.map((it, i) => ({ i, f: footprint(it), solid: CATALOG[it.type] && size(it).h > 0 }))
    .filter((b) => b.f && b.solid);
  const out = [];
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const A = boxes[a].f, B = boxes[b].f;
    if (A.x0 < B.x1 - EPS && B.x0 < A.x1 - EPS && A.y0 < B.y1 - EPS && B.y0 < A.y1 - EPS) out.push([boxes[a].i, boxes[b].i]);
  }
  return out;
}

export const snap = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Move a floor item, snapping to `step` cm and keeping it inside the room. */
export function moveItem(kit, index, x, y, { step = 0 } = {}) {
  const item = kit.items[index];
  const { fw, fd } = size(item);
  item.x = clamp(snap(x, step), 0, kit.room.width - fw);
  item.y = clamp(snap(y, step), 0, kit.room.depth - fd);
  return item;
}

/** Turn a floor item 90° about its centre, then keep it inside the room. */
export function rotateItem(kit, index) {
  const item = kit.items[index];
  const f = footprint(item);
  const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
  item.rot = ((((Number(item.rot) || 0) + 90) % 360) + 360) % 360;
  const { fw, fd } = size(item);
  item.x = clamp(cx - fw / 2, 0, kit.room.width - fw);
  item.y = clamp(cy - fd / 2, 0, kit.room.depth - fd);
  return item;
}

/**
 * A free place for a new floor item: the first spot, scanning from the back
 * left on a `step` cm grid, where it sits inside the room and overlaps no
 * other solid piece. Returns {x, y}, or null when nothing fits.
 */
export function findFreeSpot(kit, item, { step = 5 } = {}) {
  const { fw, fd } = size(item);
  const others = kit.items.filter((it) => it !== item).map((it) => ({ f: footprint(it), h: CATALOG[it.type] ? size(it).h : 0 }))
    .filter((o) => o.f && o.h > 0).map((o) => o.f);
  const free = (x, y) => others.every((B) => !(x < B.x1 - EPS && B.x0 < x + fw - EPS && y < B.y1 - EPS && B.y0 < y + fd - EPS));
  for (let y = 0; y + fd <= kit.room.depth + EPS; y += step) {
    for (let x = 0; x + fw <= kit.room.width + EPS; x += step) if (free(x, y)) return { x, y };
  }
  return null;
}

export const wallLength = (wall, room) => (wall === 'back' ? room.width : room.depth);

/** Slide something mounted on a wall (item, opening, light) to `pos`. */
export function slideOnWall(entity, pos, room, { width = 0, step = 0 } = {}) {
  const len = wallLength(entity.wall, room);
  entity.pos = clamp(snap(pos, step), width / 2, len - width / 2);
  return entity;
}
