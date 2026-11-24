// T6 UI: move handles on the selected piece in the 3D view.
//
// A floor piece gets an arrow along the room's width (x), one toward the open
// front (y), a square to drag it on the floor (xy) and a ring to turn it in
// quarter turns (rot). A wall piece gets an arrow along its wall (pos), one up
// the wall (up) and a square in the wall (plane). Moves snap with the floor
// plan's engine (src/plan.js): grid, walls, openings and other pieces' edges
// and centres, with guides while dragging. Alt (or Snap: Off) moves freely.
//
// The handles are an SVG overlay drawn in screen space from a projector
// (world mm → client px), so they work the same over the sketch view and
// Realistic 3D. While dragging, the piece moves live through preview(); the
// app applies the result once on release (one undo step).

import { snapFloorMove, snapWallMove, snapRotation, footprint, itemParams } from '../plan.js';
import { CATALOG, itemSize } from '../catalog.js';

const NS = 'http://www.w3.org/2000/svg';
const ARROW = 64; // px from the handle origin to an arrow's knob
const REACH_PX = 8; // snap reach on screen
const AXIS_CLASS = { x: 'ax-x', y: 'ax-y', pos: 'ax-x', up: 'ax-z' };

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  parent?.append(e);
  return e;
}
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);

/** World bounding box (model mm) of a piece's faces, or null. */
function itemBox(faces, index) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) {
    if (f.item !== index) continue;
    for (const poly of f.polys) for (const p of poly) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  }
  return Number.isFinite(min[0]) ? { min, max, centre: min.map((v, i) => (v + max[i]) / 2) } : null;
}

/** Axis directions in the world, per handle, for a floor piece or a piece on `wall`. */
function axesFor(wall) {
  if (!wall) return { x: [1, 0, 0], y: [0, -1, 0] }; // plan x runs right, plan y toward the open front
  return { pos: wall === 'back' ? [1, 0, 0] : [0, 1, 0], up: [0, 0, 1] }; // pos runs left→right on the back wall, front→back on the sides
}

let overlay = null; // { svg, drag }

/**
 * Draw (or clear) the handles for the selection.
 * @param {HTMLElement} wrap     the stage's wrapper (the overlay goes in it, over the stage)
 * @param {object} o
 * @param {HTMLElement} o.stage
 * @param {object|null} o.kit, o.sel, o.faces   the kit, view.sel and compiled faces3d
 * @param {Function|null} o.project   world mm → client px (null: no handles)
 * @param {number} o.grid      grid step in cm (0: none)
 * @param {Function} o.preview (xf|null, changes, item) show `item` moved: {offset, turns, centre}; changes as for commit
 * @param {Function} o.commit  (changes, item) apply {x, y} | {pos, elev} | {rot} to `item` (the piece the drag began on) for good
 */
