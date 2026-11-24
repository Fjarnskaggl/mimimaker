// 2D geometry helpers. Panel coordinates are in millimetres, y pointing up.

/**
 * An edge profile describes how a straight panel edge deviates from the
 * nominal rectangle. It is a list of segments {a0, a1, d} that cover the
 * edge from 0 to its length L, where d is the inward depth of the material
 * boundary along that segment (0 = on the nominal edge, t = notched in by the
 * material thickness, negative = a tab protruding outward).
 */
export function profilePlain(L) {
  return [{ a0: 0, a1: L, d: 0 }];
}

/** Odd number of finger segments of roughly `fingerWidth` along an edge. */
export function fingerCount(L, fingerWidth) {
  let n = Math.floor(L / fingerWidth);
  if (n % 2 === 0) n -= 1;
  return Math.max(1, n);
}

/**
 * Finger-joint profile. Both mating panels use the same `n`; the panel with
 * `keepEnds` keeps the even segments (including both corners), its partner
 * keeps the odd ones, so the two edges interlock exactly.
 */
export function profileFingers(L, t, n, keepEnds) {
  const seg = L / n;
  const out = [];
  for (let k = 0; k < n; k++) {
    const kept = (k % 2 === 0) === keepEnds;
    out.push({ a0: k * seg, a1: (k + 1) * seg, d: kept ? 0 : t });
  }
  return out;
}

/**
 * Where the tabs go on a jointed edge. Like store-bought miniature house kits,
 * an edge gets as few tabs as hold it square instead of a comb of fingers:
 * one in the middle of a short edge, two near the corners of a medium one (so
 * the joint can't rack), and a third in the middle of a long one (so it can't
 * bow). Tabs widen with the edge (about 12 % of it, from `fingerWidth` up to
 * three times that) and no segment is narrower than `fingerWidth`, so there
 * are no slivers for a blade to tear. An edge shorter than three finger widths
 * gets no tab at all: one panel sits in a plain notch along the other.
 *
 * Returns an odd number of segments {a0, a1, tab} covering 0…L; the tabs are
 * the odd ones. The higher-ranked panel keeps the even segments (and so both
 * corners), its partner keeps the tabs (see profileJoint).
 */
export function jointSegments(L, fingerWidth, edge = 0) {
  // `edge`: how much of each end the panel at the corner takes away (the
  // board thickness), so the strip either side of a tab stays fw wide
  const fw = fingerWidth, e = fw + edge;
  if (L < 3 * fw + 2 * edge) return [{ a0: 0, a1: L, tab: false }];
  let k = L < 60 ? 1 : L <= 160 ? 2 : 3;
  let w = Math.min(Math.max(0.12 * L, fw), 3 * fw);
  while (k > 1 && L < k * w + (k - 1) * fw + 2 * e) k--;
  const cuts = [];
  if (k === 1) {
    w = Math.min(w, L / 3, L - 2 * e);
    cuts.push((L - w) / 2);
  } else {
    // outer tabs centred ~20 % in from each corner, the rest spread between
    const end = Math.min(Math.max(e, 0.2 * L - w / 2), (L - k * w - (k - 1) * fw) / 2);
    const gap = (L - 2 * end - k * w) / (k - 1);
    for (let i = 0; i < k; i++) cuts.push(end + i * (w + gap));
  }
  const segs = [];
  let a = 0;
  for (const c of cuts) {
    segs.push({ a0: a, a1: c, tab: false }, { a0: c, a1: c + w, tab: true });
    a = c + w;
  }
  segs.push({ a0: a, a1: L, tab: false });
  return segs;
}

/** Edge profile for one side of a sparse joint; `keepEnds` = the higher-ranked panel. */
export function profileJoint(segs, t, keepEnds) {
  return segs.map(({ a0, a1, tab }) => ({ a0, a1, d: tab === keepEnds ? t : 0 }));
}

/** Narrowest segment of a jointed edge (for the blade-size warning). */
export function narrowestSegment(segs) {
  return Math.min(...segs.map((s) => s.a1 - s.a0));
}

