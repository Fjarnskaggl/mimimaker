// Alley shell: two layered facades standing off the side walls on spacers
// (the gap is the LED cavity), forced perspective toward the back, lit
// window holes in every layer, and a skyline backdrop at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShell } from '../src/shells/index.js';
import { findOverlaps, outsideEnvelope, partBox } from '../src/shells/fit.js';
import { checkJoints } from './shells-helpers.js';
import { pointInPolygon, distToPolys, partArea } from '../src/geometry.js';

const gap = { w: 100, h: 230, d: 180 };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (U, V) => [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
// panel coordinates of a facade point (y, z) on a facade-plane part
const toLocal = ({ o, U, V }, [y, z]) => { const d = sub([o[0], y, z], o); return [dot(d, U), dot(d, V)]; };
const alley = (params = {}, t = 2, g = gap) => buildShell({ type: 'alley', gap: g, clearance: 2, params }, { t });

const VARIANTS = [
  [{}, 2],
  [{ layers: 1 }, 2],
  [{ layers: 3, buildings: 4, seed: 7 }, 1.5],
  [{ backdrop: false, perspective: 0.2, cavity: 8 }, 2],
  [{ buildings: 2, litRatio: 1, perspective: 1 }, 1.6],
];

test('alley parts never share space and stay inside the shell', () => {
  for (const [params, t] of VARIANTS) {
    const sh = alley(params, t);
    assert.deepEqual(findOverlaps(sh.parts, t), [], JSON.stringify(params));
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), [], JSON.stringify(params));
  }
});

test('layers, cavity and street exactly fill the width', () => {
  for (const [params, t] of VARIANTS) {
    const sh = alley(params, t);
    const { W } = sh.dims;
    const { cavity, layers } = sh.alley;
    const { x0, x1 } = sh.alley.street;
    assert.ok(Math.abs(x0 - (t + cavity + layers * t)) < 1e-9, 'no materials list: every layer is shell board');
    assert.ok(Math.abs(W - x1 - x0) < 1e-9, 'symmetric');
    for (const side of ['left', 'right']) {
      const layerBoxes = sh.parts.filter((p) => p.side === side && p.role === 'layer').map((p) => partBox(p, t)[0]);
      const xs = [...new Set(layerBoxes.map(([a]) => +a.toFixed(6)))].sort((a, b) => a - b);
      assert.equal(xs.length, layers, `${side}: one x-slot per layer`);
      // every layer is exactly t thick, packed edge to edge from the cavity to the street
      const lo = side === 'left' ? t + cavity : x1;
      xs.forEach((x, i) => assert.ok(Math.abs(x - (lo + i * t)) < 1e-9));
    }
  }
});

test('spacers hold each base facade off its wall and touch both', () => {
  const t = 2;
  const sh = alley({}, t);
  const { cavity } = sh.alley;
  for (const side of ['left', 'right']) {
    const spacers = sh.parts.filter((p) => p.side === side && p.role === 'spacer');
    assert.ok(spacers.length >= 3, 'front, between buildings, back');
    for (const sp of spacers) {
      const [[a, b], [y0, y1], [z0]] = partBox(sp, t);
      assert.ok(Math.abs(b - a - cavity) < 1e-9, 'spans the cavity');
      assert.ok(Math.abs(y1 - y0 - t) < 1e-9);
      assert.ok(Math.abs(z0 - t) < 1e-9, 'stands on the floor');
      if (side === 'left') assert.ok(Math.abs(a - t) < 1e-9, 'touches the wall');
      else assert.ok(Math.abs(b - (sh.dims.W - t)) < 1e-9);
    }
    const ys = spacers.map((sp) => partBox(sp, t)[1]);
    assert.ok(ys.some(([y0]) => Math.abs(y0) < 1e-9), 'closes the front of the cavity');
  }
});

test('forced perspective: windows shrink and rooflines fall toward the back', () => {
  for (const [params, t] of VARIANTS) {
    const sh = alley(params, t);
    const { horizon } = sh.alley;
    for (const side of ['left', 'right']) {
      const blds = sh.alley.buildings.filter((b) => b.side === side);
      for (let i = 1; i < blds.length; i++) assert.ok(blds[i].y0 >= blds[i - 1].y1 - 1e-9, 'buildings in depth order');
      for (const b of blds) {
        // roof converges on the horizon: lower at the back end, still above it
        assert.ok(b.roofBack < b.roofFront && b.roofBack > horizon);
      }
      const wins = blds.flatMap((b) => b.windows).sort((p, q) => p.y - q.y);
      for (let i = 1; i < wins.length; i++) {
        assert.ok(wins[i].h <= wins[i - 1].h + 1e-9, 'deeper windows are never taller');
        assert.ok(wins[i].w <= wins[i - 1].w + 1e-9);
      }
    }
    // the street converges too: building lengths shrink with depth
    const lens = sh.alley.buildings.filter((b) => b.side === 'left').map((b) => b.y1 - b.y0);
    for (let i = 1; i < lens.length; i++) assert.ok(lens[i] < lens[i - 1]);
  }
});

