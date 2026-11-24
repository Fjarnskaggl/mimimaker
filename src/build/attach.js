// Attachment check: is every part of a piece really held by the rest of it?
//
// Works on the compiled 3D faces (compiled.faces3d, matched to parts with
// faceParts). Each face is a flat slab: its outline (and holes) on its plane,
// extruded `thickness` mm behind the face (along −n), like the WebGL viewer
// draws it. Two parts touch when a point sampled on one slab (its outline,
// holes and a grid across it, front and back) lies within the other slab.
// A piece is sound when every part is joined, through touching parts, to
// what holds the whole piece: the floor for floor pieces, its wall for wall
// pieces. A part that touches nothing that reaches the floor floats.

import { faceParts } from './exploded.js';
import { itemGroups } from './joints.js';
import { faceFrame } from '../box.js';
import { CATALOG } from '../catalog.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return l > 1e-12 ? mul(a, 1 / l) : a; };

/** Default touch tolerance (mm): glue gaps, rounding and finger clearances. */
export const TOUCH_TOL = 0.35;

/** A face as a slab: plane basis, 2D polygons on it, thickness. */
function slab(face) {
  const n = norm(face.n);
  const P = face.polys[0];
  const o = P[0];
  // an in-plane axis from the longest edge of the outline
  let U = [1, 0, 0], best = 0;
  for (let i = 0; i < P.length; i++) {
    const e = sub(P[(i + 1) % P.length], P[i]);
    const inPlane = sub(e, mul(n, dot(e, n)));
    const l = Math.hypot(...inPlane);
    if (l > best) { best = l; U = mul(inPlane, 1 / l); }
  }
  const V = cross(n, U);
  const to2 = (p) => { const d = sub(p, o); return [dot(d, U), dot(d, V)]; };
  const polys = face.polys.map((poly) => poly.map(to2));
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const [x, y] of polys[0]) { lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y); }
  return { face, n, o, U, V, polys, lo, hi, t: Math.max(0, face.thickness || 0) };
}

const inPoly = ([x, y], poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const segDist = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  const k = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - k * dx, py - ay - k * dy);
};
/** Inside the face's area (even-odd over all its polygons), or within tol of an edge. */
function inArea(s, q, tol) {
  if (q[0] < s.lo[0] - tol || q[0] > s.hi[0] + tol || q[1] < s.lo[1] - tol || q[1] > s.hi[1] + tol) return false;
  let inside = false;
  for (const poly of s.polys) if (inPoly(q, poly)) inside = !inside;
  if (inside) return true;
  for (const poly of s.polys) for (let i = 0; i < poly.length; i++) if (segDist(q, poly[i], poly[(i + 1) % poly.length]) <= tol) return true;
  return false;
}
/** Is 3D point p inside slab s (within tol)? */
function inSlab(s, p, tol) {
  const d = sub(p, s.o);
  const h = dot(d, s.n);
  if (h > tol || h < -s.t - tol) return false;
  return inArea(s, [dot(d, s.U), dot(d, s.V)], tol);
}

/** Points on a slab: its outline and holes every `step` mm, a grid across it, on its front and back. */
function samples(s, step) {
  const pts2 = [];
  for (const poly of s.polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 0; k < n; k++) pts2.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  const g = Math.max(step * 2, Math.max(s.hi[0] - s.lo[0], s.hi[1] - s.lo[1]) / 40);
  for (let x = s.lo[0] + g / 2; x < s.hi[0]; x += g) for (let y = s.lo[1] + g / 2; y < s.hi[1]; y += g) if (inArea(s, [x, y], 0)) pts2.push([x, y]);
  const out = [];
  const depths = s.t > 0 ? [0, -s.t] : [0];
  for (const [u, v] of pts2) {
    const p = add(s.o, add(mul(s.U, u), mul(s.V, v)));
    for (const h of depths) out.push(add(p, mul(s.n, h)));
  }
  return out;
}

