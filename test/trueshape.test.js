// T3 true-shape nesting. Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';
import { packParts, placementTransform, nestParts, SHEET_MARGIN, PART_GAP } from '../src/nest.js';
import { nestTrueShape } from '../src/export/trueshape.js';
import { polygonArea, rectPoly, distToSegment, pointInPolygon, bbox } from '../src/geometry.js';
import { effectiveSheet, MACHINES } from '../src/materials.js';

// ------------------------------------------------------------------ helpers
const segDist = (a, b, c, d) => {
  // 0 if the segments cross, else the smallest endpoint-to-segment distance
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return 0;
  return Math.min(distToSegment(a, c, d), distToSegment(b, c, d), distToSegment(c, a, b), distToSegment(d, a, b));
};
const inMaterial = (p, loops) => loops.reduce((n, l) => n + (pointInPolygon(p, l) ? 1 : 0), 0) % 2 === 1;
const sheetLoops = (pl) => pl.part.polys.map((poly) => poly.map(placementTransform(pl)));

/** Throws unless every placement is on the sheet and every pair is ≥ gap apart and not nested in material. */
function assertValidSheet(sheet, { margin = SHEET_MARGIN, gap = PART_GAP } = {}) {
  const eps = 1e-6;
  const all = sheet.placements.map((pl) => ({ pl, loops: sheetLoops(pl) }));
  for (const { pl, loops } of all) {
    for (const loop of loops) for (const [x, y] of loop) {
      assert.ok(x >= margin - eps && x <= sheet.w - margin + eps && y >= margin - eps && y <= sheet.h - margin + eps,
        `#${pl.part.id} vertex ${x.toFixed(2)},${y.toFixed(2)} outside the ${sheet.w}×${sheet.h} sheet margin`);
    }
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const A = all[i], B = all[j];
    const ba = bbox(A.loops), bb = bbox(B.loops);
    if (ba.x0 > bb.x1 + gap || bb.x0 > ba.x1 + gap || ba.y0 > bb.y1 + gap || bb.y0 > ba.y1 + gap) continue;
    let d = Infinity;
    for (const la of A.loops) for (const lb of B.loops) {
      for (let a = 0; a < la.length; a++) for (let b = 0; b < lb.length; b++) {
        d = Math.min(d, segDist(la[a], la[(a + 1) % la.length], lb[b], lb[(b + 1) % lb.length]));
      }
    }
    assert.ok(d >= gap - 1e-6, `#${A.pl.part.id} and #${B.pl.part.id} are ${d.toFixed(3)} mm apart (< ${gap})`);
    assert.ok(!inMaterial(A.loops[0][0], B.loops), `#${A.pl.part.id} sits inside #${B.pl.part.id}`);
    assert.ok(!inMaterial(B.loops[0][0], A.loops), `#${B.pl.part.id} sits inside #${A.pl.part.id}`);
  }
}

function assertComplete(result, parts) {
  const placed = result.sheets.flatMap((s) => s.placements.map((pl) => pl.part.id));
  const all = [...placed, ...result.oversize.map((p) => p.id)].sort((a, b) => a - b);
  assert.deepEqual(all, parts.map((p) => p.id).sort((a, b) => a - b), 'every part placed exactly once');
}

const part = (id, polys) => {
  const b = bbox(polys);
  return { id, polys: polys.map((l) => l.map(([x, y]) => [x - b.x0, y - b.y0])), scores: [], w: b.w, h: b.h, label: { x: b.w / 2, y: b.h / 2, size: 3 } };
};
const tri = (id, s) => part(id, [[[0, 0], [s, 0], [0, s]]]);
const frame = (id, o, i) => part(id, [rectPoly(0, 0, o, o), rectPoly((o - i) / 2, (o - i) / 2, i, i)]);
const square = (id, s) => part(id, [rectPoly(0, 0, s, s)]);

// ------------------------------------------------------- placement transform
test('placementTransform supports 0/90/180/270° without mirroring', () => {
  const p = part(1, [[[0, 0], [30, 0], [30, 10], [0, 20]]]);
  for (const angle of [0, 90, 180, 270]) {
    const swap = angle % 180 === 90;
    const pl = { part: p, angle, rot: swap, x: 10, y: 20, w: swap ? p.h : p.w, h: swap ? p.w : p.h };
    const loop = p.polys[0].map(placementTransform(pl));
    const b = bbox([loop]);
    assert.ok(Math.abs(b.x0 - 10) < 1e-9 && Math.abs(b.y0 - 20) < 1e-9, `angle ${angle} origin`);
    assert.ok(Math.abs(b.w - pl.w) < 1e-9 && Math.abs(b.h - pl.h) < 1e-9, `angle ${angle} size`);
    // y-up → y-down flips the winding once; a mirror would flip it again
    assert.equal(Math.sign(polygonArea(loop)), -Math.sign(polygonArea(p.polys[0])), `angle ${angle} is a rotation`);
  }
  // old placements without an angle still work
  const old = { part: p, rot: true, x: 0, y: 0, w: p.h, h: p.w };
  const withAngle = { ...old, angle: 90 };
  assert.deepEqual(p.polys[0].map(placementTransform(old)), p.polys[0].map(placementTransform(withAngle)));
});

