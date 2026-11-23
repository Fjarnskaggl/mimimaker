// Gable roofs on ordinary room boxes: kit.room.roof = { type: 'gable', pitch }.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';
import { gableRise } from '../src/shells/roof.js';

const withRoof = (roof, patch = {}) => {
  const k = defaultKit();
  k.room = { ...k.room, ...patch, roof };
  return k;
};

test('a gable roof sits on the room box: gable + two slopes, solid in 3D, up to H + rise', () => {
  for (const ceiling of [true, false]) for (const pitch of [30, 45]) {
    const kit = withRoof({ type: 'gable', pitch }, { ceiling });
    const r = compileKit(kit);
    const roof = r.parts.filter((p) => p.group === 'Roof');
    assert.deepEqual(roof.map((p) => p.name).sort(), ['Gable', 'Left roof', 'Right roof']);
    assert.ok(roof.every((p) => p.material === kit.room.material));
    const t = r.dims.t;
    // the roof's faces are the structural ones that rise above the box
    const faces = r.faces3d.filter((f) => f.layer === 0 && f.polys.flat().some((p) => p[2] > r.dims.H + 1e-6));
    assert.equal(faces.length, 3);
    assert.ok(faces.every((f) => f.thickness === t));
    const top = Math.max(...faces.flatMap((f) => f.polys.flat().map((p) => p[2])));
    assert.ok(Math.abs(top - (r.dims.H + gableRise(r.dims.W, t, pitch))) < 1e-6, `ridge at ${top}`);
    assert.ok(r.groups.find((g) => g.title === 'Roof').steps.length > 0);
    assert.ok(!r.warnings.some((w) => w.level === 'error'), JSON.stringify(r.warnings));
    // every roof part lands on a sheet
    const placed = new Set(r.sheets.flatMap((s) => s.placements.map((p) => p.part.id)));
    assert.ok(roof.every((p) => placed.has(p.id)));
  }
});

test('kits without a roof compile exactly as before', () => {
  const kits = ROOM_TYPES.map((rt) => applyRoomType(defaultKit(), rt.id)); // the default kit is the first of these
  assert.equal(new Set(kits.map((k) => k.name)).size, kits.length, "every room type really applied");
  for (const k of kits) {
    const base = JSON.stringify(compileKit(k));
    for (const roof of [undefined, null, { type: 'none' }]) {
      const kk = structuredClone(k);
      kk.room.roof = roof;
      assert.equal(JSON.stringify(compileKit(kk)), base, `roof ${JSON.stringify(roof)}`);
    }
  }
});

test('a cardstock room gets no roof, with a note; shells ignore the room roof', () => {
  const card = compileKit(withRoof({ type: 'gable', pitch: 40 }, { material: 'card110' }));
  assert.equal(card.parts.filter((p) => p.group === 'Roof').length, 0);
  assert.ok(card.warnings.some((w) => /roof/i.test(w.msg) && /board/i.test(w.msg)));
  const shelled = withRoof({ type: 'gable', pitch: 40 });
  shelled.shell = { type: 'nook', gap: { w: 90, h: 230, d: 180 }, clearance: 2, params: {} };
  const r = compileKit(shelled);
  assert.equal(r.parts.filter((p) => p.group === 'Roof').length, 0, 'the nook has its own gable option');
});
