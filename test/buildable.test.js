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
import { loadPiece } from '../src/pieces/load.js';

/** Pieces from the audit still waiting for their fix (each later PR empties this). */
const PENDING = new Set([]);

/** Pieces with strips narrower than the cutter manages, waiting for their fix. */
const PENDING_STRIPS = new Set([]);
/** Floor pieces that can't yet stand up on their own, waiting for their fix. */
const PENDING_STAND = new Set([]);

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

/** How wide what a floor piece stands on is (mm), and how tall it is, at each size. */
function footprints(type) {
  const def = CATALOG[type];
  return sizes(def).map(([label, params]) => {
    const kit = soloKit(base, type, params, defaultMaterialFor(def, base.materials));
    const c = compileKit(kit);
    const zs = c.faces3d.filter((f) => f.item === 0).flatMap((f) => f.polys[0].map((p) => p[2]));
    return [label, attachmentReport(kit, c)[0].footprint, Math.max(...zs) - Math.min(...zs)];
  });
}
// it rests on at least 2 mm, or on a third of its height for tiny pieces
const stands = (w, height) => w >= Math.min(2, height / 3);

test('every floor piece stands on its own: it rests on more than a line', () => {
  for (const [type, def] of Object.entries(CATALOG)) {
    if (def.placement === 'wall' || PENDING_STAND.has(type)) continue;
    for (const [label, w, height] of footprints(type)) assert.ok(stands(w, height), `${def.label} (${type}) ${label}: a ${height.toFixed(1)} mm piece standing on a ${w.toFixed(2)} mm strip`);
  }
  for (const type of PENDING_STAND) assert.ok(footprints(type).some(([, w, height]) => !stands(w, height)), `${type} stands now: take it off the pending list`);
});

test('ladder is a step ladder, fire screen a zigzag, crib slats at least 3 mm, coat stand in a slot', () => {
  const build = (type, params = {}) => {
    const kit = soloKit(base, type, params, defaultMaterialFor(CATALOG[type], base.materials));
    const c = compileKit(kit);
    return { kit, c, r: attachmentReport(kit, c)[0], part: (n) => c.parts.find((p) => p.name === n) };
  };
  const ladder = build('ladder');
  assert.ok(ladder.part('Front ladder') && ladder.part('Back ladder'));
  assert.equal(ladder.r.contacts.length, 1, 'the two ladders lean on each other at the top');
  const screen = build('firescreen');
  assert.equal(screen.r.contacts.length, 2, 'side panels glued to the middle one');
  // the ladder stands on the floor (tilted boards don't sink into it), and
  // a short ladder gets fewer rungs rather than rungs or gaps under 3 mm
  const bottom = (c) => Math.min(...c.faces3d.filter((f) => f.item != null).flatMap((f) => f.polys.flat().flatMap((q) => [q[2], q[2] - f.n[2] * f.thickness])));
  const floor = bottom(build('crib').c);
  assert.ok(Math.abs(bottom(ladder.c) - floor) < 0.01, `ladder bottom at z ${bottom(ladder.c)}, floor at ${floor}`);
  for (const h of [80, 260]) {
    const front = build('ladder', { h, rungs: 12 }).part('Front ladder');
    assert.ok(narrowestStrip(front.polys) >= 3 - 1e-6, `ladder h ${h}: ${narrowestStrip(front.polys)} mm`);
  }
  // crib: slats per side is the number of slats, capped only so a slat stays 3 mm
  const holes = (p) => build('crib', p).part('Side front').polys.length - 1;
  for (const slats of [2, 3, 4]) assert.equal(holes({ slats }), slats + 1, `default crib, ${slats} slats`);
  assert.equal(holes({ w: 130, slats: 6 }), 7, 'a long crib takes the most slats');
  for (const w of [60, 130]) {
    const side = build('crib', { w, slats: 6 }).part('Side front');
    assert.ok(narrowestStrip(side.polys) >= 3 - 1e-6, `crib w ${w}: slats ${narrowestStrip(side.polys)}`);
  }
  const stand = build('coatrack');
  assert.equal(stand.part('Base layer 1').polys.length, 1, 'the stand stands on the bottom layer');
  assert.equal(stand.part('Base layer 2').polys.length, 2, 'slot in the top layer');
  assert.deepEqual(stand.r.crossings, []);
});

test('blocks too thin to joint are laminated; books are solid blocks', () => {
  const parts = (type, mat) => compileKit(soloKit(base, type, {}, mat ?? defaultMaterialFor(CATALOG[type], base.materials))).parts;
  const mantel = parts('fireplace').filter((p) => p.group === 'Fireplace' && /^Mantel/.test(p.name));
  assert.ok(mantel.length >= 2 && mantel.every((p) => /^Mantel layer \d+$/.test(p.name)), mantel.map((p) => p.name).join(', '));
  const legs = parts('piano').filter((p) => /^Leg 1/.test(p.name));
  assert.ok(legs.every((p) => / layer \d+$/.test(p.name)), legs.map((p) => p.name).join(', '));
  // a big box still gets finger joints
  assert.ok(parts('piano').some((p) => p.name === 'Piano front'));
  const books = parts('bookrow', 'card110').filter((p) => /^Book 1 /.test(p.name));
  assert.equal(books.length, Math.round((3 * 10) / base.scale / 0.38), 'a 3 cm spine is three card layers');
});

