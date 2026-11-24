// T5 lighting UI: supply and mount pickers, effect fields and the circuit card.
// Pure helpers (options, set*, circuitSummaryModel, effectFieldSpecs) are
// tested in Node; the render functions need a DOM.

import { SUPPLIES } from '../lighting/circuit.js';
import { EFFECTS, effectOf } from '../lighting/effects.js';

export const SUPPLY_OPTIONS = [
  ['aa2', '2×AA battery box'],
  ['aaa2', '2×AAA battery box'],
  ['cr2032', 'CR2032 coin cell'],
  ['usb', 'USB lead (5 V)'],
];

/** Set the supply on kit.lighting.power, keeping the older `kind` in step. */
export function setSupply(power, id) {
  const supply = SUPPLIES[id] ? id : 'aa2';
  power.supply = supply;
  power.kind = supply === 'usb' ? 'usb' : 'battery';
  return power;
}

/** Plain data for the summary card, or null when there is nothing to show. */
export function circuitSummaryModel(circuit) {
  if (!circuit || !circuit.count) return null;
  const { supply, budget, totalMA, averageMA, lifeHours, lifeText, count } = circuit;
  const avg = averageMA < totalMA ? ` (about ${round(averageMA)} mA on average)` : '';
  return {
    status: circuit.status,
    title: supply.name,
    rows: [
      circuit.devices ? ['Parts', `${circuit.what}, wired in parallel`] : ['LEDs', `${count}, wired in parallel`],
      ['Current', `up to ${round(totalMA)} mA${avg} · ${budget.recommendedMA} mA comfortable, ${budget.maxMA} mA max`],
      ['Battery life', lifeHours == null ? lifeText : `${lifeText} of ${circuit.devices ? 'running' : 'light'} (estimate)`],
    ],
    load: Math.min(1, circuit.load),
    messages: circuit.warnings.map((w) => w.msg),
    note: circuit.estimateNote,
  };
}

const round = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ DOM

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}

const CSS = `
.t5-circuit { background: var(--panel); border: 2px dashed var(--line-control, var(--line)); border-radius: var(--radius-cut-md, var(--radius, 8px)); padding: 10px 12px; margin: 0 0 12px; font-size: 13px; }
.t5-circuit h3 { margin: 0 0 6px; font-size: 14px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.t5-circuit .t5-badge { font-size: 11px; padding: 1px 7px; border-radius: var(--radius-cut-sm, 999px); background: var(--success-soft); color: var(--success); border: 1.5px solid var(--success); text-transform: uppercase; letter-spacing: .04em; }
.t5-circuit[data-status=warn] .t5-badge { background: var(--warning-soft); color: var(--warning); border-color: var(--warning); }
.t5-circuit[data-status=error] .t5-badge { background: var(--danger-soft); color: var(--danger); border-color: var(--danger); }
.t5-circuit dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; margin: 0; }
.t5-circuit dt { color: var(--muted); }
.t5-circuit dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.t5-meter { height: 6px; border-radius: 3px; background: var(--line); margin: 8px 0; overflow: hidden; }
.t5-meter span { display: block; height: 100%; background: var(--success); }
.t5-circuit[data-status=warn] .t5-meter span { background: var(--warning); }
.t5-circuit[data-status=error] .t5-meter span { background: var(--danger); }
.t5-circuit ul { margin: 6px 0 0; padding-left: 18px; }
.t5-circuit .t5-note { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
`;
function ensureStyle() {
  if (document.getElementById('t5-style')) return;
  document.head.append(el('style', { id: 't5-style' }, CSS));
}

const STATUS_TEXT = { ok: 'OK', warn: 'Check', error: 'Too much' };

