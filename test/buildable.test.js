// Every piece must really build from its cut parts: each part is held by the
// rest of the piece (and through it by the floor or wall), and no part runs
// through the middle of another. See docs/audits/buildability.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, defaultKit, defaultMaterialFor } from '../src/catalog.js';
import { compileKit } from '../src/kit.js';
import { buildShell } from '../src/shells/index.js';
import { attachmentReport, soloKit, planeSlabs, holdCheck, onLowest, crossings, narrowestStrip } from '../src/build/attach.js';
import { minJointFeature } from '../src/box.js';
import { buildSteps } from '../src/build/steps.js';
import { explodedFaces } from '../src/build/exploded.js';
import { faceTexture } from '../src/textures/look.js';
import { plantPoly } from '../src/pieces/shapes.js';
import { billOfMaterials, bomText } from '../src/build/bom.js';
import { faceParts } from '../src/build/exploded.js';
import { validatePiece } from '../src/pieces/schema.js';

/** Pieces from the audit still waiting for their fix (each later PR empties this). */
const PENDING = new Set(['coatrack', 'crib']);

/** Pieces with strips narrower than the cutter manages, waiting for their fix. */
const PENDING_STRIPS = new Set(['fireplace', 'piano', 'firescreen', 'loveseat', 'dressingtable', 'crib', 'vanity', 'ladder', 'coatrack', 'bookrow']);

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

/** Parts (at the default size) with a strip narrower than the cutter's smallest clean feature. */
function thinStrips(type) {
  const def = CATALOG[type];
  const kit = soloKit(base, type, {}, defaultMaterialFor(def, base.materials));
  const c = compileKit(kit);
  const title = c.groups.at(-1).title;
  return c.parts.filter((p) => p.group === title).flatMap((p) => {
    const min = minJointFeature(c.machine, kit.materials.find((m) => m.id === p.material));
    const w = narrowestStrip(p.polys);
    return w < min - 1e-6 ? [`${p.name}: ${w.toFixed(2)} mm strip, under ${min} mm`] : [];
  });
}

test('no catalogue piece has a strip of material too narrow for the cutter (default size)', () => {
  for (const type of Object.keys(CATALOG)) {
    if (PENDING_STRIPS.has(type)) continue;
    assert.deepEqual(thinStrips(type), [], `${CATALOG[type].label} (${type})`);
  }
  for (const type of PENDING_STRIPS) assert.ok(thinStrips(type).length > 0, `${type} has no thin strips now: take it off the pending list`);
});

test('narrowestStrip measures across the material, including between holes', () => {
  assert.equal(narrowestStrip([[[0, 0], [20, 0], [20, 5], [0, 5]]]), 5);
  // a 10 mm square with a hole leaving 2 mm on the left
  assert.ok(Math.abs(narrowestStrip([[[0, 0], [10, 0], [10, 10], [0, 10]], [[2, 3], [7, 3], [7, 7], [2, 7]]]) - 2) < 1e-9);
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
  // the build guide says how long to cut it, and its exploded view shows it
  const steps = buildSteps(kit, c);
  const step = steps.find((s) => s.text.some((x) => /Cut a 1\.5 mm brass tube .* \d+ mm long for the stem/.test(x)));
  assert.ok(step, steps.map((s) => s.text.join(' ')).join('\n'));
  assert.ok(explodedFaces(kit, c, steps, step.n).some((f) => f.moving && f.source.hardware === 0), 'stem in the exploded view');
  // in Realistic 3D it wears its own colour, not the card's
  const tex = faceTexture(rodFaces[0][0], kit);
  assert.equal(tex.params.colors[0], rodFaces[0][0].color);
});

test('floor lamp spider: no strip under the fine blade minimum at any size', () => {
  const def = CATALOG.floorlamp;
  for (const [label, params] of sizes(def)) {
    const c = compileKit(soloKit(base, 'floorlamp', params, 'card110'));
    const spider = c.parts.find((p) => p.name === 'Shade spider');
    assert.ok(narrowestStrip(spider.polys) >= 1.5 - 1e-6, `${label}: ${narrowestStrip(spider.polys)}`);
  }
});

