// Pure scene maths for the WebGL viewer (no three.js, no DOM), so it can be
// unit tested in Node. Coordinates are the compiler's: millimetres, z up,
// the room's open front facing −y.

export const MAX_POINT_LIGHTS = 12;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

/** Unit vector from the scene towards the camera (same convention as preview3d.js). */
export function cameraDirection({ yaw = -32, pitch = 26 } = {}) {
  const ya = (yaw * Math.PI) / 180, pa = (pitch * Math.PI) / 180;
  return [Math.sin(ya) * Math.cos(pa), -Math.cos(ya) * Math.cos(pa), Math.sin(pa)];
}

/** Axis-aligned bounds plus a bounding sphere. */
export function sceneBounds(faces) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) for (const poly of f.polys) for (const p of poly) {
    for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 1 };
  const center = min.map((v, i) => (v + max[i]) / 2);
  return { min, max, center, radius: Math.max(1, Math.hypot(...sub(max, min)) / 2) };
}

/** Perspective camera that fits the bounding sphere for a yaw/pitch/zoom view. */
export function cameraPose(bounds, view = {}, { fov = 35, aspect = 1 } = {}) {
  const dir = cameraDirection(view);
  const half = (fov * Math.PI) / 360;
  const halfMin = Math.min(half, Math.atan(Math.tan(half) * aspect));
  const dist = (bounds.radius / Math.sin(halfMin)) * 1.04 / (view.zoom || 1);
  const position = bounds.center.map((c, i) => c + dir[i] * dist);
  return {
    position, target: bounds.center, up: [0, 0, 1],
    near: Math.max(dist * 0.01, dist - 2 * bounds.radius), far: dist + 2 * bounds.radius,
  };
}

const centroid = (poly) => poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length, s[2] + p[2] / poly.length], [0, 0, 0]);

/** Point lights for night mode: one per LED bulb, a few mm in front of its surface. */
export function ledLights(faces, { lift = 3, max = MAX_POINT_LIGHTS } = {}) {
  const lights = [];
  for (const f of faces) {
    if (!f.glow || f.opacity < 1) continue; // halos are not bulbs
    const n = normalize(f.n);
    lights.push({ color: f.color, position: centroid(f.polys[0]).map((v, i) => v + n[i] * lift), normal: n });
    if (lights.length >= max) break;
  }
  return lights;
}

/**
 * Express a planar face in 2D: {contour, holes} in (u, v), with an
 * orthonormal basis U × V = n so 2D winding matches the face normal.
 */
export function faceToPlanar(face) {
  const n = normalize(face.n);
  const axis = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const U = normalize(cross(axis, n));
  const V = cross(n, U);
  const o = face.polys[0][0];
  const to2d = (p) => { const d = sub(p, o); return [dot(d, U), dot(d, V)]; };
  const to3d = (u, v) => [0, 1, 2].map((i) => o[i] + U[i] * u + V[i] * v);
  return {
    contour: face.polys[0].map(to2d), holes: face.polys.slice(1).map((h) => h.map(to2d)),
    origin: o, U, V, normal: n, to3d,
  };
}

/**
 * How far (mm) to lift a face off its wall along its normal: wallpaper and
 * floor overlays (layer 1), trim (1.5) and LEDs (1.7/1.8) sit on the shell
 * (layer 0); furniture (2) is real geometry and stays put.
 */
export function layerOffset(layer) {
  return layer > 0 && layer < 2 ? 0.2 * layer : 0;
}

// Board panels get a default thickness until the compiler reports the real
// one on each face (face.thickness, mm). Paper overlays, trim, LEDs and
// see-through faces stay flat.
export const DEFAULT_BOARD_THICKNESS = 2;

export function faceThickness(face) {
  if (face.glow || (face.opacity ?? 1) < 1) return 0;
  if (face.layer !== 0 && face.layer !== 2) return 0;
  return face.thickness ?? DEFAULT_BOARD_THICKNESS;
}

const area2 = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
};

/**
 * Triangles for a face extruded `thickness` mm behind itself (along −n),
 * as flat position/normal arrays (9 numbers per triangle), outward wound.
 * `triangulate(contour2d, holes2d)` returns index triples into the
 * concatenated rings, like THREE.ShapeUtils.triangulateShape.
 * With thickness 0 only the front face is returned.
 */
export function extrudeFace(face, thickness, triangulate, { lift = 0 } = {}) {
  const p = faceToPlanar(face);
  const n = p.normal;
  // contour counter-clockwise, holes clockwise: the solid is always on the left of each edge
  const contour = area2(p.contour) < 0 ? [...p.contour].reverse() : p.contour;
  const holes = p.holes.map((h) => (area2(h) > 0 ? [...h].reverse() : h));
  const front = ([u, v]) => p.to3d(u, v).map((c, i) => c + n[i] * lift);
  const back = (q) => front(q).map((c, i) => c - n[i] * thickness);
  const positions = [], normals = [];
  const tri = (a, b, c, nn) => { positions.push(...a, ...b, ...c); normals.push(...nn, ...nn, ...nn); };

  const flat = [contour, ...holes].flat();
  const negN = n.map((v) => -v);
  for (const [i, j, k] of triangulate(contour, holes)) {
    let [a, b, c] = [flat[i], flat[j], flat[k]];
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) [b, c] = [c, b];
    tri(front(a), front(b), front(c), n);
    if (thickness > 0) tri(back(a), back(c), back(b), negN);
  }
  if (thickness > 0) {
    for (const ring of [contour, ...holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const du = b[0] - a[0], dv = b[1] - a[1];
        const len = Math.hypot(du, dv);
        if (len < 1e-12) continue;
        // outward = right of the edge, in 3D
        const out = p.U.map((x, k) => (x * dv - p.V[k] * du) / len);
        const af = front(a), bf = front(b), ab = back(a), bb = back(b);
        tri(af, bb, bf, out);
        tri(af, ab, bb, out);
      }
    }
  }
  return { positions, normals };
}
