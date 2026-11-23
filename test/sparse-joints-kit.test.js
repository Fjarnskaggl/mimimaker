// Small pieces and cutter limits for sparse joints: notches scale with the
// piece, never go below what the machine cuts cleanly, and pieces too small to
// hold a tab get none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBox, minJointFeature, MIN_FEATURE } from '../src/box.js';
import { jointSegments } from '../src/geometry.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { MACHINES } from '../src/materials.js';

const FACES6 = ['bottom', 'top', 'front', 'back', 'left', 'right'];

test('each cutter has a smallest clean notch, and lasers go finest', () => {
  const chip = { tool: 'knife' }, card = { tool: 'fine' }, felt = { tool: 'rotary' };
  assert.equal(minJointFeature(MACHINES.maker, chip), MIN_FEATURE.knife);
  assert.equal(minJointFeature(MACHINES.cameo, card), MIN_FEATURE.fine);
  assert.equal(minJointFeature(MACHINES.maker, felt), MIN_FEATURE.rotary);
  assert.equal(minJointFeature(MACHINES.laser, chip), MIN_FEATURE.laser);
  assert.ok(MIN_FEATURE.laser < MIN_FEATURE.fine && MIN_FEATURE.fine < MIN_FEATURE.knife);
});

test('a small box gets at most one tab per edge, each a clean width', () => {
  const t = 1.5, fw = 4.5; // auto finger width for 1.5 mm board
  for (const [W, D, H] of [[30, 20, 25], [40, 18, 22]]) {
    const { panels, minFinger } = buildBox({ W, D, H, t, faces: FACES6 });
    assert.ok(minFinger >= fw - 1e-9, `${W}x${D}x${H}: narrowest ${minFinger}`);
    for (const p of panels) {
      // a rectangle plus at most one tab or notch (4 corners) on each of 4 edges, corner steps included
      assert.ok(p.outline.length <= 4 + 4 * 4 + 8, `${p.face} of ${W}x${D}x${H}: ${p.outline.length} corners`);
    }
  }
});

test('a piece too small for a tab gets plain butt edges, and they still interlock by rank', () => {
  for (const L of [8, 12, 17]) assert.deepEqual(jointSegments(L, 6), [{ a0: 0, a1: L, tab: false }]);
  const { panels } = buildBox({ W: 16, D: 12, H: 14, t: 2, faces: FACES6 });
  for (const p of panels) assert.ok(p.outline.length <= 8, `${p.face}: ${p.outline.length} corners`);
});

test('a too-small finger width is raised to what the machine cuts cleanly', () => {
  const kit = defaultKit(); // chipboard room on a Cricut Maker (Knife Blade)
  kit.fingerWidth = 1;
  const r = compileKit(kit);
  assert.ok(!r.warnings.some((w) => /finger joints are only/.test(w.msg)), 'no thin-finger warning: the width was raised');
  const raised = r.warnings.filter((w) => /^Finger width 1 mm is narrower than the Knife Blade cuts cleanly in Chipboard 2\.0 mm/.test(w.msg));
  assert.equal(raised.length, 1, 'says once per material that the width was raised');
  assert.equal(raised[0].level, 'warn');
  assert.match(raised[0].msg, /use 3 mm/);
  const roomIds = new Set(r.groups.find((g) => g.title === 'Room box').parts);
  for (const p of r.parts.filter((q) => roomIds.has(q.id))) {
    assert.ok(p.polys[0].length <= 60, `${p.name}: ${p.polys[0].length} corners`);
  }
});

test('the default room box has only a few notches per wall', () => {
  const r = compileKit(defaultKit());
  const roomIds = new Set(r.groups.find((g) => g.title === 'Room box').parts);
  for (const p of r.parts.filter((q) => roomIds.has(q.id))) {
    assert.ok(p.polys[0].length <= 4 + 4 * 3 * 4, `${p.name}: ${p.polys[0].length} corners`);
  }
});

test('a laser kit keeps fine joints without a Knife Blade warning', () => {
  const kit = defaultKit();
  kit.machine = 'laser';
  kit.fingerWidth = 1.5;
  const r = compileKit(kit);
  assert.ok(!r.warnings.some((w) => /finger joints are only|narrower than/.test(w.msg)), r.warnings.map((w) => w.msg).join('\n'));
});

test('every raised material is named in the finger width warning', () => {
  const kit = defaultKit();
  kit.fingerWidth = 2;
  kit.items = [{ type: 'bookshelf', params: {}, material: 'bass16', x: 10, y: 10, rot: 0, wall: 'back', pos: 150, elev: 0 }];
  const r = compileKit(kit);
  const msgs = r.warnings.filter((w) => /^Finger width 2 mm/.test(w.msg)).map((w) => w.msg).join('\n');
  assert.match(msgs, /Chipboard 2\.0 mm/);
  assert.match(msgs, /Basswood/);
});

// T2 shells use the cutter's own minimum (#87), like the room box, not a fixed 3 mm Knife Blade limit
const SHELL_TYPES = ['nook', 'alley', 'bookshop', 'staircase', 'greenhouse', 'twostorey'];
const shellSpec = (type) => ({ type, gap: { w: 90, h: 230, d: 180 }, clearance: 2, params: {} });

test('shell joints never go narrower than the cutter manages', async () => {
  const { buildShell } = await import('../src/shells/index.js');
  for (const type of SHELL_TYPES) {
    for (const min of [MIN_FEATURE.knife, MIN_FEATURE.rotary]) {
      const sh = buildShell(shellSpec(type), { t: 1.5, fingerWidth: 0.5, minFeature: min });
      assert.ok(sh.minFinger >= min - 1e-9, `${type}, ${min} mm cutter: narrowest ${sh.minFinger}`);
      assert.ok(!sh.warnings.some((w) => /finger joints/.test(w.msg)), `${type}: ${sh.warnings.map((w) => w.msg).join('\n')}`);
    }
  }
});

test('a shell on a laser gets no Knife Blade warning for fine joints', async () => {
  const { buildShell } = await import('../src/shells/index.js');
  for (const type of SHELL_TYPES) {
    const sh = buildShell(shellSpec(type), { t: 1.5, fingerWidth: 0.5, minFeature: MIN_FEATURE.laser, cutter: 'the laser' });
    assert.ok(!sh.warnings.some((w) => /Knife Blade/.test(w.msg)), `${type}: ${sh.warnings.map((w) => w.msg).join('\n')}`);
  }
});

test('a laser shell kit keeps fine joints without a thin-joint warning', () => {
  for (const type of SHELL_TYPES) {
    const r = compileKit({ ...defaultKit(), machine: 'laser', fingerWidth: 1, shell: shellSpec(type) });
    assert.ok(!r.warnings.some((w) => /finger joints are only|Knife Blade/.test(w.msg)), `${type}: ${r.warnings.map((w) => w.msg).join('\n')}`);
  }
});
