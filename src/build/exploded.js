// Exploded views: one picture per build step, drawn with the existing SVG
// renderer (preview3d.js renderScene). Parts built in earlier steps sit in
// place, the step's own parts are pulled apart along the way they go on, and
// later parts are left out.
//
// compiled.faces3d carries no part ids, so faceParts() matches each 3D face
// to the part it was made from: same outline (area, perimeter, holes) within
// the same item, in creation order. Faces of a fold-up card net have their own
// rectangles, so those inherit the unmatched net made next to them.

import { renderScene } from '../preview3d.js';
import { jointGraph, itemGroups } from './joints.js';
import { buildSteps } from './steps.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return l > 1e-9 ? mul(a, 1 / l) : [0, 0, 0]; };
const mean = (pts) => mul(pts.reduce(add, [0, 0, 0]), 1 / Math.max(1, pts.length));

const perim = (poly, d) => poly.reduce((s, p, i) => s + d(p, poly[(i + 1) % poly.length]), 0);
const d2 = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const d3 = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
const area2 = (poly) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const area3 = (poly) => {
  let c = [0, 0, 0];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    c = add(c, [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]);
  });
  return Math.hypot(...c) / 2;
};
const sig2 = (polys) => ({ a: area2(polys[0]), p: perim(polys[0], d2), h: polys.length });
const sig3 = (polys) => ({ a: area3(polys[0]), p: perim(polys[0], d3), h: polys.length });
const same = (s, t) => s.h === t.h && Math.abs(s.a - t.a) <= 0.5 + 0.002 * s.a && Math.abs(s.p - t.p) <= 0.5;

/** For each face in compiled.faces3d, the id of the part it shows (or null for LED glows). */
export function faceParts(kit, compiled) {
  const faces = compiled.faces3d;
  const owner = faces.map(() => null);
  const groupOfItem = new Map();
  for (const [g, { item }] of itemGroups(kit, compiled)) groupOfItem.set(kit.items.indexOf(item), g.title);
  const itemTitles = new Set(groupOfItem.values());
  const pool = (face) => (face.item != null && groupOfItem.has(face.item)
    ? compiled.parts.filter((p) => p.group === groupOfItem.get(face.item))
    : compiled.parts.filter((p) => !itemTitles.has(p.group)));
  const sigs = new Map(compiled.parts.map((p) => [p.id, sig2(p.polys)]));
  const used = new Set();

  // 1. exact matches by shape, in order
  faces.forEach((f, k) => {
    if (f.glow) return;
    const s = sig3(f.polys);
    const p = pool(f).find((q) => !used.has(q.id) && same(sigs.get(q.id), s));
    if (p) { owner[k] = p.id; used.add(p.id); }
  });

  // 2. runs of unmatched faces (card nets, card room walls) take the unmatched
  //    parts between their matched neighbours: one each if the counts agree,
  //    else all go to the first
  const key = (f) => (f.item != null && groupOfItem.has(f.item) ? `i${f.item}` : 's');
  const classes = new Map();
  faces.forEach((f, k) => { if (!f.glow) { const c = key(f); if (!classes.has(c)) classes.set(c, []); classes.get(c).push(k); } });
  for (const ks of classes.values()) {
    const cand = pool(faces[ks[0]]).filter((p) => !used.has(p.id));
    let i = 0;
    while (i < ks.length) {
      if (owner[ks[i]] != null) { i++; continue; }
      let j = i;
      while (j < ks.length && owner[ks[j]] == null) j++;
      const lo = i > 0 ? owner[ks[i - 1]] : -Infinity;
      const hi = j < ks.length ? owner[ks[j]] : Infinity;
      let window = cand.filter((p) => p.id > lo && p.id < hi && !used.has(p.id));
      if (!window.length) window = cand.filter((p) => !used.has(p.id));
      if (!window.length) window = cand;
      const run = ks.slice(i, j);
      run.forEach((k, r) => { owner[k] = (window.length === run.length ? window[r] : window[0])?.id ?? null; });
      if (window.length === run.length) window.forEach((p) => used.add(p.id));
      else if (window[0]) used.add(window[0].id);
      i = j;
    }
  }
  return owner;
}

/**
 * Faces for step `n`'s exploded view: [{ source, polys, n, color, opacity, part, moving, offset }]
 * (source is the original face3d). Empty for steps with nothing to draw.
 */
