// Phase 1 ("studio basics") — written before the implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit, CATALOG } from '../src/catalog.js';
import { applyRoomType } from '../src/templates.js';
import { compileKit } from '../src/kit.js';
import { DEFAULT_MATERIALS, withMaterialDefaults } from '../src/materials.js';
import { encodeKit, decodeKit, shareHash, kitFromHash } from '../src/share.js';
import { footprint, collisions, snap, moveItem, rotateItem, slideOnWall, wallLength } from '../src/plan.js';
import { History } from '../src/history.js';
import { fitCoupon, couponSVG, calibrate, cutLength, estimateCutMinutes } from '../src/make.js';
import { renderScene } from '../src/preview3d.js';
import { partArea, polygonArea } from '../src/geometry.js';

// ------------------------------------------------------------- share links
test('share links round-trip a whole kit', async () => {
  const kit = applyRoomType(defaultKit(), 'kitchen');
  const enc = await encodeKit(kit);
  assert.match(enc, /^[zj][A-Za-z0-9_-]+$/, 'URL-safe');
  assert.deepEqual(await decodeKit(enc), kit);
});

test('share links are compressed well below the raw JSON size', async () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  const enc = await encodeKit(kit);
  assert.ok(enc.length < JSON.stringify(kit).length * 0.5, `${enc.length} vs ${JSON.stringify(kit).length}`);
});

test('share hash parsing', async () => {
  const kit = defaultKit();
  const hash = await shareHash(kit);
  assert.ok(hash.startsWith('#kit='));
  assert.deepEqual(await decodeKit(kitFromHash(hash)), kit);
  assert.equal(kitFromHash('#ledmap'), null);
  assert.equal(kitFromHash(''), null);
  await assert.rejects(decodeKit('xAAAA'));
});

// -------------------------------------------------------------- floor plan
const room = { width: 300, depth: 200 };
const kitWith = (items) => ({ ...defaultKit(), room: { ...defaultKit().room, ...room }, items });
const table = (x, y, rot = 0) => ({ type: 'table', params: { w: 100, d: 60, h: 75 }, material: 'chip15', x, y, rot });

test('footprints follow rotation (real cm)', () => {
  assert.deepEqual(footprint(table(10, 20)), { x0: 10, y0: 20, x1: 110, y1: 80 });
  assert.deepEqual(footprint(table(10, 20, 90)), { x0: 10, y0: 20, x1: 70, y1: 120 });
  assert.equal(footprint({ type: 'frame', params: {}, wall: 'back', pos: 50, elev: 100 }), null, 'wall items have no floor footprint');
});

test('collisions report overlapping furniture but ignore rugs and touching edges', () => {
  const kit = kitWith([
    table(0, 0), table(100, 0), // touching edges: fine
    table(50, 30), // overlaps both
    { type: 'rug', params: { w: 200, d: 100, shape: 'rect' }, material: 'felt', x: 0, y: 0, rot: 0 },
  ]);
  assert.deepEqual(collisions(kit), [[0, 2], [1, 2]]);
});

test('snap rounds to the grid', () => {
  assert.equal(snap(12.4, 5), 10);
  assert.equal(snap(12.6, 5), 15);
  assert.equal(snap(12.6, 0), 12.6, 'step 0 disables snapping');
});

test('moving an item snaps it and keeps it inside the room', () => {
  const kit = kitWith([table(0, 0)]);
  moveItem(kit, 0, 47, 33, { step: 5 });
  assert.deepEqual([kit.items[0].x, kit.items[0].y], [45, 35]);
  moveItem(kit, 0, 260, 190, { step: 5 });
  assert.deepEqual([kit.items[0].x, kit.items[0].y], [200, 140], 'clamped to 300-100, 200-60');
  moveItem(kit, 0, -20, -5, { step: 0 });
  assert.deepEqual([kit.items[0].x, kit.items[0].y], [0, 0]);
});

