// Every piece must really build from its cut parts: each part is held by the
// rest of the piece (and through it by the floor or wall), and no part runs
// through the middle of another. See docs/audits/buildability.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, defaultKit, defaultMaterialFor } from '../src/catalog.js';
import { compileKit } from '../src/kit.js';
import { buildShell } from '../src/shells/index.js';
import { attachmentReport, soloKit, planeSlabs, holdCheck, onLowest, crossings } from '../src/build/attach.js';
import { billOfMaterials, bomText } from '../src/build/bom.js';
import { faceParts } from '../src/build/exploded.js';
import { validatePiece } from '../src/pieces/schema.js';

/** Pieces from the audit still waiting for their fix (each later PR empties this). */
const PENDING = new Set(['pottedtree', 'planter', 'plant', 'littleplant', 'coatrack', 'crib']);

const base = defaultKit();
const sizes = (def) => [
  ['default', {}],
  ['smallest', Object.fromEntries(def.params.filter((q) => q.type === 'number').map((q) => [q.key, q.min]))],
  ['largest', Object.fromEntries(def.params.filter((q) => q.type === 'number').map((q) => [q.key, q.max]))],
];
function problems(type) {
  const def = CATALOG[type];
  const out = [];
  for (const [label, params] of sizes(def)) {
    const kit = soloKit(base, type, params, defaultMaterialFor(def, base.materials));
    const compiled = compileKit(kit);
    const [r] = attachmentReport(kit, compiled);
    const name = (id) => r.parts.find((p) => p.id === id)?.name ?? compiled.hardware.find((h, k) => `rod${k}` === id)?.name ?? id;
    for (const p of r.floating) out.push(`${label}: ${p.name} floats`);
    for (const [a, b] of r.crossings) out.push(`${label}: ${name(a)} runs through ${name(b)}`);
  }
  return out;
}

test('every catalogue piece is held together and stands on its floor or wall, at every size', () => {
  for (const type of Object.keys(CATALOG)) {
    if (PENDING.has(type)) continue;
    assert.deepEqual(problems(type), [], `${CATALOG[type].label} (${type})`);
  }
});

test('the pending list only names pieces that still need their fix', () => {
  for (const type of PENDING) {
    assert.ok(CATALOG[type], `${type} is a piece`);
    assert.ok(problems(type).length > 0, `${type} builds now: take it off the pending list`);
  }
});

test('the checker catches a floating part, a part through another, and passes a T-joint', () => {
  const t = 1.5;
  const floor = { id: 'floor', name: 'Floor', slabs: planeSlabs({ o: [0, 0, t], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] }, [[[0, 0], [50, 0], [50, 50], [0, 50]]], t) };
  // an upright panel standing on the floor (T-joint), and one hanging 5 mm above it
  const upright = (z, name, y = 25) => ({ id: name, name, slabs: planeSlabs({ o: [10, y, z], U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] }, [[[0, 0], [30, 0], [30, 20], [0, 20]]], t) });
  const stands = upright(t, 'stands'), hangs = upright(t + 5, 'hangs', 40);
  const r = holdCheck([floor, stands, hangs], onLowest([floor]));
  assert.deepEqual(r.floating.map((n) => n.id), ['hangs']);
  assert.deepEqual(crossings([floor, stands]), [], 'a panel standing on another is a joint, not a crossing');
  // the same panel pushed down through the floor
  assert.deepEqual(crossings([floor, upright(-5, 'through')]), [['floor', 'through']]);
  // ...unless the floor has a slot for it
  const slotted = { ...floor, slabs: planeSlabs({ o: [0, 0, t], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] }, [[[0, 0], [50, 0], [50, 50], [0, 50]], [[9.8, 23.4], [40.2, 23.4], [40.2, 25.2], [9.8, 25.2]]], t) };
  assert.deepEqual(crossings([slotted, upright(-5, 'through')]), []);
});

