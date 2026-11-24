// UI controller: edits the kit object, recompiles, and renders the views.
//
// Layout (the mimimaker design system): four steps — Design · Light · Make ·
// Build — each owning the workspace; a contextual inspector (#sidebar) that
// shows only the selected thing; a Checks pill instead of warning banners;
// the piece library in a drawer; room types in a Start dialog.

import { compileKit } from './kit.js';
import { CATALOG, defaultKit, defaultMaterialFor } from './catalog.js';
import { ROOM_TYPES, applyRoomType } from './templates.js';
import { LED_COLORS } from './lighting.js';
import { ledMapSVG, ledRows } from './ledmap.js';
import { DEFAULT_MATERIALS, MACHINES, SCALES, TOOL_NAMES, withMaterialDefaults, formatMoney } from './materials.js';
import { History } from './history.js';
import { collisions, moveItem, rotateItem, slideOnWall, snap, itemParams, findFreeSpot, snapFloorMove, snapWallMove } from './plan.js';
import { planSVG, posOnWall } from './planview.js';
import { fitCoupon, couponSVG, calibrate, estimateCutMinutes, formatMinutes } from './make.js';
import { shareHash, kitFromHash, decodeKit, shareSummary, linkSizeNote, unwrapKitFile } from './share.js';
import { itemSize } from './catalog.js';
import { renderScene } from './preview3d.js';
import { sheetPreviewSVG } from './svg.js';
import { guideHTML } from './guide.js';
// T4
import { buildCompanion } from './ui/t4.js';
import { makeZip } from './zip.js';
import { icon, MIMI, MARK } from './ui/art.js';
import { checksSummary } from './ui/checks.js';
// T6: WebGL viewer + SVG fallback
import { drawStage, rendererToggle, texturePicker, attachPicking, resetZoom, stageProjector, previewItem, onStageDrawn, hoverPiece } from './ui/t6.js';
import { drawGizmo } from './ui/gizmo.js';
// T1: piece library (search, difficulty, part counts)
import { pieceLibrary } from './ui/t1.js';
// T3 wiring: per-machine cut files
import { sheetDownloadButtons, sheetSettings, sheetLegend, nestInBackground, handCutButton, printCutButton, updatePrintCutButton, materialLibrary, kitCost, allMachinesField, machineBedFields } from './ui/t3.js';
import { zipCutFiles, zipFileList } from './export/bundle.js';
import { kitHandCutFiles } from './export/handcut.js';
import { kitPrintCutFiles } from './export/printcut.js';
// T2 shells
import { shellSection, applyRoomLocks, appendRoofControls, syncShellRoom, shellWiresLights } from './ui/t2.js';
import { remixCredit, openedSharedText, openSubmitDialog, openBundleDialog } from './ui/t7.js';
import { creatorBundle } from './share/bundle.js';
// [T5] lighting UI
import { renderSupplyField, renderCircuitSummary, renderEffectFields, renderMountField, renderShoppingButton, renderCoverField, renderSwitchFields } from './ui/t5.js';
import { shoppingFile } from './lighting/shopping.js';

const STORE_KEY = 'mimimaker.kit.v1';
const $ = (sel) => document.querySelector(sel);

let kit = loadKit() || defaultKit();
let compiled = null;
// step: design | light | make | build. views: what the stage shows per step.
// tab mirrors the old tab names for thread modules (T3 re-renders on 'sheets').
const view = {
  step: 'design', views: { design: '3d', light: '3d' }, tab: 'preview',
  yaw: -32, pitch: 26, theme: 'Basics', night: false, sel: null, snap: 5,
};
const sectionOpen = new Map(); // inspector sections the viewer opened or closed, by title

// ------------------------------------------------------------------ helpers
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
/** An element from an SVG or HTML string (icons, Mimi). */
function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
const ic = (name) => frag(icon(name));

function numberField(label, value, onChange, { min, max, step = 1, unit } = {}) {
  const input = h('input', {
    type: 'number', value, min, max, step, inputmode: 'decimal',
    oninput: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); },
  });
  return h('label', { class: 'field' }, label, unit ? h('span', { class: 'unit-wrap' }, input, h('span', { class: 'unit' }, unit)) : input);
}
function selectField(label, value, options, onChange) {
  const sel = h('select', { onchange: (e) => onChange(e.target.value) },
    options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) }, text)));
  return h('label', { class: 'field' }, label, sel);
}
function checkField(label, checked, onChange) {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }), label);
}
/** A collapsible inspector section; remembers whether the viewer opened it. */
function section(title, body, { open = true, count } = {}) {
  const d = h('details', { class: 'section', open: sectionOpen.has(title) ? sectionOpen.get(title) : open },
    h('summary', {}, title, count != null ? h('span', { class: 'count' }, count) : null),
    h('div', { class: 'section-body' }, body));
  d.addEventListener('toggle', () => sectionOpen.set(title, d.open));
  return d;
}
const matOptions = (filter = () => true) => kit.materials.filter(filter).map((m) => [m.id, m.name]);
const titleCase = (s) => s[0].toUpperCase() + s.slice(1);
const cm = (n) => Math.round(n);

function loadKit() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return normalizeKit(JSON.parse(raw));
  } catch { return null; }
}
function saveKit() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(kit)); } catch { /* storage unavailable */ }
}
function normalizeKit(k) {
  const base = defaultKit();
  const out = { ...base, ...k, room: { ...base.room, ...(k.room || {}) } };
  if (!Array.isArray(out.materials) || !out.materials.length) out.materials = structuredClone(DEFAULT_MATERIALS);
  out.materials = out.materials.map(withMaterialDefaults);
  out.openings = Array.isArray(k.openings) ? k.openings : [];
  out.items = Array.isArray(k.items) ? k.items : [];
  const L = k.lighting || {};
  out.lighting = {
    enabled: !!L.enabled, holeDiameter: L.holeDiameter || 3,
    power: { wall: 'back', pos: 20, elev: 20, kind: 'battery', ...(L.power || {}) },
    leds: Array.isArray(L.leds) ? L.leds : [],
  };
  return out;
}

// Inside a claude.ai artifact, plain <a download> links are blocked, so use the
// viewer's save capability when it's available.
const inArtifact = typeof window !== 'undefined' && !!window.claude?.use;
const savesReady = inArtifact ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);

/** A short confirmation at the bottom of the screen; `action` is [label, fn] (e.g. Undo). */
function toast(msg, opts = {}) {
  if (typeof opts === 'string') opts = { level: opts };
  const el = h('div', { class: `mm-toast${opts.level === 'error' ? ' error' : ''}`, role: 'status' },
    opts.level === 'error' ? ic('alert') : null,
    h('span', {}, msg),
    opts.action ? h('button', { type: 'button', onclick: () => { el.remove(); opts.action[1](); } }, opts.action[0]) : null);
  const box = $('#toasts');
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), opts.action || opts.level === 'error' ? 6000 : 4000);
}

