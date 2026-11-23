// Bridge between shells and the kit compiler (src/kit.js).
//
// `kit.shell = { type, gap: { w, h, d }, clearance, params }` swaps the room
// box for a shell. The shell is cut from the room's structure board. Its
// interior becomes the kit's effective room (real cm), so the floor plan,
// furniture, openings, overlays and LED holes keep working inside a
// furnishable shell such as the plain nook. Shells that are the whole scene
// (the alley) set the room contents aside with a note.

import { SHELLS, shellSize, buildShell } from './index.js';
import { ellipsePoly } from '../geometry.js';
import { LED_COLORS } from '../lighting.js';

/**
 * The kit as the compiler should see it with its shell: effective room,
 * resolved board material and spec. Null when the kit has no shell.
 * Throws if the shell can't be sized (e.g. the gap is too small).
 */
export function shellRoom(kit) {
  const spec = kit?.shell;
  const def = spec && SHELLS[spec.type];
  if (!def) return null;
  const notes = [];
  let mat = kit.materials.find((m) => m.id === kit.room.material);
  if (!mat || mat.kind !== 'board') {
    const board = kit.materials.find((m) => m.kind === 'board');
    if (!board) throw new Error('Shells are cut from board, and this kit has no board material — add one in Materials.');
    notes.push({ level: 'warn', msg: `Shells are cut from board, so the shell uses ${board.name} instead of ${mat?.name || kit.room.material}.` });
    mat = board;
  }
  const t = mat.thickness;
  const { W, H, D } = shellSize(spec);
  const cm = (mm) => (mm * kit.scale) / 10;
  const room = { ...kit.room, material: mat.id, width: cm(W - 2 * t), depth: cm(D - t), height: cm(H - 2 * t), ceiling: true };
  const out = { ...kit, room };
  if (!def.furnishable) {
    const setAside = [];
    if (kit.items?.length) setAside.push(`${kit.items.length} piece${kit.items.length > 1 ? 's' : ''} of furniture`);
    if (kit.openings?.length) setAside.push('windows and doors');
    if (kit.lighting?.enabled && kit.lighting.leds?.length) setAside.push('the room LEDs');
    out.items = [];
    out.openings = [];
    out.lighting = { ...kit.lighting, enabled: false, leds: [] };
    room.wallpaper = { ...room.wallpaper, enabled: false };
    room.floor = { ...room.floor, enabled: false };
    if (setAside.length) {
      const list = setAside.length > 1 ? `${setAside.slice(0, -1).join(', ')} and ${setAside.at(-1)}` : setAside[0];
      notes.push({ level: 'info', msg: `The ${def.label.toLowerCase()} is the whole scene, so the room's ${list} are left out while it's on. They come back when you switch the shell off.` });
    }
  }
  return { kit: out, room, spec: { ...spec, material: mat.id }, def, notes };
}

/** shellRoom for the compiler: reports problems as warnings instead of throwing. */
export function prepareShell(kit, warn) {
  let prep = null;
  try {
    prep = shellRoom(kit);
  } catch (err) {
    warn(err.message, 'error');
    return null;
  }
  for (const n of prep?.notes || []) warn(n.msg, n.level);
  return prep;
}

/**
 * Build the shell and add its parts through the compiler's own helpers.
 * Returns what the rest of the app needs: joints by part id and LED spots.
 */
export function compileShell(prep, { t, fingerWidth, holes, getMat, newGroup, addPart, add3d, warn, xf }) {
  let sh;
  try {
    sh = buildShell(prep.spec, { t, fingerWidth, holes });
  } catch (err) {
    warn(err.message, 'error');
    return { type: prep.spec.type, joints: [], lights: [] };
  }
  for (const w of sh.warnings) warn(w.msg, w.level);
  const groups = new Map(), ids = new Map();
  for (const p of sh.parts) {
    const mat = getMat(p.material, p.name);
    if (!groups.has(p.group)) groups.set(p.group, newGroup(p.group, mat));
    ids.set(p.key, addPart(groups.get(p.group), p.name, mat, p.polys, p.scores));
    add3d(0, p.polys, p.plane, xf, mat.color);
  }
  for (const s of sh.steps) groups.get(s.group)?.steps.push(s.text);
  // suggested LED spots glow in the preview until T5 plans their wiring (#16)
  for (const l of sh.lights) {
    const hex = LED_COLORS[l.color]?.hex || LED_COLORS.warm.hex;
    const plane = { o: l.p, U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] };
    add3d(1.7, [ellipsePoly(0, 0, 7, 7, 24)], plane, xf, hex, { opacity: 0.28, glow: true });
    add3d(1.8, [ellipsePoly(0, 0, 2, 2, 16)], plane, xf, hex, { glow: true });
  }
  return {
    type: sh.type,
    dims: sh.dims,
    joints: sh.joints.map((j) => ({ a: ids.get(j.a), b: ids.get(j.b), kind: j.kind })),
    lights: sh.lights,
  };
}
