// Shared assertions for the shell tests (not a test file itself).
import assert from 'node:assert/strict';
import { partBox } from '../src/shells/fit.js';

// Two parts touch when their solids share a face (closed boxes meet, no gap).
const touches = (a, b, t) => {
  const A = partBox(a, t), B = partBox(b, t);
  return A.every(([a0, a1], k) => a0 <= B[k][1] + 1e-9 && B[k][0] <= a1 + 1e-9);
};

export function checkJoints(sh, t) {
  const keys = new Set(sh.parts.map((p) => p.key));
  const byKey = new Map(sh.parts.map((p) => [p.key, p]));
  assert.ok(Array.isArray(sh.joints) && sh.joints.length);
  for (const j of sh.joints) {
    assert.ok(keys.has(j.a) && keys.has(j.b), `joint ${j.a}–${j.b} names real parts`);
    assert.ok(['finger', 'slot', 'glue-tab', 'glue-flat'].includes(j.kind), j.kind);
    assert.ok(touches(byKey.get(j.a), byKey.get(j.b), t), `${j.a} and ${j.b} actually meet`);
  }
  // every part is joined, and the whole kit is one connected piece
  const adj = new Map([...keys].map((k) => [k, []]));
  for (const j of sh.joints) { adj.get(j.a).push(j.b); adj.get(j.b).push(j.a); }
  const seen = new Set([sh.parts[0].key]);
  const queue = [sh.parts[0].key];
  while (queue.length) for (const n of adj.get(queue.shift())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  assert.deepEqual([...keys].filter((k) => !seen.has(k)), [], 'unjoined parts');
}
