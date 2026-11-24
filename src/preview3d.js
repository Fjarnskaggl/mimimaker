// Lightweight orthographic 3D preview rendered as SVG.
//
// Faces are drawn back to front. The room shell, wall/floor overlays and
// lights are drawn in fixed layers; furniture faces are ordered by an
// occlusion sort: for every pair whose screen outlines overlap, plane-side
// tests decide which one is behind, and a topological sort turns those
// pairwise answers into a drawing order (falling back to distance only to
// break cycles). This is the classic Newell approach and stays correct for
// interlocking panels where sorting by centre distance gets it wrong.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

function pointInPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  const e = 1e-9;
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}
/** Do two screen-space outlines overlap (more than just touching)? */
function outlinesOverlap(A, B) {
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) if (segmentsCross(a, b, B[j], B[(j + 1) % B.length])) return true;
  }
  const centroid = (P) => P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]);
  return pointInPoly(centroid(A), B) || pointInPoly(centroid(B), A) || A.some((p) => pointInPoly(p, B)) || B.some((p) => pointInPoly(p, A));
}

/**
 * Is face A behind face B as seen from direction `cam` (pointing at the camera)?
 * 1 = A behind B, -1 = A in front of B, 0 = can't tell (coplanar or crossing).
 */
function compareDepth(A, B, cam) {
  const classify = (pts, F) => {
    const s = Math.sign(dot(F.n, cam));
    if (!s) return 'edge';
    let above = 0, below = 0;
    for (const p of pts) {
      const d = (dot(F.n, p) - F.d) * s;
      if (d > 1e-3) above++;
      else if (d < -1e-3) below++;
    }
    if (!above && !below) return 'coplanar';
    if (!above) return 'behind';
    if (!below) return 'front';
    return 'mixed';
  };
  const ab = classify(A.pts, B);
  if (ab === 'behind') return 1;
  if (ab === 'front') return -1;
  const ba = classify(B.pts, A);
  if (ba === 'front') return 1;
  if (ba === 'behind') return -1;
  return 0;
}

/** Order faces back to front using pairwise occlusion, depth as tie-break. */
function occlusionSort(items, cam) {
  const n = items.length;
  const after = items.map(() => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = items[i], B = items[j];
    if (A.bb[2] <= B.bb[0] || B.bb[2] <= A.bb[0] || A.bb[3] <= B.bb[1] || B.bb[3] <= A.bb[1]) continue;
    if (!outlinesOverlap(A.outline, B.outline)) continue;
    const r = compareDepth(A, B, cam);
    if (r === 1) { after[i].push(j); indeg[j]++; } else if (r === -1) { after[j].push(i); indeg[i]++; }
  }
  const done = new Array(n).fill(false);
  const order = [];
  while (order.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || items[i].depth > items[pick].depth)) pick = i;
    if (pick < 0) { // cycle: draw the farthest remaining face
      for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || items[i].depth > items[pick].depth)) pick = i;
    }
    done[pick] = true;
    order.push(items[pick]);
    for (const j of after[pick]) indeg[j]--;
  }
  return order;
}

// Night: surfaces drop to moonlight (dim, slightly blue); lights get halos.
const NIGHT_TINT = [0.34, 0.37, 0.48];
const HALOS = [[4.5, 0.1], [2.6, 0.16]];

function shade(hex, k, tint = [1, 1, 1]) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c, i) => Math.round(Math.min(255, c * k * tint[i])));
  return `rgb(${ch.join(',')})`;
}

/**
 * @param {Array} faces  {layer, polys: [[x,y,z]…][], n, color, opacity, cull}
 * @param {object} view  {yaw, pitch} in degrees; night; selected = item index to outline
 */
