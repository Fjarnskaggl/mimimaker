// Sparse joints: like store-bought miniature house kits, a jointed edge gets as
// few tabs as hold it square (near the corners, plus one in the middle of a
// long edge) instead of a comb of fingers along its whole length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jointSegments, profileJoint } from '../src/geometry.js';
import { buildBox, autoFingerWidth } from '../src/box.js';
import { buildGableRoof } from '../src/shells/roof.js';

const tabs = (segs) => segs.filter((s) => s.tab);

test('a jointed edge gets 1–3 tabs depending on its length, not a comb', () => {
  const fw = 6;
  assert.equal(tabs(jointSegments(12, fw)).length, 0, 'too short for a tab: one notch, the other panel sits in it');
  assert.equal(tabs(jointSegments(40, fw)).length, 1);
  assert.equal(tabs(jointSegments(100, fw)).length, 2);
  assert.equal(tabs(jointSegments(150, fw)).length, 2);
  assert.equal(tabs(jointSegments(300, fw)).length, 3);
});

test('segments cover the edge, alternate, start and end off-tab, and are never narrower than the finger width', () => {
  for (const fw of [3, 4.5, 6, 12, 20]) for (const L of [9, 18, 25, 40, 61, 70, 99, 150, 161, 240, 400]) {
    const segs = jointSegments(L, fw);
    assert.equal(segs[0].a0, 0);
    assert.ok(Math.abs(segs[segs.length - 1].a1 - L) < 1e-9);
    assert.equal(segs.length % 2, 1, 'odd count so the corners belong to one panel');
    segs.forEach((s, k) => {
      if (k) assert.ok(Math.abs(s.a0 - segs[k - 1].a1) < 1e-9);
      assert.equal(s.tab, k % 2 === 1);
      if (segs.length > 1) assert.ok(s.a1 - s.a0 >= fw - 1e-9, `L=${L} fw=${fw}: segment ${k} is ${s.a1 - s.a0}`);
    });
  }
});

test('with two or more tabs, the outer ones sit near the corners to stop racking', () => {
  for (const L of [70, 100, 150, 240]) {
    const t = tabs(jointSegments(L, 6));
    const first = (t[0].a0 + t[0].a1) / 2, last = (t[t.length - 1].a0 + t[t.length - 1].a1) / 2;
    assert.ok(first <= 0.3 * L && last >= 0.7 * L, `L=${L}: tabs at ${first}, ${last}`);
  }
});

test('profileJoint gives complementary edges for the two panels', () => {
  const segs = jointSegments(150, 6);
  const a = profileJoint(segs, 2, true), b = profileJoint(segs, 2, false);
  a.forEach((s, i) => assert.equal(s.d + b[i].d, 2));
});

function edgeTabs(outline, axis, at) {
  // count runs of the outline that sit `t` in from a straight edge = notches
  let n = 0;
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i], q = outline[(i + 1) % outline.length];
    if (Math.abs(p[axis] - at) < 1e-9 && Math.abs(q[axis] - at) < 1e-9) n++;
  }
  return n;
}

test('a room-sized box has a handful of notches per edge, not dozens', () => {
  const t = 2;
  const { panels, minFinger } = buildBox({ W: 150, D: 100, H: 120, t, faces: ['bottom', 'back', 'left', 'right'] });
  const floor = panels.find((p) => p.face === 'bottom');
  // floor's front edge is plain; its back edge (y = D) meets the back wall: segments on the nominal line
  const back = edgeTabs(floor.outline, 1, 100) + edgeTabs(floor.outline, 1, 100 - t);
  assert.ok(back <= 5, `floor back edge has ${back} runs`);
  assert.ok(minFinger >= autoFingerWidth(t) - 1e-9, `narrowest tab ${minFinger}`);
});

test('the gable roof uses the same sparse tabs', () => {
  const r = buildGableRoof({ W: 150, D: 100, t: 2, pitch: 40, z0: 120 });
  assert.ok(r.parts.find((p) => p.key === 'roof-gable').polys[0].length <= 30, 'gable outline stays simple');
  assert.ok(r.minFinger >= autoFingerWidth(2) - 1e-9);
});
