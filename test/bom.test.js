// T4: bill of materials, cost, difficulty and build-time estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit, CATALOG } from '../src/catalog.js';
import { billOfMaterials, bomText, DIFFICULTY } from '../src/build/bom.js';
import { estimateCutMinutes } from '../src/make.js';
import { shoppingList } from '../src/lighting/shopping.js';

const bomOf = (kit) => { const compiled = compileKit(kit); return { compiled, bom: billOfMaterials(kit, compiled) }; };
const sum = (list) => list.reduce((t, i) => ({ low: t.low + i.cost.low, high: t.high + i.cost.high }), { low: 0, high: 0 });
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('sheets: one line per material, counted from the cut sheets', () => {
  const { compiled, bom } = bomOf(defaultKit());
  assert.equal(bom.sheets.length, compiled.usedMats.length);
  for (const m of compiled.usedMats) {
    const line = bom.sheets.find((s) => s.id === m.id);
    assert.ok(line, m.name);
    assert.equal(line.qty, compiled.sheets.filter((s) => s.material.id === m.id).length);
    assert.match(line.name, new RegExp(m.name.replace(/[()"/.]/g, '.')));
    assert.ok(line.cost.low > 0 && line.cost.high >= line.cost.low);
  }
});

test('lights: the lighting shopping list is part of the bill, unchanged', () => {
  const { compiled, bom } = bomOf(defaultKit());
  const list = shoppingList(compiled.lighting);
  assert.ok(list, 'the default kit is lit');
  assert.deepEqual(bom.lights, list.items);
  const leds = bom.lights.filter((i) => /LED/.test(i.name)).reduce((n, i) => n + i.qty, 0);
  assert.equal(leds, compiled.lighting.leds.length);
});

test('supplies: wood glue for board, glue stick for paper, acetate only with window frames', () => {
  const { bom } = bomOf(defaultKit());
  const names = bom.supplies.map((s) => s.name).join(' | ');
  assert.match(names, /PVA|wood glue/i);
  assert.match(names, /glue stick/i);
  assert.match(names, /acetate/i, 'the default room has a framed window');

  const card = defaultKit();
  card.room.material = 'card110';
  card.room.wallpaper = { enabled: false };
  card.room.floor = { enabled: false };
  card.openings = [];
  card.items = [{ type: 'nightstand', params: { ...CATALOG.nightstand.defaults }, material: 'card110', x: 5, y: 5, rot: 0 }];
  card.lighting = { ...card.lighting, enabled: false };
  const c = bomOf(card).bom;
  assert.ok(!c.supplies.some((s) => /PVA|wood glue/i.test(s.name)), 'no board, no wood glue');
  assert.ok(!c.supplies.some((s) => /acetate/i.test(s.name)), 'no windows, no acetate');
  assert.deepEqual(c.lights, []);
});

test('total is the sum of every line', () => {
  const { bom } = bomOf(defaultKit());
  const t = sum([...bom.sheets, ...bom.supplies, ...bom.lights]);
  assert.ok(close(bom.total.low, t.low) && close(bom.total.high, t.high));
  assert.match(bom.note, /estimate/i);
});

test('build time: cutting from the sheets, assembly and glue time from the steps', () => {
  const { compiled, bom } = bomOf(defaultKit());
  const cut = compiled.sheets.reduce((s, sh) => s + estimateCutMinutes(sh), 0);
  assert.ok(close(bom.time.cutMin, cut));
  assert.ok(bom.time.assemblyMin > 0 && bom.time.glueMin > 0);
  assert.ok(close(bom.time.totalMin, bom.time.cutMin + bom.time.assemblyMin + bom.time.glueMin));
  // more furniture takes longer
  const more = defaultKit();
  more.items = [...more.items, ...more.items.map((i) => ({ ...i, name: undefined }))];
  assert.ok(bomOf(more).bom.time.assemblyMin > bom.time.assemblyMin);
});

test('difficulty: a small card kit is easier than a lit board room, which is easier than an alley', () => {
  const card = defaultKit();
  card.room.material = 'card110';
  card.openings = [];
  card.items = [{ type: 'nightstand', params: { ...CATALOG.nightstand.defaults }, material: 'card110', x: 5, y: 5, rot: 0 }];
  card.lighting = { ...card.lighting, enabled: false };
  const alley = { ...defaultKit(), shell: { type: 'alley', gap: { w: 90, h: 230, d: 180 }, clearance: 2, params: {} } };
  const levels = [card, defaultKit(), alley].map((k) => bomOf(k).bom.difficulty);
  for (const d of levels) {
    assert.ok(DIFFICULTY.includes(d.level), d.level);
    assert.ok(d.reasons.length > 0);
  }
  assert.ok(levels[0].score < levels[1].score && levels[1].score < levels[2].score, levels.map((d) => d.score).join(' < '));
  assert.equal(levels[0].level, DIFFICULTY[0]);
  assert.equal(levels[2].level, DIFFICULTY.at(-1));
});

test('bomText: a plain-text list with every line and the total', () => {
  const { bom } = bomOf(defaultKit());
  const txt = bomText(bom);
  for (const line of [...bom.sheets, ...bom.supplies, ...bom.lights]) assert.ok(txt.includes(line.name), line.name);
  assert.match(txt, /Estimated total: \$\d+\.\d\d–\d+\.\d\d/);
  assert.match(txt, new RegExp(bom.difficulty.level));
});

test("a shell's suggested LED spots are on the bill, in the time and in the difficulty alike", () => {
  const alley = { ...defaultKit(), shell: { type: 'alley', gap: { w: 90, h: 230, d: 180 }, clearance: 2, params: {} } };
  const { compiled, bom } = bomOf(alley);
  const spots = compiled.shell.lights.length;
  assert.ok(spots > 0 && !compiled.lighting?.enabled);
  const leds = bom.lights.filter((i) => /LED/.test(i.name)).reduce((n, i) => n + i.qty, 0);
  assert.equal(leds, spots);
  assert.ok(bom.difficulty.reasons.some((r) => r.includes(`${spots} LEDs`)));
});