const boxOf = (s) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const poly of s.face.polys) for (const p of poly) for (const h of [0, -s.t]) {
    const q = add(p, mul(s.n, h));
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  }
  return { lo, hi };
};
const boxesNear = (a, b, tol) => [0, 1, 2].every((i) => a.lo[i] <= b.hi[i] + tol && b.lo[i] <= a.hi[i] + tol);

/** Do the two lists of slabs touch? */
function touching(A, B, tol, step, cache) {
  for (const a of A) for (const b of B) {
    if (!boxesNear(a.box, b.box, tol)) continue;
    const sa = cache(a), sb = cache(b);
    if (sa.some((p) => inSlab(b, p, tol)) || sb.some((p) => inSlab(a, p, tol))) return true;
  }
  return false;
}

/** Distance from 2D point q to the nearest edge of the slab's polygons. */
function edgeDist(s, q) {
  let d = Infinity;
  for (const poly of s.polys) for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(q, poly[i], poly[(i + 1) % poly.length]));
  return d;
}
/** Is there material at 3D point p, projected onto the slab's plane? */
function solidAt(s, p) {
  const d = sub(p, s.o);
  const q = [dot(d, s.U), dot(d, s.V)];
  let inside = false;
  for (const poly of s.polys) if (inPoly(q, poly)) inside = !inside;
  return inside;
}
/** Is 3D point p (on or near the slab's plane) well inside its material, at least m from every edge? */
function deepIn(s, p, m) {
  const d = sub(p, s.o);
  const q = [dot(d, s.U), dot(d, s.V)];
  let inside = false;
  for (const poly of s.polys) if (inPoly(q, poly)) inside = !inside;
  return inside && edgeDist(s, q) > m;
}

/**
 * Do slabs a and b pass through each other? Non-parallel faces cross when the
 * line where their planes meet runs through the middle of both (a T-joint or
 * a tab in a slot meets at an edge or a hole, so it doesn't count). Parallel
 * faces collide when their material overlaps across their middles.
 */
function crossing(a, b, tol) {
  if (!boxesNear(a.box, b.box, -tol)) return false;
  const m = Math.max(a.t, b.t) + 0.3;
  const c = dot(a.n, b.n);
  if (Math.abs(c) > 0.995) {
    if (a.t <= 0 || b.t <= 0) return false;
    const hb = dot(sub(b.o, a.o), a.n); // b's face, in a's normal coordinate
    const [b0, b1] = c > 0 ? [hb - b.t, hb] : [hb, hb + b.t];
    if (Math.min(0, b1) - Math.max(-a.t, b0) <= tol) return false;
    const pts = gridOn(b, 1.5);
    return pts.some((p) => deepIn(a, sub(p, mul(a.n, dot(sub(p, a.o), a.n))), 0.4) && deepIn(b, p, 0.4));
  }
  // a point on both planes, then walk the line where they meet
  const c0 = cross(a.n, b.n), sin = Math.hypot(...c0);
  const dir = mul(c0, 1 / sin);
  const da = dot(a.n, a.o), db = dot(b.n, b.o);
  const p0 = mul(add(mul(cross(b.n, dir), da), mul(cross(dir, a.n), db)), 1 / sin);
  const lo = a.box.lo.map((v, i) => Math.max(v, b.box.lo[i]) - 1), hi = a.box.hi.map((v, i) => Math.min(v, b.box.hi[i]) + 1);
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-9) { if (p0[i] < lo[i] || p0[i] > hi[i]) return false; continue; }
    const u = (lo[i] - p0[i]) / dir[i], v = (hi[i] - p0[i]) / dir[i];
    t0 = Math.max(t0, Math.min(u, v)); t1 = Math.min(t1, Math.max(u, v));
  }
  if (!(t1 > t0)) return false;
  // a crosses b where both have material on the line and each runs on through
  // the other: material on both sides, past the other's thickness
  const wa = norm(cross(a.n, dir)), wb = norm(cross(b.n, dir));
  const ea = b.t + 0.4, eb = a.t + 0.4;
  const n = Math.min(600, Math.ceil((t1 - t0) / 0.25));
  for (let k = 0; k <= n; k++) {
    const p = add(p0, mul(dir, t0 + ((t1 - t0) * k) / n));
    if (solidAt(a, p) && solidAt(b, p)
      && solidAt(a, add(p, mul(wa, ea))) && solidAt(a, sub(p, mul(wa, ea)))
      && solidAt(b, add(p, mul(wb, eb))) && solidAt(b, sub(p, mul(wb, eb)))) return true;
  }
  return false;
}
function gridOn(s, step) {
  const out = [];
  for (let x = s.lo[0] + step / 2; x < s.hi[0]; x += step) for (let y = s.lo[1] + step / 2; y < s.hi[1]; y += step) {
    if (inArea(s, [x, y], 0)) out.push(add(s.o, add(mul(s.U, x), mul(s.V, y))));
  }
  return out;
}

