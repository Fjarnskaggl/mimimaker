// Compile a kit description into numbered parts, cut sheets, 3D preview
// faces, assembly steps and warnings.

import { buildBox, faceFrame, autoFingerWidth, minJointFeature, FACE_NAMES } from './box.js';
import { foldNet, tabbedRect } from './fold.js';
import { CATALOG, itemSize } from './catalog.js';
import { TOOL_NAMES, effectiveSheet, machineFor } from './materials.js';
import { packParts, SHEET_MARGIN } from './nest.js';
import { labelAnchor } from './labels.js';
import { planLighting, LED_COLORS, POWER_KINDS } from './lighting.js';
import { archPoly, ellipsePoly, rectPoly, bbox, translatePolys } from './geometry.js';
// T2 shells
import { prepareShell, compileShell, compileRoof, shellLighting } from './shells/kit.js';
import { buildBase } from './lighting/base.js';
import { HARDWARE_COLORS, hardwareName } from './hardware.js';
import { fanRotor, turntableDisc } from './lighting/motion.js';

/** Material left under a door so the wall panel stays in one piece (mm). */
const DOOR_SILL = 0.8;
/** Gap between overlays (wallpaper, flooring) and the walls (mm). */
const OVERLAY_MARGIN = 0.5;

const ROOM_FACE_NAMES = { bottom: 'Floor', top: 'Ceiling', back: 'Back wall', left: 'Left wall', right: 'Right wall', front: 'Front' };
const WALLS = ['back', 'left', 'right'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
};
const onPlane = (pl) => ([u, v]) => v3.add(pl.o, v3.add(v3.mul(pl.U, u), v3.mul(pl.V, v)));

function rotZ(rot, w, d) {
  switch (rot) {
    case 90: return { p: ([x, y, z]) => [d - y, x, z], n: ([x, y, z]) => [-y, x, z], fw: d, fd: w };
    case 180: return { p: ([x, y, z]) => [w - x, d - y, z], n: ([x, y, z]) => [-x, -y, z], fw: w, fd: d };
    case 270: return { p: ([x, y, z]) => [y, w - x, z], n: ([x, y, z]) => [y, -x, z], fw: d, fd: w };
    default: return { p: (q) => q, n: (q) => q, fw: w, fd: d };
  }
}

const fmtIds = (ids) => ids.map((i) => `#${i}`).join(', ');


