// Shell model: a book-nook shell sized from a shelf gap, plus the fit checks
// every shell type is held to (no two parts share space, all inside the
// envelope, walls exactly fill their volume).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShell, SHELLS, shellSize } from '../src/shells/index.js';
import { findOverlaps, outsideEnvelope, partVolume, partBox } from '../src/shells/fit.js';
import { rectPoly } from '../src/geometry.js';
import { checkJoints } from './shells-helpers.js';

const vol = (b) => b.reduce((v, [a, c]) => v * Math.max(0, c - a), 1);
const inter = (a, b) => a.map(([a0, a1], i) => [Math.max(a0, b[i][0]), Math.min(a1, b[i][1])]);
function unionVolume(boxes) {
  let total = 0;
  for (let mask = 1; mask < 1 << boxes.length; mask++) {
    let cur = null, bits = 0;
    boxes.forEach((b, i) => { if (mask & (1 << i)) { bits++; cur = cur ? inter(cur, b) : b; } });
    total += (bits % 2 ? 1 : -1) * vol(cur);
  }
  return total;
}

const GAPS = [
  { w: 90, h: 230, d: 180 },
  { w: 120, h: 200, d: 150 },
  { w: 60, h: 160, d: 120 },
];

test('shell is sized from the shelf gap with clearance', () => {
  assert.deepEqual(shellSize({ gap: { w: 90, h: 230, d: 180 }, clearance: 2 }), { W: 88, H: 228, D: 180 });
  assert.deepEqual(shellSize({ gap: { w: 90, h: 230, d: 180 }, clearance: 2, depth: 150 }), { W: 88, H: 228, D: 150 });
  // asking for more depth than the shelf has is capped at the shelf
  assert.equal(shellSize({ gap: { w: 90, h: 230, d: 180 }, depth: 400 }).D, 180);
  assert.throws(() => shellSize({ gap: { w: 1, h: 230, d: 180 }, clearance: 2 }), /gap/i);
});

test('nook shell: five finger-jointed walls, open front, interior dims', () => {
  for (const gap of GAPS) for (const t of [2, 1.5]) {
    const sh = buildShell({ type: 'nook', gap, clearance: 2 }, { t });
    const { W, D, H } = sh.dims;
    assert.ok(W <= gap.w - 2 + 1e-9 && H <= gap.h - 2 + 1e-9 && D <= gap.d + 1e-9);
    const walls = sh.parts.filter((p) => p.role === 'shell');
    assert.deepEqual(walls.map((p) => p.face).sort(), ['back', 'bottom', 'left', 'right', 'top']);
    assert.deepEqual(sh.dims.inner, { x0: t, y0: 0, z0: t, W: W - 2 * t, D: D - t, H: H - 2 * t });
    // walls exactly fill the wall slabs (finger joints interlock with no gaps)
    const slabs = [
      [[0, W], [0, D], [0, t]], [[0, W], [0, D], [H - t, H]], [[0, W], [D - t, D], [0, H]],
      [[0, t], [0, D], [0, H]], [[W - t, W], [0, D], [0, H]],
    ];
    const material = walls.reduce((s, p) => s + partVolume(p, t), 0);
    const expected = unionVolume(slabs);
    assert.ok(Math.abs(material - expected) < 1e-6 * expected, `${material} vs ${expected}`);
    assert.deepEqual(findOverlaps(sh.parts, t), []);
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), []);
  }
});

test('every part plane is an orthonormal frame on its panel', () => {
  const sh = buildShell({ type: 'nook', gap: GAPS[0] }, { t: 2 });
  for (const p of sh.parts) {
    const { U, V, n } = p.plane;
    const c = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
    assert.ok(c.every((x, i) => Math.abs(Math.abs(x) - Math.abs(n[i])) < 1e-12), p.key);
  }
});

