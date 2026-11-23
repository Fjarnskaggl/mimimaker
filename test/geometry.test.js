import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBox, FACES } from '../src/box.js';
import { foldNet, tabbedRect } from '../src/fold.js';
import { partArea, polygonArea, profileFingers, rectPoly, archPoly, panelOutline, profilePlain } from '../src/geometry.js';

// Axis-aligned slab of material each face occupies in the assembled box.
function slab(face, W, D, H, t) {
  switch (face) {
    case 'bottom': return [[0, W], [0, D], [0, t]];
    case 'top': return [[0, W], [0, D], [H - t, H]];
    case 'front': return [[0, W], [0, t], [0, H]];
    case 'back': return [[0, W], [D - t, D], [0, H]];
    case 'left': return [[0, t], [0, D], [0, H]];
    case 'right': return [[W - t, W], [0, D], [0, H]];
  }
}
const vol = (b) => b.reduce((v, [a, c]) => v * Math.max(0, c - a), 1);
const inter = (a, b) => a.map(([a0, a1], i) => [Math.max(a0, b[i][0]), Math.min(a1, b[i][1])]);
function unionVolume(boxes) {
  let total = 0;
  const n = boxes.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let cur = null, bits = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { bits++; cur = cur ? inter(cur, boxes[i]) : boxes[i]; }
    total += (bits % 2 ? 1 : -1) * vol(cur);
  }
  return total;
}

const subsets = [
  ['bottom', 'top', 'front', 'back', 'left', 'right'],
  ['bottom', 'back', 'left', 'right'],
  ['bottom', 'back', 'left', 'right', 'top'],
  ['top', 'left', 'right'],
  ['top', 'left', 'right', 'back'],
  ['bottom', 'top', 'left', 'right', 'back'],
];

test('finger-jointed panels exactly fill the box material volume', () => {
  for (const faces of subsets) for (const [W, D, H, t] of [[120, 80, 100, 2], [33, 21, 47, 1.5], [10, 9, 8, 2]]) {
    const { panels } = buildBox({ W, D, H, t, faces });
    const material = panels.reduce((s, p) => s + partArea([p.outline]) * t, 0);
    const expected = unionVolume(faces.map((f) => slab(f, W, D, H, t)));
    assert.ok(Math.abs(material - expected) < 1e-6 * expected, `${faces} ${W}x${D}x${H}: ${material} vs ${expected}`);
  }
});

test('mating finger edges are complementary', () => {
  const a = profileFingers(100, 2, 9, true);
  const b = profileFingers(100, 2, 9, false);
  a.forEach((s, i) => assert.equal(s.d + b[i].d, 2));
});

test('outlines are simple counter-clockwise polygons', () => {
  const { panels } = buildBox({ W: 80, D: 50, H: 60, t: 2, faces: subsets[0] });
  for (const p of panels) assert.ok(polygonArea(p.outline) > 0);
  const plain = panelOutline(10, 5, [profilePlain(10), profilePlain(5), profilePlain(10), profilePlain(5)]);
  assert.equal(plain.length, 4);
});

test('shelves add tabs and matching slots', () => {
  const t = 2;
  const { panels, shelves } = buildBox({ W: 80, D: 30, H: 120, t, faces: ['bottom', 'top', 'left', 'right', 'back'], shelves: [40, 80] });
  assert.equal(shelves.length, 2);
  const left = panels.find((p) => p.face === 'left');
  const back = panels.find((p) => p.face === 'back');
  assert.equal(left.holes.length, 4); // 2 tabs × 2 shelves
  assert.equal(back.holes.length, 4);
  // shelf area = interior rectangle + 6 tabs of t × segment
  const s = shelves[0];
  const expected = s.w * s.h + 2 * 2 * (s.h / 5) * t + 2 * (s.w / 5) * t;
  assert.ok(Math.abs(partArea([s.outline]) - expected) < 1e-6);
});

test('fold net of a closed box is one piece whose area is faces + tabs', () => {
  const W = 40, D = 30, H = 20;
  const { pieces } = foldNet({ W, D, H, faces: subsets[0], tabWidth: 4 });
  assert.equal(pieces.length, 1);
  const [piece] = pieces;
  assert.equal(piece.polys.length, 1, 'single outline');
  const faceArea = 2 * (W * D + W * H + D * H);
  const outer = Math.abs(polygonArea(piece.polys[0]));
  assert.ok(outer > faceArea, 'tabs add area');
  // 5 fold lines + 7 tab folds
  assert.equal(piece.scores.length, 12);
});

test('fold net works for open boxes and separate pieces', () => {
  const open = foldNet({ W: 40, D: 30, H: 20, faces: ['top', 'left', 'right'] });
  assert.equal(open.pieces.length, 1);
  assert.equal(open.pieces[0].scores.length, 2);
  const sep = foldNet({ W: 40, D: 30, H: 20, faces: ['bottom', 'back', 'left', 'right'], separate: true });
  assert.equal(sep.pieces.length, 4);
  for (const p of sep.pieces) assert.equal(p.polys.length, 1);
});

test('holes are mapped into fold nets', () => {
  const { pieces } = foldNet({ W: 40, D: 30, H: 50, faces: ['bottom', 'back', 'left', 'right'], holes: { back: [rectPoly(10, 10, 10, 10)] } });
  assert.equal(pieces[0].polys.length, 2);
  assert.ok(Math.abs(Math.abs(polygonArea(pieces[0].polys[1])) - 100) < 1e-6);
});

test('tabbed rect and arch shapes', () => {
  const r = tabbedRect(30, 20, [false, true, true, true], 4);
  assert.equal(r.polys.length, 1);
  assert.equal(r.scores.length, 3);
  const arch = archPoly(0, 0, 20, 30);
  const expected = 20 * 20 + (Math.PI * 100) / 2;
  assert.ok(Math.abs(polygonArea(arch) - expected) < 1);
});