export function compileKit(kit) {
  const warnings = [];
  const warn = (msg, level = 'warn') => warnings.push({ level, msg });
  const mats = new Map(kit.materials.map((m) => [m.id, m]));
  const machine = machineFor(kit); // T3: the preset plus the kit's bed size / kerf edits
  const s = 10 / kit.scale; // real cm → model mm
  const tabWidth = kit.tabWidth || 5;
  const fingerWidth = kit.fingerWidth || 0;
  const parts = [], groups = [], faces3d = [];
  const hardware = []; // bought round stock (dowels, wire, tube) that pieces stand on: not cut, in the bill
  let currentItem = null; // index of the item whose 3D faces are being added
  let nextId = 1;

  const getMat = (id, ctx) => {
    if (mats.has(id)) return mats.get(id);
    warn(`${ctx}: unknown material "${id}" — using ${kit.materials[0].name}.`);
    return kit.materials[0];
  };
  const fitsSheet = (mat, w, h) => {
    const [sw, sh] = effectiveSheet(mat, machine).map((v) => v - 2 * SHEET_MARGIN);
    return (w <= sw && h <= sh) || (h <= sw && w <= sh);
  };
  const newGroup = (title, mat, extra = {}) => {
    const g = { title, material: mat?.name, steps: [], parts: [], ...extra };
    groups.push(g);
    return g;
  };
  const addPart = (group, name, mat, polys, scores = []) => {
    const bb = bbox(polys);
    const part = {
      id: nextId++, name, group: group.title, material: mat.id,
      polys: translatePolys(polys, -bb.x0, -bb.y0),
      scores: scores.map((seg) => seg.map(([x, y]) => [x - bb.x0, y - bb.y0])),
      w: bb.w, h: bb.h,
    };
    part.label = labelAnchor(part);
    parts.push(part);
    group.parts.push(part.id);
    return part.id;
  };
  const add3d = (layer, polys2d, plane, xf, color, opts = {}) => {
    const map = onPlane(plane);
    faces3d.push({
      layer, color, opacity: opts.opacity ?? 1, cull: opts.cull ?? false, glow: !!opts.glow, item: currentItem,
      thickness: opts.thickness, // mm of material behind the face (solid parts only; WebGL viewer)
      ...(opts.material ? { material: opts.material } : {}), // the material it is cut from: picks its texture (T6)
      ...(opts.print ? { print: true } : {}), // wallpaper / floor covering: wears the printed pattern
      polys: polys2d.map((poly) => poly.map((p) => xf.p(map(p)))), n: xf.n(plane.n),
      ...(opts.led != null ? { led: opts.led } : {}), // a light's glow: its index in kit.lighting.leds (click to select)
      ...(opts.part != null ? { part: opts.part } : {}), // the cut part this face shows, where the compiler knows it
    });
  };
  // Joint tabs never go narrower than the machine cuts cleanly in that material.
  const cutterName = (mat) => (machine.family === 'laser' ? 'the laser' : `the ${TOOL_NAMES[mat.tool] || 'blade'}`);
  const raised = new Set();
  const jointWidth = (mat) => {
    const min = minJointFeature(machine, mat);
    if (fingerWidth > 0 && fingerWidth < min && !raised.has(mat.id)) {
      raised.add(mat.id);
      warn(`Finger width ${fingerWidth} mm is narrower than ${cutterName(mat)} cuts cleanly in ${mat.name}, so its joints use ${min} mm. Set the finger width to at least ${min} mm.`);
    }
    return Math.max(fingerWidth > 0 ? fingerWidth : autoFingerWidth(mat.thickness), min);
  };
  const checkFingers = (minFinger, mat, what) => {
    const min = minJointFeature(machine, mat);
    if (minFinger < min - 1e-9) {
      warn(`${what}: finger joints are only ${minFinger.toFixed(1)} mm wide — ${cutterName(mat)} is cleaner above ${min} mm. Make it bigger, raise the finger width, or use thinner board.`);
    }
  };

  // ---------------------------------------------------------------- room box
  // >>> T2 shells: kit.shell swaps the room box for a book-nook shell; its
  // interior becomes the effective room (see src/shells/kit.js).
  const shellPrep = prepareShell(kit, warn);
  if (shellPrep) kit = shellPrep.kit;
  let shell = null;
  // <<< T2 shells
  const room = kit.room;
  const rm = getMat(room.material, 'Room');
  const t = rm.thickness;
  const Wi = room.width * s, Di = room.depth * s, Hi = room.height * s;
  const W = Wi + 2 * t, D = Di + t, H = Hi + t + (room.ceiling ? t : 0);
  const roomFaces = ['bottom', 'back', 'left', 'right', ...(room.ceiling ? ['top'] : [])];
  const wallInfo = { back: { u0: t, len: Wi }, left: { u0: 0, len: Di }, right: { u0: 0, len: Di } };
  const worldXf = { p: (q) => q, n: (q) => q };

  const openings = [];
  const holes = { back: [], left: [], right: [] };
  (kit.openings || []).forEach((o) => {
    const wi = wallInfo[o.wall];
    if (!wi) return;
    const w = o.width * s, h = o.height * s;
    const door = o.kind === 'door' || o.kind === 'archdoor';
    const y = t + (door ? DOOR_SILL : o.sill * s);
    const x = wi.u0 + o.pos * s - w / 2;
    const poly = o.kind === 'round' ? ellipsePoly(x + w / 2, y + h / 2, w / 2, h / 2, 48)
      : o.kind === 'arch' || o.kind === 'archdoor' ? archPoly(x, y, w, h)
      : rectPoly(x, y, w, h);
    if (x < wi.u0 + 1 || x + w > wi.u0 + wi.len - 1 || y + h > t + Hi - 1) {
      warn(`${cap(o.wall)} wall ${o.kind} doesn't fit inside the wall — adjust its position or size.`);
    }
    holes[o.wall].push(poly);
    openings.push({ ...o, x, y, w, h, poly, door });
  });

  // LED wire holes go through the structure (and the overlays below)
  const shellLit = shellLighting(shellPrep, { t }); // T2 shells: LEDs the shell places itself, and its back-wall windows (#16)
  const baseMat = rm.kind === 'board' ? rm : (kit.materials || []).find((m) => m.kind === 'board'); // [T5] a hidden base is cut from board
  const lighting = planLighting(kit.lighting, { s, t, W, D, H, Wi, Di, Hi, ceiling: room.ceiling, wallInfo, openings, baseT: baseMat?.thickness,
    shellLights: shellLit.lights, shellObstacles: shellLit.obstacles });
  for (const [f, list] of Object.entries(lighting.holes)) (holes[f] ||= []).push(...list);
  for (const w of lighting.warnings) typeof w === 'string' ? warn(w) : warn(w.msg, w.level);

  // >>> T2 shells
  const roomGroup = shellPrep ? null : newGroup('Room box', rm);
  if (shellPrep) {
    shell = compileShell(shellPrep, { t, fingerWidth: jointWidth(rm), minFeature: minJointFeature(machine, rm), cutter: cutterName(rm), holes, getMat, newGroup, addPart, add3d, addRod, warn, xf: worldXf });
  } else if (rm.kind === 'board') { // <<< T2 shells
    const res = buildBox({ W, D, H, t, faces: roomFaces, holes, fingerWidth: jointWidth(rm), minFeature: minJointFeature(machine, rm) });
    checkFingers(res.minFinger, rm, 'Room box');
    for (const p of res.panels) {
      addPart(roomGroup, ROOM_FACE_NAMES[p.face], rm, [p.outline, ...p.holes]);
      add3d(0, [p.outline, ...p.holes], faceFrame(p.face, W, D, H, t, 'inner'), worldXf, rm.color, { thickness: t, material: rm.id });
    }
    roomGroup.steps.push(
      `Dry-fit the walls into the floor (${fmtIds(roomGroup.parts)}). The tabs only go together one way — the floor${room.ceiling ? ' and ceiling' : ''} own the corners.`,
      'Glue one joint at a time with PVA or wood glue, checking the corners with a square (a book corner works). Let it set for 30 minutes.',
    );
  } else {
    const net = foldNet({ W, D, H, faces: roomFaces, tabWidth, separate: true, holes });
    for (const piece of net.pieces) {
      addPart(roomGroup, ROOM_FACE_NAMES[piece.faces[0]], rm, piece.polys, piece.scores);
    }
    for (const f of roomFaces) {
      const [a, b] = f === 'bottom' || f === 'top' ? [W, D] : f === 'back' ? [W, H] : [D, H];
      add3d(0, [rectPoly(0, 0, a, b), ...(holes[f] || [])], faceFrame(f, W, D, H, 0, 'inner'), worldXf, rm.color, { thickness: t, material: rm.id });
    }
    roomGroup.steps.push(
      `Fold each glue tab on ${fmtIds(roomGroup.parts)} along its score line and glue the walls to the floor and to each other, tabs on the inside.`,
    );
    if (rm.thickness < 0.7) warn(`The room box is cut from ${rm.name}; laminate two layers or back it with foam board so it stands up.`, 'info');
  }
  // >>> T2 roofs: kit.room.roof = { type: 'gable', pitch } puts a bevel-free gable roof on the box
  if (!shellPrep) compileRoof(room, { W, D, H, t, fingerWidth: jointWidth(rm), rm, newGroup, addPart, add3d, warn, xf: worldXf });
  // <<< T2 roofs

  // ------------------------------------------------------------ trim pieces
  const trimOpenings = openings.filter((o) => o.trim);
  if (trimOpenings.length) {
    const tm = getMat(room.trimMaterial, 'Trim');
    const g = newGroup('Window & door trim', tm);
    for (const o of trimOpenings) {
      const b = Math.max(1.5, Math.min(o.w, o.h) * 0.08);
      let polys;
      if (o.door) {
        const arched = o.kind === 'archdoor';
        const top = o.y + o.h;
        const outer = archPoly(o.x - b, t, o.w + 2 * b, top - t + b, arched ? o.w / 2 + b : 0);
        const inner = archPoly(o.x, t, o.w, top - t, arched ? o.w / 2 : 0);
        polys = [[outer[1], ...outer.slice(2), outer[0], inner[0], ...inner.slice(2).reverse(), inner[1]]];
      } else if (o.kind === 'round') {
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        polys = [ellipsePoly(cx, cy, o.w / 2 + b, o.h / 2 + b, 48), o.poly];
      } else if (o.kind === 'arch') {
        polys = [archPoly(o.x - b, o.y - b, o.w + 2 * b, o.h + 2 * b), o.poly];
      } else {
        const mb = Math.max(0.8, b * 0.45);
        const pw = (o.w - mb) / 2, ph = (o.h - mb) / 2;
        polys = [rectPoly(o.x - b, o.y - b, o.w + 2 * b, o.h + 2 * b),
          rectPoly(o.x, o.y, pw, ph), rectPoly(o.x + pw + mb, o.y, pw, ph),
          rectPoly(o.x, o.y + ph + mb, pw, ph), rectPoly(o.x + pw + mb, o.y + ph + mb, pw, ph)];
      }
      const id = addPart(g, `${cap(o.wall)} ${o.door ? 'door frame' : 'window frame'}`, tm, polys);
      const fr = faceFrame(o.wall, W, D, H, t + 0.3, 'inner');
      add3d(1.5, polys, fr, worldXf, tm.color, { material: tm.id });
      g.steps.push(`Glue ${o.door ? 'door' : 'window'} frame #${id} around the ${o.wall} wall opening on the inside face.`);
    }
    if (trimOpenings.some((o) => !o.door)) g.steps.push('Optional: glue clear acetate behind window frames for glass.');
  }

  // ------------------------------------------------- wallpaper and flooring
  if (room.wallpaper?.enabled) {
    const wm = getMat(room.wallpaper.material, 'Wallpaper');
    const g = newGroup('Wallpaper', wm);
    const m = OVERLAY_MARGIN;
    const vTop = (room.ceiling ? H - t : H) - m;
    for (const wall of WALLS) {
      const u0 = wall === 'back' ? t + m : 0;
      const u1 = wall === 'back' ? W - t - m : D - t - m;
      const v0 = t + m;
      const rw = u1 - u0, rh = vTop - v0;
      const mine = openings.filter((o) => o.wall === wall);
      const outline = [[0, 0]];
      for (const o of mine.filter((q) => q.door).sort((a, b) => a.x - b.x)) {
        const dx = Math.max(0.5, Math.min(o.x - u0, rw - o.w - 0.5));
        const pts = archPoly(dx, 0, o.w, o.y + o.h - v0, o.kind === 'archdoor' ? o.w / 2 : 0);
        outline.push(pts[0], ...pts.slice(2).reverse(), pts[1]);
      }
      outline.push([rw, 0], [rw, rh], [0, rh]);
      const windowHoles = [...mine.filter((o) => !o.door).map((o) => o.poly), ...(lighting.holes[wall] || [])]
        .map((poly) => poly.map(([x, y]) => [x - u0, y - v0]));
      const polys = [outline, ...windowHoles];
      addPart(g, `${cap(wall)} wallpaper`, wm, polys);
      parts.at(-1).print = true; // T3 prints the wallpaper pattern on it
      const fr = faceFrame(wall, W, D, H, t + 0.15, 'inner');
      add3d(1, polys, { ...fr, o: v3.add(fr.o, v3.add(v3.mul(fr.U, u0), v3.mul(fr.V, v0))) }, worldXf, wm.color, { material: wm.id, print: true });
    }
    g.steps.push(`Glue wallpaper ${fmtIds(g.parts)} to the inside of each wall with a glue stick or spray adhesive before adding furniture. Line the cut-outs up with the window and door openings.`);
  }
  if (room.floor?.enabled) {
    const fm = getMat(room.floor.material, 'Flooring');
    const g = newGroup('Flooring', fm);
    const m = OVERLAY_MARGIN;
    const poly = rectPoly(0, 0, Wi - 2 * m, Di - m);
    const ledHoles = (lighting.holes.bottom || []).map((h) => h.map(([x, y]) => [x - t - m, y]));
    addPart(g, 'Floor covering', fm, [poly, ...ledHoles]);
    parts.at(-1).print = true; // T3 prints the floor pattern on it
    add3d(1, [poly, ...ledHoles], { o: [t + m, 0, t + 0.1], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] }, worldXf, fm.color, { material: fm.id, print: true });
    g.steps.push(`Glue floor covering #${g.parts[0]} onto the floor. Tip: score faint lines across it every few mm for floorboards.`);
  }

  // ----------------------------------------------------------------- lights
  if (lighting.enabled && lighting.leds.length) {
    const effectFaces = new Map(); // fan rotor / turntable part name -> its 3D face
    for (const led of lighting.leds) {
      const ledIndex = led.src; // index in kit.lighting.leds, for click-to-select
      if (led.inside) continue; // T2 shells: a shell's own LEDs already glow where they sit (#16)
      const fr = faceFrame(led.face, W, D, H, t + 0.6, 'inner');
      // >>> [T5] motion and sound: a fan rotor or turntable shows where it turns; no glow
      if (led.load?.device) {
        const size = led.size;
        const shape = led.effect === 'fan' ? fanRotor(led.u, led.v, size) : led.effect === 'turntable' ? turntableDisc(led.u, led.v, size) : null;
        if (shape && !led.misplaced) effectFaces.set(`${led.label} ${led.effect === 'fan' ? 'fan blades' : 'turntable'}`, faces3d.length);
        if (shape && !led.misplaced) add3d(1.7, shape, faceFrame(led.face, W, D, H, t + (led.effect === 'fan' ? 4 : 1), 'inner'), worldXf, '#b8a990', { material: (mats.get(room.trimMaterial) || kit.materials[0]).id }); // cut from trim, as in lighting.parts
        continue;
      }
      // <<< [T5]
      const hex = LED_COLORS[led.color]?.hex || LED_COLORS.warm.hex;
      add3d(1.7, [ellipsePoly(led.u, led.v, 7, 7, 24)], fr, worldXf, hex, { opacity: 0.28, glow: true, led: ledIndex });
      add3d(1.8, [ellipsePoly(led.u, led.v, 2, 2, 16)], fr, worldXf, hex, { glow: true, led: ledIndex });
    }
    const powerName = POWER_KINDS[lighting.power.kind] || POWER_KINDS.battery;
    const lightGroup = newGroup('Lighting', null, { // [T5] kept in a variable for the cable cover
      steps: [
        `You need ${lighting.leds.length} pre-wired 3 V micro LEDs (fairy-light or "grain of wheat" style, with built-in resistors) and a ${powerName.toLowerCase()}. The LED map lists the minimum lead length for each.`,
        lighting.leds.some((l) => l.inside) // T2 shells: the shell's own LEDs leave through its back-wall holes (#16)
          ? 'The shell already has small wire holes in its back wall. Fix each LED where the map shows it and run its wires along its dashed line inside the shell (in an alley: down the cavity to the floor channel) and out through its hole; LEDs in the same cavity share one. A dab of tacky glue holds each bulb, and a dot of glue holds the wire along a shelf or floor edge.'
          : `The ${lighting.holeDiameter.toFixed(1)} mm wire holes are already cut. Poke each LED's wires through its hole from the inside before gluing in furniture; a dab of hot glue or tacky glue holds the bulb.`,
        lighting.power.mount === 'base' // [T5] hidden base
          ? 'Run each wire along its route on the outside of the room, down to the hidden base, and hold it down with thin tape or tiny staples. The Hidden base steps put in the battery box and switch.'
          : lighting.power.mount === 'flush'
          ? `Fit the power box behind the ${lighting.power.face} wall so its switch shows through the cut-out, then run each wire along its route on the outside and hold it down with thin tape or tiny staples.`
          : `Glue the power box to the outside of the ${lighting.power.face} wall where the map shows it, then run each wire along its route on the outside and hold it down with thin tape or tiny staples.`,
        ...(lighting.power.mount === 'base' ? [] : ['Wire all LEDs in parallel: twist every LED\'s + lead to the power box + lead (red) and every − to − (black), then insulate with heat-shrink or tape. Test before closing up.']),
        ...(lighting.parts?.length ? [] : ['Optional: glue a cardstock panel over the back of the room to hide the wiring.']), // [T5] the cable cover replaces this
      ],
      parts: [],
    });
    // [T5] cable cover and motor mounts: cut, and drawn on the outside of their wall
    const stackT = {}; // thickness already stacked on the outside of each face
    const placed = (lighting.parts || []).filter((p) => p.place).sort((a, b) => a.place.layer - b.place.layer);
    const lightMats = new Map((lighting.parts || []).map((p) => [p, getMat(p.material || (p.role === 'frame' || p.role === 'mount' ? room.material : room.trimMaterial), 'Lighting')]));
    const lightMat = (p) => lightMats.get(p);
    const layerAt = new Map();
    for (const p of placed) {
      const key = `${p.place.face}/${p.place.layer}`;
      if (!layerAt.has(key)) { layerAt.set(key, stackT[p.place.face] || 0); stackT[p.place.face] = (stackT[p.place.face] || 0) + lightMat(p).thickness; }
    }
    for (const p of lighting.parts || []) {
      const lm = lightMat(p);
      const pid = addPart(lightGroup, p.name, lm, p.polys);
      if (effectFaces.has(p.name)) faces3d[effectFaces.get(p.name)].part = pid;
      if (!p.place || shellPrep) continue;
      const fr = faceFrame(p.place.face, W, D, H);
      const off = layerAt.get(`${p.place.face}/${p.place.layer}`) + lm.thickness;
      const plane = { ...fr, o: v3.add(v3.add(fr.o, v3.mul(fr.n, off)), v3.add(v3.mul(fr.U, p.place.u), v3.mul(fr.V, p.place.v))) };
      add3d(0.5, p.polys, plane, worldXf, lm.color, { thickness: lm.thickness, material: lm.id, part: pid });
    }
    lightGroup.steps.push(...(lighting.steps || [])); // [T5] cable cover
    // >>> [T5] hidden base under the room: battery hatch, wire hole and switch mount
    if (lighting.power.base) {
      const L = lighting.power.base;
      const bm = baseMat;
      if (!bm) {
        warn('The hidden base is cut from board, and this kit has no board material — add one in Materials.', 'error');
      } else {
        const b = buildBase(L, { fingerWidth: jointWidth(bm), minFeature: minJointFeature(machine, bm) });
        checkFingers(b.minFinger, bm, 'Hidden base');
        const bg = newGroup('Hidden base', bm);
        const under = { p: ([x, y, z]) => [x, y, z - L.H], n: (q) => q };
        const ids = { base: [], stops: [], hatch: [], mount: [] };
        for (const p of b.panels) {
          const id = addPart(bg, p.name, bm, p.polys);
          ids.base.push(id);
          add3d(0, p.polys, faceFrame(p.face, L.W, L.D, L.H, bm.thickness, 'inner'), under, bm.color, { thickness: bm.thickness, material: bm.id, part: id });
        }
        for (const p of b.parts) {
          const id = addPart(bg, p.name, bm, p.polys);
          ids[p.key === 'stop' ? 'stops' : p.key].push(id);
          // the hatch sits in its opening; stops and the switch mount are glued on the inside of their wall
          const face = p.view?.face || (p.key === 'stop' ? 'back' : L.switch.face);
          const fr = faceFrame(face, L.W, L.D, L.H, bm.thickness, 'inner');
          const plane = p.view ? fr : { ...fr, o: v3.add(fr.o, v3.mul(fr.n, bm.thickness)) };
          add3d(0.5, p.polys, plane, under, bm.color, { thickness: bm.thickness, material: bm.id, part: id });
        }
        bg.steps.push(...b.steps.map((st) => st.replace(/\{(\w+)\}/g, (m, k) => (ids[k] ? fmtIds(ids[k]) : m))));
      }
    }
    // <<< [T5] hidden base
  }

  // ---------------------------------------------------- furniture and decor
  const typeCounts = {};
  (kit.items || []).forEach((item, itemIndex) => {
    currentItem = itemIndex;
    const def = CATALOG[item.type];
    if (!def) { warn(`Unknown item type "${item.type}".`); return; }
    const mat = getMat(item.material, def.label);
    const p = {};
    for (const prm of def.params) {
      const v = item.params?.[prm.key] ?? def.defaults[prm.key];
      p[prm.key] = prm.unit === 'cm' ? Number(v) * s : v;
    }
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
    const title = item.name || `${def.label}${typeCounts[item.type] > 1 ? ` ${typeCounts[item.type]}` : ''}`;
    const group = newGroup(title, mat, { note: def.note });
    const [iw, id, ih] = itemSize(item.type, p);

    // placement transform
    let xf;
    let wallPlane = null;
    if (def.placement === 'wall') {
      const wall = WALLS.includes(item.wall) ? item.wall : 'back';
      const wi = wallInfo[wall];
      const u0 = wi.u0 + (item.pos ?? 0) * s - iw / 2;
      const v0 = t + (item.elev ?? 0) * s - ih / 2;
      if (u0 < wi.u0 || u0 + iw > wi.u0 + wi.len || v0 < t || v0 + ih > t + Hi) warn(`${title} hangs off the ${wall} wall.`);
      const fr = faceFrame(wall, W, D, H, t + 0.3, 'inner');
      wallPlane = { ...fr, o: v3.add(fr.o, v3.add(v3.mul(fr.U, u0), v3.mul(fr.V, v0))) };
      // boxes hang with their back (local y = depth) against the wall, front facing into the room
      const base = v3.add(faceFrame(wall, W, D, H, t, 'inner').o, v3.add(v3.mul(fr.U, u0), v3.mul(fr.V, v0)));
      const lin = ([x, y, z]) => v3.add(v3.mul(fr.U, x), v3.add(v3.mul(fr.n, -y), v3.mul(fr.V, z)));
      xf = { p: ([x, y, z]) => v3.add(base, v3.add(lin([x, y - id, z]), [0, 0, 0])), n: lin };
    } else {
      const rot = (((Number(item.rot) || 0) % 360) + 360) % 360;
      const r = rotZ(rot, iw, id);
      const ox = t + (item.x ?? 0) * s, oy = D - t - (item.y ?? 0) * s - r.fd, oz = t + (room.floor?.enabled ? 0.25 : 0);
      if ((item.x ?? 0) * s + r.fw > Wi + 0.01 || (item.y ?? 0) * s + r.fd > Di + 0.01 || item.x < 0 || item.y < 0) {
        warn(`${title} sticks out of the room — check its position.`);
      }
      if (ih > Hi) warn(`${title} is taller than the room.`);
      xf = { p: (q) => v3.add(r.p(q), [ox, oy, oz]), n: r.n };
    }

    for (const c of def.build(p, { t: mat.thickness })) {
      const at = c.at || [0, 0, 0];
      const cxf = { p: (q) => xf.p(v3.add(q, at)), n: xf.n };
      if (c.kind === 'rod') addRod(c, mat, group, cxf, title);
      else if (c.kind === 'box') compileBox(c, mat, group, cxf, title);
      else {
        const plane = c.wall ? wallPlane : c.plane;
        const fmat = c.material ? getMat(c.material, title) : mat;
        const pid = addPart(group, c.name, fmat, c.polys, c.scores || []);
        add3d(c.surface ? 1.5 : 2, c.polys, plane, c.wall ? worldXf : cxf, fmat.color, { cull: false, thickness: c.surface ? undefined : fmat.thickness, material: fmat.id, part: pid });
        group.steps.push(`Glue the ${c.name.toLowerCase()} (#${pid}) in place.`);
      }
    }
    if (def.note) group.steps.push(def.note);
  });

  // A bought rod (dowel, wire, tube), cut to length: drawn as an eight-sided
  // prism from c.from to c.to, listed in compiled.hardware, never on a sheet.
  function addRod(c, mat, group, xf, title) {
    const a = xf.p(c.from), b = xf.p(c.to);
    const axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(...axis);
    if (!(length > 0.01) || !(c.d > 0)) {
      warn(`${title}: the ${c.name.toLowerCase()} has no length or thickness at this size — make the piece bigger.`);
      return;
    }
    const k = v3.mul(axis, 1 / length);
    const ref = Math.abs(k[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const u0 = cr(k, ref), lu = Math.hypot(...u0);
    const u = v3.mul(u0, 1 / lu), w = cr(k, u);
    const r = c.d / 2, n = 8;
    const ring = (o) => Array.from({ length: n }, (_, i) => {
      const ang = (2 * Math.PI * (i + 0.5)) / n;
      return v3.add(o, v3.add(v3.mul(u, r * Math.cos(ang)), v3.mul(w, r * Math.sin(ang))));
    });
    const lo = ring(a), hi = ring(b);
    const index = hardware.length;
    const color = HARDWARE_COLORS[c.stock] || HARDWARE_COLORS.dowel;
    const face = (poly, nrm) => faces3d.push({ layer: 2, color, opacity: 1, cull: false, glow: false, item: currentItem, thickness: 0, material: mat.id, polys: [poly], n: nrm, hardware: index });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ang = (2 * Math.PI * (i + 1)) / n;
      face([lo[i], lo[j], hi[j], hi[i]], v3.add(v3.mul(u, Math.cos(ang)), v3.mul(w, Math.sin(ang))));
    }
    face([...lo].reverse(), v3.mul(k, -1));
    face(hi, k);
    const h = { name: c.name, stock: c.stock, d: c.d, length, group: group.title, item: currentItem, from: a, to: b };
    h.text = `Cut ${hardwareName(c.stock, c.d)} ${Math.floor(length + 1e-6)} mm long for the ${c.name.toLowerCase()}.`;
    hardware.push(h);
    group.steps.push(h.text);
  }

  function compileBox(c, mat, group, xf, title) {
    const [bw, bd, bh] = c.size;
    const mt = mat.thickness;
    if (mat.kind === 'fabric') {
      warn(`${title}: ${mat.name} can't make boxes — choose board or cardstock.`);
      return;
    }
    // A block too thin to joint (the panels across it would be slivers the
    // cutter can't make), or one the piece asks to be solid, is laminated:
    // layers of the material stacked across its thinnest side.
    const dims = [bw, bd, bh];
    const ax = dims.indexOf(Math.min(...dims));
    // only a closed box can become a block: an open one (a shelf, a cabinet)
    // would lose the opening it exists for, so it just gets a warning
    const thin = mat.kind === 'board' && c.faces.length >= 4 && dims[ax] - 2 * mt < minJointFeature(machine, mat);
    if (thin && !c.solid && c.faces.length < 6) warn(`${title}: ${c.name} is too thin to joint in ${mat.name} (${dims[ax].toFixed(1)} mm) — make it bigger or use thinner board.`);
    if (c.solid || (thin && c.faces.length === 6)) {
      const nearFace = ['left', 'front', 'bottom'][ax], farFace = ['right', 'back', 'top'][ax];
      // holes in the far face (top, right, back) go through every layer but
      // the first, so whatever stands in them rests on that first layer, and
      // near-face holes through every layer but the last
      const holes = c.holes || {}, scores = c.scores || {};
      const far = holes[farFace] || [], near = holes[nearFace] || [];
      const k = Math.max(far.length || near.length ? 2 : 1, Math.round(dims[ax] / mt));
      if (Math.abs(k * mt - dims[ax]) > 0.5 * mt + 1e-6) warn(`${title}: ${c.name} is ${(k * mt).toFixed(1)} mm thick in ${k} layers of ${mat.name}, not ${dims[ax].toFixed(1)} mm.`);
      const lost = FACE_NAMES.filter((f) => f !== nearFace && f !== farFace && ((holes[f] || []).length || (scores[f] || []).length));
      if (lost.length || (c.shelves || []).length) warn(`${title}: ${c.name} is a solid block, so its ${[...lost, ...((c.shelves || []).length ? ['shelves'] : [])].join(', ')} ${lost.length + ((c.shelves || []).length ? 1 : 0) > 1 ? 'are' : 'is'} left out.`);
      const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
      const ids = [];
      for (let i = 0; i < k; i++) {
        const [plane, poly] = ax === 2 ? [{ o: [0, 0, (i + 1) * mt], U: X, V: Y, n: Z }, rectPoly(0, 0, bw, bd)]
          : ax === 0 ? [{ o: [i * mt, 0, 0], U: Y, V: Z, n: [-1, 0, 0] }, rectPoly(0, 0, bd, bh)]
          : [{ o: [0, i * mt, 0], U: X, V: Z, n: [0, -1, 0] }, rectPoly(0, 0, bw, bh)];
        const polys = [poly, ...(i > 0 ? far : []), ...(i < k - 1 ? near : [])];
        // the outside layers keep the face's score lines (drawers, keys, doors)
        const sc = [...(i === 0 ? scores[nearFace] || [] : []), ...(i === k - 1 ? scores[farFace] || [] : [])];
        const pid = addPart(group, `${c.name} layer ${i + 1}`, mat, polys, sc);
        parts.at(-1).build = { unit: `${group.title}/${c.name}`, role: 'layer' }; // T4: one block, glued up in a stack
        add3d(2, polys, plane, xf, mat.color, { cull: false, thickness: mt, material: mat.id, part: pid });
        ids.push(pid);
      }
      group.steps.push(`${c.name}: glue layers ${fmtIds(ids)} into a stack, edges flush, and press it flat under a book while it sets.`);
      return;
    }
    if (mat.kind === 'board') {
      // open boxes show their insides, so only cull back faces of closed ones
      const closed = c.faces.length === 6;
      const res = buildBox({ W: bw, D: bd, H: bh, t: mt, faces: c.faces, shelves: c.shelves || [], scores: c.scores || {}, holes: c.holes || {}, fingerWidth: jointWidth(mat), minFeature: minJointFeature(machine, mat) });
      checkFingers(res.minFinger, mat, title);
      const ids = res.panels.map((pn) => {
        const pid = addPart(group, `${c.name} ${pn.face}`, mat, [pn.outline, ...pn.holes], pn.scores);
        add3d(2, [pn.outline, ...pn.holes], faceFrame(pn.face, bw, bd, bh), xf, mat.color, { cull: closed, thickness: mt, material: mat.id, part: pid });
        return pid;
      });
      const shelfIds = res.shelves.map((sp, k) => {
        const pid = addPart(group, `${c.name} shelf ${k + 1}`, mat, [sp.outline]);
        add3d(2, [sp.outline], { o: [sp.x0, sp.y0, sp.z + mt], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] }, xf, mat.color, { cull: true, thickness: mt, material: mat.id, part: pid });
        return pid;
      });
      group.steps.push(`${c.name}: dry-fit panels ${fmtIds(ids)} — the tabs drop into their notches. Glue and hold square until set.`);
      if (shelfIds.length) group.steps.push(`Slide shelves ${fmtIds(shelfIds)} into the slots in the sides${c.faces.includes('back') ? ' and back' : ''} before the second side goes on.`);
      if (c.scores && Object.values(c.scores).some((l) => l.length)) group.steps.push('The score lines on the front only mark drawers/doors — don\'t fold them. Set the Knife Blade layer to "Draw" or skip them if you prefer.');
      return;
    }
    // card: fold-up net
    let net = foldNet({ W: bw, D: bd, H: bh, faces: c.faces, tabWidth, scores: c.scores || {}, holes: c.holes || {} });
    if (net.pieces.some((pc) => { const b = bbox(pc.polys); return !fitsSheet(mat, b.w, b.h); })) {
      net = foldNet({ W: bw, D: bd, H: bh, faces: c.faces, tabWidth, scores: c.scores || {}, holes: c.holes || {}, separate: true });
    }
    const ids = net.pieces.map((pc, k) => addPart(group, net.pieces.length > 1 ? `${c.name} ${pc.faces[0]}` : `${c.name} net`, mat, pc.polys, pc.scores));
    for (const f of c.faces) {
      const [a, b] = f === 'bottom' || f === 'top' ? [bw, bd] : f === 'front' || f === 'back' ? [bw, bh] : [bd, bh];
      const k = net.pieces.findIndex((pc) => pc.faces.includes(f));
      add3d(2, [rectPoly(0, 0, a, b), ...((c.holes || {})[f] || [])], faceFrame(f, bw, bd, bh), xf, mat.color, { cull: c.faces.length === 6, thickness: mt, material: mat.id, part: ids[k >= 0 ? k : 0] });
    }
    const shelfIds = (c.shelves || []).map((z, k) => {
      const sw = bw - 2 * mt, sd = bd - (c.faces.includes('back') ? mt : 0);
      const pc = tabbedRect(sw, sd, [false, true, c.faces.includes('back'), true], Math.min(tabWidth, z - mt));
      return addPart(group, `${c.name} shelf ${k + 1}`, mat, pc.polys, pc.scores);
    });
    group.steps.push(`${c.name}: crease every score line on ${fmtIds(ids)} (a ruler and bone folder help), fold it up and glue the tabs on the inside.`);
    if (shelfIds.length) group.steps.push(`Fold the tabs of shelves ${fmtIds(shelfIds)} down and glue them inside at even heights.`);
  }

  // ------------------------------------------------------------- materials
  const usedMats = [...new Set(parts.map((p) => p.material))].map((id) => mats.get(id));
  for (const m of usedMats) {
    if (!machine.tools.includes(m.tool)) {
      warn(`${m.name} needs the ${TOOL_NAMES[m.tool]}, which the ${machine.name} can't use — switch machines or materials.`, 'error');
    }
  }

  // ---------------------------------------------------------------- nesting
  const sheets = [];
  for (const m of usedMats) {
    const [sw, sh] = effectiveSheet(m, machine);
    const mine = parts.filter((p) => p.material === m.id);
    const packed = packParts(mine, sw, sh);
    for (const p of packed.oversize) {
      warn(`Part #${p.id} (${p.group} – ${p.name}, ${p.w.toFixed(0)}×${p.h.toFixed(0)} mm) is larger than a ${sw}×${sh} mm ${m.name} sheet. Shrink the design or use a bigger sheet/mat.`, 'error');
    }
    packed.sheets.forEach((sheet, i) => sheets.push({ ...sheet, material: m, index: i + 1, count: packed.sheets.length }));
  }

  return {
    parts, groups, faces3d, sheets, warnings, usedMats, machine, hardware,
    dims: { W, D, H, Wi, Di, Hi, t }, lighting, openings, ceiling: !!room.ceiling,
    shell, // T2 shells: { type, dims, joints (by part id), lights } or null
  };
}
