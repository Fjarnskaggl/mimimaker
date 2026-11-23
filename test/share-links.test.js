// T7: share-link improvements: shorter links, a size warning, and preview text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultKit } from '../src/catalog.js';
import { encodeKit, decodeKit, LONG_LINK, linkSizeNote, shareSummary } from '../src/share.js';
import { buildGallery } from '../gallery/build.js';

const KITS = fileURLToPath(new URL('../kits/', import.meta.url));
const kits = readdirSync(KITS).filter((f) => f.endsWith('.kit.json')).map((f) => JSON.parse(readFileSync(join(KITS, f), 'utf8')));

// The links main made: deflate-raw of the whole JSON, base64url, "z" prefix.
async function oldLink(kit) {
  const bytes = new TextEncoder().encode(JSON.stringify(kit));
  const out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  let s = ''; for (const b of out) s += String.fromCharCode(b);
  return 'z' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('share links are at least 30% shorter than before, and round-trip exactly', async () => {
  for (const { meta, kit } of kits) {
    const now = await encodeKit(kit);
    const before = await oldLink(kit);
    assert.ok(now.length <= before.length * 0.7, `${meta.id}: ${now.length} vs ${before.length}`);
    assert.deepEqual(await decodeKit(now), kit, meta.id);
  }
});

test('a changed material is kept in full; an unknown one too', async () => {
  const kit = defaultKit();
  kit.materials[0] = { ...kit.materials[0], thickness: 2.1, calibrated: true };
  kit.materials.push({ id: 'mine', name: 'My board', thickness: 3, kind: 'board', tool: 'knife', sheet: [300, 300], color: '#123456' });
  assert.deepEqual(await decodeKit(await encodeKit(kit)), kit);
});

test('links made before this change still open', async () => {
  const { kit } = kits[0];
  assert.deepEqual(await decodeKit(await oldLink(kit)), kit);
});

test('linkSizeNote warns only for long links and points to Save as a file', () => {
  assert.equal(linkSizeNote(LONG_LINK), null);
  const note = linkSizeNote(LONG_LINK + 1);
  assert.match(note, /long/i);
  assert.match(note, /Save as a file/);
  assert.match(note, new RegExp(String(LONG_LINK + 1).replace(/\B(?=(\d{3})+$)/g, ',')));
});

test('the seed kits all make links well under the warning size', async () => {
  for (const { meta, kit } of kits) assert.ok(('https://fjarnskaggl.github.io/mimimaker/#kit=' + await encodeKit(kit)).length < LONG_LINK, meta.id);
});

test('shareSummary describes the design in one line', () => {
  const kit = defaultKit();
  kit.name = 'Tiny Den';
  const s = shareSummary(kit);
  assert.match(s, /^Tiny Den · 1:\d+ room kit · \d+ × \d+ × \d+ cm · \d+ pieces?$/);
});

test('the app page and the gallery have preview-card text for link unfurls', async () => {
  const index = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const { html } = await buildGallery(kits.slice(0, 1));
  for (const page of [index, html]) {
    assert.match(page, /<meta property="og:title" content="[^"]+">/);
    assert.match(page, /<meta property="og:description" content="[^"]+">/);
    assert.match(page, /<meta property="og:type" content="website">/);
    assert.match(page, /<meta name="twitter:card" content="summary">/);
  }
});

test('the single-file page that Pages deploys keeps the description and preview-card tags', async () => {
  const { buildPage } = await import('../scripts/build-single.js');
  const index = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const page = buildPage({ html: index, css: '', js: '' });
  const head = page.slice(0, page.indexOf('</head>'));
  for (const re of [/<meta name="description" content="[^"]+">/, /<meta property="og:title" content="[^"]+">/, /<meta property="og:description" content="[^"]+">/, /<meta name="twitter:card" content="summary">/]) {
    assert.match(head, re);
  }
});
