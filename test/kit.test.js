import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit, CATALOG } from '../src/catalog.js';
import { packParts, placementTransform } from '../src/nest.js';
import { sheetCutSVG } from '../src/svg.js';
import { guideHTML } from '../src/guide.js';
import { makeZip, crc32 } from '../src/zip.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';
import { ledMapSVG } from '../src/ledmap.js';
import { routeWire, netPoint } from '../src/lighting.js';
import { pointInPolygon } from '../src/geometry.js';

test('default kit compiles without warnings', () => {
  const r = compileKit(defaultKit());
  assert.deepEqual(r.warnings.filter((w) => w.level !== 'info'), []);
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

test('every room type compiles cleanly and fits its pieces', () => {
  for (const rt of ROOM_TYPES) {
    const kit = applyRoomType(defaultKit(), rt.id);
    const r = compileKit(kit);
    assert.deepEqual(r.warnings.filter((w) => w.level !== 'info').map((w) => w.msg), [], rt.id);
    assert.ok(r.lighting.enabled && r.lighting.leds.length > 0, `${rt.id} has lights`);
    // floor items must not overlap each other (rugs excluded)
    const s = 10 / kit.scale;
    const boxes = kit.items.map((it, i) => ({ it, i })).filter(({ it }) => CATALOG[it.type].placement === 'floor' && it.type !== 'rug' && it.type !== 'ladder')
      .map(({ it }) => {
        const p = Object.fromEntries(CATALOG[it.type].params.map((q) => [q.key, (it.params[q.key] ?? CATALOG[it.type].defaults[q.key]) * (q.unit ? s : 1)]));
        const [w, d] = (CATALOG[it.type].size || ((q) => [q.w, q.d]))(p);
        const [fw, fd] = (it.rot || 0) % 180 ? [d, w] : [w, d];
        return { type: it.type, x0: it.x * s, y0: it.y * s, x1: it.x * s + fw, y1: it.y * s + fd };
      });
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      const overlap = A.x0 < B.x1 - 0.01 && B.x0 < A.x1 - 0.01 && A.y0 < B.y1 - 0.01 && B.y0 < A.y1 - 0.01;
      assert.ok(!overlap, `${rt.id}: ${A.type} overlaps ${B.type}`);
    }
  }
});

test('applyRoomType keeps machine and scale but recolours papers', () => {
  const base = defaultKit();
  base.machine = 'joyxtra';
  const k = applyRoomType(base, 'kitchen');
  assert.equal(k.machine, 'joyxtra');
  assert.equal(k.name, 'Cottage Kitchen');
  assert.equal(k.materials.find((m) => m.id === 'paper').color, ROOM_TYPES.find((r) => r.id === 'kitchen').colors.paper);
  assert.notEqual(base.materials.find((m) => m.id === 'paper').color, k.materials.find((m) => m.id === 'paper').color);
});

test('LEDs cut wire holes through the wall and its wallpaper', () => {
  const kit = defaultKit();
  kit.lighting.leds = [{ mount: 'wall', wall: 'left', pos: 60, elev: 150, color: 'warm' }];
  const r = compileKit(kit);
  const left = r.parts.find((p) => p.name === 'Left wall');
  const paper = r.parts.find((p) => p.name === 'Left wallpaper');
  const before = compileKit({ ...kit, lighting: { ...kit.lighting, enabled: false } });
  assert.equal(left.polys.length, before.parts.find((p) => p.name === 'Left wall').polys.length + 1);
  assert.equal(paper.polys.length, before.parts.find((p) => p.name === 'Left wallpaper').polys.length + 1);
  const [led] = r.lighting.leds;
  assert.ok(led.leadCm >= 5 && Number.isFinite(led.length));
  const end = led.route.at(-1);
  assert.deepEqual(end.map((v) => +v.toFixed(6)), r.lighting.power.p.map((v) => +v.toFixed(6)), 'route ends at the power box');
});

test('ceiling lights need a ceiling', () => {
  const kit = defaultKit();
  kit.room.ceiling = false;
  kit.lighting.leds = [{ mount: 'ceiling', x: 100, y: 100 }];
  assert.ok(compileKit(kit).warnings.some((w) => /no ceiling/.test(w.msg)));
  kit.room.ceiling = true;
  const r = compileKit(kit);
  assert.equal(r.parts.find((p) => p.name === 'Ceiling').polys.length, 2);
});

test('wire routes are axis-aligned, stay on the net and avoid openings when they can', () => {
  const dims = { W: 100, D: 60, H: 80 };
  const a = { face: 'left', p: netPoint('left', 30, 40, dims) };
  const b = { face: 'right', p: netPoint('right', 30, 20, dims) };
  const window = { x0: 40, y0: 30, x1: 60, y1: 50 };
  const { points, crossesOpening } = routeWire(a, b, dims, [window]);
  assert.equal(crossesOpening, false);
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1], 'axis aligned');
  }
  const net = [[-60, 0], [160, 0], [160, 80], [-60, 80]];
  for (const p of points) assert.ok(pointInPolygon(p, net) || p[1] === 0 || p[1] === 80);
});

test('LED map and guide render without NaN for every room type', () => {
  for (const rt of ROOM_TYPES) {
    const kit = applyRoomType(defaultKit(), rt.id);
    const r = compileKit(kit);
    const svg = ledMapSVG(r, { standalone: true });
    assert.match(svg, /<polyline/);
    assert.doesNotMatch(svg, /NaN|undefined/);
    assert.doesNotMatch(guideHTML(kit, r), /NaN|undefined/);
  }
});

test('wall-mounted boxes sit against the wall', () => {
  const kit = defaultKit();
  kit.lighting.enabled = false;
  kit.items = [{ type: 'uppercabinet', params: { ...CATALOG.uppercabinet.defaults }, material: 'chip15', wall: 'back', pos: 150, elev: 180 }];
  const r = compileKit(kit);
  const ys = r.faces3d.filter((f) => f.item === 0).flatMap((f) => f.polys[0].map((p) => p[1]));
  const backInner = r.dims.D - r.dims.t;
  assert.ok(Math.abs(Math.max(...ys) - backInner) < 1e-6, 'back face touches the wall');
  assert.ok(Math.min(...ys) < backInner - 10, 'sticks out into the room');
});

test('3D preview draws a chair seat in front of its backrest', async () => {
  const { renderScene } = await import('../src/preview3d.js');
  const kit = defaultKit();
  kit.lighting.enabled = false;
  kit.items = [{ type: 'chair', params: { w: 55, d: 55, seat: 45, back: 95 }, material: 'chip15', x: 150, y: 70, rot: 0 }];
  const faces = compileKit(kit).faces3d.filter((f) => f.item === 0);
  const back = faces.find((f) => f.n[1] < -0.99 && f.polys[0].length > 8); // arched backrest
  const seat = faces.find((f) => f.n[2] > 0.99); // seat top
  back.opacity = 0.92;
  seat.opacity = 0.91;
  for (const view of [{ yaw: -40, pitch: 42 }, { yaw: -32, pitch: 26 }, { yaw: 30, pitch: 55 }]) {
    const svg = renderScene(faces, view);
    assert.ok(svg.indexOf('fill-opacity="0.92"') < svg.indexOf('fill-opacity="0.91"'), `backrest drawn before seat at ${JSON.stringify(view)}`);
  }
});
