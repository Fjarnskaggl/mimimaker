// T3 material library: add / duplicate / delete, per-machine settings and
// cost per sheet → kit material cost. Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import {
  DEFAULT_MATERIALS, MACHINES, withMaterialDefaults, newMaterial, duplicateMaterial,
  materialInUse, machineSettings, defaultCurrency, formatMoney,
} from '../src/materials.js';
import { kitMaterialCost } from '../src/export/cost.js';
import { estimateCutMinutes } from '../src/make.js';
import { machineSettingsLine, sheetFiles } from '../src/export/machines.js';

test('every preset has a price per sheet and settings for each machine family', () => {
  for (const m of DEFAULT_MATERIALS) {
    const d = withMaterialDefaults(m);
    assert.ok(d.price > 0, `${m.id} price`);
    for (const fam of ['silhouette', 'laser']) assert.ok(d[fam], `${m.id} ${fam} settings`);
    assert.ok(d.laser.power > 0 && d.laser.power <= 100, `${m.id} laser power %`);
    assert.ok(d.laser.speed > 0 && d.laser.passes >= 1, `${m.id} laser speed/passes`);
  }
});

test('old saved materials gain price and machine settings without losing edits', () => {
  const old = { id: 'chip2', name: 'My board', thickness: 1.9, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#000' };
  const d = withMaterialDefaults(old);
  assert.equal(d.name, 'My board');
  assert.equal(d.thickness, 1.9);
  assert.equal(d.price, withMaterialDefaults(DEFAULT_MATERIALS[0]).price);
  assert.ok(d.laser.power > 0);
  // a price of 0 the user typed is kept (free scrap board)
  assert.equal(withMaterialDefaults({ ...old, price: 0 }).price, 0);
});

test('newMaterial makes a unique, usable custom material', () => {
  const list = DEFAULT_MATERIALS.map(withMaterialDefaults);
  const a = newMaterial(list);
  assert.ok(!list.some((m) => m.id === a.id));
  assert.equal(a.kind, 'card');
  assert.ok(a.sheet[0] > 0 && a.thickness > 0);
  const b = newMaterial([...list, a]);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.name, b.name);
});

test('duplicateMaterial copies everything except id and name, deeply', () => {
  const list = DEFAULT_MATERIALS.map(withMaterialDefaults);
  const src = list[0];
  const dup = duplicateMaterial(src, list);
  assert.notEqual(dup.id, src.id);
  assert.match(dup.name, /copy/);
  assert.equal(dup.thickness, src.thickness);
  assert.equal(dup.laser.power, src.laser.power);
  dup.sheet[0] = 1; dup.laser.power = 1;
  assert.notEqual(src.sheet[0], 1);
  assert.notEqual(src.laser.power, 1);
  assert.equal(dup.calibrated, undefined, 'a copy starts uncalibrated');
});

test('materialInUse finds references anywhere in the kit', () => {
  const kit = defaultKit();
  assert.equal(materialInUse(kit, kit.room.material), true);
  assert.equal(materialInUse(kit, 'not-a-material'), false);
  const custom = newMaterial(kit.materials);
  kit.materials.push(custom);
  assert.equal(materialInUse(kit, custom.id), false);
  kit.items.push({ type: 'x', material: custom.id });
  assert.equal(materialInUse(kit, custom.id), true);
});

test('machineSettings resolves the right settings per machine family', () => {
  const m = withMaterialDefaults(DEFAULT_MATERIALS[0]);
  const c = machineSettings(m, MACHINES.maker);
  assert.equal(c.family, 'cricut');
  assert.equal(c.setting, m.cricut);
  assert.equal(c.passes, m.passes);
  const s = machineSettings(m, MACHINES.cameo);
  assert.equal(s.family, 'silhouette');
  assert.ok(s.blade && s.passes >= 1 && s.speed > 0);
  const l = machineSettings({ ...m, laser: { ...m.laser, kerf: 0.15 } }, MACHINES.laser);
  assert.equal(l.family, 'laser');
  assert.equal(l.kerf, 0.15, 'per-material kerf wins');
  const l2 = machineSettings({ ...m, laser: { ...m.laser, kerf: undefined } }, MACHINES.laser);
  assert.equal(l2.kerf, MACHINES.laser.kerf, 'falls back to the machine kerf');
});

