// T3: editable mat / bed size and kerf per machine. Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { MACHINES, machineFor } from '../src/materials.js';
import { zipCutFiles } from '../src/export/bundle.js';

test('machineFor returns the preset when the kit has no overrides', () => {
  assert.deepEqual(machineFor(defaultKit()), MACHINES.maker);
  assert.deepEqual(machineFor({ machine: 'laser' }), MACHINES.laser);
  assert.deepEqual(machineFor({ machine: 'nope' }), MACHINES.maker, 'unknown ids fall back to the Maker');
  assert.deepEqual(machineFor({ machine: 'maker' }, 'joy'), MACHINES.joy, 'another machine by id');
});

test('machineFor applies a valid cut area and kerf, ignores junk', () => {
  const kit = { machine: 'laser', machineOverrides: { laser: { cut: [600, 300], kerf: 0.2 } } };
  const m = machineFor(kit);
  assert.deepEqual(m.cut, [600, 300]);
  assert.equal(m.kerf, 0.2);
  assert.equal(m.name, MACHINES.laser.name);
  assert.deepEqual(MACHINES.laser.cut, [400, 400], 'the preset is untouched');
  const junk = machineFor({ machine: 'laser', machineOverrides: { laser: { cut: [-5, 'x'], kerf: 9 } } });
  assert.deepEqual(junk.cut, MACHINES.laser.cut);
  assert.equal(junk.kerf, MACHINES.laser.kerf);
  const half = machineFor({ machine: 'maker', machineOverrides: { maker: { cut: [250, null] } } });
  assert.deepEqual(half.cut, [250, MACHINES.maker.cut[1]], 'each side falls back on its own');
});

test('compileKit lays sheets out on the overridden bed', () => {
  const kit = { ...defaultKit(), machine: 'laser', machineOverrides: { laser: { cut: [150, 150] } } };
  const r = compileKit(kit);
  assert.equal(r.machine.cut[0], 150);
  for (const s of r.sheets) assert.ok(s.w <= 150 && s.h <= 150, `${s.w}×${s.h}`);
  assert.ok(r.sheets.length > compileKit({ ...defaultKit(), machine: 'laser' }).sheets.length, 'smaller bed, more sheets');
});

test('the laser kerf override reaches the laser files', () => {
  const kit = { ...defaultKit(), machine: 'laser', machineOverrides: { laser: { kerf: 0.3 } } };
  const r = compileKit(kit);
  assert.equal(r.machine.kerf, 0.3);
});

test('all-machines zip uses each machine’s overrides', () => {
  const kit = { ...defaultKit(), machine: 'maker', machineOverrides: { laser: { cut: [150, 150] } } };
  const compiled = compileKit(kit);
  const z = zipCutFiles(kit, compiled, compileKit, { allMachines: true });
  const plain = zipCutFiles({ ...kit, machineOverrides: {} }, compiled, compileKit, { allMachines: true });
  const n = (zz) => zz.files.filter((f) => f.name.startsWith('cut-files/laser/')).length;
  assert.ok(n(z) > n(plain));
});