export function drawGizmo(wrap, o) {
  if (overlay?.drag) { // mid-drag: the drag owns the overlay; a redraw only needs the piece put back where it's being dragged
    if (overlay.drag.result) o.preview(overlay.drag.result.xf, overlay.drag.result.changes, overlay.drag.item);
    return;
  }
  let svg = wrap.querySelector(':scope > svg.t6-gizmo');
  const item = o.sel?.kind === 'item' ? o.kit?.items[o.sel.index] : null;
  const def = item && CATALOG[item.type];
  const box = def && o.project ? itemBox(o.faces || [], o.sel.index) : null;
  if (!box) { svg?.remove(); return; }
  if (!svg) {
    svg = el('svg', { class: 't6-gizmo', 'aria-hidden': 'true' });
    wrap.append(svg);
  }
  overlay = { svg, drag: null };
  // cover the stage exactly
  const sr = o.stage.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  Object.assign(svg.style, { left: `${sr.left - wr.left}px`, top: `${sr.top - wr.top}px`, width: `${sr.width}px`, height: `${sr.height}px` });
  svg.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
  svg.replaceChildren();
  const toLocal = (p) => ({ x: p.x - sr.left, y: p.y - sr.top });
  const s = 10 / (o.kit.scale || 12); // model mm per real cm
  const wall = def.placement === 'wall' ? (item.wall || 'back') : null;
  const axes = axesFor(wall);
  const [iw, , ih] = itemSize(item.type, itemParams(item));
  svg.dataset.size = JSON.stringify(wall ? [iw, ih] : [footprint(item).x1 - footprint(item).x0, footprint(item).y1 - footprint(item).y0]);
  // the handles' origin: the middle of the piece's foot, or of its face on the wall
  const origin = wall ? [...box.centre] : [box.centre[0], box.centre[1], box.min[2]];
  if (wall) { if (wall === 'back') origin[1] = box.min[1]; else if (wall === 'left') origin[0] = box.max[0]; else origin[0] = box.min[0]; }
  const O = o.project(origin);
  const screenAxis = (u) => sub(o.project(origin.map((v, i) => v + u[i] * 100)), O); // px per 100 mm
  const sa = Object.fromEntries(Object.entries(axes).map(([k, u]) => [k, screenAxis(u)]));
  if (Object.values(sa).some((v) => !Number.isFinite(v.x) || len(v) < 1e-6)) { svg.replaceChildren(); return; }
  const unit = (v) => ({ x: v.x / len(v), y: v.y / len(v) });
  const lo = toLocal(O);
  const guides = el('g', { class: 'gizmo-guides' }, svg);

  // ------------------------------------------------------------ drag logic
  const start = wall ? { pos: item.pos ?? 0, elev: item.elev ?? 0 } : { x: item.x ?? 0, y: item.y ?? 0, rot: Number(item.rot) || 0 };
  const index = o.sel.index;
  const toWorld = (changes) => { // kit change → world offset (mm) from where the piece started
    if (wall) {
      const d = [(changes.pos - start.pos) * s, (changes.elev - start.elev) * s];
      return axes.pos.map((v, i) => v * d[0] + axes.up[i] * d[1]);
    }
    return [(changes.x - start.x) * s, -(changes.y - start.y) * s, 0];
  };
  const drawGuides = (list) => {
    guides.replaceChildren();
    for (const g of list) {
      let a, b;
      if (g.axis === 'x' || g.axis === 'y') { // on the floor, in plan cm → world
        const X = (cm) => box.min[0] + (cm - start.x) * s, Y = (cm) => box.max[1] - (cm - start.y) * s, z = box.min[2];
        if (g.axis === 'x') { a = [X(g.at), Y(g.from), z]; b = [X(g.at), Y(g.to), z]; } else { a = [X(g.from), Y(g.at), z]; b = [X(g.to), Y(g.at), z]; }
      } else { // on the wall: pos / elev in cm → world
        const P = (cm) => origin.map((v, i) => v + axes.pos[i] * (cm - start.pos) * s);
        const E = (cm) => (cm - start.elev) * s;
        if (g.axis === 'pos') { const p = P(g.at); a = [p[0], p[1], origin[2] + E(g.from)]; b = [p[0], p[1], origin[2] + E(g.to)]; } else {
          const p0 = P(g.from), p1 = P(g.to); a = [p0[0], p0[1], origin[2] + E(g.at)]; b = [p1[0], p1[1], origin[2] + E(g.at)];
        }
      }
      const A = toLocal(o.project(a)), B = toLocal(o.project(b));
      el('line', { class: `gizmo-guide ${g.kind}`, x1: A.x, y1: A.y, x2: B.x, y2: B.y }, guides);
    }
  };
  const begin = (ev, name) => {
    ev.preventDefault();
    ev.stopPropagation();
    const h = ev.currentTarget;
    h.setPointerCapture?.(ev.pointerId);
    overlay.drag = { name, x0: ev.clientX, y0: ev.clientY, result: null, item };
    svg.classList.add('dragging');
    h.classList.add('active');
    const move = (mv) => {
      const d = { x: mv.clientX - overlay.drag.x0, y: mv.clientY - overlay.drag.y0 };
      if (!overlay.drag.result && Math.hypot(d.x, d.y) < 3) return; // a click, or a wobble, isn't a move
      const free = mv.altKey || !o.grid; // Alt, or Snap set to Off
      let res;
      if (name === 'rot') {
        const ring = JSON.parse(h.dataset.ring);
        const ang = (p) => Math.atan2((p.y - ring.cy) / ring.ry, (p.x - ring.cx) / ring.rx);
        let deg = ((ang({ x: mv.clientX, y: mv.clientY }) - ang({ x: overlay.drag.x0, y: overlay.drag.y0 })) * 180) / Math.PI;
        deg = ((deg + 540) % 360) - 180;
        const ccw = sa.x.x * sa.y.y - sa.x.y * sa.y.x < 0 ? 1 : -1; // world x→(−y) seen on screen
        const rot = snapRotation(start.rot, deg * ccw);
        const turns = (((rot - start.rot) / 90) % 4 + 4) % 4;
        res = { changes: { rot }, xf: { turns, centre: box.centre, offset: [0, 0, 0] }, guides: [] };
      } else {
        const solve1 = (k) => { const v = sa[k]; return ((d.x * v.x + d.y * v.y) / (len(v) ** 2)) * 100 / s; }; // cm along the axis
        const solve2 = (k1, k2) => { // cm along two axes whose screen vectors span the drag
          const a = sa[k1], b = sa[k2], det = a.x * b.y - a.y * b.x;
          if (Math.abs(det) < 1e-9) return [solve1(k1), solve1(k2)];
          return [((d.x * b.y - d.y * b.x) / det) * 100 / s, ((a.x * d.y - a.y * d.x) / det) * 100 / s];
        };
        const pxPerCm = len(sa[wall ? 'pos' : 'x']) / 100 * s;
        const reach = REACH_PX / pxPerCm;
        const opts = { grid: free ? 0 : o.grid, reach, free };
        if (!wall) {
          const [dx, dy] = name === 'xy' ? solve2('x', 'y') : name === 'x' ? [solve1('x'), 0] : [0, solve1('y')];
          const r = snapFloorMove(o.kit, index, start.x + dx, start.y + dy, opts);
          const changes = { x: name === 'y' ? start.x : r.x, y: name === 'x' ? start.y : r.y };
          res = { changes, xf: { offset: toWorld(changes) }, guides: r.guides.filter((g) => name === 'xy' || g.axis === name) };
        } else {
          const [dp, de] = name === 'plane' ? solve2('pos', 'up') : name === 'pos' ? [solve1('pos'), 0] : [0, solve1('up')];
          const r = snapWallMove(o.kit, o.sel, start.pos + dp, start.elev + de, { ...opts, w: iw, h: ih });
          const changes = { pos: name === 'up' ? start.pos : r.pos, elev: name === 'pos' ? start.elev : r.elev };
          res = { changes, xf: { offset: toWorld(changes) }, guides: r.guides.filter((g) => name === 'plane' || g.axis === (name === 'up' ? 'elev' : 'pos')) };
        }
      }
      overlay.drag.result = res;
      o.preview(res.xf, res.changes, item);
      drawGuides(res.guides);
      // the handles ride along with the piece
      const off = toLocal(o.project(origin.map((v, i) => v + (res.xf.offset?.[i] || 0))));
      handles.setAttribute('transform', `translate(${off.x - lo.x} ${off.y - lo.y})`);
    };
    const end = (ev) => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', end);
      h.removeEventListener('pointercancel', end);
      const res = overlay.drag?.result;
      overlay.drag = null;
      svg.classList.remove('dragging');
      guides.replaceChildren();
      if (res && ev.type === 'pointerup') o.commit(res.changes, item); else o.preview(null, null, item); // a cancelled drag puts it back
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  };

  // --------------------------------------------------------------- drawing
  const handles = el('g', { class: 'gizmo-handles' }, svg);
  const handle = (name, cls) => {
    const g = el('g', { class: `gizmo-handle ${cls}`, 'data-handle': name }, handles);
    g.addEventListener('pointerdown', (ev) => begin(ev, name));
    // a finger on a handle drags it: never let the browser take the touch to
    // scroll or zoom the page (that cancels the pointer and drops the drag)
    g.addEventListener('touchstart', (ev) => ev.preventDefault(), { passive: false });
    return g;
  };
  // rotate ring (floor pieces): a circle on the floor round the piece, drawn first so arrows sit on top
  if (!wall) {
    const pxPerMm = len(sa.x) / 100;
    const R = Math.max(Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1]) / 2 * 1.12, (ARROW * 0.8) / pxPerMm); // never tiny on screen
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(toLocal(o.project([origin[0] + Math.cos(a) * R, origin[1] + Math.sin(a) * R, origin[2]])));
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const g = handle('rot', 'ring');
    const d = 'M' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L') + 'Z';
    el('path', { class: 'hit', d }, g);
    el('path', { class: 'line', d }, g);
    // knob at the back left of the ring, away from the arrows (which point right and to the front)
    const k = toLocal(o.project([origin[0] - Math.SQRT1_2 * R, origin[1] + Math.SQRT1_2 * R, origin[2]]));
    el('circle', { class: 'hit-knob', cx: k.x, cy: k.y, r: 14 }, g); // finger-sized target round the small knob
    el('circle', { class: 'knob', cx: k.x, cy: k.y, r: 7 }, g);
    el('path', { class: 'glyph', d: `M${k.x - 3.5} ${k.y - 1}a3.5 3.5 0 1 1 1 3.2`, 'pointer-events': 'none' }, g);
    const ring = { cx: sr.left + (Math.min(...xs) + Math.max(...xs)) / 2, cy: sr.top + (Math.min(...ys) + Math.max(...ys)) / 2, rx: (Math.max(...xs) - Math.min(...xs)) / 2, ry: Math.max(1, (Math.max(...ys) - Math.min(...ys)) / 2) };
    g.dataset.ring = JSON.stringify(ring);
  }
  // plane square, between the two arrows
  {
    const [k1, k2] = wall ? ['pos', 'up'] : ['x', 'y'];
    const u1 = unit(sa[k1]), u2 = unit(sa[k2]);
    const at = (a, b) => ({ x: lo.x + u1.x * a + u2.x * b, y: lo.y + u1.y * a + u2.y * b });
    const q = [at(14, 14), at(34, 14), at(34, 34), at(14, 34)];
    const g = handle(wall ? 'plane' : 'xy', 'plane');
    const c = at(24, 24);
    el('circle', { class: 'hit-knob', cx: c.x, cy: c.y, r: 14 }, g);
    el('path', { class: 'knob', d: 'M' + q.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L') + 'Z' }, g);
  }
  // arrows
  for (const [name, v] of Object.entries(sa)) {
    const u = unit(v);
    const tip = { x: lo.x + u.x * ARROW, y: lo.y + u.y * ARROW };
    const g = handle(name, `arrow ${AXIS_CLASS[name]}`);
    g.dataset.pxPerCm = JSON.stringify([(v.x / 100) * s, (v.y / 100) * s]);
    el('line', { class: 'hit', x1: lo.x, y1: lo.y, x2: tip.x, y2: tip.y }, g);
    el('circle', { class: 'hit-knob', cx: tip.x, cy: tip.y, r: 14 }, g);
    el('line', { class: 'line', x1: lo.x + u.x * 10, y1: lo.y + u.y * 10, x2: tip.x - u.x * 7, y2: tip.y - u.y * 7 }, g);
    el('circle', { class: 'knob', cx: tip.x, cy: tip.y, r: 7 }, g);
    const n = { x: -u.y, y: u.x }; // a small chevron in the knob, pointing the way it moves
    el('path', { class: 'glyph', 'pointer-events': 'none', d: `M${tip.x - u.x * 2 + n.x * 3} ${tip.y - u.y * 2 + n.y * 3}L${tip.x + u.x * 2.5} ${tip.y + u.y * 2.5}L${tip.x - u.x * 2 - n.x * 3} ${tip.y - u.y * 2 - n.y * 3}` }, g);
  }
  el('circle', { class: 'gizmo-origin', cx: lo.x, cy: lo.y, r: 3 }, handles);
}

/** Remove the handles (e.g. leaving the 3D view). */
export function clearGizmo(wrap) {
  if (overlay?.drag) return;
  wrap?.querySelector(':scope > svg.t6-gizmo')?.remove();
}
