// T7: community kits (kits/*.kit.json) and the static gallery generator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultKit } from '../src/catalog.js';
import { ROOM_TYPES } from '../src/templates.js';
import { decodeKit } from '../src/share.js';
import { LICENCES, validateEntry, validateCollection, makeEntry } from '../gallery/kits.js';
import { buildGallery } from '../gallery/build.js';

const KITS_DIR = new URL('../kits/', import.meta.url).pathname;
const files = readdirSync(KITS_DIR).filter((f) => f.endsWith('.kit.json')).sort();
const entries = files.map((f) => ({ file: f, entry: JSON.parse(readFileSync(join(KITS_DIR, f), 'utf8')) }));

const sample = (meta = {}) => makeEntry(defaultKit(), { id: 'test-nook', title: 'Test nook', author: 'mimimaker', licence: 'CC-BY-4.0', ...meta });

// --------------------------------------------------------------- format
test('makeEntry wraps a kit with metadata in the kits/ format', () => {
  const e = sample();
  assert.equal(e.format, 'mimimaker-kit');
  assert.equal(e.formatVersion, 1);
  assert.equal(e.meta.id, 'test-nook');
  assert.equal(e.meta.remixedFrom, null);
  assert.deepEqual(e.kit, defaultKit());
  assert.deepEqual(validateEntry(e), []);
});

test('validateEntry rejects bad metadata', () => {
  const bad = (meta, re) => {
    const errs = validateEntry(sample(meta));
    assert.ok(errs.some((m) => re.test(m)), `${JSON.stringify(meta)} → ${errs}`);
  };
  bad({ title: '' }, /title/);
  bad({ title: 'x'.repeat(81) }, /title/);
  bad({ id: 'Has Spaces' }, /id/);
  bad({ author: '@someone' }, /author/);
  bad({ author: '' }, /author/);
  bad({ licence: 'All rights reserved, sort of' }, /licence/);
  bad({ remixedFrom: 'not an object' }, /remixedFrom/);
  bad({ remixedFrom: { id: 'test-nook' } }, /itself/);
  assert.ok(validateEntry({ format: 'nope' }).length);
  assert.ok(validateEntry(null).length);
});

test('validateEntry rejects a kit that does not compile', () => {
  const e = sample();
  e.kit = { ...e.kit, room: { ...e.kit.room, width: -5 } };
  assert.ok(validateEntry(e).some((m) => /kit/.test(m)));
  const e2 = sample();
  delete e2.kit;
  assert.ok(validateEntry(e2).some((m) => /kit/.test(m)));
});

test('every licence has a name and a link', () => {
  assert.ok(LICENCES['CC-BY-4.0'] && LICENCES.CC0);
  for (const [id, l] of Object.entries(LICENCES)) {
    assert.ok(l.name, id);
    assert.match(l.url, /^https:\/\//, id);
  }
});

test('validateCollection checks ids, file names and remix links', () => {
  const a = sample({ id: 'a' }), b = sample({ id: 'b', remixedFrom: { id: 'a' } });
  assert.deepEqual(validateCollection([{ file: 'a.kit.json', entry: a }, { file: 'b.kit.json', entry: b }]), []);
  const errs = validateCollection([
    { file: 'a.kit.json', entry: a }, { file: 'a2.kit.json', entry: a },
    { file: 'c.kit.json', entry: sample({ id: 'c', remixedFrom: { id: 'missing' } }) },
  ]);
  assert.ok(errs.some((m) => /duplicate/i.test(m)), errs.join('\n'));
  assert.ok(errs.some((m) => /a2\.kit\.json/.test(m) && /file name/i.test(m)), errs.join('\n'));
  assert.ok(errs.some((m) => /missing/.test(m)), errs.join('\n'));
  // remix cycles are impossible to credit
  const x = sample({ id: 'x', remixedFrom: { id: 'y' } }), y = sample({ id: 'y', remixedFrom: { id: 'x' } });
  assert.ok(validateCollection([{ file: 'x.kit.json', entry: x }, { file: 'y.kit.json', entry: y }]).some((m) => /cycle/i.test(m)));
});

// ------------------------------------------------------------ the kits/ folder
test('kits/ holds valid kits, one per built-in room type, credited to mimimaker', () => {
  assert.deepEqual(validateCollection(entries), []);
  for (const rt of ROOM_TYPES) {
    const e = entries.find((x) => x.entry.meta.id === rt.id);
    assert.ok(e, `seed kit for ${rt.id}`);
    assert.equal(e.entry.meta.author, 'mimimaker');
  }
});

// ------------------------------------------------------------ gallery build
test('buildGallery writes one card per kit with a render and an Open link that decodes to the kit', async () => {
  const { html, renders } = await buildGallery(entries.map((e) => e.entry), { appUrl: '../' });
  assert.match(html, /^<!doctype html>/i);
  assert.equal(Object.keys(renders).length, entries.length);
  for (const { entry } of entries) {
    const svg = renders[`renders/${entry.meta.id}.svg`];
    assert.match(svg, /^<svg[^>]*xmlns=/, entry.meta.id);
    assert.ok(svg.includes('<path'), entry.meta.id);
    assert.ok(html.includes(`src="renders/${entry.meta.id}.svg"`), entry.meta.id);
    assert.ok(html.includes(`id="kit-${entry.meta.id}"`), entry.meta.id);
  }
  const links = [...html.matchAll(/href="\.\.\/#kit=([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, entries.length);
  const titles = await Promise.all(links.map(async (l) => (await decodeKit(l)).name));
  for (const { entry } of entries) assert.ok(titles.includes(entry.kit.name), entry.meta.id);
});

test('gallery cards show title, author, licence and remix credit, escaped', async () => {
  const a = sample({ id: 'base', title: 'Base room' });
  const b = sample({ id: 'evil', title: '<script>alert(1)</script> & co', author: 'maker_2', licence: 'CC0', remixedFrom: { id: 'base' }, description: 'A "quoted" <b>room</b>' });
  const { html } = await buildGallery([a, b], { appUrl: '../' });
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co'));
  assert.ok(!html.includes('<b>room</b>'));
  assert.ok(html.includes('maker_2'));
  assert.ok(html.includes(LICENCES.CC0.url));
  assert.match(html, /Remix of <a href="#kit-base">Base room<\/a>/);
});

test('buildGallery refuses an invalid collection', async () => {
  await assert.rejects(buildGallery([sample({ title: '' })]), /title/);
});