test('lit windows are holes through every layer, inside solid facade', () => {
  for (const [params, t] of VARIANTS) {
    const sh = alley(params, t);
    const lit = sh.alley.buildings.flatMap((b) => b.windows.filter((w) => w.lit).map((w) => ({ ...w, b })));
    assert.ok(lit.length > 0, 'some windows are lit');
    for (const part of sh.parts.filter((p) => p.role === 'layer' || p.role === 'backdrop')) {
      const [outline, ...holes] = part.polys;
      assert.ok(partArea(part.polys) > 0);
      for (const h of holes) {
        for (const pt of h) {
          assert.ok(pointInPolygon(pt, outline), `${part.key}: hole inside outline`);
          assert.ok(distToPolys(pt, [outline]) >= 1.5 - 1e-9, `${part.key}: 1.5 mm of board around every hole`);
        }
        for (const q of outline) assert.ok(!pointInPolygon(q, h), `${part.key}: outline doesn't poke into a hole`);
        for (const other of holes) if (other !== h) {
          for (const pt of h) assert.ok(!pointInPolygon(pt, other) && distToPolys(pt, [other]) >= 2 - 1e-9, `${part.key}: bridges ≥ 2 mm`);
        }
        const xs = h.map(([x]) => x), ys = h.map(([, y]) => y);
        assert.ok(Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= 3 - 1e-9, 'Knife Blade minimum');
      }
    }
    // every layer of a building has a hole over each of its lit windows (light passes through the stack)
    for (const side of ['left', 'right']) {
      for (const layer of sh.parts.filter((p) => p.side === side && p.role === 'layer')) {
        const [outline, ...holes] = layer.polys;
        for (const w of lit.filter((q) => q.b.side === side)) {
          const c = toLocal(layer.plane, [w.y, w.z]);
          if (!pointInPolygon(c, outline) && !holes.some((h) => pointInPolygon(c, h))) continue; // not covered by this panel
          assert.ok(holes.some((h) => pointInPolygon(c, h)), `${layer.key} lets ${side} window at y=${w.y.toFixed(1)} shine`);
        }
      }
    }
  }
});

test('unlit windows are drawn, and each lit building gets an LED spot in its cavity', () => {
  const t = 2;
  const sh = alley({ litRatio: 0.5, seed: 3 }, t);
  const unlit = sh.alley.buildings.flatMap((b) => b.windows.filter((w) => !w.lit));
  assert.ok(unlit.length > 0);
  // drawn on the front-most layer, where they are seen
  const top = sh.parts.filter((p) => p.role === 'layer' && p.layer === sh.alley.layers - 1);
  assert.ok(top.reduce((s, p) => s + p.scores.length, 0) >= unlit.length * 3);
  const { cavity } = sh.alley;
  for (const b of sh.alley.buildings.filter((q) => q.windows.some((w) => w.lit))) {
    const led = sh.lights.find((l) => l.building === b.id);
    assert.ok(led, `LED for ${b.id}`);
    const [x, y] = led.p;
    if (b.side === 'left') assert.ok(x > t && x < t + cavity);
    else assert.ok(x < sh.dims.W - t && x > sh.dims.W - t - cavity);
    assert.ok(y > b.y0 && y < b.y1);
  }
});

test('drawn faces point at the viewer, so pen windows land on the show side', () => {
  const sh = alley({ litRatio: 0.3 });
  for (const p of sh.parts.filter((q) => q.role === 'layer' || q.role === 'backdrop')) {
    assert.deepEqual(cross(p.plane.U, p.plane.V).map((x) => x + 0), p.plane.n, p.key);
  }
});

test('same seed, same alley; different seed, different alley', () => {
  const a = JSON.stringify(alley({ seed: 5 }).alley.buildings);
  assert.equal(a, JSON.stringify(alley({ seed: 5 }).alley.buildings));
  assert.notEqual(a, JSON.stringify(alley({ seed: 6 }).alley.buildings));
});

