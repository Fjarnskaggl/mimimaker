// T7: the submit flow. The app builds a kits/<id>.kit.json for the visitor to
// add to the repo by pull request; nothing is sent anywhere by the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit } from '../src/catalog.js';
import {
  FORMAT, makeEntry, validateEntry, makeSubmission, submissionProblems, licenceChoices,
  slugify, unwrapKitFile, kitOrigin, withOrigin, SUBMIT_UPLOAD_URL,
} from '../src/share.js';
import * as gallery from '../gallery/kits.js';

const form = { title: 'My Tiny Den!', author: 'maker_2', licence: 'CC-BY-4.0', description: 'A den.', tags: 'cozy, Den ,' };

test('the kit format lives in src/share.js and the gallery uses the same functions', () => {
  assert.equal(gallery.makeEntry, makeEntry);
  assert.equal(gallery.validateEntry, validateEntry);
  assert.equal(gallery.FORMAT, FORMAT);
});

test('slugify turns a title into a kit id', () => {
  assert.equal(slugify('My Tiny Den!'), 'my-tiny-den');
  assert.equal(slugify('  Café — Bistro  '), 'cafe-bistro');
  assert.equal(slugify('!!!'), '');
  assert.ok(slugify('x'.repeat(100)).length <= 60);
});

test('makeSubmission wraps the design with the form as metadata', () => {
  const kit = defaultKit();
  const e = makeSubmission(kit, form);
  assert.equal(e.format, FORMAT);
  assert.deepEqual(e.meta, { id: 'my-tiny-den', title: 'My Tiny Den!', author: 'maker_2', licence: 'CC-BY-4.0', remixedFrom: null, description: 'A den.', tags: ['cozy', 'den'] });
  assert.deepEqual(validateEntry(e), []);
  assert.deepEqual(submissionProblems(e, kit), []);
});

test('a remix credits its source and drops the in-app origin from the kit', () => {
  const kit = withOrigin(defaultKit(), { id: 'kitchen', title: 'Cottage Kitchen', author: 'mimimaker', licence: 'CC0' });
  const e = makeSubmission(kit, form);
  assert.deepEqual(e.meta.remixedFrom, { id: 'kitchen' });
  assert.equal(e.kit.origin, undefined);
  assert.ok(kit.origin, 'the open design keeps its credit');
});

test('licence choices follow the source licence', () => {
  assert.deepEqual(licenceChoices(null), ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC0']);
  assert.deepEqual(licenceChoices('CC0'), ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC0']);
  assert.deepEqual(licenceChoices('CC-BY-4.0'), ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0']);
  assert.deepEqual(licenceChoices('CC-BY-SA-4.0'), ['CC-BY-SA-4.0']);
  assert.deepEqual(licenceChoices('CC-BY-NC-4.0'), ['CC-BY-NC-4.0']);
});

test('submissionProblems explains a missing handle and a licence the source does not allow', () => {
  const kit = withOrigin(defaultKit(), { id: 'nook', title: 'Nook', author: 'someone', licence: 'CC-BY-SA-4.0' });
  const e = makeSubmission(kit, { ...form, author: '', licence: 'CC0' });
  const probs = submissionProblems(e, kit);
  assert.ok(probs.some((p) => /handle/.test(p)), probs.join('\n'));
  assert.ok(probs.some((p) => /Nook.*CC BY-SA 4\.0/.test(p)), probs.join('\n'));
});

test('validateCollection also enforces the source licence', () => {
  const base = makeEntry(defaultKit(), { id: 'base', title: 'Base', author: 'a', licence: 'CC-BY-NC-4.0' });
  const remix = makeEntry(defaultKit(), { id: 'remix', title: 'Remix', author: 'b', licence: 'CC0', remixedFrom: { id: 'base' } });
  const errs = gallery.validateCollection([{ file: 'base.kit.json', entry: base }, { file: 'remix.kit.json', entry: remix }]);
  assert.ok(errs.some((e) => /remix\.kit\.json: .*licence/.test(e)), errs.join('\n'));
});

test('opening a kits/ file in the app gives the design with its credit', () => {
  const entry = makeEntry(defaultKit(), { id: 'den', title: 'Den', author: 'maker_2', licence: 'CC-BY-4.0' });
  const kit = unwrapKitFile(entry);
  assert.equal(kit.format, undefined);
  assert.deepEqual(kitOrigin(kit), { id: 'den', title: 'Den', author: 'maker_2', licence: 'CC-BY-4.0' });
  const plain = defaultKit();
  assert.equal(unwrapKitFile(plain), plain);
});

test('the upload link points at the kits folder of this repo', () => {
  assert.equal(SUBMIT_UPLOAD_URL, 'https://github.com/Fjarnskaggl/mimimaker/upload/main/kits');
});