test('cut time uses the chosen machine’s speed and passes', () => {
  const sheet = compileKit({ ...defaultKit(), machine: 'laser' }).sheets[0];
  const slow = { ...sheet, material: { ...withMaterialDefaults(sheet.material), laser: { power: 50, speed: 5, passes: 1, kerf: 0.1 } } };
  const fast = { ...sheet, material: { ...slow.material, laser: { ...slow.material.laser, speed: 50 } } };
  assert.ok(estimateCutMinutes(slow, MACHINES.laser) > estimateCutMinutes(fast, MACHINES.laser));
  // without a machine it is still the Cricut estimate (old callers)
  assert.equal(estimateCutMinutes(sheet), estimateCutMinutes(sheet, MACHINES.maker));
});

test('laser settings line and files follow the material’s laser settings', () => {
  const sheet = compileKit({ ...defaultKit(), machine: 'laser' }).sheets[0];
  const mat = withMaterialDefaults(sheet.material);
  const s = { ...sheet, material: { ...mat, laser: { power: 42, speed: 9, passes: 2, kerf: 0.2 } } };
  const line = machineSettingsLine(s, MACHINES.laser);
  assert.match(line, /kerf 0\.2 mm/);
  assert.match(line, /42%/);
  assert.match(line, /2 passes/);
  assert.match(line, /≈ \d+ min/, 'laser now has a cut-time estimate');
  const narrow = sheetFiles({ ...s, material: { ...s.material, laser: { ...s.material.laser, kerf: 0 } } }, MACHINES.laser)[0].data;
  assert.notEqual(sheetFiles(s, MACHINES.laser)[0].data, narrow, 'kerf changes the laser paths');
});

test('silhouette settings line uses the material’s silhouette blade', () => {
  const sheet = compileKit({ ...defaultKit(), machine: 'cameo' }).sheets[0];
  const mat = withMaterialDefaults(sheet.material);
  const s = { ...sheet, material: { ...mat, silhouette: { blade: 'Deep-Cut Blade', passes: 3, speed: 5 } } };
  assert.match(machineSettingsLine(s, MACHINES.cameo), /Deep-Cut Blade/);
});

test('kitMaterialCost multiplies sheets by price per material', () => {
  const kit = defaultKit();
  kit.materials = kit.materials.map((m) => ({ ...withMaterialDefaults(m), price: 2 }));
  const compiled = compileKit(kit);
  const cost = kitMaterialCost(compiled.sheets, { currency: '€' });
  assert.equal(cost.currency, '€');
  const sheets = cost.lines.reduce((t, l) => t + l.sheets, 0);
  assert.equal(sheets, compiled.sheets.length);
  for (const l of cost.lines) {
    assert.ok(l.id && l.name);
    assert.equal(l.pricePerSheet, 2);
    assert.equal(l.cost, l.sheets * 2);
  }
  assert.equal(cost.total, compiled.sheets.length * 2);
  assert.equal(new Set(cost.lines.map((l) => l.id)).size, cost.lines.length, 'one line per material');
});

test('kitMaterialCost flags materials with no price', () => {
  const kit = defaultKit();
  kit.materials = kit.materials.map((m) => ({ ...withMaterialDefaults(m), price: 0 }));
  const cost = kitMaterialCost(compileKit(kit).sheets);
  assert.equal(cost.total, 0);
  assert.ok(cost.lines.every((l) => l.unpriced));
});

test('currency default follows the language, and money formats with two decimals', () => {
  assert.equal(defaultCurrency('en-US'), '$');
  assert.equal(defaultCurrency('en-GB'), '£');
  assert.equal(defaultCurrency('de-DE'), '€');
  assert.equal(defaultCurrency(''), '$');
  assert.equal(formatMoney(3.5, '$'), '$3.50');
  assert.equal(formatMoney(12, '€'), '€12.00');
});