/** `count` evenly spaced tabs protruding by `t` (used for shelves). */
export function profileTabs(L, t, count = 2) {
  const n = 2 * count + 1;
  const seg = L / n;
  const out = [];
  for (let k = 0; k < n; k++) out.push({ a0: k * seg, a1: (k + 1) * seg, d: k % 2 === 1 ? -t : 0 });
  return out;
}

/**
 * Build the closed outline of a w×h panel from four edge profiles, ordered
 * bottom, right, top, left (counter-clockwise). Corner points are resolved
 * from the depths of the two edges meeting there.
 */
export function panelOutline(w, h, edges) {
  const frames = [
    { o: [0, 0], dir: [1, 0], n: [0, 1], L: w },
    { o: [w, 0], dir: [0, 1], n: [-1, 0], L: h },
    { o: [w, h], dir: [-1, 0], n: [0, -1], L: w },
    { o: [0, h], dir: [0, -1], n: [1, 0], L: h },
  ];
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const f = frames[i];
    const prof = edges[i];
    const prev = edges[(i + 3) % 4];
    const next = edges[(i + 1) % 4];
    const dPrev = prev[prev.length - 1].d;
    const dNext = next[0].d;
    prof.forEach((s, k) => {
      const a0 = k === 0 ? dPrev : s.a0;
      const a1 = k === prof.length - 1 ? f.L - dNext : s.a1;
      for (const a of [a0, a1]) {
        pts.push([f.o[0] + f.dir[0] * a + f.n[0] * s.d, f.o[1] + f.dir[1] * a + f.n[1] * s.d]);
      }
    });
  }
  return cleanPolygon(pts);
}

const close = (a, b, eps = 1e-7) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

/** Remove duplicate and collinear vertices from a closed polygon. */
export function cleanPolygon(pts, eps = 1e-7) {
  let out = [];
  for (const p of pts) if (!out.length || !close(out[out.length - 1], p, eps)) out.push(p);
  while (out.length > 1 && close(out[0], out[out.length - 1], eps)) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < eps) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Area of a part: outer loop minus holes. */
export function partArea(polys) {
  const [outer, ...holes] = polys;
  return Math.abs(polygonArea(outer)) - holes.reduce((s, h) => s + Math.abs(polygonArea(h)), 0);
}

export function rectPoly(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

export function ellipsePoly(cx, cy, rx, ry, seg = 48) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/**
 * Rectangle with a rounded (semicircular when r = w/2) top. Points are CCW
 * starting at bottom-left: BL, BR, right-top, arc…, left-top.
 */
export function archPoly(x, y, w, h, r = w / 2, seg = 24) {
  r = Math.max(0, Math.min(r, w / 2, h));
  if (r < 1e-6) return rectPoly(x, y, w, h);
  const pts = [[x, y], [x + w, y]];
  const top = y + h - r;
  // right corner arc then straight top then left corner arc
  const arc = (cx, cy, a0, a1) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  arc(x + w - r, top, 0, Math.PI / 2);
  arc(x + r, top, Math.PI / 2, Math.PI);
  return cleanPolygon(pts);
}

export function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function translatePolys(polys, dx, dy) {
  return polys.map((p) => p.map(([x, y]) => [x + dx, y + dy]));
}

export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToPolys(p, polys) {
  let d = Infinity;
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return d;
}

/**
 * Join loose segments [[a,b], …] into closed loops by matching endpoints.
 */
export function chainSegments(segs) {
  const key = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const byPoint = new Map();
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = key(p);
      if (!byPoint.has(k)) byPoint.set(k, []);
      byPoint.get(k).push(i);
    }
  });
  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const start = segs[i][0];
    const loop = [start];
    let cur = segs[i][1];
    let guard = 0;
    while (key(cur) !== key(start) && guard++ < segs.length + 1) {
      loop.push(cur);
      const next = (byPoint.get(key(cur)) || []).find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = true;
      const [a, b] = segs[next];
      cur = key(a) === key(cur) ? b : a;
    }
    loops.push(cleanPolygon(loop, 1e-6));
  }
  return loops;
}
