// Bridge between shells and the kit compiler (src/kit.js).
//
// `kit.shell = { type, gap: { w, h, d }, clearance, params }` swaps the room
// box for a shell. The shell is cut from the room's structure board. Its
// interior becomes the kit's effective room (real cm), so the floor plan,
// furniture, openings, overlays and LED holes keep working inside a
// furnishable shell such as the plain nook. Shells that are the whole scene
// (the alley) set the room contents aside with a note.

import { SHELLS, shellSize, buildShell } from './index.js';
import { buildGableRoof } from './roof.js';
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
  const Hbox = def.boxHeight ? def.boxHeight({ W, H, t }, { ...def.defaults, ...(spec.params || {}) }) : H; // under any roof
  const room = { ...kit.room, material: mat.id, width: cm(W - 2 * t), depth: cm(D - t), height: cm(Hbox - 2 * t), ceiling: true };
  const out = { ...kit, room };
  if (!def.furnishable) {
    const setAside = [];
    if (kit.items?.length) setAside.push(`${kit.items.length} piece${kit.items.length > 1 ? 's' : ''} of furniture`);
    if (kit.openings?.length) setAside.push('windows and doors');
    if (kit.lighting?.enabled && kit.lighting.leds?.length) setAside.push('the room LEDs');
    out.items = [];
    out.openings = [];
    if (def.wiredLights) {
      // the shell's own LEDs replace the room's; the power box goes on the back wall
      out.lighting = { ...kit.lighting, leds: [], power: shellPower(kit.lighting?.power, room) };
    } else {
      out.lighting = { ...kit.lighting, enabled: false, leds: [] };
    }
    room.wallpaper = { ...room.wallpaper, enabled: false };
    room.floor = { ...room.floor, enabled: false };
    if (setAside.length) {
      const list = setAside.length > 1 ? `${setAside.slice(0, -1).join(', ')} and ${setAside.at(-1)}` : setAside[0];
      notes.push({ level: 'info', msg: `The ${def.label.toLowerCase()} is the whole scene, so the room's ${list} are left out while it's on. They come back when you switch the shell off.` });
    }
  }
  return { kit: out, room, spec: { ...spec, material: mat.id }, def, notes };
}

/**
 * Where the power box goes on a shell that wires its own LEDs: always the
 * back wall (the wire holes are there); a position off the wall moves low
 * in its middle, one on it is kept so the Power fields still move the box.
 */
export function shellPower(power = {}, room) {
  const ok = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  return {
    ...power,
    wall: 'back',
    pos: ok(power.pos, room.width) ? power.pos : room.width / 2,
    elev: ok(power.elev, room.height) ? power.elev : room.height * 0.15, // low: under shelves, floors and glazing
  };
}

/**
 * For the LED planner: the shell's wired LEDs, and the windows in its back
 * wall (`obstacles`, back-wall panel polygons) that the power box and the
 * outside wire routes should keep clear of. Slots and wire holes don't count.
 */
export function shellLighting(prep, { t }) {
  const none = { lights: [], obstacles: [] };
  if (!prep?.def.wiredLights || !prep.kit.lighting?.enabled) return none;
  let sh;
  try {
    sh = buildShell(prep.spec, { t, materials: prep.kit.materials });
  } catch {
    return none; // compileShell reports the problem
  }
  const back = sh.parts.find((p) => p.key === 'shell-back');
  const obstacles = (back?.polys.slice(1) || []).filter((h) => {
    const xs = h.map(([x]) => x), zs = h.map(([, z]) => z);
    const w = Math.max(...xs) - Math.min(...xs), hh = Math.max(...zs) - Math.min(...zs);
    return Math.min(w, hh) > t + 0.5 && w * hh >= 12;
  });
  return { lights: sh.lights.filter((l) => l.wire), obstacles };
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
export function compileShell(prep, { t, fingerWidth, minFeature, cutter, holes, getMat, newGroup, addPart, add3d, addRod, warn, xf }) {
  let sh;
  try {
    sh = buildShell(prep.spec, { t, fingerWidth, minFeature, cutter, holes, materials: prep.kit.materials });
  } catch (err) {
    warn(err.message, 'error');
    return { type: prep.spec.type, joints: [], lights: [] };
  }
  for (const w of sh.warnings) warn(w.msg, w.level);
  const groups = new Map(), ids = new Map(), groupMat = new Map();
  for (const p of sh.parts) {
    const mat = getMat(p.material, p.name);
    if (!groups.has(p.group)) { groups.set(p.group, newGroup(p.group, mat)); groupMat.set(p.group, mat); }
    ids.set(p.key, addPart(groups.get(p.group), p.name, mat, p.polys, p.scores));
    add3d(0, p.polys, p.plane, xf, mat.color, { thickness: mat.thickness, material: mat.id }); // solid: material runs along −n
  }
  // bought round stock (the spiral stair's dowel post): drawn and billed, never cut
  for (const r of sh.rods || []) {
    const g = groups.get(r.group);
    if (g && addRod) addRod(r, groupMat.get(r.group), g, xf, r.group);
    else warn(`The ${r.name.toLowerCase()} (${r.d} mm ${r.stock}) couldn't be added to the ${r.group.toLowerCase()} — it's missing from the bill and the 3D view.`);
  }
  for (const s of sh.steps) groups.get(s.group)?.steps.push(s.text);
  // LED spots glow in the preview; wired ones are on the LED map too (#16)
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

/**
 * A gable roof on an ordinary room box (kit.room.roof = { type: 'gable', pitch }),
 * added through the compiler's helpers. Board rooms only; returns null when
 * there is no roof, so kits without one compile exactly as before.
 */
export function compileRoof(room, { W, D, H, t, fingerWidth, rm, newGroup, addPart, add3d, warn, xf }) {
  const roof = room?.roof;
  if (!roof || roof.type !== 'gable') return null;
  if (rm.kind !== 'board') {
    warn(`Gable roofs are cut from board, so the ${rm.name} room box has none — pick a board for the room's structure to add it.`, 'info');
    return null;
  }
  const pitch = Math.max(20, Math.min(60, Number(roof.pitch) || 40));
  const res = buildGableRoof({ W, D, t, pitch, z0: H, fingerWidth });
  const group = newGroup('Roof', rm);
  for (const p of res.parts) {
    addPart(group, p.name, rm, p.polys, p.scores);
    add3d(0, p.polys, p.plane, xf, rm.color, { thickness: t, material: rm.id });
  }
  group.steps.push(
    'Glue the gable upright on the back wall\'s top edge, flush with the back.',
    'Slide the left roof\'s tabs into the notches on the left of the gable, resting it on the left wall, then the right roof the same way — it tucks under the left one at the ridge. Glue along the walls, the gable and the ridge.',
  );
  return { pitch, rise: res.rise, joints: res.joints };
}
