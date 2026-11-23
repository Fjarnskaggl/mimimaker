// UI controller: edits the kit object, recompiles, and renders the views.

import { compileKit } from './kit.js';
import { CATALOG, THEMES, defaultKit, defaultMaterialFor } from './catalog.js';
import { ROOM_TYPES, applyRoomType } from './templates.js';
import { LED_COLORS, POWER_KINDS } from './lighting.js';
import { ledMapSVG, ledRows } from './ledmap.js';
import { DEFAULT_MATERIALS, MACHINES, SCALES } from './materials.js';
import { renderScene } from './preview3d.js';
import { sheetCutSVG, sheetPreviewSVG, sheetFileName, LAYER_COLORS } from './svg.js';
import { guideHTML } from './guide.js';
import { makeZip } from './zip.js';

const STORE_KEY = 'mimimaker.kit.v1';
const $ = (sel) => document.querySelector(sel);

let kit = loadKit() || defaultKit();
let compiled = null;
const view = { tab: 'preview', yaw: -32, pitch: 26, theme: 'Basics' };
const openCards = new WeakSet(); // item / LED cards the viewer expanded

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
function section(title, body, { open = true, count } = {}) {
  return h('details', { class: 'section', open }, h('summary', {}, title, count != null ? h('span', { class: 'count' }, count) : null), h('div', { class: 'section-body' }, body));
}
const matOptions = (filter = () => true) => kit.materials.filter(filter).map((m) => [m.id, m.name]);
const titleCase = (s) => s[0].toUpperCase() + s.slice(1);

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

function toast(msg, level = 'info') {
  const el = h('div', { class: `warn ${level} toast`, role: 'status' }, msg);
  $('#warnings').prepend(el);
  setTimeout(() => el.remove(), 5000);
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
  try {
    compiled = compileKit(kit);
  } catch (err) {
    console.error(err);
    compiled = null;
    $('#warnings').replaceChildren(h('div', { class: 'warn error' }, `Couldn't build this kit: ${err.message}`));
    return;
  }
  saveKit();
  if (sidebar) renderSidebar();
  renderSummary();
  renderWarnings();
  renderView();
}
const changed = () => update();
const restructured = () => update({ sidebar: true });

// ----------------------------------------------------------------- sidebar
function renderSidebar() {
  const sb = $('#sidebar');
  const scroll = sb.scrollTop;
  const openState = [...sb.querySelectorAll('details.section')].map((d) => d.open);
  sb.replaceChildren(roomTypesSection(), kitSection(), roomSection(), openingsSection(), itemsSection(), lightingSection(), materialsSection());
  sb.querySelectorAll('details.section').forEach((d, i) => { if (openState[i] != null) d.open = openState[i]; });
  sb.scrollTop = scroll;
}

function kitSection() {
  return section('Kit & machine', [
    h('div', { class: 'grid2' },
      selectField('Scale', kit.scale, SCALES.map((sc) => [sc, `1:${sc}`]), (v) => { kit.scale = Number(v); changed(); }),
      selectField('Cutting machine', kit.machine, Object.entries(MACHINES).map(([k, m]) => [k, m.name]), (v) => { kit.machine = v; changed(); }),
      numberField('Finger width (0 = auto)', kit.fingerWidth, (v) => { kit.fingerWidth = Math.max(0, v); changed(); }, { min: 0, max: 30, step: 0.5, unit: 'mm' }),
      numberField('Glue tab width', kit.tabWidth, (v) => { kit.tabWidth = Math.max(1, v); changed(); }, { min: 1, max: 15, step: 0.5, unit: 'mm' }),
    ),
    checkField('Draw part numbers with a Cricut pen', kit.drawLabels, (v) => { kit.drawLabels = v; changed(); }),
    h('p', { class: 'hint' }, 'All sizes below are real-world centimetres; the scale shrinks them to model size.'),
  ], { open: false });
}

