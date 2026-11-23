// Joint graph: which parts join which, and how.
//
// Derived from compileKit's output (parts, groups, materials), so nothing in
// the compiler has to change. Box parts are recognised by the names kit.js
// gives them ("<box> <face>", "<box> shelf N", "<box> net"); if a part carries
// `part.build = { unit, role, face }` (proposed kit.js hook, see #5) that wins.
//
// nodes:  { id, name, group, unit, role, face, kind }
//   role: panel (board box face) | piece (separate card face) | net (one-piece
//         card net) | shelf | flat (item flat) | overlay (wallpaper, flooring)
//         | trim (window/door frame)
//   kind: material kind — board | card | fabric
// joints: { a, b, kind, note }
//   kind: finger | slot | glue-tab | flat

import { FACES } from '../box.js';
import { CATALOG } from '../catalog.js';

export const JOINT_KINDS = {
  finger: 'finger joint',
  slot: 'tab and slot',
  'glue-tab': 'glue tab',
  flat: 'glued flat',
};

const FACE_RE = /^(.*) (bottom|top|front|back|left|right)$/;
const SHELF_RE = /^(.*) shelf (\d+)$/;
const NET_RE = /^(.*) net$/;
const ROOM_FACES = { Floor: 'bottom', Ceiling: 'top', 'Back wall': 'back', 'Left wall': 'left', 'Right wall': 'right', Front: 'front' };
const WALL_WORD = { Back: 'back', Left: 'left', Right: 'right' };

export const ROOM_UNIT = 'Room box';
/** Groups compileKit makes before the items, in order. */
const STRUCTURE = ['Room box', 'Window & door trim', 'Wallpaper', 'Flooring', 'Lighting'];

/** Map item groups (by title) to the kit item that produced them. */
export function itemGroups(kit, compiled) {
  const out = new Map();
  let gi = compiled.groups.findIndex((g) => !STRUCTURE.includes(g.title));
  if (gi < 0) return out;
  for (const item of kit.items || []) {
    const def = CATALOG[item.type];
    if (!def) continue; // compileKit skips unknown items too
    const g = compiled.groups[gi++];
    if (g) out.set(g, { item, def });
  }
  return out;
}