export function renderScene(faces, { yaw = -32, pitch = 26, night = false, selected = null, zoom = 1 } = {}) {
  const ya = (yaw * Math.PI) / 180, pa = (pitch * Math.PI) / 180;
  const cam = [Math.sin(ya) * Math.cos(pa), -Math.cos(ya) * Math.cos(pa), Math.sin(pa)];
  const fwd = cam.map((v) => -v);
  const right = normalize(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  const light = normalize([-0.4, -0.8, 1]);
  const proj = (p) => [dot(p, right), -dot(p, up)];

  const drawn = [];
  for (const face of faces) {
    const facing = dot(face.n, cam);
    let opacity = face.opacity;
    let ghost = false;
    if (face.layer < 2 && !face.glow && facing < -1e-6) { ghost = true; opacity = face.layer === 0 ? 0.12 : 0.06; }
    if (face.cull && facing <= 1e-6) continue;
    const c = face.polys[0].reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / face.polys[0].length);
    const k = 0.72 + 0.38 * Math.abs(dot(face.n, light));
    const poly2 = face.polys.map((poly) => poly.map(proj));
    const outline = poly2[0];
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of outline) { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }
    drawn.push({
      face, depth: dot(c, fwd), opacity, ghost, fill: shade(face.color, k, night ? NIGHT_TINT : undefined), poly2, outline, bb,
      pts: face.polys[0], n: face.n, d: dot(face.n, face.polys[0][0]),
    });
    if (night && face.glow && face.opacity >= 1) {
      // concentric halos around each bulb, drawn under it
      for (const [scale, op] of HALOS) {
        const c2 = outline.reduce((sum, p) => [sum[0] + p[0] / outline.length, sum[1] + p[1] / outline.length], [0, 0]);
        drawn.push({ face: { ...face, halo: true }, opacity: op, poly2: [outline.map(([x, y]) => [c2[0] + (x - c2[0]) * scale, c2[1] + (y - c2[1]) * scale])], depth: 0 });
      }
    }
  }
  // fixed layers: room shell, overlays & decor on surfaces, furniture (occlusion
  // sorted), then ghosted walls (so they never hide anything) and lights on top
  const rank = (d) => (d.face.glow ? 4 : d.ghost ? 3 : d.face.layer >= 2 ? 2 : d.face.layer >= 1 ? 1 : 0);
  const byRank = [0, 1, 2, 3, 4].map((r) => drawn.filter((d) => rank(d) === r));
  byRank[1].sort((a, b) => a.face.layer - b.face.layer);
  byRank[2] = occlusionSort(byRank[2], cam);
  byRank[4].sort((a, b) => Number(!a.face.halo) - Number(!b.face.halo)); // halos under bulbs
  drawn.length = 0;
  for (const group of byRank) drawn.push(...group);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of drawn) for (const poly of d.poly2) for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (!drawn.length) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
  const pad = Math.max(x1 - x0, y1 - y0) * 0.06;
  // zoom > 1 closes in on the centre of the fitted view, < 1 backs off
  const z = zoom > 0 ? zoom : 1;
  const w = (x1 - x0 + 2 * pad) / z, hgt = (y1 - y0 + 2 * pad) / z;
  const vb = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - hgt / 2, w, hgt].map((v) => v.toFixed(2)).join(' ');
  const sw = (v) => +(v / z).toFixed(3); // keep line weights steady as the view zooms
  const paths = drawn.map((d) => {
    const dStr = d.poly2.map((poly) => 'M' + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z').join('');
    if (d.face.halo) return `<path class="halo" pointer-events="none" d="${dStr}" fill="${d.face.color}" fill-opacity="${d.opacity}"/>`;
    if (d.face.glow) return `<path d="${dStr}" fill="${d.face.color}" fill-opacity="${d.opacity}"/>`;
    // furniture faces carry their item index so a click can select the piece
    const item = d.face.item != null ? ` data-item="${d.face.item}"` : '';
    if (selected != null && d.face.item === selected) {
      return `<path class="sel"${item} d="${dStr}" fill="${d.fill}" fill-opacity="${d.opacity}" fill-rule="evenodd" stroke="#1f7a8c" stroke-width="${sw(0.7)}" stroke-linejoin="round"/>`;
    }
    // ghosted walls are drawn on top but are see-through: let clicks pass to the piece behind
    const ghost = d.ghost ? ' pointer-events="none"' : '';
    return `<path${item}${ghost} d="${dStr}" fill="${d.fill}" fill-opacity="${d.opacity}" fill-rule="evenodd" stroke="rgba(40,30,20,${d.ghost ? 0.25 : 0.55})" stroke-width="${sw(0.25)}" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="scene-svg" style="--scene-zoom:${z}" role="img" aria-label="3D preview of the assembled kit">${paths.join('')}</svg>`;
}
