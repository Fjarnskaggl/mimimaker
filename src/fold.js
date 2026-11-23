// Fold-up nets with glue tabs for thin materials (cardstock, paper).
//
// The present faces of a box are unfolded by walking a spanning tree of the
// face adjacency graph from a base face. Tree edges become score (fold)
// lines; every other edge between two present faces gets a glue tab on one
// side. With `separate: true` every face becomes its own piece with tabs,
// which is used when a full net would not fit the cutting mat.

import { RANK } from './box.js';
import { chainSegments, cleanPolygon } from './geometry.js';

const CORNERS = {
  bottom: (W, D, H) => [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]],
  top: (W, D, H) => [[0, 0, H], [W, 0, H], [W, D, H], [0, D, H]],
  front: (W, D, H) => [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]],
  back: (W, D, H) => [[0, D, 0], [W, D, 0], [W, D, H], [0, D, H]],
  left: (W, D, H) => [[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]],
  right: (W, D, H) => [[W, 0, 0], [W, D, 0], [W, D, H], [W, 0, H]],
};
const BASE_ORDER = ['bottom', 'top', 'back', 'front', 'left', 'right'];
const VISIT_ORDER = ['back', 'front', 'left', 'right', 'top', 'bottom'];

const k3 = (c) => c.join(',');
const edgeKey = (a, b) => [k3(a), k3(b)].sort().join('|');
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const norm = (a) => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
const centroid = (pts) => mul(pts.reduce((s, p) => add(s, p), [0, 0]), 1 / pts.length);

/** Trapezoid glue tab on edge a→b, pointing away from `inside`. */
export function tabPoints(a, b, inside, tabWidth) {
  const e = sub(b, a);
  const L = Math.hypot(e[0], e[1]);
  const dir = norm(e);
  let n = [-dir[1], dir[0]];
  const m = mul(add(a, b), 0.5);
  if ((inside[0] - m[0]) * n[0] + (inside[1] - m[1]) * n[1] > 0) n = mul(n, -1);
  const h = Math.min(tabWidth, L * 0.45);
  const inset = Math.min(h, L * 0.25);
  return [a, add(add(a, mul(n, h)), mul(dir, inset)), add(add(b, mul(n, h)), mul(dir, -inset)), b];
}

/** Map a point in face (u,v) coordinates onto the placed 2D face. */
function mapper(P, a, b) {
  const du = sub(P[1], P[0]), dv = sub(P[3], P[0]);
  return ([u, v]) => add(P[0], add(mul(du, u / a), mul(dv, v / b)));
}

/**
 * @returns {{pieces: {faces: string[], polys: number[][][], scores: number[][][]}[]}}
 */