test('a rod with no length warns instead of vanishing quietly', () => {
  const kit = soloKit(base, 'floorlamp', {}, 'card110');
  kit.items[0].params.h = (0.38 * kit.scale) / 10; // below its range: the stem would end where it starts
  const c = compileKit(kit);
  assert.ok(c.warnings.some((w) => /stem has no length/.test(w.msg)), JSON.stringify(c.warnings));
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

test('plants stand on a stem in a slot in the soil top, from the pot floor up', () => {
  for (const [type, potName, leafName] of [['plant', 'Pot net', 'Leaves'], ['littleplant', 'Pot net', 'Leaves'], ['planter', 'Planter top', 'Greenery'], ['pottedtree', 'Pot net', 'Crown A']]) {
    const kit = soloKit(base, type, {}, defaultMaterialFor(CATALOG[type], base.materials));
    const c = compileKit(kit);
    const [r] = attachmentReport(kit, c);
    const part = (n) => c.parts.find((p) => p.name === n);
    const pot = part(potName), leaf = part(leafName);
    assert.ok(pot && leaf, `${type}: ${c.parts.map((p) => p.name).join(', ')}`);
    // the stem goes through the soil, so the two touch, nothing floats and nothing runs through
    assert.ok(r.contacts.some(([a, b]) => [a, b].includes(pot.id) && [a, b].includes(leaf.id)), `${type}: ${leafName} stands in the ${potName}`);
    assert.deepEqual(r.floating, [], type);
    assert.deepEqual(r.crossings, [], type);
    // without the slot, the stem would run through the soil top
    const own = faceParts(kit, c);
    const noSlot = { ...c, faces3d: c.faces3d.map((f, k) => (own[k] === pot.id && f.polys.length > 1 && Math.abs(f.n[2]) > 0.9 ? { ...f, polys: [f.polys[0]] } : f)) };
    const [r2] = attachmentReport(kit, noSlot);
    assert.ok(r2.crossings.length > 0, `${type}: the stem needs its slot`);
  }
});

test('plant pieces keep every strip cuttable at their smallest and largest sizes too', () => {
  for (const type of ['plant', 'littleplant', 'planter', 'pottedtree', 'floorlamp']) {
    const def = CATALOG[type];
    for (const [label, params] of sizes(def)) {
      const kit = soloKit(base, type, params, defaultMaterialFor(def, base.materials));
      const c = compileKit(kit);
      for (const p of c.parts.filter((q) => q.group === c.groups.at(-1).title)) {
        const min = minJointFeature(c.machine, kit.materials.find((m) => m.id === p.material));
        assert.ok(narrowestStrip(p.polys) >= min - 1e-6, `${type} ${label}: ${p.name} ${narrowestStrip(p.polys).toFixed(2)} mm`);
      }
    }
  }
});

test('potted tree crowns cross-lap: slits cut in both, crown B held by crown A', () => {
  const kit = soloKit(base, 'pottedtree', {}, 'card110');
  const c = compileKit(kit);
  const [r] = attachmentReport(kit, c);
  const id = (n) => c.parts.find((p) => p.name === n).id;
  assert.ok(!c.parts.some((p) => p.name === 'Trunk'), 'the trunk is part of crown A');
  assert.ok(r.contacts.some(([a, b]) => [a, b].includes(id('Crown A')) && [a, b].includes(id('Crown B'))));
  assert.deepEqual(r.crossings, []);
});

test('plantPoly: a stem tab down to y = 0 under the leaves, and slits from the top or bottom', () => {
  const ys = (pts) => pts.map((p) => p[1]);
  const raw = plantPoly(20, 30, 4);
  assert.ok(Math.min(...ys(raw)) > 0, 'a plain plant stays where it always was');
  const low = Math.min(...ys(raw));
  const plain = raw.map(([x, y]) => [x, y - low]); // where a stem or slit puts it: on y = 0
  const stem = plantPoly(20, 30, 4, 3, 10);
  assert.equal(Math.min(...ys(stem)), 0);
  const foot = stem.filter((p) => p[1] === 0).map((p) => p[0]).sort((a, b) => a - b);
  assert.deepEqual(foot, [8.5, 11.5], 'a 3 mm stem centred under the leaves');
  const leafLow = Math.min(...ys(stem.filter((p) => p[1] > 0)));
  assert.ok(leafLow >= 10 - 1e-9 && leafLow < 12, `leaves start 10 up (${leafLow})`);
  // slits 1.5 wide down the middle, to just past the leaves' centre
  const mid = (Math.min(...ys(plain)) + Math.max(...ys(plain))) / 2;
  const top = plantPoly(20, 30, 4, 0, 0, 1.5), bottom = plantPoly(20, 30, 4, 0, 0, -1.5);
  const slitEnd = (pts) => pts.filter(([x]) => Math.abs(x - 9.25) < 1e-9 || Math.abs(x - 10.75) < 1e-9).map((p) => p[1]);
  assert.ok(slitEnd(top).some((y) => Math.abs(y - (mid - 0.1)) < 1e-9), 'from the top down to the middle');
  assert.ok(slitEnd(bottom).some((y) => Math.abs(y - (mid + 0.1)) < 1e-9), 'from the bottom up to the middle');
  // the mouth is cut square, so the leaf beside the slit is at least 1.5 mm wide
  assert.ok(narrowestStrip([top]) >= 1.5 && narrowestStrip([bottom]) >= 1.5, `${narrowestStrip([top])} ${narrowestStrip([bottom])}`);
});
