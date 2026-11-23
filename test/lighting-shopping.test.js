import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shoppingList, shoppingListText, shoppingListCSV, PRICE_NOTE } from '../src/lighting/shopping.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

function lit(leds, power = {}) {
  const kit = defaultKit();
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, ...power };
  kit.lighting.leds = leds;
  return compileKit(kit).lighting;
}
const wall = (o = {}) => ({ mount: 'wall', wall: 'back', pos: 80, elev: 150, color: 'warm', ...o });
const find = (list, id) => list.items.find((i) => i.id === id);

test('no lights, no list', () => {
  assert.equal(shoppingList({ enabled: false }), null);
  assert.equal(shoppingList(lit([])), null);
});

test('steady LEDs are grouped by colour, with the longest lead needed', () => {
  const L = lit([wall(), wall({ pos: 20 }), wall({ color: 'amber' })]);
  const list = shoppingList(L);
  const warm = find(list, 'led-steady-warm');
  assert.equal(warm.qty, 2);
  assert.match(warm.name, /warm white/i);
  assert.match(warm.name, /3 V/);
  const longest = Math.max(...L.leds.filter((l) => l.color === 'warm').map((l) => l.leadCm));
  assert.match(warm.note, new RegExp(`${longest} cm`));
  assert.equal(find(list, 'led-steady-amber').qty, 1);
});

test('effects: flicker LEDs, fairy strings and strip length', () => {
  const list = shoppingList(lit([
    wall({ effect: 'candle' }),
    wall({ effect: 'fairy', bulbs: 20, lengthMm: 1000 }),
    wall({ effect: 'strip', lengthMm: 100, pos: 10 }),
    wall({ effect: 'strip', lengthMm: 50, pos: 10, elev: 100 }),
  ], { supply: 'usb', kind: 'usb' }));
  assert.equal(find(list, 'led-candle-warm').qty, 1);
  const fairy = find(list, 'fairy-20');
  assert.equal(fairy.qty, 1);
  assert.match(fairy.name, /20 bulbs/);
  const strip = find(list, 'strip');
  assert.equal(strip.qty, 1, 'one reel covers 150 mm');
  assert.match(strip.note, /150 mm/);
  assert.match(strip.name, /5 V/);
});

test('power parts follow the supply and mount', () => {
  const ids = (power) => shoppingList(lit([wall()], power)).items.map((i) => i.id);
  assert.ok(ids({ supply: 'aa2', kind: 'battery' }).includes('box-aa2'));
  assert.ok(ids({ supply: 'aa2', kind: 'battery' }).includes('cells-aa'));
  assert.ok(ids({ supply: 'cr2032', kind: 'battery' }).includes('box-cr2032'));
  assert.ok(ids({ supply: 'cr2032', kind: 'battery' }).includes('cells-cr2032'));
  assert.ok(ids({ supply: 'usb', kind: 'usb' }).includes('usb-lead'));
  const flush = ids({ supply: 'usb', kind: 'usb', mount: 'flush' });
  assert.ok(flush.includes('usb-socket') && flush.includes('push-switch') && !flush.includes('usb-lead'));
});

test('costs are rough ranges, summed, and labelled as estimates', () => {
  const list = shoppingList(lit([wall(), wall({ pos: 20 })]));
  for (const i of list.items) assert.ok(i.cost.low > 0 && i.cost.high >= i.cost.low, i.id);
  const sum = (k) => list.items.reduce((s, i) => s + i.cost[k], 0);
  assert.ok(Math.abs(list.total.low - sum('low')) < 1e-9);
  assert.ok(Math.abs(list.total.high - sum('high')) < 1e-9);
  assert.match(PRICE_NOTE, /estimate/i);
  assert.equal(list.note, PRICE_NOTE);
});

test('text and CSV for the guide and the zip', () => {
  const list = shoppingList(lit([wall(), wall({ effect: 'candle', pos: 20 })]));
  const txt = shoppingListText(list);
  assert.match(txt, /^Lighting shopping list/m);
  for (const i of list.items) assert.ok(txt.includes(i.name), i.name);
  assert.match(txt, /estimate/i);
  const csv = shoppingListCSV(list).trim().split('\n');
  assert.equal(csv[0], 'Qty,Item,Note,Est. low,Est. high');
  assert.equal(csv.length, list.items.length + 2, 'header + items + total');
  assert.match(csv.at(-1), /^,Total/);
  assert.equal(shoppingListCSV({ items: [{ qty: 1, name: 'a "quoted", item', note: '', cost: { low: 1, high: 2 } }], total: { low: 1, high: 2 } }).split('\n')[1], '1,"a ""quoted"", item",,1.00,2.00');
});

import { shoppingFile } from '../src/lighting/shopping.js';

test('shoppingFile: a ready-to-zip CSV, or nothing without lights', () => {
  const f = shoppingFile(lit([wall()]));
  assert.equal(f.name, 'shopping-list.csv');
  assert.equal(f.type, 'text/csv');
  assert.match(f.data, /^Qty,Item/);
  assert.match(f.data, /micro LED/);
  assert.equal(shoppingFile(lit([])), null);
  assert.equal(shoppingFile({ enabled: false }), null);
});
