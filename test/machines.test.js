// T3 machine profiles beyond Cricut. Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { MACHINES, effectiveSheet } from '../src/materials.js';
import { sheetCutSVG, sheetFileName } from '../src/svg.js';
import { laserSheetDXF, laserSheetSVG } from '../src/export/laser.js';
import { machineFamily, sheetFiles, kitCutFiles, machineSettingsLine, machineReadme } from '../src/export/machines.js';

const kitOn = (machine) => ({ ...defaultKit(), machine });

test('every machine has a family, a cut area and tools', () => {
  for (const [id, m] of Object.entries(MACHINES)) {
    assert.ok(['cricut', 'silhouette', 'laser'].includes(m.family), `${id} family`);
    assert.ok(m.cut[0] > 0 && m.cut[1] > 0, `${id} cut area`);
    assert.ok(m.tools.length, `${id} tools`);
    assert.equal(machineFamily(m), m.family);
  }
  for (const id of ['cameo', 'portrait', 'laser']) assert.ok(MACHINES[id], `${id} exists`);
  assert.equal(MACHINES.cameo.family, 'silhouette');
  assert.equal(MACHINES.laser.family, 'laser');
  assert.ok(MACHINES.laser.kerf > 0 && MACHINES.laser.kerf < 0.5, 'laser kerf');
  assert.equal(machineFamily(undefined), 'cricut', 'old kits default to Cricut');
});

test('a laser cuts every material, so the default kit has no tool errors', () => {
  const r = compileKit(kitOn('laser'));
  assert.deepEqual(r.warnings.filter((w) => w.level === 'error'), []);
  for (const s of r.sheets) {
    assert.ok(s.w <= MACHINES.laser.cut[0] && s.h <= MACHINES.laser.cut[1]);
  }
});

test('Silhouette Portrait mats are smaller than a Cameo', () => {
  const mat = { sheet: [305, 305] };
  assert.deepEqual(effectiveSheet(mat, MACHINES.portrait), [203, 305]);
  assert.deepEqual(effectiveSheet(mat, MACHINES.cameo), [305, 305]);
});

const opts = { drawLabels: false, title: 'T' };

test('Cricut sheet files are the existing Design Space SVG, unchanged', () => {
  const r = compileKit(kitOn('maker'));
  const s = r.sheets[0];
  assert.deepEqual(sheetFiles(s, r.machine, opts), [
    { name: sheetFileName(s), data: sheetCutSVG(s, opts), type: 'image/svg+xml', label: 'SVG' },
  ]);
});

test('Silhouette gets an SVG (Designer edition) and a plain DXF (Basic edition)', () => {
  const r = compileKit(kitOn('cameo'));
  const s = r.sheets[0];
  const files = sheetFiles(s, r.machine, opts);
  assert.deepEqual(files.map((f) => f.label), ['SVG', 'DXF']);
  assert.equal(files[0].data, sheetCutSVG(s, opts));
  assert.equal(files[1].data, laserSheetDXF(s, { kerf: 0, engraveLabels: false }), 'blades need no kerf');
  assert.match(files[1].name, /\.dxf$/);
  assert.ok(files[1].name.startsWith('sheet-'));
});

test('laser files are kerf-compensated with the machine kerf and engrave part numbers', () => {
  const r = compileKit(kitOn('laser'));
  const s = r.sheets[0];
  const files = sheetFiles(s, r.machine, opts);
  assert.deepEqual(files.map((f) => f.label), ['SVG', 'DXF']);
  const kerf = MACHINES.laser.kerf;
  assert.equal(files[0].data, laserSheetSVG(s, { kerf, engraveLabels: true, title: 'T' }));
  assert.equal(files[1].data, laserSheetDXF(s, { kerf, engraveLabels: true }));
  assert.match(files[0].name, /^laser-.*\.svg$/);
  // a custom kerf on the kit's machine settings wins
  const custom = sheetFiles(s, { ...r.machine, kerf: 0.25 }, opts);
  assert.equal(custom[1].data, laserSheetDXF(s, { kerf: 0.25, engraveLabels: true }));
});

test('kitCutFiles puts every sheet file under cut-files/', () => {
  for (const id of ['maker', 'cameo', 'laser']) {
    const r = compileKit(kitOn(id));
    const files = kitCutFiles(r.sheets, r.machine, opts);
    const perSheet = sheetFiles(r.sheets[0], r.machine, opts).length;
    assert.equal(files.length, r.sheets.length * perSheet, id);
    for (const f of files) assert.match(f.name, /^cut-files\/[^/]+$/);
    assert.equal(new Set(files.map((f) => f.name)).size, files.length, 'unique names');
  }
});

test('per-sheet settings and README speak the machine’s language', () => {
  const sheetOf = (id) => compileKit(kitOn(id)).sheets[0];
  assert.match(machineSettingsLine(sheetOf('maker'), MACHINES.maker), /Design Space/);
  assert.match(machineSettingsLine(sheetOf('cameo'), MACHINES.cameo), /Silhouette Studio/);
  assert.match(machineSettingsLine(sheetOf('laser'), MACHINES.laser), /kerf 0\.1 mm/);
  assert.match(machineReadme(MACHINES.maker), /Design Space/);
  assert.match(machineReadme(MACHINES.cameo), /DXF/);
  assert.match(machineReadme(MACHINES.laser), /red.*cut/i);
});