function roomSection() {
  const r = kit.room;
  return section('Room box', [
    h('div', { class: 'grid3' },
      numberField('Width', r.width, (v) => { r.width = v; changed(); }, { min: 20, unit: 'cm' }),
      numberField('Depth', r.depth, (v) => { r.depth = v; changed(); }, { min: 20, unit: 'cm' }),
      numberField('Height', r.height, (v) => { r.height = v; changed(); }, { min: 20, unit: 'cm' }),
    ),
    selectField('Structure material', r.material, matOptions((m) => m.kind !== 'fabric'), (v) => { r.material = v; changed(); }),
    checkField('Ceiling', r.ceiling, (v) => { r.ceiling = v; changed(); }),
    h('div', { class: 'grid2' },
      checkField('Wallpaper', r.wallpaper.enabled, (v) => { r.wallpaper.enabled = v; changed(); }),
      selectField('', r.wallpaper.material, matOptions((m) => m.kind === 'card'), (v) => { r.wallpaper.material = v; changed(); }),
      checkField('Floor covering', r.floor.enabled, (v) => { r.floor.enabled = v; changed(); }),
      selectField('', r.floor.material, matOptions((m) => m.kind !== 'board' || m.thickness <= 1), (v) => { r.floor.material = v; changed(); }),
    ),
    selectField('Window & door trim material', r.trimMaterial, matOptions((m) => m.kind !== 'fabric'), (v) => { r.trimMaterial = v; changed(); }),
  ]);
}

const OPENING_KINDS = [['window', 'Window'], ['arch', 'Arched window'], ['round', 'Round window'], ['door', 'Door'], ['archdoor', 'Arched door']];
const WALL_OPTIONS = [['back', 'Back wall'], ['left', 'Left wall'], ['right', 'Right wall']];

function openingsSection() {
  const cards = kit.openings.map((o, i) => {
    const door = o.kind === 'door' || o.kind === 'archdoor';
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('strong', {}, `${OPENING_KINDS.find((k) => k[0] === o.kind)?.[1] || o.kind}`),
        h('span', { class: 'badge' }, `${o.wall} wall`),
        h('button', { class: 'small ghost danger', type: 'button', 'aria-label': 'Remove opening', onclick: () => { kit.openings.splice(i, 1); restructured(); } }, 'Remove')),
      h('div', { class: 'grid2' },
        selectField('Wall', o.wall, WALL_OPTIONS, (v) => { o.wall = v; restructured(); }),
        selectField('Type', o.kind, OPENING_KINDS, (v) => { o.kind = v; restructured(); })),
      h('div', { class: 'grid2' },
        numberField(o.wall === 'back' ? 'Centre from left' : 'Centre from front', o.pos, (v) => { o.pos = v; changed(); }, { min: 0, unit: 'cm' }),
        door ? h('span') : numberField('Sill height', o.sill, (v) => { o.sill = v; changed(); }, { min: 0, unit: 'cm' }),
        numberField('Width', o.width, (v) => { o.width = v; changed(); }, { min: 5, unit: 'cm' }),
        numberField('Height', o.height, (v) => { o.height = v; changed(); }, { min: 5, unit: 'cm' })),
      checkField('Add a trim frame', o.trim, (v) => { o.trim = v; changed(); }));
  });
  return section('Windows & doors', [
    ...cards,
    h('div', { class: 'add-row' },
      h('button', { type: 'button', onclick: () => { kit.openings.push({ wall: 'back', kind: 'window', pos: kit.room.width / 2, sill: 90, width: 60, height: 90, trim: true }); restructured(); } }, '+ Window'),
      h('button', { type: 'button', onclick: () => { kit.openings.push({ wall: 'right', kind: 'door', pos: kit.room.depth / 2, sill: 0, width: 80, height: 200, trim: true }); restructured(); } }, '+ Door')),
  ], { count: kit.openings.length });
}