export function foldNet({ W, D, H, faces, tabWidth = 5, separate = false, holes = {}, scores = {} }) {
  const present = new Set(faces);
  const corners = {};
  for (const f of faces) corners[f] = CORNERS[f](W, D, H);

  const edgeFaces = new Map();
  for (const f of faces) for (let i = 0; i < 4; i++) {
    const k = edgeKey(corners[f][i], corners[f][(i + 1) % 4]);
    if (!edgeFaces.has(k)) edgeFaces.set(k, []);
    edgeFaces.get(k).push(f);
  }
  const shared = (f, g) => {
    for (let i = 0; i < 4; i++) {
      const k = edgeKey(corners[f][i], corners[f][(i + 1) % 4]);
      if (edgeFaces.get(k).includes(g)) return { i, k };
    }
    return null;
  };

  const pos = {}, depth = {}, tree = new Set();
  const unvisited = new Set(faces);
  const groups = [];
  while (unvisited.size) {
    const base = BASE_ORDER.find((f) => unvisited.has(f));
    unvisited.delete(base);
    const C = corners[base];
    const a = dist3(C[0], C[1]), b = dist3(C[0], C[3]);
    pos[base] = [[0, 0], [a, 0], [a, b], [0, b]];
    depth[base] = 0;
    const group = [base];
    const queue = [base];
    while (queue.length && !separate) {
      const f = queue.shift();
      for (const g of VISIT_ORDER) {
        if (!unvisited.has(g)) continue;
        const s = shared(f, g);
        if (!s) continue;
        unvisited.delete(g);
        // place g against edge s.i of f
        const P = pos[f];
        const ip = s.i, iq = (s.i + 1) % 4;
        const p2 = P[ip], q2 = P[iq];
        const Cg = corners[g];
        const jp = Cg.findIndex((c) => k3(c) === k3(corners[f][ip]));
        const jq = Cg.findIndex((c) => k3(c) === k3(corners[f][iq]));
        const jr = [0, 1, 2, 3].find((j) => j !== jp && j !== jq && (Math.abs(j - jq) === 1 || Math.abs(j - jq) === 3));
        const js = [0, 1, 2, 3].find((j) => j !== jp && j !== jq && j !== jr);
        const h = dist3(Cg[js], Cg[jp]);
        const e = norm(sub(q2, p2));
        let n = [-e[1], e[0]];
        const c = centroid(P);
        if ((c[0] - p2[0]) * n[0] + (c[1] - p2[1]) * n[1] > 0) n = mul(n, -1);
        const Pg = [];
        Pg[jp] = p2;
        Pg[jq] = q2;
        Pg[jr] = add(q2, mul(n, h));
        Pg[js] = add(p2, mul(n, h));
        pos[g] = Pg;
        depth[g] = depth[f] + 1;
        tree.add(s.k);
        group.push(g);
        queue.push(g);
      }
    }
    groups.push(group);
  }

  const tabOwner = (f, g) => {
    if (depth[f] !== depth[g]) return depth[f] > depth[g] ? f : g;
    if (RANK[f] !== RANK[g]) return RANK[f] < RANK[g] ? f : g;
    return f < g ? f : g;
  };

  const pieces = groups.map((group) => {
    const cut = [], score = [], holePolys = [];
    const scored = new Set();
    for (const f of group) {
      const P = pos[f];
      const C = corners[f];
      const c = centroid(P);
      for (let i = 0; i < 4; i++) {
        const a = P[i], b = P[(i + 1) % 4];
        const k = edgeKey(C[i], C[(i + 1) % 4]);
        if (tree.has(k)) {
          if (!scored.has(k)) { score.push([a, b]); scored.add(k); }
          continue;
        }
        const other = edgeFaces.get(k).find((g) => g !== f && present.has(g));
        if (other && tabOwner(f, other) === f) {
          const tp = tabPoints(a, b, c, tabWidth);
          for (let j = 0; j < tp.length - 1; j++) cut.push([tp[j], tp[j + 1]]);
          score.push([a, b]);
        } else {
          cut.push([a, b]);
        }
      }
      const fa = dist3(C[0], C[1]), fb = dist3(C[0], C[3]);
      const map = mapper(P, fa, fb);
      for (const hole of holes[f] || []) holePolys.push(hole.map(map));
      for (const [p, q] of scores[f] || []) score.push([map(p), map(q)]);
    }
    const loops = chainSegments(cut);
    return { faces: group, polys: [...loops, ...holePolys], scores: score };
  });
  return { pieces };
}

/** A flat w×h piece with glue tabs on the flagged edges [bottom, right, top, left]. */
export function tabbedRect(w, h, tabEdges, tabWidth = 5) {
  const P = [[0, 0], [w, 0], [w, h], [0, h]];
  const c = [w / 2, h / 2];
  const cut = [], score = [];
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4];
    if (tabEdges[i]) {
      const tp = tabPoints(a, b, c, tabWidth);
      for (let j = 0; j < tp.length - 1; j++) cut.push([tp[j], tp[j + 1]]);
      score.push([a, b]);
    } else cut.push([a, b]);
  }
  return { polys: chainSegments(cut).map((l) => cleanPolygon(l)), scores: score };
}