export function explodedFaces(kit, compiled, steps = buildSteps(kit, compiled), n, graph = jointGraph(kit, compiled)) {
  const step = steps.find((s) => s.n === n);
  if (!step || step.kind === 'info') return [];
  const owner = faceParts(kit, compiled);
  const builtAt = new Map();
  for (const s of steps) for (const id of s.parts) builtAt.set(id, s.n);
  // a place step moves the whole piece (built in earlier steps)
  const movingIds = new Set(step.kind === 'place'
    ? compiled.parts.filter((p) => p.group === step.group).map((p) => p.id)
    : step.parts);
  // furniture is built on the bench: zoom in on the piece, without the room
  const bench = step.kind === 'build' && [...itemGroups(kit, compiled).keys()].some((g) => g.title === step.group);
  const groupOf = new Map(compiled.parts.map((p) => [p.id, p.group]));
  const faces = [];
  compiled.faces3d.forEach((f, k) => {
    const id = owner[k];
    if (id == null || (bench && groupOf.get(id) !== step.group)) return;
    const at = builtAt.get(id);
    if (movingIds.has(id)) faces.push({ source: f, part: id, moving: true });
    else if (at != null && at < n) faces.push({ source: f, part: id, moving: false });
  });
  const moving = faces.filter((f) => f.moving);
  if (!moving.length) return [];

  // bounding-box centres: vertex means lean towards the finger-jointed edges
  const centre = (fs) => {
    const pts = fs.flatMap((f) => f.source.polys[0]);
    const lo = pts.reduce((a, p) => a.map((v, i) => Math.min(v, p[i])), [Infinity, Infinity, Infinity]);
    const hi = pts.reduce((a, p) => a.map((v, i) => Math.max(v, p[i])), [-Infinity, -Infinity, -Infinity]);
    return mul(add(lo, hi), 0.5);
  };
  const facesOf = (id) => faces.filter((f) => f.part === id);
  const span = (fs) => {
    const pts = fs.flatMap((f) => f.source.polys[0]);
    const lo = pts.reduce((a, p) => a.map((v, i) => Math.min(v, p[i])), [Infinity, Infinity, Infinity]);
    const hi = pts.reduce((a, p) => a.map((v, i) => Math.max(v, p[i])), [-Infinity, -Infinity, -Infinity]);
    return Math.max(...sub(hi, lo));
  };
  const gap = Math.max(8, 0.35 * span(moving));
  const partnersOf = (id) => graph.joints.filter((j) => j.a === id || j.b === id).map((j) => (j.a === id ? j.b : j.a));
  const offsets = new Map();

  if (step.kind === 'place') {
    // away from the room face it's glued to, along that face's normal
    const pj = graph.joints.find((j) => j.note === 'place in room' && movingIds.has(j.a));
    const target = pj ? facesOf(pj.b)[0]?.source : null;
    let dir = target ? target.n : [0, 0, 1];
    if (target && dot(sub(centre(moving), centre([{ source: target }])), dir) < 0) dir = mul(dir, -1);
    for (const id of movingIds) offsets.set(id, mul(norm(dir), gap));
  } else {
    const inStep = new Set(step.parts);
    const unitFaces = faces.filter((f) => f.moving || graph.nodes.find((x) => x.id === f.part)?.unit === step.unit);
    const mid = centre(unitFaces);
    for (const id of movingIds) {
      const mine = facesOf(id);
      if (!mine.length) continue;
      const c = centre(mine);
      const nrm = mine[0].source.n;
      const partners = partnersOf(id);
      const boxed = partners.some((q) => inStep.has(q)) || unitFaces.length > mine.length;
      let dir;
      if (boxed) {
        // a box comes apart from its middle; parts that slot into it (shelves) or lie
        // across it slide out of the open front
        const along = dot(sub(c, mid), nrm);
        const size = span(mine);
        const slides = graph.joints.some((j) => j.kind === 'slot' && (j.a === id || j.b === id) && !inStep.has(j.a === id ? j.b : j.a));
        dir = !slides && Math.abs(along) > 0.15 * size ? mul(nrm, Math.sign(along)) : [0, -1, 0];
      } else {
        // a part glued onto something already built comes off along its face
        const built = partners.map(facesOf).flat();
        const q = built.length ? centre(built) : mid;
        dir = dot(sub(c, q), nrm) < 0 ? mul(nrm, -1) : nrm;
      }
      offsets.set(id, mul(norm(dir), gap));
    }
  }

  return faces.map((f) => {
    const offset = (f.moving && offsets.get(f.part)) || [0, 0, 0];
    return {
      ...f.source,
      source: f.source,
      part: f.part,
      moving: f.moving,
      offset,
      polys: f.source.polys.map((poly) => poly.map((p) => add(p, offset))),
      opacity: f.moving ? f.source.opacity : Math.min(f.source.opacity, 0.45),
      layer: f.moving ? Math.max(2, f.source.layer) : f.source.layer,
      item: null,
    };
  });
}

/** The step's exploded view as an SVG string, or null when there's nothing to draw. */
export function explodedViewSVG(kit, compiled, steps = buildSteps(kit, compiled), n, opts = {}) {
  const faces = explodedFaces(kit, compiled, steps, n, opts.graph);
  if (!faces.some((f) => f.moving)) return null;
  const step = steps.find((s) => s.n === n);
  const svg = renderScene(faces, { yaw: opts.yaw ?? -32, pitch: opts.pitch ?? 26 });
  return svg
    .replace('class="scene-svg"', 'class="scene-svg exploded"')
    .replace(/aria-label="[^"]*"/, `aria-label="Exploded view of step ${n}: ${String(step.title).replace(/[&<>"]/g, '')}"`);
}