test('every shell part is held, in every shell and stair', () => {
  const variants = [
    ['nook', {}], ['nook', { gable: true }], ['alley', {}], ['bookshop', {}], ['staircase', {}], ['greenhouse', {}],
    ['twostorey', {}], ['twostorey', { stairs: 'spiral' }], ['twostorey', { stairs: 'none' }], ['twostorey', { risers: false }],
  ];
  for (const [type, params] of variants) {
    const sh = buildShell({ type, gap: { w: 250, h: 280, d: 200 }, params }, { t: 3 });
    const nodes = sh.parts.map((p) => ({ id: p.key, name: p.name, slabs: planeSlabs(p.plane, p.polys, 3) }));
    assert.deepEqual(holdCheck(nodes, onLowest(nodes)).floating, [], `${type} ${JSON.stringify(params)}`);
  }
});

test('floor lamp: the shade sits on a spider threaded on a brass-tube stem that stands in the base', () => {
  const kit = soloKit(base, 'floorlamp', {}, 'card110');
  const c = compileKit(kit);
  const names = c.parts.map((p) => p.name);
  assert.ok(names.includes('Shade spider'), names.join(', '));
  assert.ok(!names.includes('Pole'), 'no card pole');
  const [stem] = c.hardware;
  assert.equal(stem.stock, 'tube');
  assert.ok(stem.d >= 1.5 && stem.length > 40, `stem ${stem.d} × ${stem.length} mm`);
  // the stem goes through holes in the base top and the spider's hub
  const spider = c.parts.find((p) => p.name === 'Shade spider');
  assert.ok(spider.polys.length >= 6, 'spider: rim, four windows and a hub hole');
  // the shade (an open tube) touches the spider, the spider touches the stem
  const [r] = attachmentReport(kit, c);
  const id = (n) => c.parts.find((p) => p.name === n).id;
  const touch = (a, b) => r.contacts.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  assert.ok(touch(id('Shade net'), id('Shade spider')), 'shade on the spider');
  assert.ok(touch(id('Shade spider'), 'rod0'), 'spider on the stem');
  assert.ok(touch('rod0', id('Base net')), 'stem in the base');
  // the stem is drawn in 3D but isn't a cut part
  const own = faceParts(kit, c);
  const rodFaces = c.faces3d.map((f, k) => [f, k]).filter(([f]) => f.hardware === 0);
  assert.ok(rodFaces.length >= 8);
  assert.ok(rodFaces.every(([, k]) => own[k] == null));
  // and it is on the bill of materials and in the steps
  const bom = billOfMaterials(kit, c);
  assert.ok(bom.supplies.some((s) => /brass tube/.test(s.name)), bomText(bom));
  assert.ok(c.groups.some((g) => g.steps.some((s) => /brass tube/.test(s) && /stem/.test(s))));
});

test('rod components are validated', () => {
  const piece = (rod) => ({
    id: 'x', label: 'X', theme: 'Basics', placement: 'floor', mat: 'board', params: [], defaults: {}, size: [10, 10, 10],
    components: [{ kind: 'box', name: 'B', size: [10, 10, 10], faces: 'all' }, { kind: 'rod', name: 'Post', ...rod }],
  });
  assert.deepEqual(validatePiece(piece({ stock: 'dowel', d: 2, from: [5, 5, 0], to: [5, 5, 'h'] })), ['x.components[1].to[2]: unknown name "h"']);
  assert.deepEqual(validatePiece(piece({ stock: 'dowel', d: 2, from: [5, 5, 0], to: [5, 5, 10] })), []);
  assert.match(validatePiece(piece({ stock: 'rope', d: 2, from: [5, 5, 0], to: [5, 5, 10] })).join(), /stock: must be one of dowel, wire, tube/);
  assert.match(validatePiece(piece({ stock: 'wire', from: [5, 5, 0], to: [5, 5, 10] })).join(), /\.d: required/);
});
