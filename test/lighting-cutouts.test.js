import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUTOUTS, planCutouts } from '../src/lighting/cutouts.js';
import { bbox } from '../src/geometry.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

const ctx = { t: 2, Hi: 100, wallInfo: { back: { u0: 2, len: 120 }, left: { u0: 0, len: 90 }, right: { u0: 0, len: 90 } }, openings: [] };
const power = (o) => ({ face: 'back', u: 50, v: 20, supply: 'aa2', mount: 'flush', ...o });
const size = (c) => { const b = bbox([c.poly]); return [+(b.x1 - b.x0).toFixed(2), +(b.y1 - b.y0).toFixed(2)]; };

test('cut-out sizes are real part sizes plus clearance (not scaled)', () => {
  assert.ok(CUTOUTS.switch.w >= 8 && CUTOUTS.switch.h >= 4, 'mini slide switch actuator slot');
  assert.ok(CUTOUTS.usb.w >= 9 && CUTOUTS.usb.h >= 3.5, 'USB-C panel socket');
});

test('a box glued on the outside needs no cut-outs', () => {
  assert.deepEqual(planCutouts(power({ mount: 'outside' }), ctx).cutouts, []);
  assert.deepEqual(planCutouts(power({ mount: undefined }), ctx).cutouts, []);
});

test('flush battery box: one switch slot at the box', () => {
  for (const supply of ['aa2', 'cr2032']) {
    const { cutouts, warnings } = planCutouts(power({ supply }), ctx);
    assert.deepEqual(cutouts.map((c) => c.kind), ['switch']);
    assert.equal(cutouts[0].face, 'back');
    assert.deepEqual([cutouts[0].cx, cutouts[0].cy], [50, 20]);
    assert.deepEqual(size(cutouts[0]), [CUTOUTS.switch.w, CUTOUTS.switch.h]);
    assert.deepEqual(warnings, []);
  }
});

test('flush USB: a USB-C port slot and a push-switch hole beside it', () => {
  const { cutouts } = planCutouts(power({ supply: 'usb' }), ctx);
  assert.deepEqual(cutouts.map((c) => c.kind), ['usb', 'button']);
  const [usb, btn] = cutouts;
  assert.deepEqual(size(usb), [CUTOUTS.usb.w, CUTOUTS.usb.h]);
  assert.ok(Math.abs(size(btn)[0] - CUTOUTS.button.d) < 0.1, 'round hole');
  const gap = bbox([btn.poly]).x0 - bbox([usb.poly]).x1;
  assert.ok(gap >= 3, `holes ${gap} mm apart`);
});

test('cut-outs must sit on the wall and clear of openings', () => {
  const off = planCutouts(power({ u: 1, v: 1 }), ctx);
  assert.ok(off.warnings.some((w) => /off the back wall/.test(w)));
  const win = { wall: 'back', poly: [[40, 10], [60, 10], [60, 30], [40, 30]] };
  const hit = planCutouts(power(), { ...ctx, openings: [win] });
  assert.ok(hit.warnings.some((w) => /window or door/.test(w)));
});

test('compileKit cuts the holes through the wall and its wallpaper', () => {
  const kit = defaultKit();
  kit.lighting.enabled = true;
  const base = compileKit(kit);
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, supply: 'usb', kind: 'usb', mount: 'flush' };
  const r = compileKit(kit);
  const n = (c, name) => c.parts.find((p) => p.name === name).polys.length;
  assert.equal(n(r, 'Back wall'), n(base, 'Back wall') + 2);
  assert.equal(n(r, 'Back wallpaper'), n(base, 'Back wallpaper') + 2);
  assert.deepEqual(r.lighting.power.cutouts.map((c) => c.kind), ['usb', 'button']);
  assert.deepEqual(r.warnings.filter((w) => /cut-out/i.test(w.msg)), []);
});
