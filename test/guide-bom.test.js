// T4: the printable guide carries the bill of materials, difficulty, build
// time and an exploded view for each step (from src/build/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { guideHTML } from '../src/guide.js';
import { billOfMaterials } from '../src/build/bom.js';
import { buildSteps } from '../src/build/steps.js';
import { explodedViewSVG } from '../src/build/exploded.js';
import { formatMinutes } from '../src/make.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const money = (c) => `$${c.low.toFixed(2)}–${c.high.toFixed(2)}`;
const section = (html, title) => {
  const i = html.indexOf(`<h2>${title}</h2>`);
  if (i < 0) return null;
  const j = html.indexOf('<h2>', i + 4);
  return html.slice(i, j < 0 ? undefined : j);
};
const setup = (kit) => { const compiled = compileKit(kit); return { kit, compiled, html: guideHTML(kit, compiled), bom: billOfMaterials(kit, compiled) }; };

test('guide: a bill of materials with every sheet and supply, the lights subtotal and the grand total', () => {
  const { html, bom } = setup(defaultKit());
  const sec = section(html, 'Bill of materials');
  assert.ok(sec, 'section exists');
  for (const i of [...bom.sheets, ...bom.supplies]) {
    assert.ok(sec.includes(esc(i.name)), i.name);
    assert.ok(sec.includes(money(i.cost)), `${i.name} cost`);
  }
  // lights are listed once, in "What to buy for the lights", and counted here
  const lights = bom.lights.reduce((t, i) => ({ low: t.low + i.cost.low, high: t.high + i.cost.high }), { low: 0, high: 0 });
  assert.ok(sec.includes(money(lights)), 'lights subtotal');
  assert.ok(!bom.lights.some((i) => sec.includes(esc(i.name))), 'light items not repeated');
  assert.ok(sec.includes(money(bom.total)), 'grand total');
  assert.match(sec, /estimate/i);
  assert.ok(html.indexOf('<h2>Bill of materials</h2>') < html.indexOf('<h2>Assembly</h2>'));
});

test('guide: an unlit kit lists everything in the bill itself', () => {
  const kit = defaultKit();
  kit.lighting.enabled = false;
  const { html, bom } = setup(kit);
  assert.equal(section(html, 'What to buy for the lights'), null);
  assert.ok(section(html, 'Bill of materials').includes(money(bom.total)));
});

test('guide: difficulty and build time up front', () => {
  const { html, bom } = setup(defaultKit());
  const head = html.slice(0, html.indexOf('<h2>'));
  assert.ok(head.includes(bom.difficulty.level));
  assert.ok(head.includes(`about ${formatMinutes(bom.time.totalMin)}`));
  const sec = section(html, 'Bill of materials');
  for (const r of bom.difficulty.reasons) assert.ok(sec.includes(esc(r)), r);
  assert.ok(sec.includes(formatMinutes(bom.time.cutMin)) && sec.includes(formatMinutes(bom.time.assemblyMin)));
});

test('guide: every step with something to show has its exploded view', () => {
  const kit = defaultKit();
  const { compiled, html } = setup(kit);
  const steps = buildSteps(kit, compiled);
  let shown = 0;
  for (const s of steps) {
    const start = html.indexOf(`data-step="${s.n}"`);
    const end = html.indexOf('</section>', start);
    const block = html.slice(start, end);
    const svg = explodedViewSVG(kit, compiled, steps, s.n);
    if (svg) { shown++; assert.match(block, new RegExp(`aria-label="Exploded view of step ${s.n}:`)); } else assert.doesNotMatch(block, /exploded/);
  }
  assert.ok(shown > steps.length / 2);
});

test('guide: an unlit book nook lists its suggested LEDs in the bill', () => {
  const kit = { ...defaultKit(), shell: { type: 'alley', gap: { w: 90, h: 230, d: 180 }, clearance: 2, params: {} } };
  kit.lighting = { ...kit.lighting, enabled: false };
  const { html, bom } = setup(kit);
  assert.ok(bom.lights.length, 'the alley suggests lit spots');
  const sec = section(html, 'Bill of materials');
  for (const i of bom.lights) assert.ok(sec.includes(esc(i.name)), i.name);
});

test("guide: \"You'll need\" names the same glue as the bill", () => {
  const card = defaultKit();
  card.room.material = 'card110';
  card.items = card.items.filter((i) => ['nightstand', 'rug', 'frame'].includes(i.type));
  const { html, bom } = setup(card);
  const need = section(html, "You'll need");
  assert.ok(!bom.supplies.some((i) => i.id === 'pva'));
  assert.doesNotMatch(need, /PVA/);
  assert.match(need, /glue stick/);
});