/** Pairs of nodes whose material passes through each other: [[a, b]]. */
export function crossings(nodes, { tol = TOUCH_TOL } = {}) {
  const out = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (nodes[i].slabs.some((a) => nodes[j].slabs.some((b) => crossing(a, b, tol)))) out.push([nodes[i].id, nodes[j].id]);
  }
  return out;
}

/**
 * Narrowest strip of material in a flat part (mm): from the middle of each
 * edge, straight across the material to the next edge.
 */
export function narrowestStrip(polys) {
  const edges = polys.flatMap((poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]));
  const inside = (q) => { let c = false; for (const poly of polys) if (inPoly(q, poly)) c = !c; return c; };
  let best = Infinity;
  for (const [a, b] of edges) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.5) continue;
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    if (!inside([m[0] + nx * 0.01, m[1] + ny * 0.01])) { nx = -nx; ny = -ny; }
    if (!inside([m[0] + nx * 0.01, m[1] + ny * 0.01])) continue;
    let hit = Infinity;
    for (const [c, d] of edges) {
      if (c === a || c === b || d === a || d === b) continue; // itself, and the corners it makes with its neighbours
      const ex = d[0] - c[0], ey = d[1] - c[1];
      const den = nx * ey - ny * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = c[0] - m[0], wy = c[1] - m[1];
      const tt = (wx * ey - wy * ex) / den, uu = (wx * ny - wy * nx) / den;
      // a strip has two sides that run (nearly) parallel; a tapering tip doesn't
      const parallel = Math.abs((b[0] - a[0]) * ex + (b[1] - a[1]) * ey) / (L * Math.hypot(ex, ey)) > Math.cos(Math.PI / 6);
      if (parallel && tt > 1e-6 && uu >= -1e-9 && uu <= 1 + 1e-9) hit = Math.min(hit, tt);
    }
    // only strips whose sides run roughly parallel: a sharp corner isn't a strip
    if (hit < Infinity && hit < L * 4) best = Math.min(best, hit);
  }
  return best;
}

/** Slabs for a shell-style part: 2D polys on `plane` ({ o, U, V, n }), material t along −n. */
export function planeSlabs(plane, polys, t) {
  const map = ([u, v]) => add(plane.o, add(mul(plane.U, u), mul(plane.V, v)));
  const s = slab({ polys: polys.map((poly) => poly.map(map)), n: plane.n, thickness: t });
  s.box = boxOf(s);
  return [s];
}

/**
 * Which nodes are held? nodes: [{ id, name, slabs }]; anchor(p) says whether a
 * 3D point rests on what holds the whole thing (floor, wall).
 * Returns { floating: [{ id, name }], contacts: [[a, b]], anchored: [ids] }.
 */
