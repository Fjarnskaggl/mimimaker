// Background nesting jobs for a compiled kit, and swapping their results in.
//
// compileKit lays sheets out with instant shelf packing. These helpers send
// each material that needs more than one sheet to the true-shape nester (in a
// Web Worker, see src/ui/t3.js) and replace that material's sheets only when
// the true-shape layout needs fewer.

import { nestInput, hydrate } from './trueshape.js';

/** One job per material with more than one sheet: { material, w, h, parts, input }. */
export function nestJobs(compiled) {
  const jobs = [];
  for (const s of compiled.sheets) {
    if (s.count < 2 || jobs.some((j) => j.material.id === s.material.id)) continue;
    const parts = compiled.sheets.filter((x) => x.material.id === s.material.id).flatMap((x) => x.placements.map((p) => p.part));
    jobs.push({ material: s.material, w: s.w, h: s.h, parts, input: nestInput(parts), sheets: compiled.sheets });
  }
  return jobs;
}

/**
 * Swap true-shape layouts into `compiled.sheets` where they save sheets.
 * `raws` are the core's results, one per job. Jobs made for a different
 * compile are ignored. Returns { saved } and sets compiled.nesting when it
 * changed anything.
 */
export function applyNestResults(compiled, jobs, raws) {
  const better = new Map();
  jobs.forEach((job, k) => {
    const raw = raws[k];
    if (!raw || job.sheets !== compiled.sheets) return;
    const current = compiled.sheets.filter((s) => s.material.id === job.material.id).length;
    const res = hydrate(raw, job.parts, job.w, job.h);
    if (res.oversize.length || res.sheets.length >= current) return;
    better.set(job.material.id, { sheets: res.sheets, saved: current - res.sheets.length });
  });
  if (!better.size) return { saved: 0 };
  const out = [];
  for (const s of compiled.sheets) {
    const b = better.get(s.material.id);
    if (!b) { out.push(s); continue; }
    if (s.index !== 1) continue;
    b.sheets.forEach((sheet, i) => out.push({ ...sheet, material: s.material, index: i + 1, count: b.sheets.length }));
  }
  const saved = [...better.values()].reduce((n, b) => n + b.saved, 0);
  compiled.sheets = out;
  compiled.nesting = { method: 'true-shape', saved };
  return { saved };
}
