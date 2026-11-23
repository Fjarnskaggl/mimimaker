// T3 (make & export) UI pieces. Plain DOM so src/app.js only wires them in.

import { sheetFiles, machineSettingsLine, layerLegend } from '../export/machines.js';
import { trueShapeCore, workerSource } from '../export/trueshape.js';
import { nestJobs, applyNestResults } from '../export/nestjobs.js';
import { handCutPDF, handCutFileName, defaultPaper, PAPER_NAMES } from '../export/handcut.js';
import { kitPrintCutFiles, printableParts } from '../export/printcut.js';
import { makeZip } from '../zip.js';
import { kitMaterialCost } from '../export/cost.js';
import { DEFAULT_MATERIALS, TOOL_NAMES, withMaterialDefaults, newMaterial, duplicateMaterial, materialInUse, defaultCurrency, formatMoney, toolSettings } from '../materials.js';

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

// ------------------------------------------------------- material library
const lang = () => (typeof navigator !== 'undefined' ? navigator.language : '');

/** The kit's currency symbol (guessed from the browser language until set). */
export const kitCurrency = (kit) => kit.currency || defaultCurrency(lang());

/** Kit material cost in the kit's currency (see src/export/cost.js). */
export const kitCost = (kit, compiled) => kitMaterialCost(compiled.sheets, { currency: kitCurrency(kit) });

const KINDS = { board: 'Board · finger joints', card: 'Card · fold-up nets', fabric: 'Fabric · flat pieces' };

function numInput(label, value, set, { step = 1, min = 0, max, placeholder } = {}) {
  return el('input', {
    type: 'number', step, min, ...(max != null ? { max } : {}), ...(placeholder != null ? { placeholder } : {}),
    value: value ?? '', 'aria-label': label,
    oninput: (e) => {
      const raw = e.target.value.trim();
      if (raw === '' && placeholder != null) { set(undefined); return; }
      const v = parseFloat(raw);
      if (Number.isFinite(v) && v >= min && (max == null || v <= max)) set(v);
    },
  });
}

function textInput(label, value, set) {
  return el('input', { value: value ?? '', 'aria-label': label, onchange: (e) => set(e.target.value.trim()) });
}

function selectInput(label, value, options, set) {
  const s = el('select', { 'aria-label': label, onchange: (e) => set(e.target.value) });
  for (const [v, t] of options) {
    const o = el('option', { value: v }, t);
    if (v === value) o.selected = true;
    s.append(o);
  }
  return s;
}

const group = (title, ...fields) => el('fieldset', { class: 'mat-group' }, el('legend', {}, title), ...fields);
const field = (label, input) => el('label', { class: 'mat-field' }, el('span', {}, label), input);

/**
 * The Make page's material library: edit, add, duplicate and delete
 * materials, set each machine family's cut settings and a price per sheet.
 *
 *   kit          the live kit (its materials are edited in place)
 *   machine      the compiled machine, to show its kerf as the default
 *   onChange     a value changed (re-render sheets)
 *   onRestructure  the material list or a material's kind/tool changed
 *
 * Returns the library element; call `.update(compiled)` after each compile
 * to refresh the cost summary without rebuilding the inputs being typed in.
 */
