// Compile a kit description into numbered parts, cut sheets, 3D preview
// faces, assembly steps and warnings.

import { buildBox, faceFrame } from './box.js';
import { foldNet, tabbedRect } from './fold.js';
import { CATALOG, itemSize } from './catalog.js';
import { MACHINES, TOOL_NAMES, effectiveSheet } from './materials.js';
import { packParts, SHEET_MARGIN } from './nest.js';
import { labelAnchor } from './labels.js';
import { planLighting, LED_COLORS, POWER_KINDS } from './lighting.js';
import { archPoly, ellipsePoly, rectPoly, bbox, translatePolys } from './geometry.js';

/** Material left under a door so the wall panel stays in one piece (mm). */
const DOOR_SILL = 0.8;
/** Knife Blade cuts get ragged below roughly this feature size (mm). */
const MIN_KNIFE_FEATURE = 3;
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
  const machine = MACHINES[kit.machine] || MACHINES.maker;
  const s = 10 / kit.scale; // real cm → model mm
  const tabWidth = kit.tabWidth || 5;
  const fingerWidth = kit.fingerWidth || 0;
  const parts = [], groups = [], faces3d = [];
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
      polys: polys2d.map((poly) => poly.map((p) => xf.p(map(p)))), n: xf.n(plane.n),
    });
  };
  const checkFingers = (minFinger, mat, what) => {
    if (mat.tool === 'knife' && minFinger < MIN_KNIFE_FEATURE) {
      warn(`${what}: finger joints are only ${minFinger.toFixed(1)} mm wide — the Knife Blade is cleaner above ${MIN_KNIFE_FEATURE} mm. Make it bigger, raise the finger width, or use thinner board.`);
    }
  };

  // ---------------------------------------------------------------- room box
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
  const lighting = planLighting(kit.lighting, { s, t, W, D, H, Wi, Di, Hi, ceiling: room.ceiling, wallInfo, openings });
  for (const [f, list] of Object.entries(lighting.holes)) (holes[f] ||= []).push(...list);
  for (const w of lighting.warnings) typeof w === 'string' ? warn(w) : warn(w.msg, w.level);

  const roomGroup = newGroup('Room box', rm);
  if (rm.kind === 'board') {
    const res = buildBox({ W, D, H, t, faces: roomFaces, holes, fingerWidth });
    checkFingers(res.minFinger, rm, 'Room box');
    for (const p of res.panels) {
      addPart(roomGroup, ROOM_FACE_NAMES[p.face], rm, [p.outline, ...p.holes]);
      add3d(0, [p.outline, ...p.holes], faceFrame(p.face, W, D, H, t, 'inner'), worldXf, rm.color);
    }
    roomGroup.steps.push(
      `Dry-fit the walls into the floor (${fmtIds(roomGroup.parts)}). The fingers only go together one way — the floor${room.ceiling ? ' and ceiling' : ''} own the corners.`,
      'Glue one joint at a time with PVA or wood glue, checking the corners with a square (a book corner works). Let it set for 30 minutes.',
    );
  } else {
    const net = foldNet({ W, D, H, faces: roomFaces, tabWidth, separate: true, holes });
    for (const piece of net.pieces) {
      addPart(roomGroup, ROOM_FACE_NAMES[piece.faces[0]], rm, piece.polys, piece.scores);
    }
    for (const f of roomFaces) {
      const [a, b] = f === 'bottom' || f === 'top' ? [W, D] : f === 'back' ? [W, H] : [D, H];
      add3d(0, [rectPoly(0, 0, a, b), ...(holes[f] || [])], faceFrame(f, W, D, H, 0, 'inner'), worldXf, rm.color);
    }
    roomGroup.steps.push(
      `Fold each glue tab on ${fmtIds(roomGroup.parts)} along its score line and glue the walls to the floor and to each other, tabs on the inside.`,
    );
    if (rm.thickness < 0.7) warn(`The room box is cut from ${rm.name}; laminate two layers or back it with foam board so it stands up.`, 'info');
  }

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
      add3d(1.5, polys, fr, worldXf, tm.color);
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
      const fr = faceFrame(wall, W, D, H, t + 0.15, 'inner');
      add3d(1, polys, { ...fr, o: v3.add(fr.o, v3.add(v3.mul(fr.U, u0), v3.mul(fr.V, v0))) }, worldXf, wm.color);
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
    add3d(1, [poly, ...ledHoles], { o: [t + m, 0, t + 0.1], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] }, worldXf, fm.color);
    g.steps.push(`Glue floor covering #${g.parts[0]} onto the floor. Tip: score faint lines across it every few mm for floorboards.`);
  }

  // ----------------------------------------------------------------- lights
  if (lighting.enabled && lighting.leds.length) {
    for (const led of lighting.leds) {
      const fr = faceFrame(led.face, W, D, H, t + 0.6, 'inner');
      const hex = LED_COLORS[led.color]?.hex || LED_COLORS.warm.hex;
      add3d(1.7, [ellipsePoly(led.u, led.v, 7, 7, 24)], fr, worldXf, hex, { opacity: 0.28, glow: true });
      add3d(1.8, [ellipsePoly(led.u, led.v, 2, 2, 16)], fr, worldXf, hex, { glow: true });
    }
    const powerName = POWER_KINDS[lighting.power.kind] || POWER_KINDS.battery;
    newGroup('Lighting', null, {
      steps: [
        `You need ${lighting.leds.length} pre-wired 3 V micro LEDs (fairy-light or "grain of wheat" style, with built-in resistors) and a ${powerName.toLowerCase()}. The LED map lists the minimum lead length for each.`,
        `The ${lighting.holeDiameter.toFixed(1)} mm wire holes are already cut. Poke each LED's wires through its hole from the inside before gluing in furniture; a dab of hot glue or tacky glue holds the bulb.`,
        `Glue the power box to the outside of the ${lighting.power.face} wall where the map shows it, then run each wire along its route on the outside and hold it down with thin tape or tiny staples.`,
        'Wire all LEDs in parallel: twist every LED\'s + lead to the power box + lead (red) and every − to − (black), then insulate with heat-shrink or tape. Test before closing up.',
        'Optional: glue a cardstock panel over the back of the room to hide the wiring.',
      ],
      parts: [],
    });
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
      if (c.kind === 'box') compileBox(c, mat, group, cxf, title);
      else {
        const plane = c.wall ? wallPlane : c.plane;
        const fmat = c.material ? getMat(c.material, title) : mat;
        const pid = addPart(group, c.name, fmat, c.polys, c.scores || []);
        add3d(c.surface ? 1.5 : 2, c.polys, plane, c.wall ? worldXf : cxf, fmat.color, { cull: false });
        group.steps.push(`Glue the ${c.name.toLowerCase()} (#${pid}) in place.`);
      }
    }
    if (def.note) group.steps.push(def.note);
  });

  function compileBox(c, mat, group, xf, title) {
    const [bw, bd, bh] = c.size;
    const mt = mat.thickness;
    if (mat.kind === 'fabric') {
      warn(`${title}: ${mat.name} can't make boxes — choose board or cardstock.`);
      return;
    }
    if (mat.kind === 'board') {
      // open boxes show their insides, so only cull back faces of closed ones
      const closed = c.faces.length === 6;
      const res = buildBox({ W: bw, D: bd, H: bh, t: mt, faces: c.faces, shelves: c.shelves || [], scores: c.scores || {}, holes: c.holes || {}, fingerWidth });
      checkFingers(res.minFinger, mat, title);
      const ids = res.panels.map((pn) => {
        add3d(2, [pn.outline, ...pn.holes], faceFrame(pn.face, bw, bd, bh), xf, mat.color, { cull: closed });
        return addPart(group, `${c.name} ${pn.face}`, mat, [pn.outline, ...pn.holes], pn.scores);
      });
      const shelfIds = res.shelves.map((sp, k) => {
        add3d(2, [sp.outline], { o: [sp.x0, sp.y0, sp.z + mt], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] }, xf, mat.color, { cull: true });
        return addPart(group, `${c.name} shelf ${k + 1}`, mat, [sp.outline]);
      });
      group.steps.push(`${c.name}: dry-fit panels ${fmtIds(ids)} — the finger joints interlock. Glue and hold square until set.`);
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
      add3d(2, [rectPoly(0, 0, a, b), ...((c.holes || {})[f] || [])], faceFrame(f, bw, bd, bh), xf, mat.color, { cull: c.faces.length === 6 });
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
    parts, groups, faces3d, sheets, warnings, usedMats, machine,
    dims: { W, D, H, Wi, Di, Hi, t }, lighting, openings, ceiling: !!room.ceiling,
  };
}
