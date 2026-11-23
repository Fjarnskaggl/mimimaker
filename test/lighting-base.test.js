// Hidden base compartment (Rolife-style): battery box under the room, a
// hatch in the back to change batteries, a wire hole beside it and a switch
// near the front corner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, SWITCHES, baseLayout, buildBase } from '../src/lighting/base.js';
import { bbox } from '../src/geometry.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { shoppingList } from '../src/lighting/shopping.js';
import { setMount, setCover, MOUNT_OPTIONS } from '../src/ui/t5.js';

const backLed = { mount: 'wall', wall: 'back', pos: 60, elev: 150, color: 'warm' };
const leftLed = { mount: 'wall', wall: 'left', pos: 60, elev: 150, color: 'warm' };
const floorLed = { mount: 'floor', x: 50, y: 50, color: 'warm' };

function kitWith(leds, power = {}, extra = {}) {
  const kit = defaultKit();
  kit.openings = [];
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, kind: 'battery', supply: 'aa2', mount: 'base', ...power };
  kit.lighting.leds = leds;
  Object.assign(kit.lighting, extra);
  return kit;
}
const baseParts = (r) => r.parts.filter((p) => p.group === 'Hidden base');
const named = (r, name) => baseParts(r).find((p) => p.name === name);
const inside = (inner, outer) => inner.x0 >= outer.x0 - 1e-9 && inner.x1 <= outer.x1 + 1e-9 && inner.y0 >= outer.y0 - 1e-9 && inner.y1 <= outer.y1 + 1e-9;
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('layout: the hatch is tall and wide enough for the battery box to slide out', () => {
  for (const supply of ['aa2', 'cr2032', 'usb']) {
    const L = baseLayout({ supply, pos: 100, W: 200, D: 120, t: 2, s: 1 });
    const box = BASE.box[supply];
    assert.ok(L.hatch.h >= box.h, `${supply}: hatch ${L.hatch.h} mm tall for a ${box.h} mm box`);
    assert.ok(L.hatch.w - 2 * BASE.stopOverlap >= box.l, `${supply}: clear width past the stops fits the box`);
    assert.ok(L.hatch.z0 >= 2, 'board left under the hatch, above the bottom joint');
    assert.ok(L.hatch.z0 + L.hatch.h <= L.H - BASE.keepTop + 1e-9, 'board left over the hatch');
    assert.deepEqual(L.warnings, []);
  }
});

test('layout: the battery box follows the power position along the back, kept inside the base', () => {
  const at = (pos) => baseLayout({ supply: 'aa2', pos, W: 300, D: 120, t: 2, s: 1 });
  assert.equal(at(100).box.x, 102);
  const left = at(0), right = at(400);
  assert.ok(left.hatch.x0 - BASE.stopOverlap >= 2 + BASE.sideKeep - 1e-9);
  assert.ok(right.hatch.x0 + right.hatch.w + BASE.stopOverlap <= 300 - 2 - BASE.sideKeep + 1e-9);
});

test('layout: the wire hole sits beside the hatch, clear of the hatch stops', () => {
  for (const pos of [0, 150, 400]) {
    const L = baseLayout({ supply: 'aa2', pos, W: 300, D: 120, t: 2, s: 1 });
    const e = L.entry;
    const stops = [L.hatch.x0, L.hatch.x0 + L.hatch.w].map((x) => ({ x0: x - BASE.stopWidth / 2, x1: x + BASE.stopWidth / 2 }));
    assert.ok(stops.every((s) => e.x + e.r <= s.x0 || e.x - e.r >= s.x1), `pos ${pos}: wire hole clear of the stops`);
    assert.ok(e.x - e.r >= 2 && e.x + e.r <= 298, 'inside the back panel');
  }
});

test('layout: a room too narrow or shallow for the battery box says so', () => {
  const narrow = baseLayout({ supply: 'aa2', W: 70, D: 120, t: 2 });
  assert.match(narrow.warnings.join(' '), /too narrow/);
  const shallow = baseLayout({ supply: 'aa2', W: 200, D: 30, t: 2 });
  assert.match(shallow.warnings.join(' '), /too shallow/);
});