/** Summary card for the LED map tab. Returns null when there are no LEDs. */
export function renderCircuitSummary(circuit) {
  const m = circuitSummaryModel(circuit);
  if (!m) return null;
  ensureStyle();
  return el('section', { class: 't5-circuit', 'data-status': m.status, 'aria-label': 'Circuit summary' },
    el('h3', {}, `Circuit · ${m.title}`, el('span', { class: 't5-badge' }, STATUS_TEXT[m.status])),
    el('dl', {}, m.rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    el('div', { class: 't5-meter', role: 'meter', 'aria-label': 'Share of the supply\'s maximum current', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(m.load * 100) },
      el('span', { style: `width:${(m.load * 100).toFixed(1)}%` })),
    m.messages.length ? el('ul', {}, m.messages.map((t) => el('li', {}, t))) : null,
    el('p', { class: 't5-note' }, m.note));
}

/** Supply <select> for the lighting section. `onChange` runs after the kit is updated. */
export function renderSupplyField(power, onChange) {
  const current = SUPPLIES[power.supply] ? power.supply : (power.kind === 'usb' ? 'usb' : 'aa2');
  const sel = el('select', { 'data-t5': 'supply', onchange: (e) => { setSupply(power, e.target.value); onChange(); } },
    SUPPLY_OPTIONS.map(([v, text]) => {
      const o = el('option', { value: v }, text);
      o.selected = v === current;
      return o;
    }));
  return el('label', { class: 'field' }, 'Power', sel);
}

// ------------------------------------------------------------ effects

export const EFFECT_OPTIONS = Object.entries(EFFECTS).map(([id, e]) => [id, e.name]);
const EFFECT_KEYS = ['bulbs', 'lengthMm', 'ledsPerM', 'sizeMm'];

/** Set a light's effect: a different effect starts from its own defaults; the same one keeps what was typed. */
export function setEffect(led, id) {
  const effect = EFFECTS[id] ? id : 'steady';
  const defaults = EFFECTS[effect].defaults || {};
  // a new effect starts from its own defaults: a fairy string's 500 mm is not a
  // strip's length, nor a fan's blade span a turntable's platform
  const was = effectOf(led);
  const fresh = effect !== was;
  // ...but the sizes typed for the old effect are kept, so switching back gives them back
  const saved = { ...(led.effectSaved || {}) };
  if (fresh) {
    const old = EFFECTS[was]?.defaults || {};
    const typed = Object.fromEntries(EFFECT_KEYS.filter((k) => led[k] != null && led[k] !== old[k]).map((k) => [k, led[k]]));
    if (Object.keys(typed).length) saved[was] = typed;
    else delete saved[was];
  }
  for (const k of EFFECT_KEYS) if (fresh || !(k in defaults)) delete led[k];
  if (fresh && saved[effect]) { Object.assign(led, saved[effect]); delete saved[effect]; }
  for (const [k, v] of Object.entries(defaults)) if (led[k] == null) led[k] = v;
  if (Object.keys(saved).length) led.effectSaved = saved;
  else delete led.effectSaved;
  if (effect === 'steady') delete led.effect;
  else led.effect = effect;
  return led;
}

const FIELD_SPECS = {
  fairy: [
    { key: 'bulbs', label: 'Bulbs', min: 1, max: 100, step: 1 },
    { key: 'lengthMm', label: 'String length', min: 10, max: 5000, step: 10, unit: 'mm' },
  ],
  strip: [
    { key: 'lengthMm', label: 'Strip length', min: 5, max: 2000, step: 5, unit: 'mm' },
    { key: 'ledsPerM', label: 'LEDs per metre', min: 10, max: 240, step: 1 },
  ],
  fan: [{ key: 'sizeMm', label: 'Blade span', min: 20, max: 200, step: 5, unit: 'mm' }],
  turntable: [{ key: 'sizeMm', label: 'Platform', min: 20, max: 200, step: 5, unit: 'mm' }],
};
/** The number fields an effect needs (real product sizes, not scaled). */
export const effectFieldSpecs = (led) => FIELD_SPECS[effectOf(led)] || [];

/**
 * Effect select plus its fields, built with the app's own field helpers so they
 * match the inspector. ui: { selectField, numberField, changed, restructured }
 */
export function renderEffectFields(led, ui) {
  const sel = ui.selectField('Effect', effectOf(led), EFFECT_OPTIONS, (v) => { setEffect(led, v); ui.restructured(); });
  sel.querySelector('select')?.setAttribute('data-t5', 'effect');
  const fields = effectFieldSpecs(led).map((f) => {
    const field = ui.numberField(f.label, led[f.key] ?? EFFECTS[effectOf(led)].defaults[f.key], (v) => { led[f.key] = v; ui.changed(); }, f);
    field.querySelector('input')?.setAttribute('data-t5', f.key);
    return field;
  });
  const wrap = el('div', { class: 't5-effect' }, sel);
  if (fields.length) wrap.append(el('div', { class: 'grid2' }, fields));
  wrap.append(el('p', { class: 'hint' }, EFFECTS[effectOf(led)].blurb));
  return wrap;
}

// ------------------------------------------------------------ power mount

export const MOUNT_OPTIONS = [
  ['outside', 'Glued on the outside'],
  ['flush', 'Flush behind the wall (cut-outs)'],
  ['base', 'Hidden base under the room (hatch + switch)'],
];

/** Set how the power box is mounted; 'outside' is the default and is stored as nothing. */
export function setMount(power, id) {
  if (id === 'flush' || id === 'base') power.mount = id;
  else delete power.mount;
  return power;
}

/** Mount <select> for the Power section. `onChange` runs after the kit is updated. */
export function renderMountField(power, onChange) {
  const current = power.mount === 'flush' || power.mount === 'base' ? power.mount : 'outside';
  const sel = el('select', { 'data-t5': 'mount', onchange: (e) => { setMount(power, e.target.value); onChange(); } },
    MOUNT_OPTIONS.map(([v, text]) => {
      const o = el('option', { value: v }, text);
      o.selected = v === current;
      return o;
    }));
  return el('label', { class: 'field' }, 'Mounting', sel);
}

// ------------------------------------------------------------ hidden base switch

export const SWITCH_AT_OPTIONS = [['front', 'Front, by the left corner'], ['left', 'Left side, near the front'], ['right', 'Right side, near the front']];
export const SWITCH_KIND_OPTIONS = [['touch', 'Touch switch'], ['board', 'Touch breakout (20 × 29 mm)'], ['push', 'Push switch (6 mm)']];

const pick = (key, label, options, current, onPick) => el('label', { class: 'field' }, label,
  el('select', { 'data-t5': key, onchange: (e) => onPick(e.target.value) }, options.map(([v, text]) => {
    const o = el('option', { value: v }, text);
    o.selected = v === current;
    return o;
  })));

/**
 * Switch fields for a hidden base (power.mount === 'base'): which panel the
 * switch goes in and what kind it is. Defaults (front, touch) are stored as nothing.
 * Returns null for other mounts.
 */
export function renderSwitchFields(power, onChange) {
  if (power.mount !== 'base') return null;
  const set = (key, v, dflt) => { if (v === dflt) delete power[key]; else power[key] = v; onChange(); };
  return el('div', { class: 'grid2' },
    pick('switch-at', 'Switch on', SWITCH_AT_OPTIONS, power.switchAt || 'front', (v) => set('switchAt', v, 'front')),
    pick('switch-kind', 'Switch', SWITCH_KIND_OPTIONS, power.switch || 'touch', (v) => set('switch', v, 'touch')));
}

// ------------------------------------------------------------ shopping list

/** "Shopping list" button for the Power section; `onDownload` saves the file. */
export function renderShoppingButton(onDownload) {
  return el('button', { type: 'button', class: 'mm-btn mm-btn--sm', 'data-t5': 'shopping', title: 'Parts to buy, with rough prices (CSV)', onclick: onDownload }, 'Shopping list');
}

// ------------------------------------------------------------ cable cover

/**
 * Turn the back-wall cable cover on or off; off is stored as nothing. Turning
 * it on moves a power box glued to the back wall into `range` (from
 * compiled.lighting.coverRange) so the cover opens without a warning, and
 * remembers where it was; turning it off again puts the box back there, unless
 * it has been moved since. Returns the move made, { from, to } in [pos, elev],
 * or null.
 */
export function setCover(lighting, on, range) {
  const p = lighting.power;
  const glued = p && (p.wall || 'back') === 'back' && p.mount !== 'flush' && p.mount !== 'base';
  if (!on) {
    const moved = lighting.cover?.moved;
    delete lighting.cover;
    if (moved && glued && p.pos === moved.to[0] && p.elev === moved.to[1]) {
      put(p, moved.from);
      return { from: moved.to, to: moved.from };
    }
    return null;
  }
  const { moved: _old, ...rest } = lighting.cover || {};
  lighting.cover = { ...rest, enabled: true };
  if (!range || !glued) return null;
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v ?? lo));
  const from = [p.pos ?? 0, p.elev ?? 0]; // where the box is drawn when it has no position yet
  const to = [clamp(p.pos, range.pos), clamp(p.elev, range.elev)];
  if (from[0] === to[0] && from[1] === to[1]) return null;
  put(p, to);
  lighting.cover.moved = { from, to };
  return { from, to };
}
const put = (p, [pos, elev]) => { p.pos = pos; p.elev = elev; };

/** Plain words for a power box move made by setCover, for a toast. */
export function coverMoveText(move, on) {
  if (!move) return null;
  const [pos, elev] = move.to;
  return on
    ? `Moved the power box to ${pos} cm along, ${elev} cm up, so the cover fits round it.`
    : `Moved the power box back to ${pos} cm along, ${elev} cm up.`;
}

/**
 * "Hide wires behind a cover" checkbox, built with the app's checkField.
 * ui: { checkField, restructured, range (or a function giving it, read on change), toast? }
 */
export function renderCoverField(lighting, ui) {
  const field = ui.checkField('Hide wires behind a cover (back wall)', !!lighting.cover?.enabled, (v) => {
    const text = coverMoveText(setCover(lighting, v, typeof ui.range === 'function' ? ui.range() : ui.range), v);
    ui.restructured();
    if (text) ui.toast?.(text);
  });
  field.querySelector('input')?.setAttribute('data-t5', 'cover');
  return field;
}