async function download(name, data, type) {
  const saver = await savesReady;
  if (saver) {
    try {
      await saver.save({ filename: name, data: new Blob([data], { type }) });
    } catch (err) {
      if (err?.code !== 'declined') toast(`Couldn't save ${name}: ${err?.message || err?.code || 'unavailable here'}.`, 'error');
    }
    return;
  }
  if (inArtifact) { toast('Downloads aren\'t available in this view.', 'error'); return; }
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const slug = (s) => (s || 'kit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kit';

// ------------------------------------------------------------- recompile
function update({ sidebar = false } = {}) {
  syncShellRoom(kit); // T2 shells: the room follows the shell after any edit (scale, board thickness, undo)
  try {
    compiled = compileKit(kit);
  } catch (err) {
    console.error(err);
    compiled = null;
    showBuildError(err);
    return;
  }
  saveKit();
  if (sidebar) {
    if (view.step === 'make') $('#view').dataset.key = ''; // rebuild Make's controls too
    renderInspector();
  } else refreshCircuit();
  renderSummary();
  renderChecks();
  renderView();
  nestInBackground(compiled, (c) => { if (c !== compiled) return; renderSummary(); if (view.tab === 'sheets' || view.tab === 'guide') renderView(); }); // T3
  if (!restoring) (sidebar ? commitNow() : scheduleCommit());
}

// ---------------------------------------------------------------- history
const undoHistory = new History(150);
let commitTimer = null;
let restoring = false;
function commitNow() {
  clearTimeout(commitTimer);
  commitTimer = null;
  undoHistory.push(JSON.stringify(kit));
  updateUndoButtons();
}
function scheduleCommit() {
  clearTimeout(commitTimer);
  commitTimer = setTimeout(commitNow, 400); // typing in a field becomes one undo step
}
function restore(state) {
  if (!state) return;
  restoring = true;
  const before = kit;
  kit = normalizeKit(JSON.parse(state));
  $('#kit-name').value = kit.name;
  view.dragging = null;
  // keep the selection when undo/redo only moved or changed it (so the handles
  // stay for another try); drop it when pieces came or went, as indexes shift
  if (!sameThing(before, kit, view.sel)) view.sel = null;
  update({ sidebar: true });
  restoring = false;
  updateUndoButtons();
}
function sameThing(a, b, sel) {
  if (!sel) return false;
  const list = (k) => (sel.kind === 'item' ? k.items : sel.kind === 'opening' ? k.openings : k.lighting?.leds) || [];
  const A = list(a), B = list(b);
  return A.length === B.length && B[sel.index] != null && (sel.kind !== 'item' || A[sel.index]?.type === B[sel.index].type);
}
function undo() { if (commitTimer) commitNow(); restore(undoHistory.undo()); }
function redo() { if (commitTimer) commitNow(); restore(undoHistory.redo()); }
function updateUndoButtons() {
  const u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
  if (u) u.disabled = !undoHistory.canUndo;
  if (r) r.disabled = !undoHistory.canRedo;
}
const changed = () => update();
const restructured = () => update({ sidebar: true });

// ------------------------------------------------------------------- steps
const TABS = { design: { '3d': 'preview', plan: 'plan' }, light: { '3d': 'preview', plan: 'plan', wiring: 'ledmap' }, make: 'sheets', build: 'guide' };
function syncTab() {
  const t = TABS[view.step];
  view.tab = typeof t === 'string' ? t : t[view.views[view.step]];
}
function setStep(step) {
  if (step === view.step) return;
  view.step = step;
  syncTab();
  $('#workspace').dataset.step = step;
  document.querySelectorAll('.mm-steps [data-step]').forEach((b) => (b.dataset.step === step ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
  if (step !== 'design') closeDrawer();
  if (step !== 'design' && view.sel?.kind !== 'led') view.sel = null; // pieces and openings are edited on Design
  $('#view').dataset.key = '';
  $('#view').replaceChildren();
  $('#view').scrollTop = 0;
  renderInspector();
  renderView();
}
function setStageView(name) {
  view.views[view.step] = name;
  syncTab();
  renderView();
}

// --------------------------------------------------------------- inspector
function inspHead(kind, title, meta, { back = false } = {}) {
  return h('div', { class: 'insp-head' },
    h('span', { class: 'insp-kind' }, kind),
    h('h2', { class: 'insp-title' }, title),
    meta ? h('span', { class: 'insp-meta' }, meta) : null,
    back ? h('button', { type: 'button', class: 'mm-btn mm-btn--sm mm-btn--quiet', 'data-action': 'back', onclick: () => select(null) }, 'Done') : null);
}
const insSec = (title, ...body) => h('section', { class: 'insp-sec' }, title ? h('h3', {}, title) : null, ...body);
function notice(tone, word, text) {
  return h('div', { class: `mm-notice mm-notice--${tone} insp-notice`, role: tone === 'danger' ? 'alert' : null },
    ic(tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert'), h('div', {}, h('b', {}, word), ' ', text));
}

// a row of the pieces list points at its piece in 3D, under the pointer or
// focused (the pointer wins); rows go away when the inspector re-renders
// without firing pointerleave or blur, so a re-render clears both
const listPoint = { over: null, focus: null };
function pointAt(key, index) { listPoint[key] = index; hoverPiece(listPoint.over ?? listPoint.focus); }

function select(sel) {
  view.sel = sel;
  renderInspector();
  // the stage on screen shows the selection too, right away (the 3D view
  // renders on demand, so nothing else would redraw it until the next orbit)
  if (view.tab === 'plan') drawPlan();
  else if (view.tab === 'preview') drawScene();
}

/** keepScroll: a refresh mid-drag stays where the person has scrolled to. */
function renderInspector({ keepScroll = false } = {}) {
  const sb = $('#sidebar');
  if (view.step === 'make' || view.step === 'build') { sb.replaceChildren(); return; }
  const scroll = sb.scrollTop;
  if (listPoint.over != null || listPoint.focus != null) { listPoint.over = listPoint.focus = null; hoverPiece(null); } // its rows are about to go
  const e = selectedEntity();
  let content;
  if (view.step === 'light') content = e?.kind === 'led' ? ledInspector(e) : lightingInspector();
  else if (e?.kind === 'item') content = itemInspector(e);
  else if (e?.kind === 'opening') content = openingInspector(e);
  else if (e?.kind === 'led') content = ledInspector(e);
  else content = roomInspector();
  sb.replaceChildren(...content.filter(Boolean));
  sb.scrollTop = e && !keepScroll ? 0 : scroll;
}

const OPENING_KINDS = [['window', 'Window'], ['arch', 'Arched window'], ['round', 'Round window'], ['door', 'Door'], ['archdoor', 'Arched door']];
const WALL_OPTIONS = [['back', 'Back wall'], ['left', 'Left wall'], ['right', 'Right wall']];
const isDoor = (o) => o.kind === 'door' || o.kind === 'archdoor';

function roomInspector() {
  const r = kit.room;
  const clashes = new Set(collisions(kit).flat());
  const items = kit.items.map((item, i) => {
    const def = CATALOG[item.type];
    const mat = kit.materials.find((m) => m.id === item.material);
    return h('button', { type: 'button', class: `insp-row${clashes.has(i) ? ' clash' : ''}`, 'data-select-item': i, onclick: () => select({ kind: 'item', index: i }),
      // point at the piece in the 3D view while the row is under the pointer or focused
      onpointerenter: () => pointAt('over', i), onpointerleave: () => pointAt('over', null), onfocus: () => pointAt('focus', i), onblur: () => pointAt('focus', null) },
      h('span', { class: 'sw', style: `background:${mat?.color || '#ccc'}` }),
      h('span', { class: 'grow' }, def?.label || item.type),
      clashes.has(i) ? h('span', { class: 'mm-chip mm-chip--danger' }, 'Overlaps') : h('span', { class: 'k2' }, def?.group || ''));
  });
  const openings = kit.openings.map((o, i) => h('button', { type: 'button', class: 'insp-row', 'data-select-opening': i, onclick: () => select({ kind: 'opening', index: i }) },
    ic(isDoor(o) ? 'joint' : 'window'),
    h('span', { class: 'grow' }, OPENING_KINDS.find((k) => k[0] === o.kind)?.[1] || o.kind),
    h('span', { class: 'k2' }, `${o.wall} wall`)));
  return [
    inspHead('Room', 'The room', `${cm(r.width)} × ${cm(r.depth)} × ${cm(r.height)} cm · 1:${kit.scale}`),
    remixCredit(kit, { h }), // T7 remix credit
    roomSection(),
    shellSection(kit, { h, section, numberField, selectField, checkField, changed, restructured }), // T2 shells
    texturePicker({ section, selectField, getKit: () => kit, setKit: (next) => { kit = next; update(); } }), // T6 textures
    section('Furniture & decor', [
      items.length ? h('div', { class: 'insp-list' }, items) : h('p', { class: 'hint' }, 'No pieces yet.'),
      h('div', { class: 'add-row' }, h('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: openDrawer }, ic('plus'), 'Add a piece')),
    ], { count: kit.items.length }),
    section('Windows & doors', [
      openings.length ? h('div', { class: 'insp-list' }, openings) : h('p', { class: 'hint' }, 'No windows or doors yet.'),
      h('div', { class: 'add-row' },
        h('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => addOpening('window') }, ic('plus'), 'Window'),
        h('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => addOpening('door') }, ic('plus'), 'Door')),
    ], { count: kit.openings.length, open: false }),
  ];
}

function roomSection() {
  const r = kit.room;
  const el = section('Room box', [
    h('div', { class: 'grid3' },
      numberField('Width', r.width, (v) => { r.width = v; changed(); }, { min: 20, unit: 'cm' }),
      numberField('Depth', r.depth, (v) => { r.depth = v; changed(); }, { min: 20, unit: 'cm' }),
      numberField('Height', r.height, (v) => { r.height = v; changed(); }, { min: 20, unit: 'cm' }),
    ),
    selectField('Structure board', r.material, matOptions((m) => m.kind !== 'fabric'), (v) => { r.material = v; changed(); }),
    checkField('Ceiling', r.ceiling, (v) => { r.ceiling = v; changed(); }),
    h('div', { class: 'grid2' },
      checkField('Wallpaper', r.wallpaper.enabled, (v) => { r.wallpaper.enabled = v; changed(); }),
      selectField('', r.wallpaper.material, matOptions((m) => m.kind === 'card'), (v) => { r.wallpaper.material = v; changed(); }),
      checkField('Floor covering', r.floor.enabled, (v) => { r.floor.enabled = v; changed(); }),
      selectField('', r.floor.material, matOptions((m) => m.kind !== 'board' || m.thickness <= 1), (v) => { r.floor.material = v; changed(); }),
    ),
    selectField('Window and door trim', r.trimMaterial, matOptions((m) => m.kind !== 'fabric'), (v) => { r.trimMaterial = v; changed(); }),
    h('p', { class: 'hint' }, 'Real-world sizes; the scale shrinks them to the model.'),
  ]);
  applyRoomLocks(kit, el, h); // T2 shells: the shell owns the room size (and overlays for whole-scene shells)
  appendRoofControls(kit, el, { h, numberField, checkField, changed, restructured }); // T2 roofs
  return el;
}

function materialHint(id) {
  const m = kit.materials.find((x) => x.id === id);
  return m ? `${TOOL_NAMES[m.tool] || m.tool} · ${m.thickness} mm` : '';
}

function itemInspector(e) {
  const { obj: item, def, index: i } = e;
  const at = view.dragging?.item === item ? { ...item, ...view.dragging.changes } : item; // where a 3D handle drag has it right now
  if (!def) return [inspHead('Piece', `Unknown piece (${item.type})`, '', { back: true })];
  item.params ||= {};
  const [w, d, hgt] = itemSize(item.type, itemParams(item));
  const clash = collisions(kit).some((pair) => pair.includes(i));
  const nums = def.params.filter((p) => p.type !== 'select');
  const params = def.params.map((p) => {
    const val = item.params[p.key] ?? def.defaults[p.key];
    if (p.type === 'select') return selectField(p.label, val, p.options.map((o) => [o, titleCase(o)]), (v) => { item.params[p.key] = v; changed(); });
    return numberField(p.label, val, (v) => { item.params[p.key] = v; changed(); }, { min: p.min, max: p.max, step: p.step, unit: p.unit });
  });
  const placement = def.placement === 'wall'
    ? [selectField('Wall', item.wall || 'back', WALL_OPTIONS, (v) => { item.wall = v; changed(); }),
      numberField('Along wall', at.pos ?? 0, (v) => { item.pos = v; changed(); }, { min: 0, unit: 'cm' }),
      numberField('Centre height', at.elev ?? 0, (v) => { item.elev = v; changed(); }, { min: 0, unit: 'cm' })]
    : [numberField('From left', at.x ?? 0, (v) => { item.x = v; changed(); }, { min: 0, unit: 'cm' }),
      numberField('From back', at.y ?? 0, (v) => { item.y = v; changed(); }, { min: 0, unit: 'cm' }),
      selectField('Turn', at.rot || 0, [[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']], (v) => { item.rot = Number(v); changed(); })];
  const matFilter = def.mat === 'fabric' ? () => true : (m) => m.kind !== 'fabric';
  return [
    inspHead('Piece', def.label, `${cm(w)} × ${cm(d)} × ${cm(hgt)} cm · ${def.group}`, { back: true }),
    clash ? notice('danger', 'Overlaps another piece.', 'Move one of them on the floor plan.') : null,
    insSec('Size and shape', h('div', { class: nums.length >= 3 ? 'grid3' : 'grid2' }, params)),
    insSec('Material',
      h('label', { class: 'field' }, h('select', { 'aria-label': 'Material', onchange: (ev) => { item.material = ev.target.value; restructured(); } },
        matOptions(matFilter).map(([v, t]) => h('option', { value: v, selected: v === item.material }, t)))),
      h('p', { class: 'hint' }, materialHint(item.material))),
    section('Position', [h('div', { class: 'grid3' }, placement), h('p', { class: 'hint' }, 'Or drag it on the floor plan.')], { open: false }),
    h('div', { class: 'insp-actions' },
      h('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => planAction('duplicate') }, 'Duplicate'),
      def.placement === 'floor' ? h('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => planAction('rotate') }, 'Rotate') : null,
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'mm-btn mm-btn--sm mm-btn--danger', onclick: () => planAction('delete') }, 'Remove')),
  ];
}

function openingInspector(e) {
  const o = e.obj;
  const label = OPENING_KINDS.find((k) => k[0] === o.kind)?.[1] || 'Opening';
  return [
    inspHead(isDoor(o) ? 'Door' : 'Window', label, `${o.wall} wall · ${cm(o.width)} × ${cm(o.height)} cm`, { back: true }),
    insSec('Size and shape',
      h('div', { class: 'grid2' },
        selectField('Type', o.kind, OPENING_KINDS, (v) => { o.kind = v; restructured(); }),
        isDoor(o) ? h('span') : numberField('Sill height', o.sill, (v) => { o.sill = v; changed(); }, { min: 0, unit: 'cm' }),
        numberField('Width', o.width, (v) => { o.width = v; changed(); }, { min: 5, unit: 'cm' }),
        numberField('Height', o.height, (v) => { o.height = v; changed(); }, { min: 5, unit: 'cm' })),
      checkField('Add a trim frame', o.trim, (v) => { o.trim = v; changed(); })),
    insSec('Where',
      h('div', { class: 'grid2' },
        selectField('Wall', o.wall, WALL_OPTIONS, (v) => { o.wall = v; restructured(); }),
        numberField(o.wall === 'back' ? 'From left' : 'From front', o.pos, (v) => { o.pos = v; changed(); }, { min: 0, unit: 'cm' })),
      h('p', { class: 'hint' }, 'Measured to the centre. Or slide it along its wall on the floor plan.')),
    h('div', { class: 'insp-actions' }, h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'mm-btn mm-btn--sm mm-btn--danger', onclick: () => planAction('delete') }, 'Remove')),
  ];
}

function ledInspector(e) {
  const led = e.obj;
  const place = led.mount === 'wall'
    ? [selectField('Wall', led.wall || 'back', WALL_OPTIONS, (v) => { led.wall = v; changed(); }),
      numberField('Along wall', led.pos ?? 0, (v) => { led.pos = v; changed(); }, { min: 0, unit: 'cm' }),
      numberField('Height', led.elev ?? 0, (v) => { led.elev = v; changed(); }, { min: 0, unit: 'cm' })]
    : [numberField('From left', led.x ?? 0, (v) => { led.x = v; changed(); }, { min: 0, unit: 'cm' }),
      numberField('From back', led.y ?? 0, (v) => { led.y = v; changed(); }, { min: 0, unit: 'cm' })];
  const colour = LED_COLORS[led.color] || LED_COLORS.warm;
  return [
    inspHead('Light', `L${e.index + 1}${led.name ? ` · ${led.name}` : ''}`, `${led.mount} · ${colour.name}`, { back: true }),
    insSec('Light',
      h('label', { class: 'field' }, 'Name', h('input', { value: led.name || '', oninput: (ev) => { led.name = ev.target.value; changed(); } })),
      h('div', { class: 'grid2' },
        selectField('Mounted on', led.mount, [['wall', 'Wall'], ['ceiling', 'Ceiling'], ['floor', 'Floor or a lamp']], (v) => { led.mount = v; restructured(); }),
        selectField('Colour', led.color || 'warm', Object.entries(LED_COLORS).map(([k, c]) => [k, c.name]), (v) => { led.color = v; restructured(); })),
      renderEffectFields(led, { selectField, numberField, changed, restructured })), // [T5] effect picker
    insSec('Where', h('div', { class: led.mount === 'wall' ? 'grid3' : 'grid2' }, place)),
    h('div', { class: 'insp-actions' }, h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'mm-btn mm-btn--sm mm-btn--danger', onclick: () => planAction('delete') }, 'Remove')),
  ];
}

function addLed(mount, { selectIt = true } = {}) {
  const L = kit.lighting;
  L.enabled = true;
  const led = { name: '', mount, color: 'warm' };
  if (mount === 'wall') Object.assign(led, { wall: 'back', pos: Math.round(kit.room.width / 2), elev: 180 });
  else Object.assign(led, { x: Math.round(kit.room.width / 2), y: Math.round(kit.room.depth / 2) });
  if (mount === 'ceiling' && !kit.room.ceiling) { kit.room.ceiling = true; toast('Turned on the ceiling for the ceiling light.'); }
  L.leds.push(led);
  if (selectIt) view.sel = { kind: 'led', index: L.leds.length - 1 };
  restructured();
}

function lightingInspector() {
  const L = kit.lighting;
  // >>> T2 shells: a shell that places its own LEDs (#16) lists them instead of the room's
  if (shellWiresLights(kit)) {
    const shellLeds = (compiled?.lighting?.leds || []).filter((l) => l.inside);
    const powerFields = lightingInspectorPower(L);
    const on = L.enabled && compiled?.lighting?.enabled;
    return [
      inspHead('Lighting', 'Circuit', `${shellLeds.length} light${shellLeds.length === 1 ? '' : 's'}`),
      on ? renderCircuitSummary(compiled.lighting.circuit) : notice('info', 'Lights are off.', 'Turn them on under Power to wire the shell\'s LEDs.'),
      section('Lights', [
        h('p', { class: 'hint', 'data-shell-lights': '' }, 'The shell places these LEDs itself (behind an alley\'s lit windows, under shelves, floors and roofs). Change the shell in its panel to move them.'),
        h('div', { class: 'insp-list' }, shellLeds.map((led) => h('div', { class: 'insp-row' },
          h('span', { class: 'led-dot', style: `background:${LED_COLORS[led.color]?.hex || LED_COLORS.warm.hex}` }),
          h('span', { class: 'grow' }, `${led.label}${led.name ? ` · ${led.name}` : ''}`),
          h('span', { class: 'k2' }, led.where)))),
      ], { count: shellLeds.length }),
      section('Power', powerFields, { open: false }),
    ];
  }
  // <<< T2 shells
  if (!L.leds.length) {
    return [
      inspHead('Lighting', 'Lights', ''),
      h('div', { class: 'mm-empty' }, frag(MIMI.sleep),
        h('h3', {}, 'No lights yet'),
        h('p', {}, 'Add a light and Mimi will plan the wiring, the battery and the lead lengths.'),
        h('button', { type: 'button', class: 'mm-btn mm-btn--primary', onclick: () => addLed('wall', { selectIt: false }) }, ic('plus'), 'Add a wall light')),
    ];
  }
  const rows = L.leds.map((led, i) => h('button', { type: 'button', class: 'insp-row', 'data-select-led': i, onclick: () => select({ kind: 'led', index: i }) },
    h('span', { class: 'led-dot', style: `background:${LED_COLORS[led.color]?.hex || LED_COLORS.warm.hex}` }),
    h('span', { class: 'grow' }, `L${i + 1}${led.name ? ` · ${led.name}` : ''}`),
    h('span', { class: 'k2' }, led.mount)));
  const on = L.enabled && compiled?.lighting?.enabled;
  return [
    inspHead('Lighting', 'Circuit', `${L.leds.length} light${L.leds.length === 1 ? '' : 's'}`),
    on ? renderCircuitSummary(compiled.lighting.circuit) : notice('info', 'Lights are off.', 'Turn them on under Power to cut the wire holes.'), // [T5] circuit summary
    section('Lights', [
      h('div', { class: 'insp-list' }, rows),
      h('div', { class: 'add-row' },
        h('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => addLed('wall') }, ic('plus'), 'Wall'),
        h('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => addLed('ceiling') }, ic('plus'), 'Ceiling'),
        h('button', { type: 'button', class: 'mm-btn mm-btn--sm', onclick: () => addLed('floor') }, ic('plus'), 'Floor')),
    ], { count: L.leds.length }),
    section('Power', lightingInspectorPower(L), { open: false }),
  ];
}

function lightingInspectorPower(L) {
  return [
    checkField('Lights on (cut the wire holes)', L.enabled, (v) => { L.enabled = v; restructured(); }),
    h('div', { class: 'grid2' },
      renderSupplyField(L.power, changed), // [T5] supply picker
      numberField('Wire hole', L.holeDiameter, (v) => { L.holeDiameter = Math.max(1, v); changed(); }, { min: 1, max: 8, step: 0.5, unit: 'mm' })),
    renderMountField(L.power, restructured), // [T5] mount picker (restructured: the base adds switch fields)
    renderSwitchFields(L.power, changed), // [T5] hidden base switch
    renderCoverField(L, { checkField, restructured, range: compiled.lighting?.coverRange }), // [T5] cable cover
    renderShoppingButton(() => { const f = shoppingFile(compiled.lighting); if (f) download(f.name, f.data, f.type); }), // [T5] shopping list
    h('div', { class: 'grid3' },
      selectField('Power box', L.power.wall, WALL_OPTIONS, (v) => { L.power.wall = v; changed(); }),
      numberField('Along wall', L.power.pos, (v) => { L.power.pos = v; changed(); }, { min: 0, unit: 'cm' }),
      numberField('Height', L.power.elev, (v) => { L.power.elev = v; changed(); }, { min: 0, unit: 'cm' })),
  ];
}

/** Keep the circuit card live while fields in the Light inspector change. */
function refreshCircuit() {
  const card = document.querySelector('#sidebar .t5-circuit');
  if (card && compiled.lighting?.enabled) card.replaceWith(renderCircuitSummary(compiled.lighting.circuit)); // [T5]
}

// ------------------------------------------------------------ piece drawer
const thumbCache = new Map();
function itemThumb(type) {
  const def = CATALOG[type];
  const material = defaultMaterialFor(def, kit.materials);
  const key = `${type}|${kit.materials.find((m) => m.id === material)?.color}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  let svg = '';
  try {
    const big = { ...kit.room, width: 1500, depth: 1500, height: 1500, ceiling: false, wallpaper: { enabled: false, material: 'paper' }, floor: { enabled: false, material: 'card65' } };
    const c = compileKit({ ...kit, shell: null, room: big, openings: [], lighting: { enabled: false }, items: [{ type, params: { ...def.defaults }, material, x: 0, y: 0, rot: 0, wall: 'back', pos: 750, elev: 400 }] });
    svg = renderScene(c.faces3d.filter((f) => f.item === 0), { yaw: -28, pitch: 22 });
  } catch { /* leave blank */ }
  thumbCache.set(key, svg);
  return svg;
}
function roomThumb(id) {
  const key = `room|${id}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  let svg = '';
  try { svg = renderScene(compileKit(applyRoomType(kit, id)).faces3d, { yaw: -30, pitch: 24 }); } catch { /* blank */ }
  thumbCache.set(key, svg);
  return svg;
}

function addPiece(type) {
  const def = CATALOG[type];
  const item = { type, params: { ...def.defaults }, material: defaultMaterialFor(def, kit.materials) };
  if (def.placement === 'wall') Object.assign(item, { wall: 'back', pos: Math.round(kit.room.width / 2), elev: 150 });
  else Object.assign(item, { rot: 0 }, findFreeSpot(kit, { ...item, x: 0, y: 0 }) || { x: 10, y: 10 });
  kit.items.push(item);
  view.sel = { kind: 'item', index: kit.items.length - 1 };
  restructured();
  toast(`Added ${def.label.toLowerCase()}. Drag it on the floor plan to place it.`);
}
function addOpening(kind) {
  const o = kind === 'door'
    ? { wall: 'right', kind: 'door', pos: Math.round(kit.room.depth / 2), sill: 0, width: 80, height: 200, trim: true }
    : { wall: 'back', kind: 'window', pos: Math.round(kit.room.width / 2), sill: 90, width: 60, height: 90, trim: true };
  kit.openings.push(o);
  view.sel = { kind: 'opening', index: kit.openings.length - 1 };
  restructured();
  toast(`Added a ${kind} to the ${o.wall} wall.`);
}

function openDrawer() {
  if (view.step !== 'design') setStep('design');
  const drawer = $('#drawer');
  drawer.replaceChildren(
    h('div', { class: 'drawer-head' }, h('h2', {}, 'Add a piece'),
      h('button', { type: 'button', class: 'mm-btn mm-btn--sm mm-btn--quiet mm-btn--icon', 'data-action': 'close', 'aria-label': 'Close', onclick: closeDrawer }, ic('close'))),
    pieceLibrary({ view, addPiece, thumb: itemThumb })); // T1: piece library (search, difficulty, part counts) lives in src/ui/t1.js
  drawer.hidden = false;
  $('#rail-pieces').setAttribute('aria-expanded', 'true');
}
function closeDrawer() {
  const drawer = $('#drawer');
  if (!drawer || drawer.hidden) return;
  drawer.hidden = true;
  drawer.replaceChildren();
  $('#rail-pieces').setAttribute('aria-expanded', 'false');
}

// -------------------------------------------------------------------- header
function renderSummary() {
  const { parts, sheets } = compiled;
  $('#summary').replaceChildren(
    h('span', {}, h('b', {}, parts.length), ' parts'),
    h('span', {}, h('b', {}, sheets.length), ` sheet${sheets.length === 1 ? '' : 's'}`),
    h('span', {}, '≈ ', h('b', {}, formatMinutes(sheets.reduce((t, s) => t + estimateCutMinutes(s, compiled.machine), 0)))),
  );
}

function renderChecks() {
  const s = checksSummary(compiled.warnings);
  const pill = $('#checks');
  pill.dataset.state = s.state;
  pill.querySelector('.txt').textContent = s.label;
  const items = s.items.map((it) => h('div', { class: `warn ${it.level === 'error' ? 'error' : 'warning'}` }, ic('alert'),
    h('div', {}, h('b', {}, it.title), it.times > 1 ? h('span', { class: 'times' }, ` ×${it.times}`) : null, it.hint ? h('small', {}, it.hint) : null)));
  const notes = s.notes.map((n) => h('div', { class: 'warn info' }, ic('info'), h('div', {}, n.msg)));
  $('#warnings').replaceChildren(
    ...(items.length ? items : [h('p', { class: 'checks-empty' }, 'Nothing to fix: every part fits its sheet and every joint is a cuttable size.')]),
    ...(notes.length ? [h('h3', {}, 'Tips'), ...notes] : []));
}
function showBuildError(err) {
  const pill = $('#checks');
  pill.dataset.state = 'danger';
  pill.querySelector('.txt').textContent = "Can't build";
  $('#warnings').replaceChildren(h('div', { class: 'warn error' }, ic('alert'), h('div', {}, h('b', {}, "This kit couldn't be built."), h('small', {}, err.message))));
}

function togglePop(btn, pop, open = pop.hidden) {
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
}
function closePops() {
  let closed = false;
  for (const [b, p] of [['#checks', '#checks-pop'], ['#btn-file', '#file-menu']]) {
    if (!$(p).hidden) { togglePop($(b), $(p), false); closed = true; }
  }
  if (!$('#share-pop').hidden) { $('#share-pop').hidden = true; closed = true; }
  return closed;
}

// ---------------------------------------------------------------- main view
function renderView() {
  if (!compiled) return;
  const el = $('#view');
  if (view.step === 'make') return renderMake(el);
  if (view.step === 'build') return renderBuild(el);
  renderStage(el);
}

function segmented(label, options) {
  const current = view.views[view.step];
  return h('div', { class: 'mm-seg', role: 'group', 'aria-label': label },
    options.map(([id, text, ico]) => h('button', { type: 'button', 'data-view': id, 'aria-pressed': String(current === id), onclick: () => setStageView(id) }, ico ? ic(ico) : null, text)));
}

function renderStage(el) {
  const name = view.views[view.step];
  const key = `${view.step}:${name}`;
  if (el.dataset.key !== key || !el.firstChild) {
    el.dataset.key = key;
    const views = view.step === 'light'
      ? [['3d', 'Room', 'cube'], ['plan', 'Plan', 'plan'], ['wiring', 'Wiring', 'bulb']]
      : [['3d', '3D', 'cube'], ['plan', 'Plan', 'plan']];
    const bar = h('div', { class: 'stage-bar' }, segmented('View', views), h('span', { class: 'grow' }));
    if (name === '3d') el.replaceChildren(build3d(bar));
    else if (name === 'plan') el.replaceChildren(buildPlan(bar));
    else el.replaceChildren(h('div', { class: 'stage-wrap flow' }, bar, h('div', { class: 'wiring' })));
  }
  if (name === '3d') drawScene();
  else if (name === 'plan') drawPlan();
  else renderWiring(el.querySelector('.wiring'));
}

function build3d(bar) {
  const stage = h('div', { class: 'stage' });
  const yaw = h('input', { type: 'range', min: -80, max: 80, value: view.yaw, 'aria-label': 'Rotate', oninput: (e) => { view.yaw = Number(e.target.value); drawScene(); } });
  const pitch = h('input', { type: 'range', min: 5, max: 80, value: view.pitch, 'aria-label': 'Tilt', oninput: (e) => { view.pitch = Number(e.target.value); drawScene(); } });
  if (view.step === 'design') {
    const night = h('button', {
      id: 'night-toggle', type: 'button', class: 'mm-btn night-toggle', 'aria-pressed': String(view.night),
      onclick: () => { view.night = !view.night; night.setAttribute('aria-pressed', String(view.night)); night.lastChild.textContent = view.night ? 'Night' : 'Day'; drawScene(); },
    }, h('i'), view.night ? 'Night' : 'Day');
    bar.append(night);
  }
  bar.append(rendererToggle(drawScene)); // T6
  const foot = h('div', { class: 'stage-foot' },
    h('span', { class: 'mm-chip' }, view.step === 'light' ? 'The lights as they glow · drag to orbit · click a light to select it' : 'Drag to orbit · scroll to zoom · click a piece, then drag its handles (Alt: no snap) · R turn · D duplicate · Del remove'),
    h('div', { class: 'orbit' }, h('label', {}, 'Rotate', yaw), h('label', {}, 'Tilt', pitch)));
  let drag = null;
  stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.yaw = Math.max(-80, Math.min(80, drag.yaw + (e.clientX - drag.x) * 0.4));
    view.pitch = Math.max(5, Math.min(80, drag.pitch + (e.clientY - drag.y) * 0.3));
    yaw.value = view.yaw; pitch.value = view.pitch;
    drawScene();
  });
  const end = () => { drag = null; };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  // T6: click a piece (Design) or a light (Light) to select it
  attachPicking(stage, (index, kind) => {
    if (index != null) select({ kind, index });
    else if (view.sel?.kind === kind || view.sel?.kind === 'led') select(null); // a click off them; a window picked from the list stays
  }, { picks: () => (view.step === 'design' ? 'item' : view.step === 'light' ? 'led' : null) });
  return h('div', { class: 'stage-wrap' }, stage, bar, foot);
}
// T6: move handles on the selected piece, redrawn after every draw of the 3D view
let inspectorFrame = 0;
function drawHandles(stage) {
  const wrap = stage.parentElement;
  if (!wrap || !compiled) return;
  const on = view.step === 'design' && view.tab === 'preview';
  drawGizmo(wrap, {
    stage, kit, faces: compiled.faces3d, sel: on ? view.sel : null, project: on ? stageProjector(stage) : null, grid: view.snap,
    preview: (xf, changes, item) => {
      const at = kit.items.indexOf(item);
      previewItem(stage, at >= 0 ? at : view.sel?.index, xf); // the dragged piece, even if the selection moved on
      // the inspector's position fields follow the drag, as on the plan; a
      // turn also shows where it lands once kept in the room, as on release
      if (xf && changes && 'rot' in changes) {
        const turns = (((changes.rot - (Number(item.rot) || 0)) / 90) % 4 + 4) % 4;
        const probe = { room: kit.room, items: [{ ...item }] };
        if (turns) rotateItem(probe, 0, turns);
        changes = { x: probe.items[0].x, y: probe.items[0].y, rot: probe.items[0].rot };
      }
      view.dragging = xf ? { item, changes } : null;
      if (!inspectorFrame) inspectorFrame = requestAnimationFrame(() => { inspectorFrame = 0; renderInspector({ keepScroll: true }); });
    },
    commit: (changes, item) => {
      view.dragging = null;
      const i = kit.items.indexOf(item); // the piece the drag began on, wherever it is now (or gone)
      if (i < 0) { renderInspector({ keepScroll: true }); drawScene(); return; } // gone (undone mid-drag): show the kit as it is
      if ('rot' in changes) { // one turn about the centre, kept in the room, as the Rotate button does
        const turns = (((changes.rot - (Number(item.rot) || 0)) / 90) % 4 + 4) % 4;
        if (turns) rotateItem(kit, i, turns);
      } else Object.assign(item, changes);
      restructured();
    },
  });
}
onStageDrawn(drawHandles);
window.addEventListener('resize', () => { if (view.tab === 'preview') drawScene(); });
// the stage can change size without the window (the layout reflowing): Realistic 3D re-renders itself, so follow it
const stageSize = new ResizeObserver((entries) => requestAnimationFrame(() => { for (const en of entries) if (en.target.isConnected) drawHandles(en.target); }));
onStageDrawn((stage) => { if (!stage.t6sizeWatched) { stage.t6sizeWatched = true; stageSize.observe(stage); } });

function drawScene() {
  const stage = document.querySelector('.stage');
  if (!stage || !compiled) return;
  const night = view.step === 'light' || view.night;
  stage.classList.toggle('night', night);
  drawStage(stage, compiled.faces3d, night === view.night ? view : { ...view, night }, kit); // T6
}

// --------------------------------------------------------------- floor plan
function selectedEntity() {
  const s = view.sel;
  if (!s) return null;
  if (s.kind === 'item') return kit.items[s.index] ? { ...s, obj: kit.items[s.index], def: CATALOG[kit.items[s.index].type] } : null;
  if (s.kind === 'opening') return kit.openings[s.index] ? { ...s, obj: kit.openings[s.index] } : null;
  if (s.kind === 'led') return kit.lighting.leds[s.index] ? { ...s, obj: kit.lighting.leds[s.index] } : null;
  return null;
}
const isFloorItem = (e) => e?.kind === 'item' && e.def?.placement === 'floor';

function drawPlan(guides = []) {
  const host = document.querySelector('.plan-canvas');
  if (!host) return;
  const clashes = new Set(collisions(kit).flat());
  host.innerHTML = planSVG(kit, { selected: view.sel, clashes, guides });
}

/** Snap reach: about 8 screen px, in plan cm. */
function planReach(canvas) {
  const k = canvas.querySelector('svg')?.getScreenCTM()?.a;
  return k > 0 ? 8 / k : 3;
}

function planAction(action) {
  const e = selectedEntity();
  if (!e) return;
  if (action === 'rotate' && isFloorItem(e)) rotateItem(kit, e.index);
  if (action === 'duplicate' && e.kind === 'item') {
    const copy = structuredClone(e.obj);
    if (e.def.placement === 'floor') { copy.x = (copy.x ?? 0) + 10; copy.y = (copy.y ?? 0) + 10; } else copy.pos = (copy.pos ?? 0) + 10;
    kit.items.splice(e.index + 1, 0, copy);
    if (e.def.placement === 'floor') moveItem(kit, e.index + 1, copy.x, copy.y);
    view.sel = { kind: 'item', index: e.index + 1 };
  }
  if (action === 'delete') {
    const list = e.kind === 'item' ? kit.items : e.kind === 'opening' ? kit.openings : kit.lighting.leds;
    const name = e.kind === 'item' ? e.def?.label.toLowerCase() : e.kind === 'opening' ? 'the opening' : `light L${e.index + 1}`;
    list.splice(e.index, 1);
    view.sel = null;
    restructured();
    toast(`Removed ${name}.`, { action: ['Undo', undo] });
    return;
  }
  restructured();
}

function nudge(dx, dy) {
  const e = selectedEntity();
  if (!e) return;
  if (isFloorItem(e)) moveItem(kit, e.index, (e.obj.x ?? 0) + dx, (e.obj.y ?? 0) + dy);
  else if (e.kind === 'led' && e.obj.mount !== 'wall') { e.obj.x = (e.obj.x ?? 0) + dx; e.obj.y = (e.obj.y ?? 0) + dy; }
  else if (e.obj.wall) {
    const along = e.obj.wall === 'back' ? dx : -dy;
    slideOnWall(e.obj, (e.obj.pos ?? 0) + along, kit.room, { width: entityWidth(e) });
  }
  changed();
}

function entityHeight(e) {
  if (e.kind === 'opening') return e.obj.height;
  if (e.kind === 'item') return itemSize(e.obj.type, itemParams(e.obj))[2];
  return 0;
}

function entityWidth(e) {
  if (e.kind === 'opening') return e.obj.width;
  if (e.kind === 'item') return itemSize(e.obj.type, itemParams(e.obj))[0];
  return 0;
}

function buildPlan(bar) {
  const canvas = h('div', { class: 'plan-canvas', tabindex: '0', 'aria-label': 'Floor plan editor' });
  bar.append(h('label', { class: 'snap' }, 'Snap',
    h('select', { 'aria-label': 'Snap to grid', onchange: (e) => { view.snap = Number(e.target.value); } },
      [[0, 'Off'], [1, '1 cm'], [5, '5 cm'], [10, '10 cm']].map(([v, t]) => h('option', { value: v, selected: v === view.snap }, t)))));
  const foot = h('div', { class: 'stage-foot' }, h('span', { class: 'mm-chip' },
    'Drag to move · ', h('kbd', {}, 'R'), ' turn · ', h('kbd', {}, 'D'), ' duplicate · ', h('kbd', {}, 'Del'), ' remove · Alt: no snap'));
  canvas.addEventListener('pointerdown', (ev) => {
    const target = ev.target.closest('[data-index],[data-oi],[data-li]');
    if (!target) { select(null); return; }
    const kind = target.dataset.index != null ? 'item' : target.dataset.oi != null ? 'opening' : 'led';
    const index = Number(target.dataset.index ?? target.dataset.oi ?? target.dataset.li);
    const same = view.sel?.kind === kind && view.sel.index === index;
    view.sel = { kind, index };
    renderInspector({ keepScroll: same }); // grabbing the selected piece again keeps the sidebar where it was
    const e = selectedEntity();
    // The plan re-renders while dragging, so always measure against the
    // SVG that is on screen now (a detached one has no screen position).
    const toPlan = (cx, cy) => {
      const svg = canvas.querySelector('svg');
      const pt = svg.createSVGPoint();
      pt.x = cx; pt.y = cy;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return [p.x, p.y];
    };
    const p0 = toPlan(ev.clientX, ev.clientY);
    const start = { x: e.obj.x ?? 0, y: e.obj.y ?? 0, pos: e.obj.pos ?? 0 };
    const grab = e.obj.wall ? posOnWall(e.obj.wall, p0, kit.room) - start.pos : 0; // keep the grab point under the pointer
    const reach = planReach(canvas);
    let moved = false, frame = 0, guides = [];
    const paint = () => { // once per frame: the plan, its guides and the inspector's position fields
      frame = 0;
      drawPlan(guides);
      renderInspector({ keepScroll: true });
    };
    const onMove = (mv) => {
      const p = toPlan(mv.clientX, mv.clientY);
      const dx = p[0] - p0[0], dy = p[1] - p0[1];
      if (!moved && Math.hypot(dx, dy) < 1) return;
      moved = true;
      const free = mv.altKey || !view.snap; // Snap Off means no pull to pieces or walls either
      const step = free ? 0 : view.snap;
      guides = [];
      if (isFloorItem(e)) {
        const r = snapFloorMove(kit, index, start.x + dx, start.y + dy, { grid: step, reach, free });
        e.obj.x = r.x; e.obj.y = r.y; guides = r.guides;
      } else if (e.obj.wall && (e.kind !== 'led' || e.obj.mount === 'wall')) {
        const hgt = entityHeight(e);
        const elev = e.kind === 'opening' ? (e.obj.sill ?? 0) + hgt / 2 : e.obj.elev ?? 0;
        const r = snapWallMove(kit, { kind, index }, posOnWall(e.obj.wall, p, kit.room) - grab, elev,
          { w: entityWidth(e), h: hgt, grid: step, reach, free });
        e.obj.pos = r.pos; guides = r.guides.filter((g) => g.axis === 'pos'); // the plan shows positions along the wall
      } else if (e.kind === 'led') {
        e.obj.x = Math.min(Math.max(snap(start.x + dx, step), 0), kit.room.width);
        e.obj.y = Math.min(Math.max(snap(start.y + dy, step), 0), kit.room.depth);
      }
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(frame);
      if (moved) restructured(); else drawPlan();
      canvas.focus({ preventScroll: true });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp); // a touch taken over by the browser ends the drag too
    ev.preventDefault();
    drawPlan();
  });
  return h('div', { class: 'stage-wrap' }, canvas, bar, foot);
}

function onKey(ev) {
  const tag = ev.target?.tagName;
  const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (ev.key === 'Escape') {
    if ($('#start').open) return; // the dialog closes itself
    if (closePops()) return;
    if (!$('#drawer').hidden) { closeDrawer(); return; }
    if (typing) ev.target.blur();
    if (view.sel) select(null);
    return;
  }
  if (typing) return;
  const mod = ev.ctrlKey || ev.metaKey;
  const key = ev.key.toLowerCase();
  if (mod && key === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  if (mod && key === 'y') { ev.preventDefault(); redo(); return; }
  if (mod || ev.altKey) return;
  // the plan and Design's 3D view share the shortcuts; in 3D only while nothing
  // else has focus, so a focused list button keeps its own keys
  const in3d = view.tab === 'preview' && view.step === 'design' && (ev.target === document.body || ev.target?.closest?.('.stage'));
  if (view.tab !== 'plan' && !in3d) return;
  const step = ev.shiftKey ? 10 : 1;
  const actions = {
    r: () => planAction('rotate'), d: () => planAction('duplicate'),
    delete: () => planAction('delete'), backspace: () => planAction('delete'),
    arrowleft: () => nudge(-step, 0), arrowright: () => nudge(step, 0), arrowup: () => nudge(0, -step), arrowdown: () => nudge(0, step),
  };
  if (actions[key] && view.sel) { ev.preventDefault(); actions[key](); }
}

// ------------------------------------------------------------ light: wiring
function renderWiring(el) {
  if (!el) return;
  if (!compiled.lighting?.enabled || !compiled.lighting.leds.length) {
    el.replaceChildren(h('p', { class: 'hint' }, 'Add a light to see its wire route, holes and lead lengths here.'));
    return;
  }
  const rows = ledRows(compiled);
  const table = h('div', { class: 'table-wrap' }, h('table', { class: 'led-table' },
    h('thead', {}, h('tr', {}, ['LED', 'Name', 'Mounted on', 'Colour', 'Wire run', 'Lead needed'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.map((r) => h('tr', {},
      h('td', {}, h('span', { class: 'wire', style: `background:${r.wireColor}` }), r.label),
      h('td', {}, r.name || '—'), h('td', {}, r.where), h('td', {}, r.color),
      h('td', { class: 'num' }, `${r.runCm.toFixed(1)} cm`), h('td', { class: 'num' }, h('b', {}, `≥ ${r.leadCm} cm`)))))));
  el.replaceChildren(
    h('div', { class: 'map-head' },
      h('p', { class: 'hint' }, compiled.lighting.leds.some((l) => l.inside) // T2 shells: LEDs the shell places itself (#16)
        ? `Seen from behind the shell, the side you wire on. Dashed lines run inside the shell to the small holes in the back wall; from there run each wire along its line to the ${compiled.lighting.power.kind === 'usb' ? 'USB lead' : 'battery box'}.`
        : `Seen from behind the room, the side you wire on. ${compiled.lighting.holeDiameter.toFixed(1)} mm holes are pre-cut at each LED; run each wire along its line to the ${compiled.lighting.power.kind === 'usb' ? 'USB lead' : 'battery box'}.`),
      h('button', { class: 'mm-btn mm-btn--sm', type: 'button', onclick: () => download(`${slug(kit.name)}-led-map.svg`, ledMapSVG(compiled, { standalone: true }), 'image/svg+xml') }, ic('download'), 'SVG')),
    h('div', { class: 'map-wrap', html: ledMapSVG(compiled) }),
    table);
}

// --------------------------------------------------------------------- make
function renderCalibration() {
  const boards = compiled.usedMats.filter((m) => m.kind === 'board');
  if (!boards.length) return null;
  const cards = boards.map((m) => {
    const c = fitCoupon(m);
    return h('article', { class: 'calib-card', 'data-calibrate': m.id },
      h('header', {},
        h('span', { class: 'sw', style: `background:${m.color}` }),
        h('strong', {}, m.name),
        m.calibrated ? h('span', { class: 'calibrated' }, `Calibrated · ${m.thickness.toFixed(2)} mm`) : h('span', { class: 'uncal' }, 'Not calibrated'),
        h('button', { class: 'mm-btn mm-btn--sm', type: 'button', onclick: () => download(`fit-test-${m.id}.svg`, couponSVG(m), 'image/svg+xml') }, ic('download'), 'Fit test')),
      h('div', { class: 'slots', role: 'group', 'aria-label': `Snug slot for ${m.name}` }, c.slots.map((sl) => h('button', {
        class: 'slot', type: 'button', 'aria-pressed': String(Math.abs(sl.width - m.thickness) < 1e-6 && !!m.calibrated),
        onclick: () => {
          const i = kit.materials.findIndex((x) => x.id === m.id);
          kit.materials[i] = calibrate(kit.materials[i], sl.width);
          restructured();
          toast(`${m.name} set to ${sl.width.toFixed(2)} mm. Every joint now fits that board.`);
        },
      }, h('b', {}, sl.index), ` ${sl.width.toFixed(2)}`))));
  });
  return h('section', { class: 'calib' },
    h('h3', {}, 'Fit test'),
    h('p', { class: 'hint' }, 'Cut the comb, push a scrap of each board into the numbered slots, and pick the first one that holds it snugly without forcing.'),
    h('div', { class: 'calib-grid' }, cards));
}

// T3 material library (src/ui/t3.js); rebuilt when the kit object is replaced (undo, templates)
let matLib = null, matsOpen = false; // matsOpen keeps the Materials panel open across Make rebuilds
function materialsPanel() {
  if (!matLib || matLib.kit !== kit) matLib = materialLibrary({ kit, machine: () => compiled?.machine, onChange: changed, onRestructure: restructured });
  return matLib;
}

function renderMake(el) {
  if (el.dataset.key !== 'make' || !el.querySelector('.page.make')) {
    el.dataset.key = 'make';
    el.replaceChildren(h('div', { class: 'page make' },
      h('div', { class: 'page-head' },
        h('h2', {}, 'Make'),
        h('div', { class: 'mm-meter', id: 'make-meter' }),
        h('span', { class: 'grow' }),
        handCutButton(() => ({ kit, compiled }), download, ic('download')), // T3
        printCutButton(() => ({ kit, compiled }), download, ic('download')), // T3
        h('button', { id: 'btn-zip', type: 'button', class: 'mm-btn mm-btn--primary', onclick: exportZip }, ic('download'), 'Download kit')),
      h('div', { class: 'make-setup' },
        selectField('Cutting machine', kit.machine, Object.entries(MACHINES).map(([k, m]) => [k, m.name]), (v) => { kit.machine = v; changed(); }),
        Object.assign(selectField('Scale', kit.scale, SCALES.map((sc) => [sc, `1:${sc}`]), (v) => { kit.scale = Number(v); changed(); }), { className: 'field narrow' }),
        allMachinesField(() => kit, changed)), // T3: changed() so the toggle is an undo step
      h('div', { id: 'make-calib' }),
      h('section', { class: 'calib' }, h('h3', {}, 'Sheets'), h('div', { id: 'make-legend' }), h('div', { id: 'make-sheets', class: 'sheets-grid' })),
      h('details', { class: 'more' }, h('summary', {}, ic('sliders'), 'Advanced'), h('div', {},
        h('div', { class: 'grid2' },
          numberField('Finger width (0 = auto)', kit.fingerWidth, (v) => { kit.fingerWidth = Math.max(0, v); changed(); }, { min: 0, max: 30, step: 0.5, unit: 'mm' }),
          numberField('Glue tab width', kit.tabWidth, (v) => { kit.tabWidth = Math.max(1, v); changed(); }, { min: 1, max: 15, step: 0.5, unit: 'mm' })),
        checkField('Draw part numbers with a Cricut pen', kit.drawLabels, (v) => { kit.drawLabels = v; changed(); }),
        h('div', { id: 'make-bed' }))),
      h('details', { class: 'more', open: matsOpen, ontoggle: (e) => { matsOpen = e.target.open; } }, h('summary', {}, ic('sheets'), 'Materials'), h('div', { id: 'make-materials' }))));
  }
  const { dims, parts, sheets } = compiled;
  const minutes = sheets.reduce((t, s) => t + estimateCutMinutes(s, compiled.machine), 0);
  const cost = kitCost(kit, compiled); // T3
  el.querySelector('#make-meter').replaceChildren(
    h('div', {}, h('span', {}, 'Model'), h('b', {}, `${dims.W.toFixed(0)} × ${dims.D.toFixed(0)} × ${dims.H.toFixed(0)}`, h('small', {}, ' mm'))),
    h('div', {}, h('span', {}, 'Parts'), h('b', {}, parts.length)),
    h('div', {}, h('span', {}, 'Sheets'), h('b', {}, sheets.length)),
    h('div', {}, h('span', {}, 'Cutting'), h('b', {}, `≈ ${formatMinutes(minutes)}`)),
    h('div', { title: 'Sheets × price per sheet (set prices under Materials)' }, h('span', {}, 'Material'), h('b', {}, formatMoney(cost.total, cost.currency)))); // T3
  const bedSlot = el.querySelector('#make-bed'); // T3 machine bed size / kerf
  if (!bedSlot.firstChild) bedSlot.append(machineBedFields(() => kit, changed));
  bedSlot.firstChild.update();
  const lib = materialsPanel(); // T3
  const slot = el.querySelector('#make-materials');
  if (slot.firstChild !== lib) slot.replaceChildren(lib);
  lib.update(compiled);
  updatePrintCutButton(el, kit, compiled); // T3
  const calib = renderCalibration();
  el.querySelector('#make-calib').replaceChildren(...(calib ? [calib] : []));
  el.querySelector('#make-legend').replaceChildren(sheetLegend(compiled.machine, 'Numbers match the assembly guide. Hover a part for details.', compiled.nesting)); // T3
  const fileOpts = { drawLabels: kit.drawLabels, title: (s) => `${kit.name} – ${s.material.name} ${s.index}` };
  el.querySelector('#make-sheets').replaceChildren(...compiled.sheets.map((s) => h('article', { class: 'sheet-card' },
    h('header', {},
      h('span', { class: 'sw', style: `background:${s.material.color}` }),
      h('strong', {}, `${s.material.name} · ${s.index} of ${s.count}`),
      ...sheetDownloadButtons(s, compiled.machine, fileOpts, download)), // T3
    h('div', { html: sheetPreviewSVG(s) }),
    sheetSettings(s, compiled.machine), // T3
    h('div', { class: 'meta' }, `${s.w} × ${s.h} mm · ${s.placements.length} parts: ${s.placements.map((p) => '#' + p.part.id).sort((a, b) => a.slice(1) - b.slice(1)).join(' ')}`))));
}

// -------------------------------------------------------------------- build
function renderBuild(el) {
  const html = guideHTML(kit, compiled);
  const frame = h('iframe', { class: 'guide-frame', title: 'Assembly guide' });
  frame.srcdoc = html;
  el.dataset.key = 'build';
  el.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'guide-tools' },
      h('h2', {}, 'Build'),
      inArtifact ? null : h('button', { type: 'button', class: 'mm-btn', onclick: () => frame.contentWindow?.print() }, 'Print guide'),
      h('button', { type: 'button', class: 'mm-btn', onclick: () => download(`${slug(kit.name)}-guide.html`, html, 'text/html') }, ic('download'), 'Download guide')),
    frame));
  buildCompanion(el.querySelector('.page'), kit, compiled); // T4
}

// ---------------------------------------------------------------- export
function exportZip() {
  const cut = zipCutFiles(kit, compiled, compileKit, { drawLabels: kit.drawLabels, title: (s) => `${kit.name} – ${s.material.name} ${s.index}`, allMachines: !!kit.zipAllMachines }); // T3
  const files = cut.files;
  files.push(...kitHandCutFiles(compiled.sheets, { title: kit.name })); // T3
  try { files.push(...kitPrintCutFiles(compiled, kit)); } catch (e) { console.warn('print-then-cut skipped:', e); } // T3: never block the kit
  files.push({ name: 'assembly-guide.html', data: guideHTML(kit, compiled) });
  if (compiled.lighting?.enabled && compiled.lighting.leds.length) files.push({ name: 'led-map.svg', data: ledMapSVG(compiled, { standalone: true }) });
  if (shoppingFile(compiled.lighting)) files.push(shoppingFile(compiled.lighting)); // [T5] shopping list
  files.push({ name: 'kit.json', data: JSON.stringify(kit, null, 2) });
  files.push({
    name: 'README.txt',
    data: `${kit.name}\n\nOpen assembly-guide.html in a browser for the parts list, Design Space steps and assembly instructions.\n${cut.readme}kit.json re-opens this design in mimimaker.\n\n${zipFileList([...files, { name: 'README.txt' }])}`, // T3 file list
  });
  download(`${slug(kit.name)}.zip`, makeZip(files), 'application/zip');
}

async function shareLink() {
  closePops();
  const pop = $('#share-pop');
  pop.hidden = false;
  $('#share-url').value = '';
  $('#share-url').placeholder = 'Making link…';
  $('#share-note').textContent = '';
  $('#share-summary').textContent = shareSummary(kit); // T7
  pop.querySelector('.share-warn')?.remove();
  const url = location.href.split('#')[0] + await shareHash(kit);
  const long = linkSizeNote(url.length); // T7: some apps cut long links
  if (long) $('#share-note').after(h('p', { class: 'hint share-warn', role: 'note' }, long));
  $('#share-url').value = url;
  $('#share-url').select();
  try { await navigator.clipboard.writeText(url); $('#share-note').textContent = 'Copied. Anyone with the link gets their own copy of this design.'; } catch {
    $('#share-note').textContent = 'Copy the link above. Anyone with it gets their own copy of this design.';
  }
  if (inArtifact) $('#share-note').textContent += ' Links open in the website version of mimimaker.';
}

// ------------------------------------------------------------------ start
// T7: a room started from Start is not a remix, so it drops the remix credit.
function freshRoom(next) { delete next.origin; return next; }
function replaceKit(next, message) {
  kit = next;
  resetZoom(); // T6: a new room starts in its fitted view
  $('#kit-name').value = kit.name;
  view.sel = null;
  thumbCache.clear();
  closeDrawer();
  if ($('#start').open) $('#start').close();
  restructured();
  toast(message, { action: ['Undo', undo] });
}

function buildStart() {
  const dlg = $('#start');
  const cards = ROOM_TYPES.map((rt) => h('button', {
    class: 'rt-card', type: 'button', 'aria-label': `Start from ${rt.name}`, 'data-room': rt.id,
    onclick: () => replaceKit(freshRoom(applyRoomType(kit, rt.id)), `${rt.name} loaded. Click any piece to change it.`),
  }, h('span', { class: 'thumb' }), h('strong', {}, rt.name), h('span', { class: 'rt-blurb' }, rt.blurb)));
  const blank = h('button', {
    id: 'start-blank', class: 'rt-card blank', type: 'button',
    onclick: () => {
      const next = structuredClone(kit);
      Object.assign(next, { name: 'My room', items: [], openings: [], shell: null });
      delete next.roomType;
      next.lighting = { ...next.lighting, enabled: false, leds: [] };
      replaceKit(freshRoom(next), 'Blank room ready. Add pieces from the Pieces drawer.');
    },
  }, h('span', { class: 'thumb' }, ic('plus')), h('strong', {}, 'Blank room'), h('span', { class: 'rt-blurb' }, 'An empty box at the current size. Add your own pieces.'));
  dlg.replaceChildren(h('div', { class: 'start-inner' },
    h('div', { class: 'start-head' }, frag(MIMI.hello),
      h('div', {}, h('h2', {}, 'Make a tiny world'),
        h('p', {}, 'Pick a room to start from. It replaces the room, its furniture and lights; your scale, machine and materials stay.')),
      h('button', { type: 'button', class: 'mm-btn mm-btn--quiet mm-btn--icon', 'data-action': 'close', 'aria-label': 'Close', onclick: () => dlg.close() }, ic('close'))),
    h('div', { class: 'rt-grid' }, cards, blank),
    h('div', { class: 'start-foot' },
      h('label', { class: 'mm-btn', for: 'file-open' }, ic('sheets'), 'Open a file'),
      h('button', { type: 'button', class: 'mm-btn mm-btn--quiet', onclick: () => dlg.close() }, 'Keep my design'))));
}
function openStart() {
  closePops();
  const dlg = $('#start');
  for (const card of dlg.querySelectorAll('.rt-card[data-room]')) {
    const thumb = card.querySelector('.thumb');
    if (!thumb.firstChild) thumb.innerHTML = roomThumb(card.dataset.room);
  }
  dlg.showModal();
}

// ------------------------------------------------------------------- init
async function init() {
  const shared = kitFromHash(location.hash);
  if (shared) {
    try {
      kit = normalizeKit(await decodeKit(shared));
      setTimeout(() => toast(openedSharedText(kit)), 0); // T7
    } catch {
      setTimeout(() => toast('That share link is damaged, so your last design was opened instead.', 'error'), 0);
    }
    try { window.history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
  }
  window.mimimaker = { get kit() { return kit; }, get compiled() { return compiled; }, refresh: () => restructured() };

  $('#brand-mark').innerHTML = MARK;
  document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
  buildStart();

  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.checks-wrap, .menu-wrap, #share-pop, #btn-share')) closePops();
  });
  document.querySelectorAll('.mm-steps [data-step]').forEach((b) => b.addEventListener('click', () => setStep(b.dataset.step)));
  $('#checks').addEventListener('click', () => { const open = $('#checks-pop').hidden; closePops(); togglePop($('#checks'), $('#checks-pop'), open); });
  $('#btn-file').addEventListener('click', () => { const open = $('#file-menu').hidden; closePops(); togglePop($('#btn-file'), $('#file-menu'), open); });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-share').addEventListener('click', shareLink);
  $('#share-close').addEventListener('click', () => { $('#share-pop').hidden = true; });
  $('#share-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#share-url').value); $('#share-note').textContent = 'Copied.'; } catch { $('#share-url').select(); }
  });
  $('#rail-pieces').addEventListener('click', () => ($('#drawer').hidden ? openDrawer() : closeDrawer()));
  $('#rail-window').addEventListener('click', () => addOpening('window'));
  $('#rail-room').addEventListener('click', () => { closeDrawer(); select(null); });

  const nameInput = $('#kit-name');
  nameInput.value = kit.name;
  nameInput.addEventListener('input', () => { kit.name = nameInput.value; changed(); });
  $('#btn-new').addEventListener('click', openStart);
  $('#btn-submit').addEventListener('click', () => { closePops(); openSubmitDialog($('#submit'), kit, { h, download, ic }); }); // T7
  $('#btn-bundle').addEventListener('click', () => { closePops(); openBundleDialog($('#bundle'), kit, { h, download, ic, bundle: creatorBundle, zip: makeZip }); }); // T7
  $('#btn-save').addEventListener('click', () => { closePops(); download(`${slug(kit.name)}.json`, JSON.stringify(kit, null, 2), 'application/json'); });
  $('#file-open').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    closePops();
    try {
      replaceKit(normalizeKit(unwrapKitFile(JSON.parse(await file.text()))), `Opened ${file.name}.`); // T7: kits/ files open too
    } catch (err) {
      toast(`That file couldn't be opened: ${err.message}`, 'error');
    }
    e.target.value = '';
  });
  syncTab();
  update({ sidebar: true });
}

init();