// ------------------------------------------------------------ correctness
test('true-shape nesting: no overlaps, gap kept, parts inside the sheet (default kit, every material)', () => {
  const r = compileKit(defaultKit());
  for (const m of r.usedMats) {
    const [sw, sh] = effectiveSheet(m, r.machine);
    const mine = r.parts.filter((p) => p.material === m.id);
    const res = nestTrueShape(mine, sw, sh);
    assertComplete(res, mine);
    for (const s of res.sheets) assertValidSheet(s);
  }
});

test('true-shape nesting: valid on awkward shapes (triangles, frames, L-shapes)', () => {
  const parts = [];
  let id = 1;
  for (let k = 0; k < 6; k++) parts.push(tri(id++, 60 + 25 * k));
  for (let k = 0; k < 4; k++) parts.push(frame(id++, 90 + 10 * k, 60 + 5 * k));
  for (let k = 0; k < 6; k++) parts.push(part(id++, [[[0, 0], [70, 0], [70, 15], [15, 15], [15, 50 + 5 * k], [0, 50 + 5 * k]]]));
  for (let k = 0; k < 10; k++) parts.push(square(id++, 12 + 3 * k));
  const res = nestTrueShape(parts, 279, 279);
  assertComplete(res, parts);
  for (const s of res.sheets) assertValidSheet(s);
});

test('parts too big for any rotation are reported as oversize', () => {
  const parts = [square(1, 50), part(2, [rectPoly(0, 0, 400, 20)])];
  const res = nestTrueShape(parts, 279, 279);
  assert.deepEqual(res.oversize.map((p) => p.id), [2]);
  assertComplete(res, parts);
});

// ------------------------------------------------------------ fewer sheets
test('triangles interlock: half the sheets of rectangle packing', () => {
  const parts = [1, 2, 3, 4].map((id) => tri(id, 200));
  assert.equal(packParts(parts, 279, 279).sheets.length, 4);
  const res = nestTrueShape(parts, 279, 279);
  assert.equal(res.sheets.length, 2);
  for (const s of res.sheets) assertValidSheet(s);
});

test('small parts go into window holes of bigger parts', () => {
  const parts = [];
  for (let k = 1; k <= 4; k++) parts.push(frame(k, 120, 100));
  for (let k = 5; k <= 20; k++) parts.push(square(k, 40));
  assert.equal(packParts(parts, 279, 279).sheets.length, 2);
  const res = nestTrueShape(parts, 279, 279);
  assert.equal(res.sheets.length, 1);
  assertValidSheet(res.sheets[0]);
});

test('nestParts never uses more sheets than rectangle packing (every room type, every material)', () => {
  for (const { id } of ROOM_TYPES) {
    const r = compileKit(applyRoomType(defaultKit(), id));
    for (const m of r.usedMats) {
      const [sw, sh] = effectiveSheet(m, r.machine);
      const mine = r.parts.filter((p) => p.material === m.id);
      const shelf = packParts(mine, sw, sh);
      const best = nestParts(mine, sw, sh);
      assert.ok(best.sheets.length <= shelf.sheets.length, `${id} / ${m.id}: ${best.sheets.length} > ${shelf.sheets.length}`);
      assert.ok(['shelf', 'true-shape'].includes(best.method));
      assertComplete(best, mine);
      for (const s of best.sheets) assertValidSheet(s);
    }
  }
});

test('nestParts picks true-shape when it saves sheets', () => {
  const parts = [1, 2, 3, 4].map((id) => tri(id, 200));
  const best = nestParts(parts, 279, 279);
  assert.equal(best.method, 'true-shape');
  assert.equal(best.sheets.length, 2);
});

test('true-shape nesting is deterministic and quick enough for a whole kit', () => {
  const r = compileKit(applyRoomType(defaultKit(), 'kitchen'));
  const m = r.usedMats[0];
  const [sw, sh] = effectiveSheet(m, MACHINES.maker);
  const mine = r.parts.filter((p) => p.material === m.id);
  const t0 = performance.now();
  const a = nestTrueShape(mine, sw, sh);
  const ms = performance.now() - t0;
  const b = nestTrueShape(mine, sw, sh);
  assert.deepEqual(a.sheets.map((s) => s.placements.map((p) => [p.part.id, p.x, p.y, p.angle])), b.sheets.map((s) => s.placements.map((p) => [p.part.id, p.x, p.y, p.angle])));
  assert.ok(ms < 5000, `${ms.toFixed(0)} ms`);
});
