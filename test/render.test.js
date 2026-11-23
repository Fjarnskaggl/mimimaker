// T6 renderer helpers (src/render/scene.js): pure maths the WebGL viewer is
// built on, so it can be checked without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit } from '../src/catalog.js';
import { applyRoomType } from '../src/templates.js';
import { compileKit } from '../src/kit.js';
import {
  cameraDirection, cameraPose, sceneBounds, ledLights, faceToPlanar, layerOffset, MAX_POINT_LIGHTS,
  faceThickness, extrudeFace,
} from '../src/render/scene.js';

const close = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('camera direction uses the same yaw/pitch convention as the SVG preview', () => {
  // yaw 0, pitch 0: looking from the open front (−y) of the room
  const d0 = cameraDirection({ yaw: 0, pitch: 0 });
  assert.ok(close(d0[0], 0) && close(d0[1], -1) && close(d0[2], 0), String(d0));
  // straight down from above at pitch 90
  const d1 = cameraDirection({ yaw: 0, pitch: 90 });
  assert.ok(close(d1[2], 1), String(d1));
  // positive yaw swings the camera towards +x
  assert.ok(cameraDirection({ yaw: 30, pitch: 20 })[0] > 0);
  assert.ok(close(Math.hypot(...cameraDirection({ yaw: -32, pitch: 26 })), 1));
});

test('scene bounds enclose every face vertex', () => {
  const faces = compileKit(defaultKit()).faces3d;
  const b = sceneBounds(faces);
  for (const f of faces) for (const poly of f.polys) for (const p of poly) {
    for (let i = 0; i < 3; i++) assert.ok(p[i] >= b.min[i] - 1e-9 && p[i] <= b.max[i] + 1e-9);
  }
  assert.ok(b.radius > 0);
  for (let i = 0; i < 3; i++) assert.ok(close(b.center[i], (b.min[i] + b.max[i]) / 2));
});

test('camera pose frames the whole scene and looks at its centre', () => {
  const faces = compileKit(defaultKit()).faces3d;
  const b = sceneBounds(faces);
  const pose = cameraPose(b, { yaw: -32, pitch: 26 }, { fov: 35, aspect: 1.5 });
  assert.deepEqual(pose.target, b.center);
  const off = pose.position.map((v, i) => v - b.center[i]);
  const dist = Math.hypot(...off);
  assert.ok(dist > b.radius, 'camera sits outside the bounding sphere');
  const dir = cameraDirection({ yaw: -32, pitch: 26 });
  assert.ok(close(dot(off.map((v) => v / dist), dir), 1, 1e-9), 'camera on the view direction');
  assert.ok(pose.near > 0 && pose.far > dist + b.radius);
  // zoom 2 halves the distance
  const z = cameraPose(b, { yaw: -32, pitch: 26, zoom: 2 }, { fov: 35, aspect: 1.5 });
  assert.ok(close(Math.hypot(...z.position.map((v, i) => v - b.center[i])), dist / 2, 1e-6));
});

test('LED point lights: one per bulb (not per halo), nudged off its surface', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  const faces = compileKit(kit).faces3d;
  const bulbs = faces.filter((f) => f.glow && f.opacity >= 1);
  assert.ok(bulbs.length > 0, 'the café has LEDs');
  const lights = ledLights(faces);
  assert.equal(lights.length, Math.min(bulbs.length, MAX_POINT_LIGHTS));
  for (const [i, L] of lights.entries()) {
    const f = bulbs[i];
    assert.equal(L.color, f.color);
    const c = f.polys[0].reduce((s, p) => s.map((v, k) => v + p[k] / f.polys[0].length), [0, 0, 0]);
    const off = L.position.map((v, k) => v - c[k]);
    assert.ok(dot(off, f.n) > 0, 'light sits in front of the surface it is mounted on');
    assert.ok(Math.hypot(...off) < 10);
  }
});