test('too narrow a gap is refused with a clear message, thin cavity warns', () => {
  assert.throws(() => alley({ layers: 3, cavity: 10 }, 2, { w: 50, h: 200, d: 150 }), /street/i);
  const sh = alley({ cavity: 3 });
  assert.ok(sh.warnings.some((w) => /cavity/i.test(w.msg)));
});

test('assembly steps cover every part', () => {
  const sh = alley();
  assert.ok(sh.steps.length >= 4);
  const groups = new Set(sh.parts.map((p) => p.group));
  for (const g of groups) assert.ok(sh.steps.some((s) => s.group === g), `steps for ${g}`);
});

test('alley joints: every spacer, layer and backdrop is glued to what it touches', () => {
  for (const [params, t] of VARIANTS) {
    const sh = alley(params, t);
    checkJoints(sh, t);
    for (const p of sh.parts.filter((q) => q.role === 'spacer')) {
      const mine = sh.joints.filter((j) => j.a === p.key || j.b === p.key);
      assert.ok(mine.length >= 2, `${p.key} holds two things together`);
    }
    for (const p of sh.parts.filter((q) => q.role === 'layer' && q.layer > 0)) {
      assert.ok(sh.joints.some((j) => j.kind === 'flat' && [j.a, j.b].includes(p.key)), `${p.key} glued to the layer below`);
    }
  }
});

test('relief layers open only over lit windows; unlit ones are drawn on the front layer only', () => {
  for (const [params, t] of VARIANTS) {
    const sh = alley(params, t);
    const { layers } = sh.alley;
    for (const b of sh.alley.buildings) {
      const lit = b.windows.filter((w) => w.lit).length;
      const unlit = b.windows.length - lit;
      for (const p of sh.parts.filter((q) => q.building === b.id)) {
        assert.equal(p.polys.length - 1, lit, `${p.key}: one opening per lit window`);
        assert.equal(p.scores.length > 0, p.layer === layers - 1 && unlit > 0, `${p.key}: only the front layer is drawn on`);
      }
    }
    if (layers > 1) {
      for (const base of sh.parts.filter((p) => p.role === 'layer' && p.layer === 0)) {
        assert.equal(base.scores.length, 0, `${base.key}: hidden under the relief, so nothing to draw`);
      }
    }
  }
});

const MATS = [
  { id: 'chip2', thickness: 2, kind: 'board' },
  { id: 'bass08', thickness: 0.8, kind: 'board' },
  { id: 'card110', thickness: 0.38, kind: 'card' },
];

test('relief layers can be cut from thinner material: they stack at its thickness and still fit', () => {
  const t = 2;
  for (const relief of ['bass08', 'card110']) for (const layers of [2, 3]) {
    const sh = buildShell({ type: 'alley', gap, clearance: 2, material: 'chip2', params: { layers, reliefMaterial: relief } }, { t, materials: MATS });
    const tr = MATS.find((m) => m.id === relief).thickness;
    const reliefs = sh.parts.filter((p) => p.role === 'layer' && p.layer > 0);
    assert.ok(reliefs.length > 0);
    for (const p of reliefs) {
      assert.equal(p.material, relief, p.key);
      assert.equal(p.thickness, tr, p.key);
    }
    for (const p of sh.parts.filter((q) => !(q.role === 'layer' && q.layer > 0))) {
      assert.equal(p.material, 'chip2', `${p.key} stays board`);
      assert.ok(p.thickness === undefined || p.thickness === t, p.key);
    }
    const { x0, x1 } = sh.alley.street;
    assert.ok(Math.abs(x0 - (t + sh.alley.cavity + t + (layers - 1) * tr)) < 1e-9, 'street starts at the last relief face');
    assert.ok(Math.abs(sh.dims.W - x1 - x0) < 1e-9);
    assert.deepEqual(findOverlaps(sh.parts, t), [], `${relief} × ${layers}`);
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), []);
    checkJoints(sh, t);
  }
});

test('an unknown relief material falls back to the shell board, with a warning', () => {
  const sh = buildShell({ type: 'alley', gap, material: 'chip2', params: { reliefMaterial: 'nope' } }, { t: 2, materials: MATS });
  assert.ok(sh.warnings.some((w) => /relief/i.test(w.msg)), JSON.stringify(sh.warnings));
  for (const p of sh.parts.filter((q) => q.role === 'layer' && q.layer > 0)) assert.equal(p.material, 'chip2');
});