test('rotating keeps the item centred and inside the room', () => {
  const kit = kitWith([table(100, 50)]); // centre 150, 80
  rotateItem(kit, 0);
  const it = kit.items[0];
  assert.equal(it.rot, 90);
  const f = footprint(it);
  assert.deepEqual([(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2], [150, 80]);
  rotateItem(kit, 0); rotateItem(kit, 0); rotateItem(kit, 0);
  assert.equal(kit.items[0].rot, 0);
  const corner = kitWith([table(200, 140)]);
  rotateItem(corner, 0);
  const g = footprint(corner.items[0]);
  assert.ok(g.x1 <= 300 && g.y1 <= 200 && g.x0 >= 0 && g.y0 >= 0, 'clamped after rotating');
});

test('wall items slide along their wall within its length', () => {
  assert.equal(wallLength('back', room), 300);
  assert.equal(wallLength('left', room), 200);
  const frame = { type: 'frame', params: { w: 40, h: 50, border: 5 }, wall: 'left', pos: 0, elev: 150 };
  slideOnWall(frame, 500, room, { width: 40, step: 5 });
  assert.equal(frame.pos, 180);
  slideOnWall(frame, 63, room, { width: 40, step: 5 });
  assert.equal(frame.pos, 65);
  slideOnWall(frame, -10, room, { width: 40, step: 0 });
  assert.equal(frame.pos, 20);
});

// ----------------------------------------------------------------- history
test('history undoes and redoes, dropping the redo branch on new edits', () => {
  const h = new History(3);
  assert.equal(h.canUndo, false);
  h.push('a'); h.push('b'); h.push('b'); h.push('c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), 'a');
  assert.equal(h.undo(), null, 'nothing before the first state');
  assert.equal(h.redo(), 'b');
  h.push('d');
  assert.equal(h.canRedo, false, 'new edit clears redo');
  assert.equal(h.undo(), 'b');
  h.push('e'); h.push('f'); h.push('g');
  // limit 3 keeps only the newest three states
  assert.equal(h.undo(), 'f');
  assert.equal(h.undo(), 'e');
  assert.equal(h.undo(), null);
});

// -------------------------------------------------- fit test & cut settings
test('fit coupon has one slot per step around the nominal thickness', () => {
  const mat = DEFAULT_MATERIALS.find((m) => m.id === 'chip2');
  const c = fitCoupon(mat);
  assert.deepEqual(c.slots.map((s) => +s.width.toFixed(2)), [1.8, 1.9, 2, 2.1, 2.2]);
  assert.equal(c.polys.length, 1, 'one outline (slots are notches in the edge)');
  const notchArea = c.slots.reduce((sum, s) => sum + s.width * s.depth, 0);
  assert.ok(Math.abs(partArea(c.polys) - (c.w * c.h - notchArea)) < 1e-6);
  assert.ok(polygonArea(c.polys[0]) > 0);
  const svg = couponSVG(mat);
  assert.match(svg, /width="[\d.]+mm"/);
  assert.match(svg, /<g id="cut"/);
  assert.match(svg, /<g id="draw"/, 'slot numbers drawn with a pen');
});

test('calibrating sets the measured thickness', () => {
  const mat = { ...DEFAULT_MATERIALS.find((m) => m.id === 'chip15') };
  const next = calibrate(mat, 1.6);
  assert.equal(next.thickness, 1.6);
  assert.equal(next.calibrated, true);
  assert.equal(mat.thickness, 1.5, 'original untouched');
});

test('materials carry Cricut settings, and old kits get defaults', () => {
  for (const m of DEFAULT_MATERIALS) {
    assert.ok(m.cricut && m.passes >= 1 && m.speed > 0, m.id);
  }
  const old = { id: 'chip2', name: 'Chipboard 2.0 mm', thickness: 2, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#000' };
  const filled = withMaterialDefaults(old);
  assert.ok(filled.passes > 1 && filled.cricut);
  assert.equal(filled.thickness, 2, 'keeps the user\'s values');
  const custom = withMaterialDefaults({ id: 'mine', name: 'Mystery card', thickness: 0.3, kind: 'card', tool: 'fine', sheet: [200, 200], color: '#fff' });
  assert.equal(custom.passes, 1);
});

test('cut length and time estimates', () => {
  const part = { polys: [[[0, 0], [30, 0], [30, 20], [0, 20]]], scores: [[[0, 10], [30, 10]]] };
  assert.deepEqual(cutLength(part), { cut: 100, score: 30 });
  const r = compileKit(defaultKit());
  const board = r.sheets.find((s) => s.material.kind === 'board');
  const card = r.sheets.find((s) => s.material.kind === 'card');
  const tb = estimateCutMinutes(board), tc = estimateCutMinutes(card);
  assert.ok(tb > 0 && tc > 0);
  const slower = estimateCutMinutes({ ...board, material: { ...board.material, passes: board.material.passes * 2 } });
  assert.ok(slower > tb * 1.5, 'more passes take longer');
  assert.ok(tb > tc, 'knife-cut board takes longer than card');
});

// --------------------------------------------------------------- night mode
test('night mode darkens surfaces and adds glow halos', () => {
  const r = compileKit(applyRoomType(defaultKit(), 'cafe'));
  const day = renderScene(r.faces3d);
  const night = renderScene(r.faces3d, { night: true });
  const count = (s, re) => (s.match(re) || []).length;
  assert.ok(count(night, /class="halo"/g) > 0);
  assert.equal(count(day, /class="halo"/g), 0);
  const avg = (s) => {
    const fills = [...s.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)].map((m) => (+m[1] + +m[2] + +m[3]) / 3);
    return fills.reduce((a, b) => a + b, 0) / fills.length;
  };
  assert.ok(avg(night) < avg(day) * 0.6, 'surfaces are much darker at night');
});

// ------------------------------------------------------------ plan drawing
test('plan view maps wall positions both ways', async () => {
  const { wallSpan, posOnWall } = await import('../src/planview.js');
  const r = { width: 300, depth: 200 };
  assert.deepEqual(wallSpan('back', 100, 40, r), { x0: 80, y0: 0, x1: 120, y1: 0 });
  assert.deepEqual(wallSpan('left', 50, 20, r), { x0: 0, y0: 140, x1: 0, y1: 160 }, 'side walls measure from the front');
  assert.deepEqual(wallSpan('right', 50, 20, r), { x0: 300, y0: 140, x1: 300, y1: 160 });
  assert.equal(posOnWall('back', [120, 30], r), 120);
  assert.equal(posOnWall('left', [5, 150], r), 50);
});

test('plan view tags every item, opening and light for interaction', async () => {
  const { planSVG } = await import('../src/planview.js');
  const kit = applyRoomType(defaultKit(), 'kitchen');
  const svg = planSVG(kit, { selected: { kind: 'item', index: 2 }, clashes: new Set([4]) });
  assert.equal((svg.match(/data-index="/g) || []).length, kit.items.length);
  assert.equal((svg.match(/data-oi="/g) || []).length, kit.openings.length);
  assert.equal((svg.match(/data-li="/g) || []).length, kit.lighting.leds.length);
  assert.match(svg, /class="plan-item sel" data-index="2"/);
  assert.match(svg, /class="plan-item clash[^"]*" data-index="4"/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});
