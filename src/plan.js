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
export function rotateItem(kit, index, turns = 1) {
  const item = kit.items[index];
  const f = footprint(item);
  const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
  item.rot = ((((Number(item.rot) || 0) + 90 * turns) % 360) + 360) % 360;
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

// ------------------------------------------------------------------ snapping
// Shared by the floor plan and the 3D move handles. Each axis snaps on its
// own: the piece's low edge, centre and high edge are tried against walls and
// other pieces' edges and centres; the nearest within `reach` cm wins, and
// otherwise the low edge (the centre, for things on a wall) goes to the
// `grid`. `free` (Alt, or snapping set to Off) skips all of it.
// Guides say what lined up, for drawing: {axis, at, from, to, kind}.

/** The best snap of a span [lo, lo + len] to targets on one axis, or null. */
function snapSpan(lo, len, targets, reach) {
  let best = null;
  for (const [k, off] of [[0, 0], [1, len / 2], [2, len]]) {
    for (const t of targets) {
      if (t.edges && !t.edges.includes(k)) continue;
      const d = t.at - (lo + off);
      if (Math.abs(d) <= reach + EPS && (!best || Math.abs(d) < Math.abs(best.d) - EPS)) best = { d, t };
    }
  }
  return best;
}

function snapAxis(lo, len, min, max, targets, { grid, reach, free, centred = false }) {
  if (free) return { v: clamp(lo, min, max - len), hit: null };
  const hit = reach > 0 ? snapSpan(lo, len, targets, reach) : null;
  const mid = centred ? len / 2 : 0;
  const v = hit ? lo + hit.d : snap(lo + mid - min, grid) + min - mid;
  const c = clamp(v, min, max - len);
  // the room's edge can push it off the line it snapped to: then nothing lined up
  return { v: c, hit: hit && Math.abs(c - v) < EPS ? hit : null };
}

/**
 * Snap a floor piece being moved to (x, y) cm (its back-left corner).
 * @returns {{x: number, y: number, guides: object[]}}
 */
export function snapFloorMove(kit, index, x, y, { grid = 5, reach = 3, free = false } = {}) {
  const item = kit.items[index];
  const { fw, fd } = size(item);
  const others = kit.items.map((it, i) => (i === index || !CATALOG[it.type] || size(it).h <= 0 ? null : footprint(it))).filter(Boolean);
  const tx = [{ at: 0, edges: [0], kind: 'wall' }, { at: kit.room.width, edges: [2], kind: 'wall' }];
  const ty = [{ at: 0, edges: [0], kind: 'wall' }, { at: kit.room.depth, edges: [2], kind: 'wall' }];
  for (const f of others) {
    for (const at of [f.x0, (f.x0 + f.x1) / 2, f.x1]) tx.push({ at, kind: 'piece', f });
    for (const at of [f.y0, (f.y0 + f.y1) / 2, f.y1]) ty.push({ at, kind: 'piece', f });
  }
  const opts = { grid, reach, free };
  const sx = snapAxis(x, fw, 0, kit.room.width, tx, opts);
  const sy = snapAxis(y, fd, 0, kit.room.depth, ty, opts);
  const guides = [];
  if (sx.hit) {
    const f = sx.hit.t.f;
    guides.push({ axis: 'x', at: sx.hit.t.at, kind: sx.hit.t.kind, from: Math.min(sy.v, f ? f.y0 : 0), to: Math.max(sy.v + fd, f ? f.y1 : kit.room.depth) });
  }
  if (sy.hit) {
    const f = sy.hit.t.f;
    guides.push({ axis: 'y', at: sy.hit.t.at, kind: sy.hit.t.kind, from: Math.min(sx.v, f ? f.x0 : 0), to: Math.max(sx.v + fw, f ? f.x1 : kit.room.width) });
  }
  return { x: sx.v, y: sy.v, guides };
}

/**
 * Snap something on a wall (a wall piece, an opening or a wall light) being
 * moved to centre `pos` along the wall and centre height `elev`, both cm.
 * `who` is {kind: 'item'|'opening'|'led', index}; w and h are its size on the
 * wall. Targets: the wall's ends, floor and top, and the edges and centres
 * of other pieces and openings on the same wall.
 * @returns {{pos: number, elev: number, guides: object[]}}
 */
export function snapWallMove(kit, who, pos, elev, { w = 0, h = 0, grid = 5, reach = 3, free = false } = {}) {
  const list = who.kind === 'opening' ? kit.openings : who.kind === 'led' ? kit.lighting?.leds || [] : kit.items;
  const me = list[who.index];
  const wall = me?.wall || 'back';
  const len = wallLength(wall, kit.room), top = kit.room.height;
  const spans = []; // [pos0, pos1, elev0, elev1] of the others on this wall
  kit.items.forEach((it, i) => {
    if ((who.kind === 'item' && i === who.index) || it.wall !== wall || CATALOG[it.type]?.placement !== 'wall') return;
    const [iw, , ih] = itemSize(it.type, itemParams(it));
    const p = it.pos ?? 0, e = it.elev ?? 0;
    spans.push([p - iw / 2, p + iw / 2, e - ih / 2, e + ih / 2]);
  });
  (kit.openings || []).forEach((o, i) => {
    if ((who.kind === 'opening' && i === who.index) || o.wall !== wall) return;
    const sill = o.sill ?? 0;
    spans.push([o.pos - o.width / 2, o.pos + o.width / 2, sill, sill + o.height]);
  });
  const tp = [{ at: 0, edges: [0], kind: 'wall' }, { at: len, edges: [2], kind: 'wall' }];
  const te = [{ at: 0, edges: [0], kind: 'wall' }, { at: top, edges: [2], kind: 'wall' }];
  for (const [p0, p1, e0, e1] of spans) {
    for (const at of [p0, (p0 + p1) / 2, p1]) tp.push({ at, kind: 'piece', span: [e0, e1] });
    for (const at of [e0, (e0 + e1) / 2, e1]) te.push({ at, kind: 'piece', span: [p0, p1] });
  }
  const opts = { grid, reach, free, centred: true };
  const sp = snapAxis(pos - w / 2, w, 0, len, tp, opts);
  const se = snapAxis(elev - h / 2, h, 0, top, te, opts);
  const guides = [];
  if (sp.hit) { const s0 = sp.hit.t.span || [0, top]; guides.push({ axis: 'pos', at: sp.hit.t.at, kind: sp.hit.t.kind, wall, from: Math.min(se.v, s0[0]), to: Math.max(se.v + h, s0[1]) }); }
  if (se.hit) { const s0 = se.hit.t.span || [0, len]; guides.push({ axis: 'elev', at: se.hit.t.at, kind: se.hit.t.kind, wall, from: Math.min(sp.v, s0[0]), to: Math.max(sp.v + w, s0[1]) }); }
  return { pos: sp.v + w / 2, elev: se.v + h / 2, guides };
}

/** A floor piece's turn after dragging a rotate handle by `delta` degrees: whole quarter turns only. */
export function snapRotation(rot, delta) {
  const turns = Math.round(delta / 90);
  return ((((Number(rot) || 0) + turns * 90) % 360) + 360) % 360;
}
