// T2 UI: the book-nook shell panel in the sidebar.
//
// The app passes in its form helpers so the panel looks like the rest of the
// sidebar. Choosing a shell stores `kit.shell` and keeps `kit.room` in step
// with the shell's interior, so the floor plan and LED planner agree with it;
// switching the shell off puts the room's own size back.

import { SHELLS } from '../shells/index.js';
import { shellRoom } from '../shells/kit.js';

export const DEFAULT_GAP = { w: 90, h: 230, d: 180 };

/** Copy the shell's effective room size into kit.room (no-op without a shell). */
export function syncShellRoom(kit) {
  let prep = null;
  try { prep = shellRoom(kit); } catch { return; } // the compiler reports bad sizes
  if (!prep) return;
  for (const k of ['width', 'depth', 'height', 'ceiling']) kit.room[k] = prep.room[k];
}

export function setShellType(kit, type) {
  if (!type) {
    const before = kit.shell?.roomBefore;
    if (before) Object.assign(kit.room, before);
    kit.shell = null;
    return;
  }
  if (kit.shell) {
    kit.shell = { ...kit.shell, type, params: {} };
  } else {
    const { width, depth, height, ceiling } = kit.room;
    kit.shell = { type, gap: { ...DEFAULT_GAP }, clearance: 2, params: {}, roomBefore: { width, depth, height, ceiling } };
  }
  syncShellRoom(kit);
}

const tag = (field, key, value) => {
  field.querySelector('input, select')?.setAttribute(key, value);
  return field;
};

/** The sidebar section. `ui` = { h, section, numberField, selectField, checkField, changed, restructured }. */
export function shellSection(kit, ui) {
  const { h, section, numberField, selectField, checkField, changed, restructured } = ui;
  const sh = kit.shell;
  const def = sh && SHELLS[sh.type];
  const edit = (fn) => (v) => { fn(v); syncShellRoom(kit); changed(); };
  const body = [
    tag(selectField('Shape', sh?.type || '', [['', 'None (plain room box)'], ...Object.entries(SHELLS).map(([k, d]) => [k, d.label])],
      (v) => { setShellType(kit, v); restructured(); }), 'data-shell', 'type'),
  ];
  if (def) {
    body.push(
      h('p', { class: 'hint' }, 'Measure the shelf gap it slides into. The shell is cut from the structure board and replaces the room box; its inside becomes the room.'),
      h('div', { class: 'grid3' },
        ...[['w', 'Gap width'], ['h', 'Gap height'], ['d', 'Gap depth']].map(([k, label]) => tag(
          numberField(label, sh.gap[k], edit((v) => { sh.gap[k] = v; }), { min: 20, unit: 'mm' }), 'data-shell-gap', k))),
      numberField('Clearance', sh.clearance ?? 2, edit((v) => { sh.clearance = Math.max(0, v); }), { min: 0, max: 10, step: 0.5, unit: 'mm' }),
    );
    if (def.params.length) {
      body.push(h('div', { class: 'grid2' }, def.params.map((p) => {
        const value = sh.params?.[p.key] ?? def.defaults[p.key];
        const set = edit((v) => { sh.params = { ...sh.params, [p.key]: v }; });
        if (p.type === 'bool') return tag(checkField(p.label, value, set), 'data-shell-param', p.key);
        return tag(numberField(p.label, value, (v) => set(p.type === 'int' ? Math.round(v) : v),
          { min: p.min, max: p.max, step: p.step ?? 1, unit: p.unit }), 'data-shell-param', p.key);
      })));
    }
    if (!def.furnishable) body.push(h('p', { class: 'hint' }, 'This shell is the whole scene: furniture, windows and room LEDs are set aside while it is on.'));
  }
  const el = section('Book nook shell', body);
  el.dataset.panel = 'shell';
  return el;
}