test('fit checker catches overlapping and out-of-envelope parts', () => {
  const t = 2;
  const plane = (x) => ({ o: [x, 0, 0], U: [0, 1, 0], V: [0, 0, 1], n: [1, 0, 0] });
  const a = { key: 'a', polys: [rectPoly(0, 0, 20, 20)], plane: plane(2) }; // x ∈ [0, 2]
  const b = { key: 'b', polys: [rectPoly(10, 10, 20, 20)], plane: plane(3) }; // x ∈ [1, 3]: overlaps a
  const c = { key: 'c', polys: [rectPoly(0, 0, 20, 20)], plane: plane(5) }; // x ∈ [3, 5]: touches b only
  const holed = { key: 'h', polys: [rectPoly(0, 0, 40, 40), rectPoly(5, 5, 30, 30)], plane: plane(3) };
  const inHole = { key: 'i', polys: [rectPoly(10, 10, 5, 5)], plane: plane(3) };
  assert.deepEqual(findOverlaps([a, b, c], t).map((o) => o.keys), [['a', 'b']]);
  assert.deepEqual(findOverlaps([holed, inHole], t), [], 'a part sitting in a hole is fine');
  assert.deepEqual(partBox(a, t), [[0, 2], [0, 20], [0, 20]]);
  assert.deepEqual(outsideEnvelope([a, c], t, { W: 4, D: 30, H: 30 }), ['c']);
});

test('shell registry describes its types for the UI', () => {
  for (const [type, def] of Object.entries(SHELLS)) {
    assert.ok(def.label, type);
    assert.equal(typeof def.build, 'function');
    for (const p of def.params) assert.ok(p.key in def.defaults, `${type}.${p.key} has a default`);
  }
  assert.throws(() => buildShell({ type: 'nope', gap: GAPS[0] }, { t: 2 }), /unknown shell/i);
});

test('shell modules go through the single-file bundler', async () => {
  const { bundle } = await import('../scripts/build-single.js');
  const { js: out } = bundle(new URL('../src/shells/index.js', import.meta.url).pathname);
  assert.match(out, /buildShell/);
  assert.match(out, /shellSize/);
});

test('nook shell lists its finger joints as a connected graph', () => {
  const t = 2;
  const sh = buildShell({ type: 'nook', gap: GAPS[0] }, { t });
  checkJoints(sh, t);
  assert.equal(sh.joints.length, 8, '4 floor/roof edges × 2 + back/side × 2');
  assert.ok(sh.joints.every((j) => j.kind === 'finger'));
});

test('every part carries a material, defaulting to the shell material', () => {
  const sh = buildShell({ type: 'nook', gap: GAPS[0], material: 'bass16' }, { t: 1.6 });
  assert.ok(sh.parts.every((p) => p.material === 'bass16'));
  const none = buildShell({ type: 'nook', gap: GAPS[0] }, { t: 2 });
  assert.ok(none.parts.every((p) => !('material' in p) || p.material === undefined));
});

test('holes passed to a shell are cut through its walls', () => {
  const hole = rectPoly(30, 60, 20, 30);
  for (const type of ['nook', 'alley']) {
    const sh = buildShell({ type, gap: { w: 100, h: 230, d: 180 } }, { t: 2, holes: { back: [hole], left: [rectPoly(40, 40, 10, 10)] } });
    const back = sh.parts.find((p) => p.key === 'shell-back');
    assert.ok(back.polys.some((p) => JSON.stringify(p) === JSON.stringify(hole)), `${type}: back wall hole`);
    assert.equal(sh.parts.find((p) => p.key === 'shell-left').polys.length, 2, `${type}: left wall hole`);
  }
});

test("fit checker uses a part's own thickness when it has one", () => {
  const plane = (x) => ({ o: [x, 0, 0], U: [0, 1, 0], V: [0, 0, 1], n: [1, 0, 0] });
  const board = { key: 'board', polys: [rectPoly(0, 0, 20, 20)], plane: plane(2) }; // x ∈ [0, 2]
  const thin = { key: 'thin', thickness: 0.8, polys: [rectPoly(0, 0, 20, 20)], plane: plane(2.8) }; // x ∈ [2, 2.8]
  const [[x0, x1]] = partBox(thin, 2);
  assert.ok(Math.abs(x0 - 2) < 1e-9 && Math.abs(x1 - 2.8) < 1e-9);
  assert.deepEqual(findOverlaps([board, thin], 2), [], 'a 2 mm default would wrongly overlap');
  assert.ok(Math.abs(partVolume(thin, 2) - 400 * 0.8) < 1e-9);
  assert.deepEqual(outsideEnvelope([thin], 2, { W: 2.8, D: 20, H: 20 }), []);
});
