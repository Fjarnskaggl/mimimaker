// T3 (make & export) UI pieces. Plain DOM so src/app.js only wires them in.

import { sheetFiles, machineSettingsLine, layerLegend } from '../export/machines.js';
import { trueShapeCore, workerSource } from '../export/trueshape.js';
import { nestJobs, applyNestResults } from '../export/nestjobs.js';
import { handCutPDF, handCutFileName, defaultPaper, PAPER_NAMES } from '../export/handcut.js';
import { kitPrintCutFiles, printableParts } from '../export/printcut.js';
import { makeZip } from '../zip.js';

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

/** Download buttons for one sheet card (one per file the machine needs). */
export function sheetDownloadButtons(sheet, machine, opts, download) {
  return sheetFiles(sheet, machine, opts).map((f) => el('button', {
    class: 'small', type: 'button', title: `Download ${f.name}`,
    onclick: () => download(f.name, f.data, f.type),
  }, f.label));
}

/** The settings line under a sheet preview. */
export function sheetSettings(sheet, machine) {
  return el('div', { class: 'cut-time' }, machineSettingsLine(sheet, machine));
}

/** Layer colour legend for the sheets view (plus a note when nesting saved sheets). */
export function sheetLegend(machine, note, nesting) {
  return el('div', { class: 'legend' },
    ...layerLegend(machine).map((l) => el('span', {}, el('i', { style: `border-color:${l.color}${l.dashed ? ';border-top-style:dashed' : ''}` }), l.label)),
    el('span', {}, note),
    ...(nesting?.saved ? [el('span', { class: 'nest-note' }, `Nested by shape: saved ${nesting.saved} sheet${nesting.saved === 1 ? '' : 's'}`)] : []));
}

// ------------------------------------------------------ background nesting
// One worker, built from the core's source. While it is busy only the latest
// compile waits; older ones are dropped. Without Worker support the core runs
// on the main thread after a tick.
let worker = null, busy = false, waiting = null, seq = 0;

function startWorker() {
  if (worker !== null) return worker;
  try {
    const url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
    worker = new Worker(url);
  } catch {
    worker = false;
  }
  return worker;
}

const nestHere = (task) => { const core = trueShapeCore(); return task.jobs.map((j) => core.nest(j.input, j.w, j.h)); };

function run(task) {
  if (busy) { waiting = task; return; }
  busy = true;
  const done = (results) => {
    busy = false;
    task.finish(results);
    if (waiting) { const next = waiting; waiting = null; run(next); }
  };
  const w = startWorker();
  if (!w) { setTimeout(() => done(nestHere(task)), 0); return; }
  const id = ++seq;
  const stop = () => { w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); };
  const onMessage = (e) => {
    if (e.data?.id !== id) return;
    stop();
    if (window.mimimaker) window.mimimaker.nestWorkerUsed = true;
    done(e.data.results);
  };
  const onError = () => { // worker blocked or crashed: finish here, stop using it
    stop();
    w.terminate();
    worker = false;
    done(nestHere(task));
  };
  w.addEventListener('message', onMessage);
  w.addEventListener('error', onError);
  w.postMessage({ id, jobs: task.jobs.map((j) => ({ parts: j.input, w: j.w, h: j.h })) });
}

/**
 * Nest `compiled` by true shape in the background. When that saves sheets,
 * its sheets are replaced and `onImproved(compiled)` is called.
 */
export function nestInBackground(compiled, onImproved) {
  const jobs = nestJobs(compiled);
  if (!jobs.length) return;
  run({
    jobs,
    finish: (results) => {
      if (applyNestResults(compiled, jobs, results).saved) onImproved(compiled);
    },
  });
}

// ---------------------------------------------------------- hand-cut PDF
/**
 * Secondary "Hand-cut PDF" button for the Make page head. `get()` returns
 * { kit, compiled } at click time, since the head is built once.
 */
export function handCutButton(get, download, icon = null) {
  const paper = defaultPaper(typeof navigator !== 'undefined' ? navigator.language : '');
  return el('button', {
    id: 'btn-handcut', type: 'button', class: 'mm-btn',
    title: `Print every sheet 1:1 on ${PAPER_NAMES[paper]} to cut by hand (both paper sizes are in the kit zip)`,
    onclick: () => {
      const { kit, compiled } = get();
      download(handCutFileName(paper), handCutPDF(compiled.sheets, { paper, title: kit.name }), 'application/pdf');
    },
  }, ...(icon ? [icon] : []), 'Hand-cut PDF');
}

// ------------------------------------------------------- print then cut
const slugName = (s) => String(s || 'kit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kit';

/**
 * Secondary "Print then cut" button for the Make page head: a zip of the
 * print-area SVGs (Design Space), the PDF and a README. `get()` returns
 * { kit, compiled } at click time. Call updatePrintCutButton() on render.
 */
export function printCutButton(get, download, icon = null) {
  return el('button', {
    id: 'btn-printcut', type: 'button', class: 'mm-btn',
    title: 'Textured wallpaper and flooring to print on a home printer and cut on a Cricut (fits Design Space\'s 6.75 × 9.25 in print area)',
    onclick: () => {
      const { kit, compiled } = get();
      const files = kitPrintCutFiles(compiled, kit);
      if (files.length) download(`${slugName(kit.name)}-print-then-cut.zip`, makeZip(files), 'application/zip');
    },
  }, ...(icon ? [icon] : []), 'Print then cut');
}

/** Disable the button when no part of the kit is textured. */
export function updatePrintCutButton(root, kit, compiled) {
  const btn = root.querySelector('#btn-printcut');
  if (btn) btn.disabled = !printableParts(compiled, kit).length;
}