test('build: an open-topped box with the hatch and wire hole in its back and the switch hole in front', () => {
  const L = baseLayout({ supply: 'aa2', pos: 100, W: 200, D: 120, t: 2 });
  const b = buildBase(L, { fingerWidth: 6 });
  assert.deepEqual(b.panels.map((p) => p.face).sort(), ['back', 'bottom', 'front', 'left', 'right']);
  const back = b.panels.find((p) => p.face === 'back');
  const holeBoxes = back.polys.slice(1).map((h) => bbox([h]));
  assert.ok(holeBoxes.some((h) => Math.abs(h.w - L.hatch.w) < 1e-6 && Math.abs(h.h - L.hatch.h) < 1e-6), 'hatch opening');
  assert.ok(holeBoxes.some((h) => Math.abs(h.w - 2 * BASE.wireR) < 0.1), 'wire hole');
  const front = b.panels.find((p) => p.face === 'front');
  const sw = bbox([front.polys[1]]);
  assert.ok(Math.abs(sw.w - SWITCHES.touch.hole) < 0.1, 'touch switch window');
  assert.ok(sw.x0 < 200 / 3, 'by the left corner');
  assert.ok(inside(sw, bbox([front.polys[0]])));
});

test('build: hatch fits its opening with a friction gap, has a finger hole; the stops overlap the edges', () => {
  const L = baseLayout({ supply: 'aa2', pos: 100, W: 200, D: 120, t: 2 });
  const b = buildBase(L, { fingerWidth: 6 });
  const hatch = b.parts.find((p) => p.key === 'hatch');
  const hb = bbox([hatch.polys[0]]);
  assert.ok(hb.w < L.hatch.w && hb.w > L.hatch.w - 1, 'slightly narrower than the opening');
  assert.ok(hb.h < L.hatch.h && hb.h > L.hatch.h - 1);
  assert.equal(hatch.polys.length, 2, 'finger hole');
  const stops = b.parts.filter((p) => p.key === 'stop').map((p) => bbox(p.polys));
  assert.equal(stops.length, 2);
  for (const s of stops) assert.ok(overlaps(s, { x0: L.hatch.x0, x1: L.hatch.x0 + L.hatch.w, y0: L.hatch.z0, y1: L.hatch.z0 + L.hatch.h }));
});

test('build: the switch mount holds a touch module in a pocket, or a push switch through a collar', () => {
  const touch = buildBase(baseLayout({ supply: 'aa2', W: 200, D: 120, t: 2 }), { fingerWidth: 6 });
  const tm = touch.parts.find((p) => p.key === 'mount');
  const pocket = bbox([tm.polys[1]]);
  assert.ok(Math.abs(pocket.w - SWITCHES.touch.pocket[0]) < 1e-6 && Math.abs(pocket.h - SWITCHES.touch.pocket[1]) < 1e-6);
  const push = buildBase(baseLayout({ supply: 'aa2', W: 200, D: 120, t: 2, switchKind: 'push' }), { fingerWidth: 6 });
  const pm = push.parts.find((p) => p.key === 'mount');
  assert.ok(Math.abs(bbox([pm.polys[1]]).w - SWITCHES.push.hole) < 0.1);
});

test('build: the switch can go in the left or right side, near the front', () => {
  for (const face of ['left', 'right']) {
    const L = baseLayout({ supply: 'aa2', W: 200, D: 120, t: 2, switchAt: face });
    const b = buildBase(L, { fingerWidth: 6 });
    const side = b.panels.find((p) => p.face === face);
    assert.equal(side.polys.length, 2, `${face}: switch hole`);
    assert.ok(bbox([side.polys[1]]).x0 < 120 / 3, 'near the front (u = 0)');
    assert.equal(b.panels.find((p) => p.face === 'front').polys.length, 1);
  }
});

test('kit: a hidden base adds its parts, steps and 3D faces under the room', () => {
  const r = compileKit(kitWith([backLed, leftLed]));
  const g = r.groups.find((x) => x.title === 'Hidden base');
  assert.ok(g, 'Hidden base group');
  assert.equal(baseParts(r).length, 9, '5 panels, hatch, 2 stops, switch mount');
  assert.ok(named(r, 'Battery hatch') && named(r, 'Switch mount (touch switch)'));
  const steps = g.steps.join('\n');
  assert.match(steps, /hatch/i);
  assert.match(steps, /touch switch/);
  assert.match(steps, /change batteries/);
  assert.doesNotMatch(steps, /\{\w+\}/, 'part numbers filled in');
  assert.ok(r.faces3d.some((f) => f.polys.some((p) => p.some(([, , z]) => z < -1))), 'base drawn below the floor');
  assert.equal(r.lighting.power.mount, 'base');
  assert.deepEqual(r.lighting.power.cutouts, []);
});

test('kit: every wire runs to the wire hole beside the hatch, and leads include the run inside the base', () => {
  const r = compileKit(kitWith([backLed, leftLed]));
  const L = r.lighting;
  const e = L.power.base.entry;
  for (const led of L.leds) {
    assert.deepEqual(led.route.at(-1).map((v) => +v.toFixed(6)), [+e.x.toFixed(6), 0]);
    const outside = led.route.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - led.route[i][0], p[1] - led.route[i][1]), 0);
    assert.ok(led.length >= outside + L.power.base.inRun, 'lead reaches the switch and box');
  }
  assert.ok(!r.warnings.some((w) => /off the back wall|over a window/.test(w.msg || w)), 'no outside power-box warnings');
});