test('solid: is validated as true or false', () => {
  const piece = (solid) => ({
    id: 'x', label: 'X', theme: 'Basics', placement: 'floor', mat: 'board', params: [], defaults: {}, size: [10, 10, 10],
    components: [{ kind: 'box', name: 'B', size: [10, 10, 10], faces: 'all', solid }],
  });
  assert.deepEqual(validatePiece(piece(true)), []);
  assert.match(validatePiece(piece('yes')).join(), /solid: must be true or false/);
});

test('a laminated block keeps its outside score lines, open boxes stay open, slots keep a floor', () => {
  const compile = (type, params = {}, mat) => compileKit(soloKit(base, type, params, mat ?? defaultMaterialFor(CATALOG[type], base.materials)));
  // the piano's keybed is a block, and its keys are still scored on it
  const keybed = compile('piano').parts.filter((p) => /^Keybed layer/.test(p.name));
  assert.ok(keybed.length >= 1 && keybed.some((p) => (p.scores || []).length), 'keybed keeps its key scores');
  // a bookshelf too thin to joint warns; it never becomes a solid block
  for (const [label, params] of sizes(CATALOG.bookshelf)) {
    const c = compile('bookshelf', params);
    assert.ok(!c.parts.some((p) => p.build?.role === 'layer'), `bookshelf ${label} is not a block`);
  }
  // a block with a slot in its top has at least two layers, so the slot has a floor
  const def = { id: 'test-slotblock', label: 'Slot block', theme: 'Basics', placement: 'floor', mat: 'board', params: [], defaults: {}, size: [20, 20, 2],
    components: [{ kind: 'box', name: 'Base', size: [20, 20, 2], faces: 'all', solid: true, at: [0, 0, 0], holes: { top: [{ rect: [8, 9, 4, 2] }] } }] };
  CATALOG['test-slotblock'] = loadPiece(def);
  try {
    const layers = compileKit(soloKit(base, 'test-slotblock', {}, 'chip2')).parts.filter((p) => /^Base layer/.test(p.name));
    assert.equal(layers.length, 2);
    assert.equal(layers[0].polys.length, 1, 'the first layer is the floor of the slot');
    assert.equal(layers[1].polys.length, 2);
  } finally { delete CATALOG['test-slotblock']; }
  // books are as thick as their layers, so a row on board doesn't run together
  const row = compile('bookrow', { th: 2 }, 'chip2');
  const r = attachmentReport(soloKit(base, 'bookrow', { th: 2 }, 'chip2'), row)[0];
  assert.deepEqual(r.crossings, []);
});

test('the spiral stair post is a bought dowel: drawn in 3D, in the bill and in its guide step', () => {
  const kit = { ...defaultKit(), items: [], shell: { type: 'twostorey', gap: { w: 250, h: 280, d: 200 }, clearance: 2, params: { stairs: 'spiral' } } };
  const c = compileKit(kit);
  const k = c.hardware.findIndex((h) => h.name === 'Stair post');
  assert.ok(k >= 0, 'post listed as hardware');
  const post = c.hardware[k];
  assert.equal(post.stock, 'dowel');
  assert.equal(post.group, 'Stairs');
  assert.ok(Math.hypot(post.to[0] - post.from[0], post.to[1] - post.from[1]) < 1e-6 && post.to[2] > post.from[2], 'post stands upright');
  assert.ok(post.length > 50, `post ${post.length} mm`);
  assert.ok(c.faces3d.some((f) => f.hardware === k), 'post drawn in 3D');
  assert.match(bomText(billOfMaterials(kit, c)), /dowel/i);
  const steps = buildSteps(kit, c);
  const step = steps.find((s) => (s.hardware || []).includes(k));
  assert.ok(step, 'a step puts the post in');
  assert.equal(step.text.filter((x) => /\bcut\b/i.test(x) && /dowel/i.test(x)).length, 1, 'cut once');
  assert.ok(explodedFaces(kit, c, steps, step.n).some((f) => f.part === `rod${k}` && f.moving), 'post moves in its step');
});