// --------------------------------------------------------- thumbnails
const thumbCache = new Map();
function itemThumb(type) {
  const def = CATALOG[type];
  const material = defaultMaterialFor(def, kit.materials);
  const key = `${type}|${kit.materials.find((m) => m.id === material)?.color}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  let svg = '';
  try {
    const big = { ...kit.room, width: 1500, depth: 1500, height: 1500, ceiling: false, wallpaper: { enabled: false, material: 'paper' }, floor: { enabled: false, material: 'card65' } };
    const c = compileKit({ ...kit, room: big, openings: [], lighting: { enabled: false }, items: [{ type, params: { ...def.defaults }, material, x: 0, y: 0, rot: 0, wall: 'back', pos: 750, elev: 400 }] });
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

/** Run `action` on the second click within 3 s (confirm() is unavailable in sandboxed views). */
function confirmTwice(el, action) {
  if (el.classList.contains('armed')) { el.classList.remove('armed'); action(); return; }
  document.querySelectorAll('.armed').forEach((b) => b.classList.remove('armed'));
  el.classList.add('armed');
  setTimeout(() => el.classList.remove('armed'), 3000);
}

function roomTypesSection() {
  const cards = ROOM_TYPES.map((rt) => h('button', {
    class: 'rt-card', type: 'button', 'aria-label': `Start from ${rt.name}`,
    onclick: (e) => confirmTwice(e.currentTarget, () => {
      kit = applyRoomType(kit, rt.id);
      $('#kit-name').value = kit.name;
      thumbCache.clear();
      restructured();
      toast(`Loaded the ${rt.name.toLowerCase()} — everything is editable below.`);
    }),
  },
  h('span', { class: 'thumb', html: roomThumb(rt.id) }),
  h('strong', {}, rt.name),
  h('span', { class: 'rt-blurb' }, rt.blurb),
  h('span', { class: 'rt-confirm' }, 'Click again to replace your design')));
  return section('Room types', [
    h('p', { class: 'hint' }, 'Start from a furnished room. It replaces the room, furniture and lights; your scale, machine and materials stay.'),
    h('div', { class: 'rt-grid' }, cards),
  ], { open: false });
}

function cardDetails(obj, summary, body) {
  const d = h('details', { class: 'card', open: openCards.has(obj) }, h('summary', { class: 'card-head' }, summary), h('div', { class: 'card-body' }, body));
  d.addEventListener('toggle', () => (d.open ? openCards.add(obj) : openCards.delete(obj)));
  return d;
}

function itemsSection() {
  const cards = kit.items.map((item, i) => {
    const def = CATALOG[item.type];
    if (!def) return h('div', { class: 'card' }, `Unknown item ${item.type}`);
    item.params ||= {};
    const params = def.params.map((p) => {
      const val = item.params[p.key] ?? def.defaults[p.key];
      if (p.type === 'select') return selectField(p.label, val, p.options.map((o) => [o, titleCase(o)]), (v) => { item.params[p.key] = v; changed(); });
      return numberField(p.label, val, (v) => { item.params[p.key] = v; changed(); }, { min: p.min, max: p.max, step: p.step, unit: p.unit });
    });
    const placement = def.placement === 'wall'
      ? [selectField('Wall', item.wall || 'back', WALL_OPTIONS, (v) => { item.wall = v; changed(); }),
        numberField('Centre along wall', item.pos ?? 0, (v) => { item.pos = v; changed(); }, { min: 0, unit: 'cm' }),
        numberField('Centre height', item.elev ?? 0, (v) => { item.elev = v; changed(); }, { min: 0, unit: 'cm' })]
      : [numberField('From left wall', item.x ?? 0, (v) => { item.x = v; changed(); }, { min: 0, unit: 'cm' }),
        numberField('From back wall', item.y ?? 0, (v) => { item.y = v; changed(); }, { min: 0, unit: 'cm' }),
        selectField('Rotation', item.rot || 0, [[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']], (v) => { item.rot = Number(v); changed(); })];
    const matFilter = def.mat === 'fabric' ? () => true : (m) => m.kind !== 'fabric';
    const mat = kit.materials.find((m) => m.id === item.material);
    return cardDetails(item, [
      h('span', { class: 'sw', style: `background:${mat?.color || '#ccc'}` }),
      h('strong', {}, def.label),
      h('span', { class: 'badge' }, def.group),
    ], [
      h('div', { class: 'grid2' }, params),
      selectField('Material', item.material, matOptions(matFilter), (v) => { item.material = v; restructured(); }),
      h('div', { class: 'grid3' }, placement),
      h('div', { class: 'card-actions' },
        h('button', { class: 'small', type: 'button', onclick: () => { const copy = structuredClone(item); kit.items.splice(i + 1, 0, copy); openCards.add(copy); restructured(); } }, 'Duplicate'),
        h('button', { class: 'small danger', type: 'button', onclick: () => { kit.items.splice(i, 1); restructured(); } }, 'Remove')),
    ]);
  });

  const addPiece = (type) => {
    const def = CATALOG[type];
    const item = { type, params: { ...def.defaults }, material: defaultMaterialFor(def, kit.materials) };
    if (def.placement === 'wall') Object.assign(item, { wall: 'back', pos: Math.round(kit.room.width / 2), elev: 150 });
    else Object.assign(item, { x: 10, y: 10, rot: 0 });
    kit.items.push(item);
    openCards.add(item);
    restructured();
    toast(`Added ${def.label.toLowerCase()} — set its position in the list above.`);
  };
  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Piece themes' }, THEMES.map((th) => h('button', {
    type: 'button', role: 'tab', class: 'chip', 'aria-selected': String(view.theme === th),
    onclick: () => { view.theme = th; renderSidebar(); },
  }, th)));
  const pieces = Object.entries(CATALOG).filter(([, d]) => d.group === view.theme).map(([type, d]) => h('button', {
    type: 'button', class: 'piece', title: `Add ${d.label}`, onclick: () => addPiece(type),
  }, h('span', { class: 'thumb', html: itemThumb(type) }), h('span', {}, d.label)));
  return section('Furniture & decor', [
    ...cards,
    h('div', { class: 'library' }, h('strong', { class: 'library-title' }, 'Add a piece'), chips, h('div', { class: 'piece-grid' }, pieces)),
  ], { count: kit.items.length });
}

function lightingSection() {
  const L = kit.lighting;
  const body = [checkField('Add LED lights', L.enabled, (v) => { L.enabled = v; restructured(); })];
  if (L.enabled) {
    const ledCards = L.leds.map((led, i) => {
      const place = led.mount === 'wall'
        ? [selectField('Wall', led.wall || 'back', WALL_OPTIONS, (v) => { led.wall = v; changed(); }),
          numberField('Along wall', led.pos ?? 0, (v) => { led.pos = v; changed(); }, { min: 0, unit: 'cm' }),
          numberField('Height', led.elev ?? 0, (v) => { led.elev = v; changed(); }, { min: 0, unit: 'cm' })]
        : [numberField('From left wall', led.x ?? 0, (v) => { led.x = v; changed(); }, { min: 0, unit: 'cm' }),
          numberField('From back wall', led.y ?? 0, (v) => { led.y = v; changed(); }, { min: 0, unit: 'cm' })];
      return cardDetails(led, [
        h('span', { class: 'led-dot', style: `background:${LED_COLORS[led.color]?.hex || LED_COLORS.warm.hex}` }),
        h('strong', {}, `L${i + 1}${led.name ? ` · ${led.name}` : ''}`),
        h('span', { class: 'badge' }, led.mount),
      ], [
        h('label', { class: 'field' }, 'Name', h('input', { value: led.name || '', oninput: (e) => { led.name = e.target.value; changed(); } })),
        h('div', { class: 'grid2' },
          selectField('Mounted on', led.mount, [['wall', 'Wall'], ['ceiling', 'Ceiling'], ['floor', 'Floor / in a lamp']], (v) => { led.mount = v; restructured(); }),
          selectField('Colour', led.color || 'warm', Object.entries(LED_COLORS).map(([k, c]) => [k, c.name]), (v) => { led.color = v; restructured(); })),
        h('div', { class: led.mount === 'wall' ? 'grid3' : 'grid2' }, place),
        h('div', { class: 'card-actions' }, h('button', { class: 'small danger', type: 'button', onclick: () => { L.leds.splice(i, 1); restructured(); } }, 'Remove')),
      ]);
    });
    const addLed = (mount) => {
      const led = { name: '', mount, color: 'warm' };
      if (mount === 'wall') Object.assign(led, { wall: 'back', pos: Math.round(kit.room.width / 2), elev: 180 });
      else Object.assign(led, { x: Math.round(kit.room.width / 2), y: Math.round(kit.room.depth / 2) });
      if (mount === 'ceiling' && !kit.room.ceiling) { kit.room.ceiling = true; toast('Turned on the ceiling for the ceiling light.'); }
      L.leds.push(led);
      openCards.add(led);
      restructured();
    };
    body.push(
      h('div', { class: 'grid2' },
        numberField('Wire hole', L.holeDiameter, (v) => { L.holeDiameter = Math.max(1, v); changed(); }, { min: 1, max: 8, step: 0.5, unit: 'mm' }),
        selectField('Power', L.power.kind, Object.keys(POWER_KINDS).map((k) => [k, k === 'usb' ? 'USB cable' : 'Battery box']), (v) => { L.power.kind = v; changed(); })),
      h('div', { class: 'grid3' },
        selectField('Power box on', L.power.wall, WALL_OPTIONS, (v) => { L.power.wall = v; changed(); }),
        numberField('Along wall', L.power.pos, (v) => { L.power.pos = v; changed(); }, { min: 0, unit: 'cm' }),
        numberField('Height', L.power.elev, (v) => { L.power.elev = v; changed(); }, { min: 0, unit: 'cm' })),
      ...ledCards,
      h('div', { class: 'add-row' },
        h('button', { type: 'button', onclick: () => addLed('wall') }, '+ Wall light'),
        h('button', { type: 'button', onclick: () => addLed('ceiling') }, '+ Ceiling light'),
        h('button', { type: 'button', onclick: () => addLed('floor') }, '+ Floor light')),
      h('p', { class: 'hint' }, 'Wall and floor positions match furniture: along-wall from the left (back wall) or front (side walls). The LED map tab shows each wire route.'),
    );
  }
  return section('Lighting', body, { count: L.enabled ? L.leds.length : null, open: false });
}

function materialsSection() {
  const rows = kit.materials.map((m) => h('div', { class: 'mat-row' },
    h('input', { type: 'color', value: m.color, 'aria-label': `${m.name} colour`, oninput: (e) => { m.color = e.target.value; changed(); } }),
    h('input', { value: m.name, 'aria-label': 'Material name', onchange: (e) => { m.name = e.target.value; restructured(); } }),
    h('input', { type: 'number', value: m.thickness, step: 0.05, min: 0.05, 'aria-label': `${m.name} thickness (mm)`, oninput: (e) => { const v = parseFloat(e.target.value); if (v > 0) { m.thickness = v; changed(); } } }),
    h('input', { type: 'number', value: m.sheet[0], step: 1, min: 20, 'aria-label': `${m.name} sheet width (mm)`, oninput: (e) => { const v = parseFloat(e.target.value); if (v > 20) { m.sheet[0] = v; changed(); } } }),
    h('input', { type: 'number', value: m.sheet[1], step: 1, min: 20, 'aria-label': `${m.name} sheet height (mm)`, oninput: (e) => { const v = parseFloat(e.target.value); if (v > 20) { m.sheet[1] = v; changed(); } } })));
  return section('Materials', [
    h('div', { class: 'mat-table' },
      h('div', { class: 'mat-row mat-head' }, h('span'), h('span', {}, 'Name'), h('span', {}, 'Thick mm'), h('span', {}, 'Sheet W'), h('span', {}, 'Sheet H')),
      rows),
    h('p', { class: 'hint' }, 'Measure your actual board with calipers — finger joints are sized from this thickness.'),
    h('button', { type: 'button', class: 'small ghost', onclick: () => { kit.materials = structuredClone(DEFAULT_MATERIALS); restructured(); } }, 'Reset materials'),
  ], { open: false });
}

// -------------------------------------------------------------------- main
function renderSummary() {
  const { dims, parts, sheets } = compiled;
  $('#summary').replaceChildren(
    h('span', {}, 'Model ', h('b', {}, `${dims.W.toFixed(0)} × ${dims.D.toFixed(0)} × ${dims.H.toFixed(0)} mm`)),
    h('span', {}, h('b', {}, parts.length), ' parts'),
    h('span', {}, h('b', {}, sheets.length), ` sheet${sheets.length === 1 ? '' : 's'}`),
  );
}

function renderWarnings() {
  $('#warnings').replaceChildren(...compiled.warnings.map((w) => h('div', { class: `warn ${w.level}` }, w.msg)));
}

function renderView() {
  document.querySelectorAll('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === view.tab)));
  const el = $('#view');
  if (view.tab === 'preview') renderPreview(el);
  else if (view.tab === 'sheets') renderSheets(el);
  else if (view.tab === 'ledmap') renderLedMap(el);
  else renderGuide(el);
}

function renderPreview(el) {
  let stage = el.querySelector('.stage');
  if (!stage) {
    stage = h('div', { class: 'stage' });
    const yaw = h('input', { type: 'range', min: -80, max: 80, value: view.yaw, 'aria-label': 'Rotate', oninput: (e) => { view.yaw = Number(e.target.value); drawScene(); } });
    const pitch = h('input', { type: 'range', min: 5, max: 80, value: view.pitch, 'aria-label': 'Tilt', oninput: (e) => { view.pitch = Number(e.target.value); drawScene(); } });
    el.replaceChildren(stage, h('div', { class: 'stage-tools' },
      h('label', {}, 'Rotate ', yaw), h('label', {}, 'Tilt ', pitch),
      h('span', {}, 'Drag the model to orbit. Colours follow the material swatches.')));
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
  }
  drawScene();
}
function drawScene() {
  const stage = document.querySelector('.stage');
  if (stage && compiled) stage.innerHTML = renderScene(compiled.faces3d, view);
}

function renderSheets(el) {
  const legend = h('div', { class: 'legend' },
    h('span', {}, h('i', { style: `border-color:${LAYER_COLORS.cut}` }), 'Cut'),
    h('span', {}, h('i', { style: `border-color:${LAYER_COLORS.score};border-top-style:dashed` }), 'Score / fold'),
    h('span', {}, 'Numbers match the assembly guide. Hover a part for details.'));
  const cards = compiled.sheets.map((s) => {
    const card = h('article', { class: 'sheet-card' },
      h('header', {},
        h('span', { class: 'sw', style: `background:${s.material.color}` }),
        h('strong', {}, `${s.material.name} · ${s.index}/${s.count}`),
        h('button', { class: 'small', type: 'button', onclick: () => download(sheetFileName(s), sheetCutSVG(s, { drawLabels: kit.drawLabels, title: `${kit.name} – ${s.material.name} ${s.index}` }), 'image/svg+xml') }, 'SVG')),
      h('div', { html: sheetPreviewSVG(s) }),
      h('div', { class: 'meta' }, `${s.w}×${s.h} mm · ${s.placements.length} parts: ${s.placements.map((p) => '#' + p.part.id).sort((a, b) => a.slice(1) - b.slice(1)).join(' ')}`));
    return card;
  });
  el.replaceChildren(legend, h('div', { class: 'sheets-grid' }, cards));
}

function renderLedMap(el) {
  if (!compiled.lighting?.enabled || !compiled.lighting.leds.length) {
    el.replaceChildren(h('div', { class: 'empty' },
      h('strong', {}, 'No lights yet'),
      h('p', {}, 'Add LEDs and mimimaker cuts their wire holes, plans each wire\'s route on the outside of the room and tells you how long the leads need to be.'),
      h('button', { type: 'button', class: 'primary', onclick: () => {
        kit.lighting.enabled = true;
        kit.lighting.leds.push({ name: 'Wall light', mount: 'wall', wall: 'back', pos: Math.round(kit.room.width / 2), elev: 180, color: 'warm' });
        restructured();
      } }, 'Add a wall light')));
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
      h('p', { class: 'hint' }, `Seen from behind the room, the side you wire on. ${compiled.lighting.holeDiameter.toFixed(1)} mm holes are pre-cut at each LED; run each wire along its line to the ${compiled.lighting.power.kind === 'usb' ? 'USB lead' : 'battery box'}.`),
      h('button', { class: 'small', type: 'button', onclick: () => download(`${slug(kit.name)}-led-map.svg`, ledMapSVG(compiled, { standalone: true }), 'image/svg+xml') }, 'SVG')),
    h('div', { class: 'map-wrap', html: ledMapSVG(compiled) }),
    table);
}

function renderGuide(el) {
  const html = guideHTML(kit, compiled);
  const frame = h('iframe', { class: 'guide-frame', title: 'Assembly guide' });
  frame.srcdoc = html;
  el.replaceChildren(
    h('div', { class: 'guide-tools' },
      inArtifact ? null : h('button', { type: 'button', onclick: () => frame.contentWindow?.print() }, 'Print guide'),
      h('button', { type: 'button', onclick: () => download(`${slug(kit.name)}-guide.html`, html, 'text/html') }, 'Download .html')),
    frame);
}

// ------------------------------------------------------------------ header
function exportZip() {
  const files = compiled.sheets.map((s) => ({
    name: `cut-files/${sheetFileName(s)}`,
    data: sheetCutSVG(s, { drawLabels: kit.drawLabels, title: `${kit.name} – ${s.material.name} ${s.index}` }),
  }));
  files.push({ name: 'assembly-guide.html', data: guideHTML(kit, compiled) });
  if (compiled.lighting?.enabled && compiled.lighting.leds.length) files.push({ name: 'led-map.svg', data: ledMapSVG(compiled, { standalone: true }) });
  files.push({ name: 'kit.json', data: JSON.stringify(kit, null, 2) });
  files.push({
    name: 'README.txt',
    data: `${kit.name}\n\nOpen assembly-guide.html in a browser for the parts list, Design Space steps and assembly instructions.\nUpload each SVG in cut-files/ to Cricut Design Space at its original size.\nkit.json re-opens this design in mimimaker.\n`,
  });
  download(`${slug(kit.name)}.zip`, makeZip(files), 'application/zip');
}

function init() {
  const nameInput = $('#kit-name');
  nameInput.value = kit.name;
  nameInput.addEventListener('input', () => { kit.name = nameInput.value; changed(); });
  // two-step confirm (window.confirm is unavailable in sandboxed views)
  let armed = null;
  $('#btn-new').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (!armed) {
      btn.textContent = 'Click again to reset';
      btn.classList.add('danger-armed');
      armed = setTimeout(() => { armed = null; btn.textContent = 'New'; btn.classList.remove('danger-armed'); }, 3000);
      return;
    }
    clearTimeout(armed); armed = null;
    btn.textContent = 'New'; btn.classList.remove('danger-armed');
    kit = defaultKit();
    nameInput.value = kit.name;
    restructured();
  });
  $('#btn-save').addEventListener('click', () => download(`${slug(kit.name)}.json`, JSON.stringify(kit, null, 2), 'application/json'));
  $('#btn-zip').addEventListener('click', exportZip);
  $('#file-open').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      kit = normalizeKit(JSON.parse(await file.text()));
      nameInput.value = kit.name;
      restructured();
    } catch (err) {
      toast(`That file couldn't be opened: ${err.message}`, 'error');
    }
    e.target.value = '';
  });
  document.querySelectorAll('.tabs [role=tab]').forEach((b) => b.addEventListener('click', () => {
    view.tab = b.dataset.tab;
    $('#view').replaceChildren();
    renderView();
  }));
  update({ sidebar: true });
}

init();
