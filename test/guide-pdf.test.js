// T4: the assembly guide as a PDF for the creator bundle (#91), built from the
// same parts list, bill of materials and steps as the HTML guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { guidePDF } from '../src/build/pdfguide.js';
import { buildSteps } from '../src/build/steps.js';
import { billOfMaterials } from '../src/build/bom.js';
import { pdfString } from '../src/export/pdf.js';

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const make = (kit = defaultKit(), opts = { creator: 'tiny_rooms', licence: 'CC BY 4.0' }) => {
  const compiled = compileKit(kit);
  const bytes = guidePDF(kit, compiled, opts);
  return { kit, compiled, bytes, pdf: latin1(bytes) };
};
// the text drawn on the pages (inside the content streams only)
const pageText = (pdf) => [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1]).join('\n');
const has = (pdf, s) => pageText(pdf).includes(pdfString(s).slice(1, -1));

test('guidePDF returns PDF bytes', () => {
  const { bytes, pdf } = make();
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
  const pages = Number(pdf.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1]);
  assert.ok(pages >= 4, `${pages} pages`);
});

test("the cover carries the creator's handle and licence, and no mimimaker branding", () => {
  const { pdf } = make();
  assert.ok(has(pdf, 'Designed by tiny_rooms'));
  assert.ok(has(pdf, 'CC BY 4.0'));
  assert.doesNotMatch(pageText(pdf), /mimimaker/i, 'no watermark or app name on the pages');
  // remix credit when there is one
  const remix = make(defaultKit(), { creator: 'tiny_rooms', licence: 'CC BY-SA 4.0', remix: 'Corner café by bea' }).pdf;
  assert.ok(has(remix, 'Remix of Corner café by bea'));
});

test('the same parts, materials and steps as the HTML guide', () => {
  const { kit, compiled, pdf } = make();
  for (const p of compiled.parts) assert.ok(has(pdf, `#${p.id}`) && has(pdf, p.name), `part #${p.id} ${p.name}`);
  for (const m of compiled.usedMats) assert.ok(has(pdf, m.name), m.name);
  for (const s of buildSteps(kit, compiled)) assert.ok(has(pdf, s.title), `step ${s.n} ${s.title}`);
  const bom = billOfMaterials(kit, compiled);
  for (const i of [...bom.sheets, ...bom.supplies, ...bom.lights]) assert.ok(has(pdf, i.name), i.name);
  assert.ok(has(pdf, bom.difficulty.level));
});

test('steps come with their exploded views, drawn as vector shapes', () => {
  const { pdf } = make();
  const fills = (pageText(pdf).match(/^f\*$/gm) || []).length;
  assert.ok(fills > 200, `${fills} filled shapes`);
});

test('long instructions wrap inside the page and nothing is drawn off it', () => {
  const { pdf } = make();
  const W = 210 * 72 / 25.4, H = 297 * 72 / 25.4;
  for (const [, x, y] of pageText(pdf).matchAll(/([-\d.]+) ([-\d.]+) Td/g)) {
    assert.ok(+x >= 0 && +x <= W - 30, `text x ${x}`);
    assert.ok(+y >= 0 && +y <= H, `text y ${y}`);
  }
});

test('characters Helvetica lacks are spelled out, not dropped as "?"', () => {
  const kit = defaultKit();
  kit.currency = '€';
  const { pdf } = make(kit);
  assert.match(pageText(pdf), /EUR ?\d+\.\d\d/);
});

test('Letter paper and a deterministic file', () => {
  const a = make().bytes, b = make().bytes;
  assert.deepEqual(a, b);
  const kit = defaultKit();
  const letter = latin1(guidePDF(kit, compileKit(kit), { creator: 'x', licence: 'CC0', paper: 'letter' }));
  assert.match(letter, /\/MediaBox \[0 0 612\.0\d 792\.0\d\]/);
});

test('the creator bundle ships the PDF guide next to the HTML one, with the credit', async () => {
  const { creatorBundle } = await import('../src/share/bundle.js');
  const b = creatorBundle(defaultKit(), { author: 'tiny_rooms', licence: 'CC-BY-SA-4.0' });
  const pdf = b.files.find((f) => f.name === 'assembly-guide.pdf');
  assert.ok(pdf, 'assembly-guide.pdf in the bundle');
  const text = latin1(pdf.data);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(has(text, 'Designed by tiny_rooms · CC BY-SA 4.0'));
  assert.match(b.files.find((f) => f.name === 'README.txt').data, /assembly-guide\.pdf/);
});
