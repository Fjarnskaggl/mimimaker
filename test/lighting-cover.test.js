import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVER, planCover } from '../src/lighting/cover.js';
import { bbox, pointInPolygon } from '../src/geometry.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';

function kitWith(leds, { cover = { enabled: true }, power = {}, openings = [] } = {}) {
  const kit = defaultKit();
  kit.openings = openings;
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, kind: 'battery', supply: 'aa2', ...power };
  kit.lighting.leds = leds;
  kit.lighting.cover = cover;
  return kit;
}
const backLed = { mount: 'wall', wall: 'back', pos: 60, elev: 150, color: 'warm' };
const leftLed = { mount: 'wall', wall: 'left', pos: 60, elev: 150, color: 'warm' };
const frames = (L) => L.parts.filter((p) => p.role === 'frame');
const panel = (L) => L.parts.find((p) => p.role === 'panel');

test('cover off (or missing): no extra parts or steps', () => {
  for (const cover of [undefined, { enabled: false }]) {
    const L = compileKit(kitWith([backLed], { cover })).lighting;
    assert.deepEqual(L.parts, []);
    assert.deepEqual(L.steps, []);
  }
});

test('cover on: four frame strips round the back wall and one panel', () => {
  const r = compileKit(kitWith([backLed]));
  const L = r.lighting;
  const { W, H } = r.dims;
  assert.equal(frames(L).length, 4, 'no wire leaves the back wall, so no gaps');
  const fb = bbox(frames(L).flatMap((p) => p.polys));
  assert.deepEqual([fb.x0, fb.y0, fb.x1, fb.y1].map((v) => +v.toFixed(6)), [0, 0, +W.toFixed(6), +H.toFixed(6)]);
  for (const f of frames(L)) {
    const b = bbox(f.polys);
    assert.ok(Math.min(b.w, b.h) === COVER.frameWidth, `${f.name} is a ${COVER.frameWidth} mm strip`);
  }
  const p = panel(L);
  const pb = bbox([p.polys[0]]);
  assert.deepEqual([pb.w, pb.h].map((v) => +v.toFixed(6)), [+W.toFixed(6), +H.toFixed(6)]);
  assert.ok(L.steps.length >= 2 && L.steps.some((s) => /frame/i.test(s)) && L.steps.some((s) => /cover panel/i.test(s)));
});

test('a wire leaving the back wall splits the frame strip with a gap where it crosses', () => {
  const L = compileKit(kitWith([leftLed])).lighting;
  const cross = L.leds[0].route.find(([x]) => Math.abs(x) < 1e-9);
  assert.ok(cross, 'route crosses the back wall\'s left edge');
  const left = frames(L).filter((p) => /left/i.test(p.name));
  assert.equal(left.length, 2, 'left strip in two pieces');
  const [a, b] = left.map((p) => bbox(p.polys)).sort((m, n) => m.y0 - n.y0);
  assert.ok(a.y1 <= cross[1] - COVER.gap / 2 + 1e-9 && b.y0 >= cross[1] + COVER.gap / 2 - 1e-9, 'gap around the crossing');
  assert.ok(b.y0 - a.y1 <= COVER.gap + 1e-6, 'gap is the channel width');
});

test('the panel has holes for back-wall openings and the power box', () => {
  const win = { kind: 'window', wall: 'back', pos: 200, sill: 100, width: 60, height: 80 };
  const r = compileKit(kitWith([backLed], { openings: [win] }));
  const p = panel(r.lighting);
  assert.equal(p.polys.length, 3, 'outline + window + power box');
  const op = r.openings.find((o) => o.wall === 'back');
  const c = [op.x + op.w / 2, op.y + op.h / 2];
  assert.ok(p.polys.slice(1).some((h) => pointInPolygon(c, h)), 'window hole');
  const pw = r.lighting.power;
  assert.ok(p.polys.slice(1).some((h) => pointInPolygon([pw.u, pw.v], h)), 'power box hole');
  const box = p.polys.slice(1).map((h) => bbox([h])).find((b) => b.x0 <= pw.u && pw.u <= b.x1 && b.y0 <= pw.v && pw.v <= b.y1);
  assert.ok(box.w >= COVER.box.aa2.w && box.h >= COVER.box.aa2.h);
});

test('flush power: the panel shows the switch cut-out, not the whole box', () => {
  const r = compileKit(kitWith([backLed], { power: { mount: 'flush' } }));
  const p = panel(r.lighting);
  const [sw] = r.lighting.power.cutouts;
  const holes = p.polys.slice(1).map((h) => bbox([h]));
  const sb = bbox([sw.poly]);
  assert.ok(holes.some((b) => Math.abs(b.w - sb.w) < 1e-6 && Math.abs(b.h - sb.h) < 1e-6), 'switch-sized hole');
  assert.ok(!holes.some((b) => b.w >= COVER.box.aa2.w), 'no box-sized hole');
});

test('a power box on another wall needs no hole, and a box past the edge warns', () => {
  const side = compileKit(kitWith([backLed], { power: { wall: 'left', pos: 50, elev: 60 } }));
  assert.equal(panel(side.lighting).polys.length, 1);
  const edge = compileKit(kitWith([backLed], { power: { pos: 2, elev: 2 } }));
  assert.ok(edge.warnings.some((w) => /cover/i.test(w.msg) && /power box/i.test(w.msg)));
});

test('compileKit adds the cover parts to the Lighting group on the right materials', () => {
  const kit = kitWith([leftLed]);
  const r = compileKit(kit);
  const group = r.groups.find((g) => g.title === 'Lighting');
  const named = group.parts.map((id) => r.parts.find((p) => p.id === id));
  assert.ok(named.some((p) => p.name === 'Cable cover panel' && p.material === kit.room.trimMaterial));
  assert.ok(named.filter((p) => /frame/i.test(p.name)).every((p) => p.material === kit.room.material));
  assert.equal(named.length, r.lighting.parts.length);
  assert.ok(r.lighting.steps.every((s) => group.steps.includes(s)));
  // chosen materials win
  kit.lighting.cover = { enabled: true, frameMaterial: 'card110', panelMaterial: kit.room.material };
  const r2 = compileKit(kit);
  assert.ok(r2.parts.some((p) => p.name === 'Cable cover panel' && p.material === kit.room.material));
});

test('cover off leaves every built-in room exactly as before', () => {
  for (const rt of ROOM_TYPES) {
    const k = applyRoomType(defaultKit(), rt.id);
    const a = compileKit(k);
    const b = compileKit({ ...k, lighting: { ...k.lighting, cover: { enabled: false } } });
    assert.equal(JSON.stringify(b.parts), JSON.stringify(a.parts), rt.id);
    assert.equal(JSON.stringify(b.groups), JSON.stringify(a.groups), rt.id);
  }
});
