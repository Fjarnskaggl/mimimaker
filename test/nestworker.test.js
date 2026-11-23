// T3 background nesting: worker source and swapping results into a compiled kit.
// Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { placementTransform, SHEET_MARGIN } from '../src/nest.js';
import { trueShapeCore, workerSource } from '../src/export/trueshape.js';
import { nestJobs, applyNestResults } from '../src/export/nestjobs.js';

const joyKit = () => ({ ...defaultKit(), machine: 'joyxtra' });

test('the worker source is self-contained and answers like the core', () => {
  const posted = [];
  const ctx = vm.createContext({ postMessage: (m) => posted.push(m) }); // no imports, no module scope
  vm.runInContext(workerSource(), ctx);
  const compiled = compileKit(joyKit());
  const jobs = nestJobs(compiled);
  ctx.onmessage({ data: { id: 7, jobs: jobs.map((j) => ({ parts: j.input, w: j.w, h: j.h })) } });
  assert.equal(posted.length, 1);
  assert.equal(posted[0].id, 7);
  const core = trueShapeCore();
  assert.deepEqual(JSON.parse(JSON.stringify(posted[0].results)), JSON.parse(JSON.stringify(jobs.map((j) => core.nest(j.input, j.w, j.h)))));
});

test('nestJobs: one job per material that needs more than one sheet', () => {
  const compiled = compileKit(joyKit());
  const jobs = nestJobs(compiled);
  const multi = [...new Set(compiled.sheets.filter((s) => s.count > 1).map((s) => s.material.id))];
  assert.deepEqual(jobs.map((j) => j.material.id), multi);
  for (const j of jobs) {
    const onSheets = compiled.sheets.filter((s) => s.material.id === j.material.id).flatMap((s) => s.placements.map((p) => p.part.id));
    assert.deepEqual(j.parts.map((p) => p.id).sort((a, b) => a - b), onSheets.sort((a, b) => a - b));
    assert.equal(j.input.length, j.parts.length);
    assert.ok(j.w > 0 && j.h > 0);
    assert.ok(!('id' in j.input[0]) && !('label' in j.input[0]), 'only geometry goes to the worker');
  }
});

test('applyNestResults swaps in fewer sheets and keeps numbering, order and parts', () => {
  const compiled = compileKit(joyKit());
  const before = compiled.sheets.length;
  const matOrder = [...new Set(compiled.sheets.map((s) => s.material.id))];
  const jobs = nestJobs(compiled);
  const core = trueShapeCore();
  const info = applyNestResults(compiled, jobs, jobs.map((j) => core.nest(j.input, j.w, j.h)));
  assert.equal(info.saved, 1);
  assert.equal(compiled.sheets.length, before - 1);
  assert.deepEqual(compiled.nesting, { method: 'true-shape', saved: 1 });
  assert.deepEqual([...new Set(compiled.sheets.map((s) => s.material.id))], matOrder, 'material order kept');
  for (const id of matOrder) {
    const mine = compiled.sheets.filter((s) => s.material.id === id);
    assert.deepEqual(mine.map((s) => s.index), mine.map((_, i) => i + 1));
    for (const s of mine) assert.equal(s.count, mine.length);
  }
  const placed = compiled.sheets.flatMap((s) => s.placements.map((p) => p.part.id)).sort((a, b) => a - b);
  assert.deepEqual(placed, compiled.parts.map((p) => p.id).sort((a, b) => a - b), 'every part once');
  for (const s of compiled.sheets) for (const pl of s.placements) for (const [x, y] of pl.part.polys[0].map(placementTransform(pl))) {
    assert.ok(x >= SHEET_MARGIN - 1e-6 && x <= s.w - SHEET_MARGIN + 1e-6 && y >= SHEET_MARGIN - 1e-6 && y <= s.h - SHEET_MARGIN + 1e-6);
  }
});

test('applyNestResults never adds sheets and ignores results for a stale kit', () => {
  const compiled = compileKit(joyKit());
  const sheets = compiled.sheets;
  const jobs = nestJobs(compiled);
  // a "result" that needs one sheet per part is worse: keep the shelf layout
  const worse = jobs.map((j) => ({ sheets: j.input.map((_, index) => [{ index, angle: 0, x: SHEET_MARGIN, y: SHEET_MARGIN, w: j.input[index].w, h: j.input[index].h }]), oversize: [] }));
  const info = applyNestResults(compiled, jobs, worse);
  assert.equal(info.saved, 0);
  assert.equal(compiled.sheets, sheets, 'untouched');
  assert.equal(compiled.nesting, undefined);
  // jobs from another compile don't apply
  const other = compileKit(joyKit());
  const core = trueShapeCore();
  assert.equal(applyNestResults(other, jobs, jobs.map((j) => core.nest(j.input, j.w, j.h))).saved, 0);
  assert.equal(other.nesting, undefined);
});