export function materialLibrary({ kit, machine, onChange, onRestructure }) {
  const open = new Set();
  const root = el('div', { class: 'mat-library' });
  const cost = el('div', { class: 'mat-cost', 'aria-live': 'polite' });
  let last = null, shown = [];

  const restructure = () => { render(); onRestructure(); };

  function settingsPanel(m) {
    const d = withMaterialDefaults(m);
    const sub = (fam) => { m[fam] = { ...d[fam], ...(m[fam] || {}) }; return m[fam]; };
    return el('div', { class: 'mat-settings', 'data-material': m.id },
      group('Material',
        field('Kind', selectInput('Kind', m.kind, Object.entries(KINDS), (v) => { m.kind = v; restructure(); })),
        field('Blade', selectInput('Blade', m.tool, Object.entries(TOOL_NAMES), (v) => {
          // a new blade means new cut settings; the old blade's would mislead
          if (v !== m.tool) Object.assign(m, toolSettings(v));
          m.tool = v;
          restructure();
        }))),
      group('Cricut',
        field('Design Space', textInput('Design Space setting', d.cricut, (v) => { m.cricut = v || d.cricut; onChange(); })),
        field('Passes', numInput('Cricut passes', d.passes, (v) => { m.passes = Math.max(1, Math.round(v)); onChange(); }, { min: 1, max: 50 })),
        field('Speed mm/s', numInput('Cricut speed (mm/s)', d.speed, (v) => { if (v > 0) { m.speed = v; onChange(); } }, { min: 1 }))),
      group('Silhouette',
        field('Blade', textInput('Silhouette blade', d.silhouette.blade, (v) => { sub('silhouette').blade = v || d.silhouette.blade; onChange(); })),
        field('Passes', numInput('Silhouette passes', d.silhouette.passes, (v) => { sub('silhouette').passes = Math.max(1, Math.round(v)); onChange(); }, { min: 1, max: 50 })),
        field('Speed 1–30', numInput('Silhouette speed (1–30)', d.silhouette.speed, (v) => { sub('silhouette').speed = v; onChange(); }, { min: 1, max: 30 }))),
      group('Laser',
        field('Power %', numInput('Laser power (%)', d.laser.power, (v) => { sub('laser').power = v; onChange(); }, { min: 1, max: 100 })),
        field('Speed mm/s', numInput('Laser speed (mm/s)', d.laser.speed, (v) => { if (v > 0) { sub('laser').speed = v; onChange(); } }, { min: 0.1, step: 0.5 })),
        field('Passes', numInput('Laser passes', d.laser.passes, (v) => { sub('laser').passes = Math.max(1, Math.round(v)); onChange(); }, { min: 1, max: 20 })),
        field('Kerf mm', numInput('Laser kerf (mm)', m.laser?.kerf, (v) => { const l = sub('laser'); if (v == null) delete l.kerf; else l.kerf = v; onChange(); },
          { min: 0, max: 1, step: 0.01, placeholder: String(machine()?.kerf ?? 0.1) }))));
  }

  const deleteTitle = (m, inUse, only) => (inUse ? `Delete ${m.name} (in use: pick another material for its parts first)`
    : only ? `Delete ${m.name} (the last material)` : `Delete ${m.name}`);

  function deleteButton(m, inUse, only) {
    const b = el('button', {
      type: 'button', class: 'mm-btn mm-btn--sm mat-delete', 'data-material': m.id, title: deleteTitle(m, inUse, only),
      onclick: () => {
        if (materialInUse(kit, m.id, last) || kit.materials.length === 1) { render(); return; } // went into use since the last render
        kit.materials = kit.materials.filter((x) => x !== m);
        open.delete(m.id);
        restructure();
      },
    }, 'Delete');
    b.disabled = inUse || only;
    return b;
  }

  function row(m) {
    const inUse = materialInUse(kit, m.id, last);
    const only = kit.materials.length === 1;
    const d = withMaterialDefaults(m);
    const isOpen = open.has(m.id);
    return [
      el('div', { class: 'mat-row', 'data-material': m.id },
        el('input', { type: 'color', value: m.color, 'aria-label': `${m.name} colour`, oninput: (e) => { m.color = e.target.value; onChange(); } }),
        el('input', { value: m.name, 'aria-label': 'Material name', onchange: (e) => { m.name = e.target.value.trim() || m.name; restructure(); } }),
        numInput(`${m.name} thickness (mm)`, m.thickness, (v) => { if (v > 0) { m.thickness = v; onChange(); } }, { step: 0.05, min: 0.05 }),
        numInput(`${m.name} sheet width (mm)`, m.sheet[0], (v) => { if (v > 20) { m.sheet[0] = v; onChange(); } }, { min: 20 }),
        numInput(`${m.name} sheet height (mm)`, m.sheet[1], (v) => { if (v > 20) { m.sheet[1] = v; onChange(); } }, { min: 20 }),
        numInput(`${m.name} price per sheet`, d.price, (v) => { m.price = v; onChange(); }, { step: 0.05, min: 0 }),
        el('div', { class: 'mat-actions' },
          el('button', { type: 'button', class: 'mm-btn mm-btn--sm', title: `Machine settings for ${m.name}`, 'aria-expanded': String(isOpen),
            onclick: () => { if (isOpen) open.delete(m.id); else open.add(m.id); render(); } }, 'Settings'),
          el('button', { type: 'button', class: 'mm-btn mm-btn--sm', title: `Duplicate ${m.name}`,
            onclick: () => { const i = kit.materials.indexOf(m); kit.materials.splice(i + 1, 0, duplicateMaterial(withMaterialDefaults(m), kit.materials)); restructure(); } }, 'Duplicate'),
          deleteButton(m, inUse, only))),
      ...(isOpen ? [settingsPanel(m)] : []),
    ];
  }

  // Re-entrancy guard: removing a focused input fires its change event in
  // the middle of replaceChildren, which would otherwise render twice.
  let rendering = false;
  function render() {
    if (rendering) return;
    rendering = true;
    try { renderNow(); } finally { rendering = false; }
  }
  function renderNow() {
    shown = [...kit.materials];
    const cur = kitCurrency(kit);
    root.replaceChildren(
      el('div', { class: 'mat-lib-head' },
        el('label', { class: 'mat-field' }, el('span', {}, 'Currency'),
          el('input', { class: 'mat-currency', value: cur, maxlength: 4, 'aria-label': 'Currency',
            onchange: (e) => {
              kit.currency = e.target.value.trim() || defaultCurrency(lang());
              const head = root.querySelector('.mat-price-head');
              if (head) head.textContent = `${kit.currency} / sheet`;
              onChange();
            } })),
        cost),
      el('div', { class: 'mat-table' },
        el('div', { class: 'mat-row mat-head' }, el('span'), el('span', {}, 'Name'), el('span', {}, 'Thick mm'), el('span', {}, 'Sheet W'), el('span', {}, 'Sheet H'), el('span', { class: 'mat-price-head' }, `${cur} / sheet`), el('span')),
        ...kit.materials.flatMap(row)),
      el('p', { class: 'hint' }, 'Measure your board with calipers, or use the fit test: finger joints are sized from this thickness. Settings are starting points; test on a scrap first.'),
      el('div', { class: 'mat-lib-foot' },
        el('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => { const m = newMaterial(kit.materials); kit.materials.push(m); open.add(m.id); restructure(); } }, 'Add material'),
        el('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => {
          const keep = kit.materials.filter((m) => !DEFAULT_MATERIALS.some((d) => d.id === m.id) && materialInUse(kit, m.id));
          kit.materials = [...structuredClone(DEFAULT_MATERIALS), ...keep];
          restructure();
        } }, 'Reset materials')));
    if (last) root.update(last);
  }

  root.kit = kit;
  root.update = (compiled) => {
    last = compiled;
    // materials replaced elsewhere (fit-test calibration, kit.json import): rebuild the rows
    if (shown.length !== kit.materials.length || shown.some((m, i) => m !== kit.materials[i])) { render(); return; }
    // parts may have switched material since the rows were built
    for (const b of root.querySelectorAll('button.mat-delete')) {
      const m = kit.materials.find((x) => x.id === b.dataset.material);
      if (!m) continue;
      const inUse = materialInUse(kit, m.id, compiled), only = kit.materials.length === 1;
      b.disabled = inUse || only;
      b.title = deleteTitle(m, inUse, only);
    }
    const c = kitCost(kit, compiled);
    cost.replaceChildren(
      el('ul', {}, ...c.lines.map((l) => el('li', {},
        `${l.name}: ${l.sheets} sheet${l.sheets === 1 ? '' : 's'} × ${formatMoney(l.pricePerSheet, c.currency)} = `,
        el('b', {}, formatMoney(l.cost, c.currency)), l.unpriced ? el('em', {}, ' (no price set)') : ''))),
      el('div', { class: 'mat-total' }, 'Total for this kit: ', el('b', {}, formatMoney(c.total, c.currency))));
  };
  render();
  return root;
}

// --------------------------------------------------------- kit zip option
/**
 * "All machines" checkbox for the Make setup row (kit.zipAllMachines).
 * `getKit()` is read on each change, since undo replaces the kit object.
 */
export function allMachinesField(getKit, onChange) {
  const box = el('input', { type: 'checkbox', onchange: (e) => { getKit().zipAllMachines = e.target.checked; onChange(); } });
  box.checked = !!getKit().zipAllMachines;
  return el('label', { class: 'check zip-all', title: 'Put cut files for every machine in the kit zip, one folder each, so anyone you share it with can cut it' },
    box, el('span', {}, 'All machines in the kit zip'));
}
