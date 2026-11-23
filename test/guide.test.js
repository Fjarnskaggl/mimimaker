// T4: the printable guide is built from the generated build steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit, CATALOG } from '../src/catalog.js';
import { buildSteps } from '../src/build/steps.js';
import { guideHTML } from '../src/guide.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';

const stepSections = (html) => [...html.matchAll(/<section class="step[^"]*" data-step="(\d+)"[^>]*>([\s\S]*?)<\/section>/g)].map((m) => ({ n: Number(m[1]), body: m[2] }));

test('guide has one numbered section per build step, in order', () => {
  const kit = defaultKit();
  const compiled = compileKit(kit);
  const steps = buildSteps(kit, compiled);
  const sections = stepSections(guideHTML(kit, compiled));
  assert.deepEqual(sections.map((s) => s.n), steps.map((s) => s.n));
  sections.forEach((sec, i) => assert.ok(sec.body.includes(steps[i].title.replace(/&/g, '&amp;')), `step ${i + 1} title`));
});

test('guide: bookshelf shelves slide in before the second side closes them', () => {
  const kit = defaultKit();
  kit.items = [{ type: 'bookshelf', params: { ...CATALOG.bookshelf.defaults }, material: 'bass16', x: 10, y: 10, rot: 0 }];
  const html = guideHTML(kit, compileKit(kit));
  const slide = html.indexOf('Slide the shelves into the bookshelf');
  const close = html.indexOf('Close the bookshelf');
  assert.ok(slide > 0 && close > slide);
});

test('guide steps show their joints, parts and glue time', () => {
  const kit = defaultKit();
  const compiled = compileKit(kit);
  const steps = buildSteps(kit, compiled);
  const sections = stepSections(guideHTML(kit, compiled));
  const room = sections[0].body;
  assert.match(room, /finger joint/);
  assert.match(room, /30 min/);
  for (const id of steps[0].parts) assert.match(room, new RegExp(`#${id}\\b`));
  const lighting = sections.find((s) => /Wire the lights/.test(s.body));
  if (lighting) assert.doesNotMatch(lighting.body, /glue set/);
});

test('every room type renders a guide whose steps cover every part', () => {
  for (const rt of ROOM_TYPES) {
    const kit = applyRoomType(defaultKit(), rt.id);
    const compiled = compileKit(kit);
    const body = stepSections(guideHTML(kit, compiled)).map((s) => s.body).join('');
    for (const p of compiled.parts) assert.match(body, new RegExp(`#${p.id}\\b`), `${rt.id}: part #${p.id}`);
  }
});
