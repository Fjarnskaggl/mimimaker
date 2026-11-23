// T4: the bill of materials prices sheets from the material library (T3,
// #82): each material's own price per sheet, in the kit's currency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { billOfMaterials, bomText, costText, totalText } from '../src/build/bom.js';
import { kitMaterialCost } from '../src/export/cost.js';
import { guideHTML } from '../src/guide.js';

const bomOf = (kit) => { const compiled = compileKit(kit); return { compiled, bom: billOfMaterials(kit, compiled) }; };

test('sheet lines cost exactly what the material library says', () => {
  const kit = defaultKit();
  const { compiled, bom } = bomOf(kit);
  const lib = kitMaterialCost(compiled.sheets, { currency: '$' });
  assert.equal(bom.sheets.length, lib.lines.length);
  for (const l of lib.lines) {
    const line = bom.sheets.find((s) => s.id === l.id);
    assert.equal(line.qty, l.sheets);
    assert.equal(line.cost.low, l.cost);
    assert.equal(line.cost.high, l.cost);
    assert.equal(line.cost.currency, '$');
  }
});

test('an edited price per sheet flows into the bill', () => {
  const kit = defaultKit();
  kit.materials.find((m) => m.id === 'chip2').price = 9;
  const { bom } = bomOf(kit);
  const line = bom.sheets.find((s) => s.id === 'chip2');
  assert.equal(line.cost.low, 9 * line.qty);
  assert.equal(costText(line.cost), `$${(9 * line.qty).toFixed(2)}`);
});

test("sheets are in the kit's currency; glue and lights stay labelled US-dollar estimates", () => {
  const kit = defaultKit();
  kit.currency = '€';
  const { bom } = bomOf(kit);
  assert.ok(bom.sheets.every((s) => s.cost.currency === '€'));
  assert.ok([...bom.supplies, ...bom.lights].every((i) => (i.cost.currency || '$') === '$'));
  assert.deepEqual(bom.totals.map((t) => t.currency).sort(), ['$', '€']);
  const total = totalText(bom);
  assert.match(total, /€\d+\.\d\d/);
  assert.match(total, /\$\d+\.\d\d–\d+\.\d\d/);
  assert.match(bom.note, /€/);
  assert.match(bomText(bom), /€/);
  assert.match(guideHTML(kit, compileKit(kit)), /€\d+\.\d\d/);
});

test('a material with no price says so instead of costing nothing silently', () => {
  const kit = defaultKit();
  kit.materials.find((m) => m.id === 'chip2').price = 0;
  const { bom } = bomOf(kit);
  assert.match(bom.sheets.find((s) => s.id === 'chip2').note, /no price set/);
});

test('one currency: a single total, as before', () => {
  const { bom } = bomOf(defaultKit());
  assert.equal(bom.totals.length, 1);
  assert.equal(totalText(bom), costText(bom.total));
});
