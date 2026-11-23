// T2 UI: the book-nook shell panel in the sidebar.
//
// The app passes in its form helpers so the panel looks like the rest of the
// sidebar. Choosing a shell stores `kit.shell` and keeps `kit.room` in step
// with the shell's interior, so the floor plan and LED planner agree with it;
// switching the shell off puts the room's own size back.

import { SHELLS } from '../shells/index.js';
import { shellRoom, shellPower } from '../shells/kit.js';

export const DEFAULT_GAP = { w: 90, h: 230, d: 180 };

/** Copy the shell's effective room size into kit.room (no-op without a shell). */
export function syncShellRoom(kit) {
  let prep = null;
  try { prep = shellRoom(kit); } catch { return; } // the compiler reports bad sizes
  if (!prep) return;
  for (const k of ['width', 'depth', 'height', 'ceiling']) kit.room[k] = prep.room[k];
  // a shell that wires its own LEDs keeps the power box on its back wall, so the Power fields show where it is
  if (prep.def.wiredLights && kit.lighting) kit.lighting.power = shellPower(kit.lighting.power, prep.room);
}

/** Does this kit's shell place and wire its own LEDs (#16)? */
export const shellWiresLights = (kit) => !!(kit?.shell && SHELLS[kit.shell.type]?.wiredLights);

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

/**
 * Which Room box fields the shell takes over: `size` (width, depth, height,
 * ceiling) whenever a shell is on; `overlays` (wallpaper, floor) when the
 * shell is the whole scene. `note` explains it in the Room box section.
 */
export function roomLocks(kit) {
  const def = kit?.shell && SHELLS[kit.shell.type];
  if (!def) return { size: false, overlays: false, note: null };
  const overlays = !def.furnishable;
  const note = overlays
    ? 'Sized by the shell — change the shelf gap. Wallpaper and floor covering are off while the shell is the whole scene.'
    : 'Sized by the shell — change the shelf gap.';
  return { size: true, overlays, note };
}

const ROOM_SIZE_FIELDS = ['Width', 'Depth', 'Height', 'Ceiling'];
const ROOM_OVERLAY_FIELDS = ['Wallpaper', 'Floor covering'];

/** Disable the Room box fields a shell owns (found by their labels) and add the note. */
export function applyRoomLocks(kit, sectionEl, h) {
  const locks = roomLocks(kit);
  if (!locks.note) return;
  const labelled = (names) => [...sectionEl.querySelectorAll('label')]
    .filter((l) => l.querySelector('input') && names.some((n) => l.textContent.trim().startsWith(n)));
  const lock = (labels, withPicker = false) => labels.forEach((l) => {
    const input = l.querySelector('input');
    input.disabled = true;
    // overlays are off under a whole-scene shell: show that, but leave the
    // room's own setting alone so it returns with the room
    if (withPicker) input.checked = false;
    // each overlay checkbox is followed by its material picker
    const picker = withPicker && l.nextElementSibling?.querySelector('select');
    if (picker) picker.disabled = true;
  });
  if (locks.size) lock(labelled(ROOM_SIZE_FIELDS));
  if (locks.overlays) lock(labelled(ROOM_OVERLAY_FIELDS), true);
  sectionEl.querySelector('.section-body')?.prepend(h('p', { class: 'hint', 'data-room-lock': '' }, locks.note));
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
        if (p.type === 'material') {
          const opts = kit.materials.filter((m) => m.kind !== 'fabric').map((m) => [m.id, m.name]);
          return tag(selectField(p.label, value, opts, set), 'data-shell-param', p.key);
        }
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

/**
 * Room box roof controls, appended to the Room section (not while a shell is
 * on: shells bring their own roof options). `ui` = { h, numberField, checkField, changed, restructured }.
 */
export function appendRoofControls(kit, sectionEl, ui) {
  if (kit.shell) return;
  const { h, numberField, checkField, changed, restructured } = ui;
  const roof = kit.room.roof?.type === 'gable' ? kit.room.roof : null;
  const row = h('div', { class: 'grid2' },
    tag(checkField('Gable roof', !!roof, (v) => { kit.room.roof = v ? { type: 'gable', pitch: 40 } : null; restructured(); }), 'data-room-roof', 'gable'),
    roof ? tag(numberField('Roof pitch', roof.pitch, (v) => { roof.pitch = Math.max(20, Math.min(60, v)); changed(); },
      { min: 20, max: 60, step: 5, unit: '°' }), 'data-room-roof', 'pitch') : h('span'));
  const body = sectionEl.querySelector('.section-body') || sectionEl;
  const hint = body.querySelector(':scope > p.hint:last-child');
  hint ? body.insertBefore(row, hint) : body.append(row);
}
