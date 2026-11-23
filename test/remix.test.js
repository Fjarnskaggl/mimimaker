// T7: remix credits. A design opened from the gallery (or from someone's
// share link) remembers where it came from, and shows that credit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultKit } from '../src/catalog.js';
import { LICENCES, kitOrigin, withOrigin, creditText, decodeKit } from '../src/share.js';
import { LICENCES as GALLERY_LICENCES } from '../gallery/kits.js';
import { buildGallery } from '../gallery/build.js';

const meta = { id: 'cozy-den', title: 'Cozy Den', author: 'maker_2', licence: 'CC-BY-4.0', description: 'x', tags: [] };

test('withOrigin records the source kit; kitOrigin reads it back, cleaned', () => {
  const kit = defaultKit();
  const out = withOrigin(kit, meta);
  assert.notEqual(out, kit, 'returns a copy');
  assert.equal(kit.origin, undefined, 'leaves the input alone');
  assert.deepEqual(kitOrigin(out), { id: 'cozy-den', title: 'Cozy Den', author: 'maker_2', licence: 'CC-BY-4.0' });
});

test('kitOrigin ignores junk and drops fields it cannot trust', () => {
  assert.equal(kitOrigin(defaultKit()), null);
  assert.equal(kitOrigin({ origin: 'nope' }), null);
  assert.equal(kitOrigin({ origin: { title: '' } }), null);
  const o = kitOrigin({ origin: { title: 'T'.repeat(200), author: 'not a handle!', licence: 'GPL', id: 'Bad Id', extra: 1 } });
  assert.equal(o.title.length, 80);
  assert.deepEqual(Object.keys(o), ['title']);
});

test('creditText names the source, author and licence', () => {
  assert.equal(creditText(meta), 'Remix of Cozy Den by maker_2 · CC BY 4.0 (credit the author)');
  assert.equal(creditText({ title: 'Untitled' }), 'Remix of Untitled');
  assert.equal(creditText(null), '');
});

test('the gallery shares one licence list with the app', () => {
  assert.equal(GALLERY_LICENCES, LICENCES);
});

test('gallery links carry the kit\'s origin, so the app can credit it', async () => {
  const dir = fileURLToPath(new URL('../kits/', import.meta.url));
  const entries = readdirSync(dir).filter((f) => f.endsWith('.kit.json')).slice(0, 2)
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const { html } = await buildGallery(entries);
  const links = [...html.matchAll(/href="\.\.\/#kit=([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  const origins = await Promise.all(links.map(async (l) => kitOrigin(await decodeKit(l))));
  for (const e of entries) {
    assert.ok(origins.some((o) => o?.id === e.meta.id && o.title === e.meta.title && o.author === e.meta.author && o.licence === e.meta.licence), e.meta.id);
  }
});
