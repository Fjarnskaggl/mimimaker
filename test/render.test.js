// T6 renderer helpers (src/render/scene.js): pure maths the WebGL viewer is
// built on, so it can be checked without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit } from '../src/catalog.js';
import { applyRoomType } from '../src/templates.js';
import { compileKit } from '../src/kit.js';
import {
  cameraDirection, cameraPose, sceneBounds, ledLights, faceToPlanar, layerOffset, MAX_POINT_LIGHTS,
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