test('kit: floor lights drop their wires straight into the base, no feet needed', () => {
  const r = compileKit(kitWith([floorLed]));
  const led = r.lighting.leds[0];
  assert.equal(led.route.length, 1);
  assert.ok(!r.warnings.some((w) => /feet/.test(w.msg || w)));
});

test('kit: with the cable cover, the bottom frame strip leaves a gap over the wire hole', () => {
  const r = compileKit(kitWith([backLed], {}, { cover: { enabled: true } }));
  const x = r.lighting.power.base.entry.x;
  const bottoms = r.lighting.parts.filter((p) => /frame – bottom/.test(p.name));
  assert.equal(bottoms.length, 2);
  assert.ok(bottoms.every((p) => { const b = bbox(p.polys); return b.x1 <= x || b.x0 >= x; }));
  const panel = r.lighting.parts.find((p) => p.role === 'panel');
  assert.equal(panel.polys.length, 1, 'no power-box hole in the cover: the box is in the base');
});

test('kit: other mounts have no base', () => {
  const r = compileKit(kitWith([backLed], { mount: undefined }));
  assert.equal(baseParts(r).length, 0);
  assert.equal(r.lighting.power.base, undefined);
});

test('shopping list: the base lists its switch and hides the battery box', () => {
  const touch = shoppingList(compileKit(kitWith([backLed])).lighting);
  assert.ok(touch.items.some((i) => i.id === 'touch-switch'));
  assert.match(touch.items.find((i) => i.id === 'box-aa2').note, /hidden in the base/);
  const push = shoppingList(compileKit(kitWith([backLed], { switch: 'push' })).lighting);
  assert.ok(push.items.some((i) => i.id === 'push-switch'));
});

test('UI helpers: the base is a mount option, and the cover leaves its battery position alone', () => {
  assert.ok(MOUNT_OPTIONS.some(([id]) => id === 'base'));
  const p = {};
  setMount(p, 'base');
  assert.equal(p.mount, 'base');
  const L = { power: { wall: 'back', pos: 999, elev: 999, mount: 'base' } };
  setCover(L, true, { pos: [10, 20], elev: [10, 20] });
  assert.equal(L.power.pos, 999);
});

// ---- review follow-ups
import { ledMapSVG } from '../src/ledmap.js';
import { planSVG } from '../src/planview.js';

test('kit: a card room cuts its base from board, laid out for that board\'s thickness', () => {
  const kit = kitWith([backLed]);
  const card = kit.materials.find((m) => m.kind === 'card');
  kit.room.material = card.id;
  const r = compileKit(kit);
  const L = r.lighting.power.base;
  const bm = r.usedMats.find((m) => m.id === baseParts(r)[0].material);
  assert.equal(bm.kind, 'board');
  assert.equal(L.t, bm.thickness);
  assert.ok(L.hatch.z0 >= bm.thickness + 1, 'hatch clear of the bottom joint');
});

test('USB in the base: the lead comes in through the hatch, and its inline switch stays on', () => {
  const r = compileKit(kitWith([backLed], { supply: 'usb', kind: 'usb' }));
  const steps = r.groups.find((g) => g.title === 'Hidden base').steps.join('\n');
  assert.doesNotMatch(steps, /socket board/);
  assert.match(steps, /USB lead/);
  assert.match(steps, /inline switch/);
  const list = shoppingList(r.lighting);
  assert.ok(list.items.some((i) => i.id === 'usb-lead'));
});

test('a power box on another wall: the base says the battery sits under the back', () => {
  const r = compileKit(kitWith([backLed], { wall: 'left', pos: 10 }));
  assert.ok(r.warnings.some((w) => /hidden base/i.test(w.msg || w) && /back/.test(w.msg || w)));
});

test('floor light leads are measured from where they drop in, not from the back wire hole', () => {
  const near = compileKit(kitWith([{ mount: 'floor', x: 5, y: 5, color: 'warm' }])).lighting;
  const far = compileKit(kitWith([{ mount: 'floor', x: 280, y: 200, color: 'warm' }])).lighting;
  assert.ok(near.leds[0].length < far.leds[0].length);
});

test('plan and LED map: no power box outside a wall when it is in the base', () => {
  const kit = kitWith([backLed]);
  assert.doesNotMatch(planSVG(kit), /plan-power/);
  const svg = ledMapSVG(compileKit(kit));
  assert.match(svg, /BASE/);
  assert.doesNotMatch(svg, />2×AA</);
});