test('ledLights caps the number of point lights', () => {
  const bulb = (x) => ({ glow: true, opacity: 1, color: '#ffcc66', n: [0, 0, -1], polys: [[[x, 0, 10], [x + 1, 0, 10], [x + 1, 1, 10]]] });
  const faces = Array.from({ length: MAX_POINT_LIGHTS + 5 }, (_, i) => bulb(i * 3));
  assert.equal(ledLights(faces).length, MAX_POINT_LIGHTS);
});

test('faceToPlanar maps outline and holes to 2D and back without loss', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  const faces = compileKit(kit).faces3d;
  const holed = faces.find((f) => f.polys.length > 1);
  assert.ok(holed, 'some face (a wall with a window) has holes');
  for (const f of [holed, ...faces.slice(0, 10)]) {
    const p = faceToPlanar(f);
    assert.equal(p.holes.length, f.polys.length - 1);
    const all = [p.contour, ...p.holes];
    all.forEach((poly2, k) => poly2.forEach(([u, v], j) => {
      const q = p.to3d(u, v);
      const want = f.polys[k][j];
      for (let i = 0; i < 3; i++) assert.ok(close(q[i], want[i], 1e-6), `vertex ${j} of poly ${k}`);
    }));
    // basis is right-handed with the face normal, so triangle winding follows n
    assert.ok(close(dot(p.normal, f.n), 1, 1e-9));
  }
});

test('overlays and lights are lifted off their wall to avoid z-fighting; furniture is not', () => {
  assert.equal(layerOffset(0), 0);
  assert.equal(layerOffset(2), 0);
  assert.ok(layerOffset(1) > 0);
  assert.ok(layerOffset(1.7) > layerOffset(1.5) && layerOffset(1.5) > layerOffset(1));
  assert.ok(layerOffset(1.8) > layerOffset(1.7));
  assert.ok(layerOffset(1.8) < 0.5, 'still visually flush (under half a mm)');
});

// ------------------------------------------------------ panels with thickness
/** Signed volume of a closed triangle soup (divergence theorem). */
function volume(pos) {
  let v = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const a = pos.slice(i, i + 3), b = pos.slice(i + 3, i + 6), c = pos.slice(i + 6, i + 9);
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}
/** Every undirected edge of a closed surface is used by exactly two triangles, once each way. */
function assertClosed(pos) {
  const key = (p) => p.map((v) => v.toFixed(5)).join(',');
  const edges = new Map();
  for (let i = 0; i < pos.length; i += 9) {
    const t = [0, 1, 2].map((k) => key(pos.slice(i + 3 * k, i + 3 * k + 3)));
    for (let k = 0; k < 3; k++) {
      const e = `${t[k]}>${t[(k + 1) % 3]}`;
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  for (const [e, n] of edges) {
    const [a, b] = e.split('>');
    assert.equal(n, 1, `edge ${e} used ${n}× in one direction`);
    assert.equal(edges.get(`${b}>${a}`), 1, `edge ${e} has no opposite`);
  }
}
const fan = (contour, holes) => { assert.equal(holes.length, 0); return contour.slice(2).map((_, i) => [0, i + 1, i + 2]); };
// frame triangulation for a square outline (4 pts) with one square hole (4 pts),
// either winding: each outline corner pairs with its nearest hole corner
const frame = (contour, holes) => {
  assert.equal(holes.length, 1);
  const near = (p) => 4 + holes[0].reduce((best, q, k) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(holes[0][best][0] - p[0], holes[0][best][1] - p[1]) ? k : best), 0);
  const tris = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; tris.push([i, j, near(contour[j])], [i, near(contour[j]), near(contour[i])]); }
  return tris;
};
const square = (x0, y0, s, z = 0) => [[x0, y0, z], [x0 + s, y0, z], [x0 + s, y0 + s, z], [x0, y0 + s, z]];