test('every lighting and hidden-base part is drawn in 3D where it goes', () => {
  const kit = defaultKit();
  kit.openings = [];
  kit.room.ceiling = true;
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, kind: 'battery', supply: 'aa2', mount: 'base' };
  kit.lighting.leds = [
    { mount: 'wall', wall: 'back', pos: 80, elev: 150, color: 'warm' },
    { mount: 'ceiling', x: 150, y: 100, effect: 'fan', sizeMm: 60 },
    { mount: 'floor', x: 100, y: 100, effect: 'turntable', sizeMm: 50 },
  ];
  kit.lighting.cover = { enabled: true };
  const c = compileKit(kit);
  const owner = faceParts(kit, c);
  const drawn = new Set(owner.filter((id) => id != null));
  const parts = c.parts.filter((p) => p.group === 'Lighting' || p.group === 'Hidden base');
  assert.ok(parts.some((p) => /motor mount/.test(p.name)) && parts.some((p) => /Hatch stop/.test(p.name)) && parts.some((p) => /Cable cover panel/.test(p.name)));
  for (const p of parts) assert.ok(drawn.has(p.id), `${p.name} (#${p.id}) is drawn in 3D`);
  // each one is drawn as its own part, not guessed from its outline
  for (const p of parts) assert.ok(c.faces3d.some((f) => f.part === p.id), `${p.name} carries its part id`);
  // the fan's motor mount sits on top of the ceiling, the turntable's under the floor
  const zs = (name) => c.faces3d.filter((f, k) => owner[k] === c.parts.find((p) => p.name === name)?.id)
    .flatMap((f) => f.polys.flat().flatMap((q) => [q[2], q[2] - f.n[2] * (f.thickness || 0)]));
  const ceiling = Math.max(...zs('Ceiling')), floor = Math.min(...zs('Floor'));
  const plate = (id) => c.faces3d.filter((f) => f.part === id && f.thickness > 0).flatMap((f) => f.polys.flat().flatMap((q) => [q[2], q[2] - f.n[2] * f.thickness]));
  const mounts = c.parts.filter((p) => /motor mount/.test(p.name)).map((p) => plate(p.id));
  assert.ok(mounts.some((z) => Math.abs(Math.min(...z) - ceiling) < 0.01), `a mount on the ceiling at ${ceiling}: ${mounts.map((z) => Math.min(...z)).join(', ')}`);
  assert.ok(mounts.some((z) => Math.abs(Math.max(...z) - floor) < 0.01), `a mount under the floor at ${floor}`);
  // each motor's shaft runs from its mount through the shaft hole to the rotor in the room
  const reach = c.parts.filter((p) => /motor mount/.test(p.name)).map((p) => {
    const zs = c.faces3d.filter((f) => f.part === p.id && f.thickness === 0).flatMap((f) => f.polys.flat().map((q) => q[2]));
    return zs.length ? [Math.min(...zs), Math.max(...zs)] : null;
  });
  const fanBlades = zs(c.parts.find((p) => /fan blades/.test(p.name)).name), disc = zs(c.parts.find((p) => /turntable/.test(p.name)).name);
  assert.ok(fanBlades.length && disc.length, 'rotors drawn');
  assert.ok(reach.some((r) => r && r[1] >= ceiling - 0.01 && r[0] <= Math.max(...fanBlades) + 0.01), `fan shaft reaches the blades: ${JSON.stringify(reach)}`);
  assert.ok(reach.some((r) => r && r[0] <= floor + 0.01 && r[1] >= Math.min(...disc) - 0.01), `turntable shaft reaches the disc: ${JSON.stringify(reach)}`);
});

test('every piece cuts cleanly in every board and card material: no strip under the cutter minimum', () => {
  const mats = base.materials.filter((m) => m.kind === 'board' || m.kind === 'card');
  const bad = [];
  for (const [type, def] of Object.entries(CATALOG)) {
    for (const m of mats) {
      const min = minJointFeature(null, m);
      for (const [label, params] of sizes(def)) {
        const c = compileKit(soloKit(base, type, params, m.id));
        for (const p of c.parts) {
          if (!p.polys) continue;
          const w = narrowestStrip(p.polys);
          if (w < min - 1e-6) bad.push(`${type} in ${m.id} ${label}: ${p.name} ${w.toFixed(2)} mm (needs ${min})`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('in a book-nook shell, the cable cover, motor mounts and shafts are drawn too', () => {
  for (const type of ['nook', 'twostorey']) {
    const kit = { ...defaultKit(), items: [], openings: [], shell: { type, gap: { w: 250, h: 280, d: 200 }, clearance: 2, params: {} } };
    kit.room.ceiling = true;
    kit.lighting.enabled = true;
    kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, kind: 'battery', supply: 'aa2' };
    kit.lighting.leds = [{ mount: 'wall', wall: 'back', pos: 80, elev: 150, color: 'warm' }, { mount: 'ceiling', x: 150, y: 100, effect: 'fan', sizeMm: 60 }];
    kit.lighting.cover = { enabled: true };
    const c = compileKit(kit);
    const parts = c.parts.filter((p) => p.group === 'Lighting');
    assert.ok(parts.some((p) => /Cable cover panel/.test(p.name)), type);
    assert.ok(!c.warnings.some((w) => /room's the room/.test(w.msg)), 'the set-aside note reads cleanly');
    for (const p of parts) assert.ok(c.faces3d.some((f) => f.part === p.id), `${type}: ${p.name} is drawn in 3D`);
    // the cover sits on the outside of the shell's back wall
    const back = c.shell.dims.D;
    const panel = parts.find((p) => p.name === 'Cable cover panel');
    const ys = c.faces3d.filter((f) => f.part === panel.id).flatMap((f) => f.polys.flat().map((q) => q[1]));
    assert.ok(Math.min(...ys) > back - 0.01, `${type}: cover panel behind the back wall (${Math.min(...ys)} vs ${back})`);
  }
});
