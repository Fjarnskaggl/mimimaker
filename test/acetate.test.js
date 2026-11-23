// T3: clear acetate for glazing (T2's #55). Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';
import { DEFAULT_MATERIALS, MACHINES, withMaterialDefaults } from '../src/materials.js';
import { sheetCutSVG } from '../src/svg.js';

const acetate = () => DEFAULT_MATERIALS.find((m) => m.id === 'acetate');

test('acetate is a default material: clear, flat-cut, Fine-Point Blade', () => {
  const m = acetate();
  assert.ok(m, 'id acetate (the greenhouse glazingMaterial default)');
  assert.equal(m.kind, 'card', 'flat-cut, never a fold net');
  assert.equal(m.tool, 'fine');
  assert.ok(m.thickness >= 0.15 && m.thickness <= 0.3, `${m.thickness} mm`);
  assert.equal(m.cricut, 'Acetate');
  assert.ok(m.passes >= 1 && m.speed > 0);
  assert.deepEqual(withMaterialDefaults(m), m, 'complete preset');
  for (const id of ['maker', 'explore', 'joyxtra', 'cameo', 'portrait', 'laser']) assert.ok(MACHINES[id].tools.includes(m.tool), id);
  assert.equal(new Set(DEFAULT_MATERIALS.map((x) => x.id)).size, DEFAULT_MATERIALS.length, 'ids unique');
});

test('kits that do not use acetate compile exactly as before', () => {
  const without = (kit) => ({ ...kit, materials: kit.materials.filter((m) => m.id !== 'acetate') });
  for (const kit of [defaultKit(), ...ROOM_TYPES.map((rt) => applyRoomType(defaultKit(), rt.id))]) {
    assert.ok(kit.materials.some((m) => m.id === 'acetate'), 'new kits carry it');
    const a = compileKit(kit), b = compileKit(without(kit));
    assert.ok(!a.usedMats.some((m) => m.id === 'acetate'), kit.name);
    assert.deepEqual(a.warnings, b.warnings, kit.name);
    assert.deepEqual(a.sheets.map((s) => sheetCutSVG(s)), b.sheets.map((s) => sheetCutSVG(s)), kit.name);
  }
});

test('the greenhouse puts its panes on acetate sheets once the material exists', () => {
  const kit = { ...defaultKit(), shell: { type: 'greenhouse', gap: { w: 100, h: 230, d: 180 }, clearance: 2, params: {} } };
  const r = compileKit(kit);
  const panes = r.parts.filter((p) => p.material === 'acetate');
  assert.ok(panes.length > 0, 'panes are cut parts');
  assert.ok(r.sheets.some((s) => s.material.id === 'acetate'), 'an acetate sheet');
  assert.ok(!r.warnings.some((w) => /no clear acetate/i.test(w.msg)), 'no hand-cut fallback note');
});
