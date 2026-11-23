// T3: the kit zip can carry every machine's cut files, and its README lists
// every file. Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { MACHINES } from '../src/materials.js';
import { kitCutFiles } from '../src/export/machines.js';
import { zipCutFiles, zipFileList } from '../src/export/bundle.js';

const opts = { drawLabels: false, title: 'T' };

test('one machine: the same cut-files/ as before, plus its README section', () => {
  const kit = defaultKit();
  const compiled = compileKit(kit);
  const z = zipCutFiles(kit, compiled, compileKit, { ...opts, allMachines: false });
  assert.deepEqual(z.files.map((f) => f.name), kitCutFiles(compiled.sheets, compiled.machine, opts).map((f) => f.name));
  assert.match(z.readme, /Design Space/);
});

test('all machines: a folder per machine, each with that machine’s files', () => {
  const kit = defaultKit();
  const compiled = compileKit(kit);
  const z = zipCutFiles(kit, compiled, compileKit, { ...opts, allMachines: true });
  for (const id of Object.keys(MACHINES)) {
    const own = z.files.filter((f) => f.name.startsWith(`cut-files/${id}/`));
    assert.ok(own.length, `${id} has files`);
  }
  assert.ok(z.files.some((f) => /^cut-files\/laser\/laser-.*\.dxf$/.test(f.name)), 'laser DXF');
  assert.ok(z.files.some((f) => /^cut-files\/cameo\/.*\.dxf$/.test(f.name)), 'Silhouette DXF');
  assert.ok(!z.files.some((f) => /^cut-files\/maker\/.*\.dxf$/.test(f.name)), 'Cricut gets SVG only');
  assert.equal(new Set(z.files.map((f) => f.name)).size, z.files.length, 'unique names');
  for (const m of Object.values(MACHINES)) assert.ok(z.readme.includes(m.name), `README names ${m.name}`);
});

test('all machines: the chosen machine keeps its nested sheets', () => {
  const kit = { ...defaultKit(), machine: 'maker' };
  const compiled = compileKit(kit);
  compiled.sheets = compiled.sheets.slice(0, 1); // stands in for true-shape nesting
  const z = zipCutFiles(kit, compiled, compileKit, { ...opts, allMachines: true });
  assert.equal(z.files.filter((f) => f.name.startsWith('cut-files/maker/')).length, 1);
});

test('all machines: a machine that can’t cut a material says so in the README', () => {
  const kit = defaultKit(); // has chipboard, which needs the Knife Blade
  const z = zipCutFiles(kit, compileKit(kit), compileKit, { ...opts, allMachines: true });
  assert.match(z.readme, /Cricut Joy[^\n]*\n[^\n]*(Knife Blade|can't)/);
});

test('zipFileList describes every file in the zip', () => {
  const files = [
    { name: 'cut-files/maker/sheet-1.svg' }, { name: 'cut-files/sheet-2.svg' }, { name: 'hand-cut/hand-cut-templates-a4.pdf' },
    { name: 'print-then-cut/print-then-cut.pdf' }, { name: 'assembly-guide.html' }, { name: 'kit.json' }, { name: 'led-map.svg' },
  ];
  const text = zipFileList(files);
  assert.match(text, /Files in this zip/);
  for (const f of files) assert.ok(text.includes(f.name), f.name);
  assert.match(text, /cut-files\/maker\/sheet-1\.svg.*Cricut Maker/);
  assert.match(text, /kit\.json.*mimimaker/);
  // folders are listed in order, files sorted inside them
  assert.ok(text.indexOf('assembly-guide.html') < text.indexOf('cut-files/'));
});

test('all machines: parts too big for a machine’s mat are named in the README', () => {
  const kit = defaultKit();
  const compiled = compileKit(kit);
  const joy = compileKit({ ...kit, machine: 'joy' });
  const missing = joy.warnings.filter((w) => /is larger than a/.test(w.msg)).length;
  assert.ok(missing > 0, 'the default room has parts wider than a Cricut Joy mat');
  const z = zipCutFiles(kit, compiled, compileKit, { ...opts, allMachines: true });
  assert.match(z.readme, /cut-files\/joy\/[^\n]*\n(?:[^\n]*\n)*?\s+Missing \d+ parts? too big for its mat: #\d+/);
});

test('all machines: one machine failing to compile does not block the zip', () => {
  const kit = defaultKit();
  const compiled = compileKit(kit);
  const flaky = (k) => { if (k.machine === 'cameo') throw new Error('boom'); return compileKit(k); };
  const z = zipCutFiles(kit, compiled, flaky, { ...opts, allMachines: true });
  assert.ok(!z.files.some((f) => f.name.startsWith('cut-files/cameo/')));
  assert.ok(z.files.some((f) => f.name.startsWith('cut-files/laser/')));
  assert.match(z.readme, /cut-files\/cameo\/[^\n]*couldn't/i);
});

test('all machines: the how-to text points at the machine folders', () => {
  const kit = defaultKit();
  const z = zipCutFiles(kit, compileKit(kit), compileKit, { ...opts, allMachines: true });
  assert.doesNotMatch(z.readme, /each SVG in cut-files\/ /);
});

test('zipFileList: a folder’s own README is described as its instructions', () => {
  const text = zipFileList([{ name: 'print-then-cut/README.txt' }, { name: 'print-then-cut/print-then-cut.pdf' }]);
  assert.match(text, /print-then-cut\/README\.txt\s+how to use this folder/);
});