export function holdCheck(nodes, anchor, { tol = TOUCH_TOL, step = 0.75 } = {}) {
  const cacheMap = new Map();
  const cache = (s) => { if (!cacheMap.has(s)) cacheMap.set(s, samples(s, step)); return cacheMap.get(s); };
  const anchored = nodes.filter((n) => n.slabs.some((s) => cache(s).some(anchor))).map((n) => n.id);
  const contacts = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (touching(nodes[i].slabs, nodes[j].slabs, tol, step, cache)) contacts.push([nodes[i].id, nodes[j].id]);
  }
  const held = new Set(anchored);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [a, b] of contacts) if (held.has(a) !== held.has(b)) { held.add(a); held.add(b); grew = true; }
  }
  return { floating: nodes.filter((n) => !held.has(n.id)).map(({ id, name }) => ({ id, name })), contacts, anchored };
}

/** Rests on the lowest point of these nodes. */
export const onLowest = (nodes, tol = TOUCH_TOL) => {
  const floor = Math.min(...nodes.flatMap((n) => n.slabs.map((s) => s.box.lo[2])));
  return (p) => p[2] <= floor + tol;
};

/**
 * For each kit item, its parts and whether each one is held.
 * Returns [{ item, title, type, parts: [{ id, name }], floating: [{ id, name }],
 *            contacts: [[idA, idB]], anchored: [ids touching the floor/wall] }].
 */
export function attachmentReport(kit, compiled, opts = {}) {
  const owner = faceParts(kit, compiled);
  const byId = new Map(compiled.parts.map((p) => [p.id, p]));
  const { W, D, H, t } = compiled.dims;
  const out = [];
  for (const [g, { item, def }] of itemGroups(kit, compiled)) {
    const index = kit.items.indexOf(item);
    const slabs = new Map(); // part id -> slabs
    compiled.faces3d.forEach((f, k) => {
      if (f.item !== index || f.glow || owner[k] == null) return;
      if (!g.parts.includes(owner[k])) return;
      const s = slab(f);
      s.box = boxOf(s);
      if (!slabs.has(owner[k])) slabs.set(owner[k], []);
      slabs.get(owner[k]).push(s);
    });
    const nodes = g.parts.filter((id) => slabs.has(id)).map((id) => ({ id, name: byId.get(id).name, slabs: slabs.get(id) }));
    // bought rods (dowels, wire, tube) hold parts too
    (compiled.hardware || []).forEach((h, k) => {
      if (h.item !== index) return;
      const rs = compiled.faces3d.filter((f) => f.hardware === k).map((f) => { const s = slab(f); s.box = boxOf(s); return s; });
      nodes.push({ id: `rod${k}`, name: h.name, slabs: rs, rod: true });
    });
    // what holds the piece: the floor surface or the wall's inner face
    let anchor;
    if (def.placement === 'wall') {
      const wall = ['back', 'left', 'right'].includes(item.wall) ? item.wall : 'back';
      const fr = faceFrame(wall, W, D, H, t, 'inner');
      anchor = (p) => dot(sub(p, fr.o), fr.n) <= 0.3 + (opts.tol ?? TOUCH_TOL) + 0.5; // hung 0.3 mm proud of the wall
    } else anchor = onLowest(nodes, opts.tol);
    const res = holdCheck(nodes, anchor, opts);
    out.push({ item: index, title: g.title, type: item.type, parts: nodes.filter((n) => !n.rod).map(({ id, name }) => ({ id, name })), ...res, crossings: crossings(nodes, opts) });
  }
  return out;
}

/** A one-item kit for checking a catalogue piece on its own. */
export function soloKit(baseKit, type, params = {}, material) {
  const def = CATALOG[type];
  const kit = structuredClone(baseKit);
  kit.openings = [];
  kit.lighting = { ...(kit.lighting || {}), enabled: false, leds: [] };
  kit.room = { ...kit.room, width: 400, depth: 300, height: 300, wallpaper: { ...(kit.room.wallpaper || {}), enabled: false }, floor: { ...(kit.room.floor || {}), enabled: false } };
  const item = { type, params: { ...def.defaults, ...params }, material };
  if (def.placement === 'wall') Object.assign(item, { wall: 'back', pos: 200, elev: 150 });
  else Object.assign(item, { x: 10, y: 10 });
  kit.items = [item];
  return kit;
}
