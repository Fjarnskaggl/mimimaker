// Gable roofs (src/shells/roof.js): two slopes finger-jointed into a gable
// without bevels, used first by the nook shell's `gable` option.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShell, SHELLS } from '../src/shells/index.js';
import { shellRoom } from '../src/shells/kit.js';
import { findOverlaps, outsideEnvelope, partBox, partContains } from '../src/shells/fit.js';
import { defaultKit } from '../src/catalog.js';
import { checkJoints } from './shells-helpers.js';

const gap = { w: 90, h: 230, d: 180 };
const nook = (params = {}, t = 2, g = gap) => buildShell({ type: 'nook', gap: g, clearance: 2, params }, { t });

const VARIANTS = [
  [{ gable: true }, 2],
  [{ gable: true, pitch: 30 }, 1.5],
  [{ gable: true, pitch: 55 }, 2],
  [{ gable: true, pitch: 45 }, 1.6],
];

test('nook keeps its flat top unless a gable roof is asked for', () => {
  const sh = nook();
  assert.equal(sh.parts.length, 5);
  assert.ok(!sh.roof);
  assert.ok(SHELLS.nook.params.some((p) => p.key === 'gable'));
  for (const p of SHELLS.nook.params) assert.ok(p.key in SHELLS.nook.defaults, p.key);
});

test('a gabled nook: no overlaps, inside the shelf gap, roof up to the top, joints hang together', () => {
  for (const [params, t] of VARIANTS) {
    const sh = nook(params, t);
    assert.deepEqual(findOverlaps(sh.parts, t), [], JSON.stringify(params));
    assert.deepEqual(outsideEnvelope(sh.parts, t, sh.dims), [], JSON.stringify(params));
    checkJoints(sh, t);
    const roof = sh.parts.filter((p) => p.role === 'roof');
    assert.equal(roof.length, 3, 'gable + two slopes');
    const top = Math.max(...roof.map((p) => partBox(p, t)[2][1]));
    assert.ok(Math.abs(top - sh.dims.H) < 1e-6, `ridge reaches the top of the gap (${top.toFixed(3)} vs ${sh.dims.H})`);
    // box + roof fill the height exactly
    assert.ok(Math.abs(sh.roof.box + sh.roof.rise - sh.dims.H) < 1e-9);
    assert.equal(sh.dims.inner.H, sh.roof.box - 2 * t, 'the attic is not part of the room');
  }
});

test('the slopes are finger-jointed into the gable: every point of the joint strip is in exactly one part', () => {
  for (const [params, t] of VARIANTS) {
    const sh = nook(params, t);
    const gable = sh.parts.find((p) => p.key === 'roof-gable');
    const slopes = sh.parts.filter((p) => p.key === 'roof-left' || p.key === 'roof-right');
    const { D } = sh.dims;
    const y = D - t / 2; // middle of the gable's thickness
    let samples = 0, inSlopes = 0;
    for (const s of sh.roof.joints) { // { side, from: [x, z], dir: [dx, dz], inward: [nx, nz], length }
      for (let i = 0.5; i < 400; i++) {
        const u = (i / 400) * s.length;
        for (const w of [0.2, 0.5, 0.8]) {
          const x = s.from[0] + s.dir[0] * u + s.inward[0] * w * t;
          const z = s.from[1] + s.dir[1] * u + s.inward[1] * w * t;
          const p = [x, y, z];
          const hits = [gable, ...slopes].filter((q) => partContains(q, t, p)).length;
          assert.equal(hits, 1, `${s.side} joint strip at u=${u.toFixed(2)}: ${hits} parts`);
          samples++;
          if (slopes.some((q) => partContains(q, t, p))) inSlopes++;
        }
      }
    }
    // a few sparse tabs (see jointSegments): the gable keeps most of the strip
    assert.ok(samples > 0 && inSlopes > samples * 0.05 && inSlopes < samples * 0.5, `both gable and tabs take part (${inSlopes}/${samples})`);
  }
});

test('the ridge is tight and the slopes sit on the side walls', () => {
  for (const [params, t] of VARIANTS) {
    const sh = nook(params, t);
    assert.ok(sh.roof.ridgeGap >= 0 && sh.roof.ridgeGap <= 0.3, `ridge gap ${sh.roof.ridgeGap}`);
    assert.ok(sh.joints.some((j) => j.kind === 'flat' && [j.a, j.b].includes('roof-left') && [j.a, j.b].includes('roof-right')));
    for (const side of ['left', 'right']) {
      assert.ok(sh.joints.some((j) => [j.a, j.b].includes(`roof-${side}`) && [j.a, j.b].includes(`shell-${side}`)), `${side} slope on its wall`);
      assert.ok(sh.joints.some((j) => j.kind === 'finger' && [j.a, j.b].includes(`roof-${side}`) && [j.a, j.b].includes('roof-gable')));
    }
  }
});

test('a gabled nook still furnishes: the room is the box under the attic', () => {
  const kit = { ...defaultKit(), shell: { type: 'nook', gap, clearance: 2, params: { gable: true, pitch: 40 } } };
  const t = kit.materials.find((m) => m.id === kit.room.material).thickness;
  const sh = buildShell({ ...kit.shell, material: kit.room.material }, { t });
  const { room } = shellRoom(kit);
  assert.ok(Math.abs(room.height - (sh.dims.inner.H * kit.scale) / 10) < 1e-9);
});

test('a roof that cannot fit the gap is refused clearly, and steps cover the roof', () => {
  assert.throws(() => nook({ gable: true, pitch: 60 }, 2, { w: 120, h: 90, d: 150 }), /roof/i);
  const sh = nook({ gable: true });
  assert.ok(sh.steps.some((s) => s.group === 'Roof'));
  assert.ok(sh.lights.length >= 1, 'an attic LED spot');
});
