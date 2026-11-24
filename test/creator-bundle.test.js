// T7: the creator bundle, a zip a designer can sell or give away: box art,
// cut files for each machine family, the assembly guide, a licence and the
// design file. No mimimaker watermark anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit } from '../src/catalog.js';
import { applyRoomType } from '../src/templates.js';
import { withOrigin, validateEntry, kitOrigin, unwrapKitFile } from '../src/share.js';
import { creatorBundle, BUNDLE_MACHINES } from '../src/share/bundle.js';

const kitchen = () => applyRoomType(defaultKit(), 'kitchen');
const opts = { author: 'tiny_rooms', licence: 'CC-BY-NC-4.0' };
const names = (b) => b.files.map((f) => f.name);

test('the bundle has box art, cut files per machine family, the guide, licence and design', () => {
  const b = creatorBundle(kitchen(), opts);
  assert.deepEqual(b.problems, []);
  const n = names(b);
  for (const view of ['front', 'side', 'top']) assert.ok(n.includes(`box-art/cottage-kitchen-${view}.svg`), view);
  assert.ok(n.includes('box-art/cottage-kitchen-night.svg'), 'the kitchen has lights, so a night render');
  assert.deepEqual(Object.keys(BUNDLE_MACHINES), ['cricut', 'silhouette', 'laser']);
  for (const fam of Object.keys(BUNDLE_MACHINES)) assert.ok(n.some((x) => x.startsWith(`cut-files/${fam}/`)), fam);
  assert.ok(n.some((x) => /^cut-files\/silhouette\/.*\.dxf$/.test(x)));
  assert.ok(n.some((x) => /^cut-files\/laser\/.*\.dxf$/.test(x)));
  assert.ok(n.includes('assembly-guide.html'));
  assert.ok(n.includes('LICENSE.txt'));
  assert.ok(n.includes('README.txt'));
  assert.ok(n.includes('cottage-kitchen.kit.json'));
  assert.equal(b.zipName, 'cottage-kitchen-creator-bundle.zip');
});

test('box art is real SVG drawn from the design', () => {
  const b = creatorBundle(kitchen(), opts);
  const front = b.files.find((f) => f.name.endsWith('-front.svg')).data;
  assert.match(front, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  // > 40: pots got soil tops (#buildability), which hide a few inside faces
  assert.ok((front.match(/<path/g) || []).length > 40);
  const top = b.files.find((f) => f.name.endsWith('-top.svg')).data;
  assert.notEqual(front, top);
});

test('no mimimaker watermark in the box art, cut files or guide', () => {
  const b = creatorBundle(kitchen(), opts);
  for (const f of b.files) {
    if (/^(box-art|cut-files)\//.test(f.name) || f.name === 'assembly-guide.html') assert.doesNotMatch(String(f.data), /mimimaker/i, f.name);
  }
});

test('the licence file and the guide name the creator and the licence', () => {
  const b = creatorBundle(kitchen(), opts);
  const lic = b.files.find((f) => f.name === 'LICENSE.txt').data;
  assert.match(lic, /Cottage Kitchen/);
  assert.match(lic, /tiny_rooms/);
  assert.match(lic, /CC BY-NC 4\.0/);
  assert.match(lic, /creativecommons\.org\/licenses\/by-nc\/4\.0/);
  const guide = b.files.find((f) => f.name === 'assembly-guide.html').data;
  assert.match(guide, /Designed by tiny_rooms/);
  assert.match(guide, /CC BY-NC 4\.0/);
});

test('the design file is a valid kits/ entry that reopens with its credit', () => {
  const b = creatorBundle(kitchen(), opts);
  const entry = JSON.parse(b.files.find((f) => f.name.endsWith('.kit.json')).data);
  assert.deepEqual(validateEntry(entry), []);
  assert.deepEqual(kitOrigin(unwrapKitFile(entry)), { id: 'cottage-kitchen', title: 'Cottage Kitchen', author: 'tiny_rooms', licence: 'CC-BY-NC-4.0' });
});

test('a remix credits its source and must keep its licence terms', () => {
  const kit = withOrigin(kitchen(), { id: 'nook', title: 'Cozy Nook', author: 'someone', licence: 'CC-BY-SA-4.0' });
  const bad = creatorBundle(kit, { author: 'tiny_rooms', licence: 'CC-BY-4.0' });
  assert.ok(bad.problems.some((p) => /Cozy Nook/.test(p)), bad.problems.join('\n'));
  assert.deepEqual(bad.files, []);
  const ok = creatorBundle(kit, { author: 'tiny_rooms', licence: 'CC-BY-SA-4.0' });
  assert.deepEqual(ok.problems, []);
  assert.match(ok.files.find((f) => f.name === 'LICENSE.txt').data, /Remix of Cozy Nook by someone/);
});

test('a missing handle is a problem, and the README says if selling is allowed', () => {
  assert.ok(creatorBundle(kitchen(), { author: '', licence: 'CC0' }).problems.some((p) => /handle/.test(p)));
  const nc = creatorBundle(kitchen(), opts).files.find((f) => f.name === 'README.txt').data;
  assert.match(nc, /not for sale/i);
  const by = creatorBundle(kitchen(), { author: 'tiny_rooms', licence: 'CC-BY-4.0' }).files.find((f) => f.name === 'README.txt').data;
  assert.match(by, /may sell/i);
});

test('a room without lights gets no night render', () => {
  const kit = kitchen();
  kit.lighting = { ...kit.lighting, enabled: false, leds: [] };
  assert.ok(!names(creatorBundle(kit, opts)).some((n) => n.endsWith('-night.svg')));
});
