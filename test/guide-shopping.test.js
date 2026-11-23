// T4: the guide lists what to buy for the lights (#57, from T5's shopping list).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { guideHTML } from '../src/guide.js';
import { shoppingList, PRICE_NOTE } from '../src/lighting/shopping.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const wall = (o = {}) => ({ mount: 'wall', wall: 'back', pos: 80, elev: 150, color: 'warm', ...o });

function litKit(leds, power = {}) {
  const kit = defaultKit();
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, ...power };
  kit.lighting.leds = leds;
  return kit;
}
const buySection = (html) => {
  const i = html.indexOf('<h2>What to buy for the lights</h2>');
  if (i < 0) return null;
  const j = html.indexOf('<h2>', i + 4);
  return html.slice(i, j < 0 ? undefined : j);
};

test('a lit kit gets a "What to buy for the lights" table with every item, the total and the price note', () => {
  const kit = litKit([wall(), wall({ pos: 20 }), wall({ color: 'amber', effect: 'candle' })]);
  const compiled = compileKit(kit);
  const list = shoppingList(compiled.lighting);
  const sec = buySection(guideHTML(kit, compiled));
  assert.ok(sec, 'section exists');
  const rows = [...sec.matchAll(/<tr class="buy">([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  assert.equal(rows.length, list.items.length);
  list.items.forEach((item, i) => {
    assert.match(rows[i], new RegExp(`<td>${item.qty}</td>`));
    assert.ok(rows[i].includes(esc(item.name)), item.name);
    assert.ok(rows[i].includes(esc(item.note)), item.note);
    assert.ok(rows[i].includes(`$${item.cost.low.toFixed(2)}–${item.cost.high.toFixed(2)}`), `${item.id} cost`);
  });
  assert.ok(sec.includes(`$${list.total.low.toFixed(2)}–${list.total.high.toFixed(2)}`), 'total');
  assert.ok(sec.includes(esc(PRICE_NOTE)), 'price note stays visible');
  assert.match(sec, /shopping-list\.csv/);
  assert.match(sec, /estimate/i);
});

test('the buying list comes after the lighting map', () => {
  const kit = litKit([wall()]);
  const html = guideHTML(kit, compileKit(kit));
  assert.ok(html.indexOf('<h2>What to buy for the lights</h2>') > html.indexOf('<h2>Lighting</h2>'));
});

test('no lights, no buying list', () => {
  const kit = defaultKit();
  kit.lighting.enabled = false;
  assert.equal(buySection(guideHTML(kit, compileKit(kit))), null);
  const empty = litKit([]);
  assert.equal(buySection(guideHTML(empty, compileKit(empty))), null);
});
