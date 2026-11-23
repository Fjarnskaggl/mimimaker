import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit, CATALOG } from '../src/catalog.js';
import { packParts, placementTransform } from '../src/nest.js';
import { sheetCutSVG } from '../src/svg.js';
import { guideHTML } from '../src/guide.js';
import { makeZip, crc32 } from '../src/zip.js';

test('default kit compiles without warnings', () => {
  const r = compileKit(defaultKit());
  assert.deepEqual(r.warnings, []);
  assert.ok(r.parts.length > 20);
  const ids = r.parts.map((p) => p.id);
  assert.deepEqual(ids, ids.map((_, i) => i + 1), 'parts numbered 1..n');
  // every part lands on exactly one sheet
  const placed = r.sheets.flatMap((s) => s.placements.map((p) => p.part.id)).sort((a, b) => a - b);
  assert.deepEqual(placed, ids);
});

test('every catalog item builds in board and card materials', () => {
  for (const type of Object.keys(CATALOG)) {
    for (const material of ['chip15', 'card110']) {
      const kit = defaultKit();
      kit.items = [{ type, params: { ...CATALOG[type].defaults }, material, x: 10, y: 10, rot: 0, wall: 'back', pos: 150, elev: 150 }];
      const r = compileKit(kit);
      const errors = r.warnings.filter((w) => w.level === 'error');
      assert.deepEqual(errors, [], `${type} in ${material}`);
      assert.ok(r.groups.at(-1).parts.length > 0, `${type} produced parts`);
    }
  }
});

test('placement warnings fire for items outside the room', () => {
  const kit = defaultKit();
  kit.items[0].x = 290;
  const r = compileKit(kit);
  assert.ok(r.warnings.some((w) => /sticks out/.test(w.msg)));
});

test('machine without a knife blade flags board materials', () => {
  const kit = defaultKit();
  kit.machine = 'explore';
  const r = compileKit(kit);
  assert.ok(r.warnings.some((w) => w.level === 'error' && /Knife Blade/.test(w.msg)));
});

test('cardstock room box becomes separate tabbed panels', () => {
  const kit = defaultKit();
  kit.room.material = 'card110';
  const r = compileKit(kit);
  const room = r.groups.find((g) => g.title === 'Room box');
  assert.equal(room.parts.length, 4);
  const byName = Object.fromEntries(room.parts.map((id) => [r.parts[id - 1].name, r.parts[id - 1]]));
  assert.equal(byName.Floor.scores.length, 0, 'walls glue onto the floor, not vice versa');
  for (const wall of ['Back wall', 'Left wall', 'Right wall']) assert.ok(byName[wall].scores.length > 0, `${wall} has tab folds`);
});

test('packing keeps parts inside the sheet and apart', () => {
  const parts = Array.from({ length: 30 }, (_, i) => ({ id: i, w: 20 + (i % 7) * 9, h: 15 + (i % 5) * 11 }));
  const { sheets, oversize } = packParts(parts, 200, 150);
  assert.equal(oversize.length, 0);
  for (const s of sheets) {
    const boxes = s.placements.map((p) => [p.x, p.y, p.x + p.w, p.y + p.h]);
    for (const [x0, y0, x1, y1] of boxes) assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 200 && y1 <= 150);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], 'no overlap');
    }
  }
  assert.equal(packParts([{ id: 1, w: 500, h: 10 }], 200, 150).oversize.length, 1);
});

test('rotated placement maps the part bounding box onto its slot', () => {
  const pl = { part: { w: 40, h: 10 }, rot: true, x: 5, y: 7, w: 10, h: 40 };
  const T = placementTransform(pl);
  const pts = [[0, 0], [40, 0], [40, 10], [0, 10]].map(T);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [5, 15, 7, 47]);
});

test('cut SVG uses mm units and separate cut / score / draw layers', () => {
  const kit = defaultKit();
  const r = compileKit(kit);
  const card = r.sheets.find((s) => s.placements.some((p) => p.part.scores.length));
  const svg = sheetCutSVG(card, { drawLabels: true });
  assert.match(svg, /width="\d+(\.\d+)?mm"/);
  assert.match(svg, /<g id="cut"/);
  assert.match(svg, /<g id="score"/);
  assert.match(svg, /<g id="draw"/);
  assert.doesNotMatch(svg, /NaN|undefined/);
  assert.doesNotMatch(guideHTML(kit, r), /NaN|undefined/);
});

test('zip writer produces a valid archive structure', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = makeZip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.svg', data: '<svg/>' }]);
  const dv = new DataView(zip.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(zip.length - 12, true), 2);
});
