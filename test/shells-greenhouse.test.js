// Greenhouse shell: a nook whose roof, side walls and back are glazed above
// a solid knee wall, with clear acetate panes behind the window grids and a
// potting bench slotted in across the back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShell, SHELLS } from '../src/shells/index.js';
import { findOverlaps, outsideEnvelope, partBox, partContains } from '../src/shells/fit.js';
import { pointInPolygon, distToPolys } from '../src/geometry.js';
import { checkJoints } from './shells-helpers.js';

const MATS = [
  { id: 'chip2', thickness: 2, kind: 'board' },
  { id: 'acetate', thickness: 0.2, kind: 'card' },
];
const gap = { w: 100, h: 230, d: 180 };
const house = (params = {}, t = 2, materials = MATS) =>
  buildShell({ type: 'greenhouse', gap, clearance: 2, material: 'chip2', params }, { t, materials });

const VARIANTS = [
  [{}, 2],
  [{ glazeBack: false }, 1.5],
  [{ glazeSides: false, bench: false }, 2],
  [{ kneeHeight: 0.45, paneSize: 25 }, 2],
  [{ glazeRoof: false, barWidth: 4 }, 1.6],
];

const at = ({ o, U, V }, [u, v]) => [0, 1, 2].map((i) => o[i] + U[i] * u + V[i] * v);
const glazedHoles = (wall) => wall.polys.slice(1).filter((h) => h.glazed !== false && h.length === 4);

test('greenhouse is registered as a whole-scene shell', () => {
  assert.ok(SHELLS.greenhouse?.label);
  assert.equal(SHELLS.greenhouse.furnishable, false);
  for (const p of SHELLS.greenhouse.params) assert.ok(p.key in SHELLS.greenhouse.defaults, p.key);
});

test('greenhouse parts never share space, stay inside, and hang together', () => {
  for (const [params, t] of VARIANTS) {
    const sh = house(params, t);
    assert.deepEqual(findOverlaps(sh.parts, t), [], JSON.stringify(params));
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), [], JSON.stringify(params));
    checkJoints(sh, t);
  }
});

test('window grids: openings ≥ 3 mm, bars and borders cuttable, only on the glazed walls', () => {
  for (const [params, t] of VARIANTS) {
    const sh = house(params, t);
    const want = {
      top: params.glazeRoof !== false, back: params.glazeBack !== false,
      left: params.glazeSides !== false, right: params.glazeSides !== false,
    };
    for (const face of Object.keys(want)) {
      const wall = sh.parts.find((p) => p.key === `shell-${face}`);
      const holes = sh.greenhouse.windows[face] || [];
      assert.equal(holes.length > 0, want[face], `${face} glazed: ${want[face]}`);
      const [outline] = wall.polys;
      for (const h of holes) {
        assert.ok(wall.polys.some((p) => p === h || JSON.stringify(p) === JSON.stringify(h)), `${face}: window is cut`);
        const xs = h.map(([x]) => x), ys = h.map(([, y]) => y);
        assert.ok(Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= 3 - 1e-9, 'Knife Blade minimum');
        for (const p of h) {
          assert.ok(pointInPolygon(p, outline) && distToPolys(p, [outline]) >= t + 1.5 - 1e-9, `${face}: border clear of the finger joints`);
          for (const o of holes) if (o !== h) assert.ok(distToPolys(p, [o]) >= (params.barWidth ?? 3) - 1e-9, `${face}: bars ≥ bar width`);
        }
      }
    }
  }
});

test('every window is covered by a clear pane with a glue margin', () => {
  for (const [params, t] of VARIANTS) {
    const sh = house(params, t);
    for (const [face, holes] of Object.entries(sh.greenhouse.windows)) {
      if (!holes.length) continue;
      const wall = sh.parts.find((p) => p.key === `shell-${face}`);
      const pane = sh.parts.find((p) => p.role === 'glazing' && p.face === face);
      assert.ok(pane, `${face} pane`);
      assert.equal(pane.material, 'acetate');
      assert.equal(pane.thickness, 0.2);
      // every window corner, pushed 1.5 mm outwards, lies on the pane (just inside the wall)
      for (const h of holes) {
        const xs = h.map(([x]) => x), ys = h.map(([, y]) => y);
        const corners = [[Math.min(...xs) - 1.5, Math.min(...ys) - 1.5], [Math.max(...xs) + 1.5, Math.max(...ys) + 1.5]];
        for (const c of corners) {
          const p = at(wall.plane, c).map((v, i) => v + wall.plane.n[i] * 0.1);
          assert.ok(partContains(pane, t, p), `${face}: pane overlaps the window by 1.5 mm`);
        }
      }
      assert.ok(sh.joints.some((j) => j.kind === 'flat' && [j.a, j.b].includes(pane.key) && [j.a, j.b].includes(wall.key)));
    }
  }
});

test('without acetate in the kit the panes become a note and a cutting list', () => {
  const sh = house({}, 2, [{ id: 'chip2', thickness: 2, kind: 'board' }]);
  assert.equal(sh.parts.filter((p) => p.role === 'glazing').length, 0);
  assert.ok(sh.warnings.some((w) => w.level === 'info' && /acetate/i.test(w.msg)));
  assert.ok(sh.steps.some((s) => /acetate/i.test(s.text) && /\d+ × \d+ mm/.test(s.text)), 'pane sizes listed');
  assert.deepEqual(findOverlaps(sh.parts, 2), []);
});

test('the potting bench sits below the glazing, slotted into both sides and the back', () => {
  for (const [params, t] of VARIANTS) {
    const sh = house(params, t);
    const bench = sh.parts.filter((p) => p.role === 'bench');
    if (params.bench === false) { assert.equal(bench.length, 0); continue; }
    assert.equal(bench.length, 1);
    const [, , [, top]] = partBox(bench[0], t);
    assert.ok(top <= sh.greenhouse.knee - 1e-9, 'bench top under the knee wall top');
    assert.ok(top - sh.dims.inner.z0 >= 15, 'room under the bench');
    for (const wall of ['left', 'right', 'back']) {
      assert.ok(sh.joints.some((j) => j.kind === 'slot' && [j.a, j.b].includes(bench[0].key) && [j.a, j.b].includes(`shell-${wall}`)), wall);
    }
    // its slots (the non-window rectangular holes) are filled by the bench
    for (const wall of sh.parts.filter((p) => p.role === 'shell')) {
      const windows = new Set((sh.greenhouse.windows[wall.face] || []).map((h) => JSON.stringify(h)));
      for (const hole of wall.polys.slice(1)) {
        if (hole.length !== 4 || windows.has(JSON.stringify(hole))) continue;
        const c = hole.reduce(([a, b], [x, y]) => [a + x / 4, b + y / 4], [0, 0]);
        const p = at(wall.plane, c).map((v, i) => v - wall.plane.n[i] * (t / 2));
        assert.ok(partContains(bench[0], t, p), `${wall.key}: bench slot filled`);
      }
    }
  }
});

test('greenhouse suggests LEDs and has steps for every group', () => {
  const sh = house();
  assert.ok(sh.lights.length >= 2);
  for (const l of sh.lights) assert.ok(l.p.every((v, i) => v > 0 && v < [sh.dims.W, sh.dims.D, sh.dims.H][i]));
  for (const g of new Set(sh.parts.map((p) => p.group))) assert.ok(sh.steps.some((s) => s.group === g), g);
});