export function jointGraph(kit, compiled) {
  const kindOf = new Map((kit.materials || []).map((m) => [m.id, m.kind]));
  for (const m of compiled.usedMats || []) kindOf.set(m.id, m.kind);
  const byId = new Map(compiled.parts.map((p) => [p.id, p]));
  const items = itemGroups(kit, compiled);
  const nodes = [];
  const joints = [];
  const join = (a, b, kind, note) => { if (a && b && a !== b) joints.push({ a, b, kind, ...(note ? { note } : {}) }); };
  const node = (p, extra) => {
    const n = { id: p.id, name: p.name, group: p.group, kind: kindOf.get(p.material) || 'board', face: null, ...extra, ...(p.build || {}) };
    nodes.push(n);
    return n;
  };

  // Faces of one box (map face -> node), joined along shared edges.
  const joinFaces = (faces, kind) => {
    const done = new Set();
    for (const [f, n] of Object.entries(faces)) {
      for (const g of FACES[f].nb) {
        const m = faces[g];
        const key = [f, g].sort().join('|');
        if (m && !done.has(key)) { done.add(key); join(n.id, m.id, kind); }
      }
    }
  };

  const roomFaces = {};
  for (const g of compiled.groups) {
    const parts = g.parts.map((id) => byId.get(id));
    if (g.title === 'Room box') {
      for (const p of parts) {
        const face = ROOM_FACES[p.name];
        const n = node(p, { unit: ROOM_UNIT, face });
        n.role = n.kind === 'board' ? 'panel' : 'piece';
        if (face) roomFaces[face] = n;
      }
      const kinds = Object.values(roomFaces).map((n) => n.role);
      joinFaces(roomFaces, kinds.includes('panel') ? 'finger' : 'glue-tab');
      continue;
    }
    if (g.title === 'Wallpaper' || g.title === 'Flooring') {
      for (const p of parts) {
        const face = g.title === 'Flooring' ? 'bottom' : WALL_WORD[p.name.split(' ')[0]];
        node(p, { unit: g.title, role: 'overlay', face });
        join(p.id, roomFaces[face]?.id, 'flat');
      }
      continue;
    }
    if (g.title === 'Window & door trim') {
      for (const p of parts) {
        const face = WALL_WORD[p.name.split(' ')[0]];
        node(p, { unit: g.title, role: 'trim', face });
        join(p.id, roomFaces[face]?.id, 'flat');
      }
      continue;
    }

    // ----------------------------------------------------------- an item
    const info = items.get(g);
    const boxes = new Map(); // box name -> { faces, shelves, net }
    const box = (name) => {
      if (!boxes.has(name)) boxes.set(name, { faces: {}, shelves: [], net: null, partsByFace: {} });
      return boxes.get(name);
    };
    // first pass: candidate box faces (a face name alone isn't enough — a box
    // needs two faces, a net or shelves)
    const cand = parts.map((p) => {
      if (p.build) return { p, box: p.build.unit?.split('/').slice(1).join('/') || null, ...p.build };
      let m;
      if ((m = p.name.match(SHELF_RE))) return { p, box: m[1], role: 'shelf' };
      if ((m = p.name.match(NET_RE))) return { p, box: m[1], role: 'net' };
      if ((m = p.name.match(FACE_RE))) return { p, box: m[1], role: 'face', face: m[2] };
      return { p, box: null, role: 'flat' };
    });
    const faceCount = {};
    for (const c of cand) if (c.role === 'face') faceCount[c.box] = (faceCount[c.box] || 0) + 1;
    for (const c of cand) {
      const isBox = c.box !== null && (c.role !== 'face' || faceCount[c.box] >= 2 || cand.some((d) => d.box === c.box && d.role === 'shelf'));
      if (!isBox) { c.role = 'flat'; c.box = null; c.face = null; }
    }
    const flats = [];
    for (const c of cand) {
      if (c.role === 'flat') { flats.push(c.p); continue; }
      const b = box(c.box);
      const unit = `${g.title}/${c.box}`;
      if (c.role === 'shelf') b.shelves.push(node(c.p, { unit, role: 'shelf' }));
      else if (c.role === 'net') b.net = node(c.p, { unit, role: 'net' });
      else {
        const n = node(c.p, { unit, role: null, face: c.face });
        n.role = n.kind === 'board' ? 'panel' : 'piece';
        b.faces[c.face] = n;
      }
    }
    for (const b of boxes.values()) {
      const panels = Object.values(b.faces);
      const board = panels.some((n) => n.role === 'panel');
      joinFaces(b.faces, board ? 'finger' : 'glue-tab');
      for (const s of b.shelves) {
        if (board) for (const f of ['left', 'right', 'back']) join(s.id, b.faces[f]?.id, 'slot');
        else if (b.net) join(s.id, b.net.id, 'glue-tab');
        else for (const f of ['left', 'right', 'back']) join(s.id, b.faces[f]?.id, 'glue-tab');
      }
    }
    // boxes of one item glue to each other (seat ↔ arms), flats onto the first box
    const anchors = [...boxes.values()].map((b) => b.net || b.faces.back || b.faces.bottom || Object.values(b.faces)[0] || b.shelves[0]).filter(Boolean);
    for (let k = 1; k < anchors.length; k++) join(anchors[k].id, anchors[0].id, 'flat', 'boxes of one piece');
    const firstUnit = anchors[0]?.unit;
    for (const p of flats) {
      node(p, { unit: firstUnit || `${g.title}/${p.name}`, role: 'flat' });
      if (anchors[0]) join(p.id, anchors[0].id, 'flat');
    }
    // the finished piece sits on the floor or hangs on its wall
    const where = info?.def.placement === 'wall' ? (['back', 'left', 'right'].includes(info.item.wall) ? info.item.wall : 'back') : 'bottom';
    const rep = anchors[0] || nodes.find((n) => n.id === flats[0]?.id);
    if (rep) join(rep.id, roomFaces[where]?.id, 'flat', 'place in room');
  }
  return { nodes, joints };
}

/** Joints touching part `id`. */
export const jointsOf = (graph, id) => graph.joints.filter((j) => j.a === id || j.b === id);
