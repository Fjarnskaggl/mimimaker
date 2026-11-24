// Compile-speed budget. Every edit recompiles the kit, and placing part
// numbers (labelAnchor) used to be ~80% of a compile. The budget counts work
// (point–edge tests), which is deterministic, so it can gate merges where a
// timing would flake. The answer must stay exactly what a plain search of the
// whole 13×13 grid finds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { compileKit } from '../src/kit.js';
import { labelAnchor, labelWork } from '../src/labels.js';
import { pointInPolygon, distToPolys } from '../src/geometry.js';
import { defaultKit } from '../src/catalog.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';

/** The plain search, counting point–edge tests the same way labelWork does. */
function plainAnchor(part, text = String(part.id)) {
  const [outer, ...holes] = part.polys;
  const edges = part.polys.reduce((n, p) => n + p.length, 0);
  let best = null, work = 0;
  const N = 13;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = [((i + 0.5) / N) * part.w, ((j + 0.5) / N) * part.h];
    work += outer.length;
    if (!pointInPolygon(p, outer)) continue;
    work += holes.reduce((n, h) => n + h.length, 0);
    if (holes.some((h) => pointInPolygon(p, h))) continue;
    work += edges;
    const d = distToPolys(p, part.polys);
    const score = d - 0.001 * Math.hypot(p[0] - part.w / 2, p[1] - part.h / 2);
    if (!best || score > best.score) best = { x: p[0], y: p[1], d, score };
  }
  if (!best) best = { x: part.w / 2, y: part.h / 2, d: 2 };
  const size = Math.max(1.2, Math.min(5, best.d * 1.3, (1.8 * best.d) / (text.length * 0.75)));
  return { anchor: { x: best.x, y: best.y, size }, work };
}

function allKits() {
  const kits = ROOM_TYPES.map((rt) => [rt.id, applyRoomType(defaultKit(), rt.id)]);
  for (const f of readdirSync(new URL('../kits/', import.meta.url)).filter((f) => f.endsWith('.kit.json'))) {
    const j = JSON.parse(readFileSync(new URL(`../kits/${f}`, import.meta.url), 'utf8'));
    kits.push([f, j.kit || j]);
  }
  return kits;
}

test('perf budget: part numbers land exactly where a full grid search puts them, for a third of the work', () => {
  let parts = 0, plain = 0, used = 0;
  for (const [name, kit] of allKits()) {
    for (const part of compileKit(kit).parts) {
      parts++;
      const ref = plainAnchor(part);
      labelWork.edgeTests = 0;
      assert.deepEqual(labelAnchor(part), ref.anchor, `${name}: part ${part.id} (${part.name})`);
      plain += ref.work;
      used += labelWork.edgeTests;
    }
  }
  assert.ok(parts > 500, `checked ${parts} parts`);
  // measured 2026-11-24: 25% of the plain search's point–edge tests (3.7× faster compiles)
  assert.ok(used <= plain * 0.33, `label work ${used} <= 33% of the plain search's ${plain} (${((100 * used) / plain).toFixed(1)}%)`);
});

test('perf budget: compiling the café places its part numbers in under 150k point–edge tests', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  labelWork.edgeTests = 0;
  compileKit(kit);
  // measured 2026-11-24: ~105k (the plain search: ~420k)
  assert.ok(labelWork.edgeTests > 0 && labelWork.edgeTests <= 150000, `${labelWork.edgeTests}`);
});