test('faceThickness: uses the compiled thickness, else a board default for panels; overlays and lights stay flat', () => {
  assert.equal(faceThickness({ layer: 0, thickness: 1.6 }), 1.6);
  assert.equal(faceThickness({ layer: 2, thickness: 0.8 }), 0.8);
  assert.ok(faceThickness({ layer: 0 }) > 0);
  assert.ok(faceThickness({ layer: 2 }) > 0);
  assert.equal(faceThickness({ layer: 1 }), 0, 'wallpaper is paper-thin');
  assert.equal(faceThickness({ layer: 1.5 }), 0);
  assert.equal(faceThickness({ layer: 1.8, glow: true }), 0);
  assert.equal(faceThickness({ layer: 2, glow: true }), 0);
  assert.equal(faceThickness({ layer: 2, opacity: 0.5 }), 0, 'see-through faces stay flat');
});

test('extrudeFace: a panel becomes a closed solid of area × thickness, behind its face', () => {
  for (const n of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [0, -1, 0]]) {
    // the same 10 × 10 square in a plane perpendicular to n
    const pts = n[2] ? square(0, 0, 10, 5) : n[0] ? square(0, 0, 10).map(([a, b]) => [5, a, b]) : square(0, 0, 10).map(([a, b]) => [a, 5, b]);
    for (const ccw of [true, false]) {
      const poly = ccw ? pts : [...pts].reverse();
      const g = extrudeFace({ layer: 0, n, polys: [poly] }, 2, fan);
      assert.equal(g.positions.length, g.normals.length);
      assertClosed(g.positions);
      assert.ok(close(volume(g.positions), 200, 1e-6), `volume ${volume(g.positions)} for n=${n}`);
      // material lies behind the face: every vertex is on the face plane or 2 mm behind it
      const d0 = dot(poly[0], n);
      for (let i = 0; i < g.positions.length; i += 3) {
        const d = dot(g.positions.slice(i, i + 3), n) - d0;
        assert.ok(close(d, 0, 1e-9) || close(d, -2, 1e-9), `depth ${d}`);
      }
    }
  }
});

test('extrudeFace: holes become tunnels through the panel', () => {
  const face = { layer: 0, n: [0, 0, 1], polys: [square(0, 0, 10), square(3, 3, 4)] };
  const g = extrudeFace(face, 1.5, frame);
  assertClosed(g.positions);
  assert.ok(close(volume(g.positions), (100 - 16) * 1.5, 1e-6), `volume ${volume(g.positions)}`);
  // hole given clockwise works too
  const g2 = extrudeFace({ ...face, polys: [square(0, 0, 10), [...square(3, 3, 4)].reverse()] }, 1.5, frame);
  assertClosed(g2.positions);
  assert.ok(close(volume(g2.positions), (100 - 16) * 1.5, 1e-6));
});

test('extrudeFace: vertex normals match each triangle’s winding (outward)', () => {
  const g = extrudeFace({ layer: 2, n: [0, 1, 0], polys: [square(0, 0, 10).map(([a, b]) => [a, 0, b])] }, 2, fan);
  for (let i = 0; i < g.positions.length; i += 9) {
    const p = (k) => g.positions.slice(i + 3 * k, i + 3 * k + 3);
    const u = p(1).map((v, k) => v - p(0)[k]), w = p(2).map((v, k) => v - p(0)[k]);
    const c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    assert.ok(dot(c, g.normals.slice(i, i + 3)) > 0, `triangle ${i / 9}`);
  }
});

test('extrudeFace with zero thickness is just the face, facing n', () => {
  const g = extrudeFace({ layer: 1, n: [0, 0, 1], polys: [square(0, 0, 10)] }, 0, fan);
  assert.equal(g.positions.length, 2 * 9);
  for (let i = 0; i < g.normals.length; i += 3) assert.deepEqual(g.normals.slice(i, i + 3), [0, 0, 1]);
});

test('every board panel of a real kit extrudes to a closed solid', () => {
  const faces = compileKit(applyRoomType(defaultKit(), 'cafe')).faces3d.filter((f) => faceThickness(f) > 0 && f.polys.length === 1);
  assert.ok(faces.length > 10);
  // fan is only valid for convex outlines; use it on the plain rectangles
  const rects = faces.filter((f) => f.polys[0].length === 4);
  assert.ok(rects.length > 0);
  for (const f of rects) assertClosed(extrudeFace(f, faceThickness(f), fan).positions);
});
