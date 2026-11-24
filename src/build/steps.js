// Step generator: turns the joint graph into ordered, grouped build steps.
//
// Order: room shell → wallpaper & flooring → window/door trim → lighting →
// each piece of furniture (built, then placed in the room) → roof.
// A book-nook shell is built from its declared joints: floor, back and first
// side → anything that slots into them (shelves, landing, bench) → the second
// side → the shell's other parts → … → the roof and anything only on it, last.
// Inside a board box: base, back and first side → shelves → second side,
// front and top, so shelves always slide in before the second side closes
// them in.
//
// step: { n, kind, title, group, unit, parts, joints, text[], cureMin }
//   kind: build | place | info
//   joints: joints made in this step (to this step's parts or earlier ones)
//   cureMin: how long to let the glue set before moving on (glue timers)

import { jointGraph, itemGroups, shellPartIds, isShellGroup, roomRoofGroup, JOINT_KINDS, ROOM_UNIT } from './joints.js';

/** Minutes to let glue grab before handling, by what's being joined. */
export const CURE = { room: 30, board: 15, card: 5, overlay: 10, flat: 5, place: 5 };

const ids = (list) => list.map((n) => `#${n.id ?? n}`).join(', ');
const lc = (s) => s.toLowerCase();
const unitName = (unit) => unit.split('/').slice(1).join('/');
const BOX_ORDER = ['bottom', 'back', 'left', 'right', 'front', 'top'];

export function buildSteps(kit, compiled, graph = jointGraph(kit, compiled)) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const built = new Set();
  const steps = [];
  const push = (step) => {
    const mine = new Set(step.parts);
    // placing a piece and gluing its boxes together are joints of their own
    // steps (place / finish), not of building any one box
    const own = (j) => j.note === 'place in room' || j.note === 'boxes of one piece';
    const joints = step.kind === 'place'
      ? graph.joints.filter((j) => j.note === 'place in room' && nodeById.get(j.a)?.group === step.group)
      : [
        ...graph.joints.filter((j) => !own(j) && ((mine.has(j.a) && (built.has(j.b) || mine.has(j.b))) || (mine.has(j.b) && built.has(j.a)))),
        ...(step.joins || []),
      ];
    delete step.joins;
    step.parts.forEach((id) => built.add(id));
    steps.push({ kind: 'build', unit: null, cureMin: 0, ...step, joints, n: steps.length + 1 });
  };
  const groupNodes = (title) => graph.nodes.filter((n) => n.group === title);
  const groupByTitle = new Map(compiled.groups.map((g) => [g.title, g]));

  // ---------------------------------------------------------------- room
  const room = groupNodes('Room box');
  if (room.length) {
    const board = room.some((n) => n.role === 'panel');
    const order = [...room].sort((a, b) => BOX_ORDER.indexOf(a.face) - BOX_ORDER.indexOf(b.face));
    push({
      title: 'Build the room box', group: 'Room box', unit: ROOM_UNIT, parts: order.map((n) => n.id),
      cureMin: CURE.room,
      text: board ? [
        `Dry-fit the walls into the floor (${ids(order)}). The fingers only go together one way — the floor${room.some((n) => n.face === 'top') ? ' and ceiling own' : ' owns'} the corners.`,
        'Glue one joint at a time with PVA or wood glue, checking each corner with a square (a book corner works).',
      ] : [
        `Crease the score lines on ${ids(order)} and fold every glue tab inwards.`,
        'Glue the walls to the floor first, then to each other, tabs on the inside. Hold each joint until it grabs.',
      ],
    });
  }

  // --------------------------------------------------------------- shell
  const shellIds = shellPartIds(compiled);
  const shellGroups = compiled.groups.filter((g) => isShellGroup(g, shellIds));
  const partners = (id) => graph.joints.filter((j) => j.a === id || j.b === id).map((j) => (j.a === id ? j.b : j.a));
  // the lid: the top wall, any roof, and parts that only join those
  const lid = new Set(graph.nodes.filter((n) => n.role === 'roof' || (shellIds.has(n.id) && n.face === 'top')).map((n) => n.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const n of graph.nodes) {
      if (lid.has(n.id) || !shellIds.has(n.id)) continue;
      const ps = partners(n.id);
      if (ps.length && ps.every((q) => lid.has(q))) { lid.add(n.id); grew = true; }
    }
  }
  // the shell's own notes: roof ones go with the roof, the rest with the walls
  const shellNotes = shellGroups.find((g) => g.title === 'Shell')?.steps || [];
  const roofNotes = shellNotes.slice(1).filter((x) => /\broof\b/i.test(x));
  const wallNotes = shellNotes.slice(1).filter((x) => !roofNotes.includes(x));
  if (shellGroups.length) {
    const texts = (title) => shellGroups.find((g) => g.title === title)?.steps || [];
    const walls = groupNodes('Shell').filter((n) => n.face && !lid.has(n.id));
    const first = ['bottom', 'back', 'left'].map((f) => walls.find((n) => n.face === f)).filter(Boolean);
    const second = walls.filter((n) => !first.includes(n));
    const firstIds = new Set(first.map((n) => n.id));
    const slotted = graph.nodes.filter((n) => shellIds.has(n.id) && !n.face && !lid.has(n.id)
      && graph.joints.some((j) => j.kind === 'slot' && ((j.a === n.id && firstIds.has(j.b)) || (j.b === n.id && firstIds.has(j.a)))));
    const wallList = (list) => list.map((n) => `${lc(n.name)} #${n.id}`).join(', ');
    const fingers = `the fingers only go together one way. Glue one joint at a time and check each corner is square`;
    if (!slotted.length || !second.length) {
      push({
        title: 'Build the shell', group: 'Shell', unit: 'Shell', parts: [...first, ...second, ...slotted].map((n) => n.id), cureMin: CURE.room,
        text: [shellNotes[0] || `Dry-fit ${wallList([...first, ...second])} — ${fingers}. Leave the roof off for now.`, ...wallNotes],
      });
    } else {
      push({
        title: 'Start the shell: floor, back and one side', group: 'Shell', unit: 'Shell', parts: first.map((n) => n.id), cureMin: CURE.room,
        text: [`Dry-fit ${wallList(first)} — ${fingers}. Check every slot is clear before gluing, and leave the roof off for now.`, ...wallNotes],
      });
      const slotsIn = first.filter((w) => slotted.some((n) => graph.joints.some((j) => j.kind === 'slot' && [j.a, j.b].includes(n.id) && [j.a, j.b].includes(w.id))));
      push({
        title: `Slot in the ${[...new Set(slotted.map((n) => lc(n.group)))].join(' and ')}`, group: slotted[0].group, unit: slotted[0].unit, parts: slotted.map((n) => n.id), cureMin: 0,
        text: [`Push the tabs of ${ids(slotted)} into their slots in the ${slotsIn.map((w) => lc(w.name)).join(' and ')} — before the ${second.map((w) => lc(w.name)).join(' and ')} goes on. Don't glue them yet.`],
      });
      push({
        title: 'Close the shell', group: 'Shell', unit: 'Shell', parts: second.map((n) => n.id), cureMin: CURE.room,
        text: [`Fit ${wallList(second)} over the tabs and the remaining fingers, then run glue along every joint and slot from the inside.`],
      });
    }
    // the shell's other parts, a group at a time, each after what it glues to
    const done = new Set([...first, ...second, ...slotted].map((n) => n.id));
    let todo = shellGroups.map((g) => ({ g, ns: groupNodes(g.title).filter((n) => !done.has(n.id) && !lid.has(n.id)) })).filter((x) => x.ns.length);
    while (todo.length) {
      const ready = todo.find(({ ns }) => ns.every((n) => partners(n.id).every((q) => done.has(q) || lid.has(q) || ns.some((m) => m.id === q) || !shellIds.has(q))));
      const { g, ns } = ready || todo[0];
      todo = todo.filter((x) => x.g !== g);
      const own = texts(g.title);
      const whole = groupNodes(g.title).every((n) => ns.includes(n) || lid.has(n.id));
      push({
        title: `Add the ${lc(g.title)}`, group: g.title, unit: g.title, parts: ns.map((n) => n.id),
        cureMin: ns.some((n) => n.kind === 'board') ? CURE.board : CURE.card,
        text: whole && own.length ? [...own] : ns.map((n) => `Glue the ${lc(n.name)} (#${n.id}) in place.`),
      });
      ns.forEach((n) => done.add(n.id));
    }
  }

  // ------------------------------------------------- overlays and trim
  for (const title of ['Wallpaper', 'Flooring']) {
    const ns = groupNodes(title);
    if (!ns.length) continue;
    push({
      title: title === 'Wallpaper' ? 'Paper the walls' : 'Lay the floor', group: title, unit: title, parts: ns.map((n) => n.id),
      cureMin: CURE.overlay,
      text: title === 'Wallpaper'
        ? [`Glue wallpaper ${ids(ns)} to the inside of each wall with a glue stick or spray adhesive. Line the cut-outs up with the window and door openings and the LED holes.`]
        : [`Glue floor covering ${ids(ns)} onto the floor. Tip: score faint lines across it every few mm for floorboards.`],
    });
  }
  const trim = groupNodes('Window & door trim');
  if (trim.length) {
    push({
      title: 'Frame the windows and doors', group: 'Window & door trim', unit: 'Window & door trim', parts: trim.map((n) => n.id),
      cureMin: CURE.flat,
      text: [
        ...trim.map((n) => `Glue ${lc(n.name)} #${n.id} around its opening on the inside of the ${n.face} wall, over the wallpaper.`),
        ...(trim.some((n) => /window/.test(n.name)) ? ['Optional: glue clear acetate behind the window frames for glass.'] : []),
      ],
    });
  }
  const light = groupByTitle.get('Lighting');
  if (light) push({ kind: 'info', title: 'Wire the lights', group: 'Lighting', parts: [], text: [...light.steps] });

  // ------------------------------------------------------------ furniture
  for (const [g, { item, def }] of itemGroups(kit, compiled)) {
    const ns = groupNodes(g.title);
    if (!ns.length) continue;
    const units = [...new Set(ns.filter((n) => n.role !== 'flat').map((n) => n.unit))];
    for (const unit of units) {
      const un = ns.filter((n) => n.unit === unit && n.role !== 'flat');
      const shelves = un.filter((n) => n.role === 'shelf');
      const net = un.find((n) => n.role === 'net');
      const faces = Object.fromEntries(un.filter((n) => n.face).map((n) => [n.face, n]));
      const name = unitName(unit);
      if (net || un.some((n) => n.role === 'piece')) {
        const body = net ? [net] : BOX_ORDER.map((f) => faces[f]).filter(Boolean);
        push({
          title: `Fold up the ${lc(name)}`, group: g.title, unit, parts: body.map((n) => n.id), cureMin: CURE.card,
          text: [net
            ? `Crease every score line on ${ids(body)} (a ruler and bone folder help), fold it up and glue the tabs on the inside.`
            : `Crease the tabs on ${ids(body)} and glue the pieces together, tabs on the inside.`],
        });
        if (shelves.length) {
          push({
            title: `Glue the shelves into the ${lc(name)}`, group: g.title, unit, parts: shelves.map((n) => n.id), cureMin: CURE.card,
            text: [`Fold the tabs of shelves ${ids(shelves)} down and glue them inside at even heights, working from the bottom up.`],
          });
        }
        continue;
      }
      // board box: base + back + first side → shelves → second side, front, top
      const start = ['bottom', 'back', 'left'].map((f) => faces[f]).filter(Boolean);
      const first = start.length ? start : [faces[BOX_ORDER.find((f) => faces[f])]];
      const rest = BOX_ORDER.map((f) => faces[f]).filter((n) => n && !first.includes(n));
      const fingerText = (list) => `Dry-fit ${ids(list)} — the finger joints only go together one way. Glue each joint with PVA and hold it square until it grabs.`;
      if (!shelves.length) {
        push({ title: `Build the ${lc(name)}`, group: g.title, unit, parts: [...first, ...rest].map((n) => n.id), cureMin: CURE.board, text: [fingerText([...first, ...rest])] });
        continue;
      }
      push({ title: `Start the ${lc(name)}: base, back and one side`, group: g.title, unit, parts: first.map((n) => n.id), cureMin: CURE.board, text: [fingerText(first)] });
      const slotsIn = ['left', 'back'].filter((f) => faces[f] && first.includes(faces[f]));
      push({
        title: `Slide the shelves into the ${lc(name)}`, group: g.title, unit, parts: shelves.map((n) => n.id), cureMin: 0,
        text: [`Slide shelves ${ids(shelves)} into their slots in the ${slotsIn.join(' and ')}${faces.right ? ' — before the second side goes on' : ''}. Don't glue them yet.`],
      });
      push({
        title: `Close the ${lc(name)}`, group: g.title, unit, parts: rest.map((n) => n.id), cureMin: CURE.board,
        text: [`Fit ${ids(rest)} over the shelf tabs and the remaining fingers, then run glue along every joint and shelf slot from the inside.`],
      });
    }

    // flats and joining several boxes into one piece
    const flats = ns.filter((n) => n.role === 'flat');
    const boxJoins = graph.joints.filter((j) => j.note === 'boxes of one piece' && nodeById.get(j.a)?.group === g.title);
    const note = def.note && !/shelves/i.test(def.note) ? [def.note] : [];
    // bought rods (stems, posts): cut to length in the step that puts them in
    const rods = (compiled.hardware || []).map((h, k) => ({ h, k })).filter(({ h }) => h.group === g.title);
    if (units.length && (flats.length || boxJoins.length || rods.length)) {
      push({
        title: flats.length || rods.length ? `Finish the ${lc(g.title)}` : `Join the ${lc(g.title)}`, group: g.title, unit: units[0], parts: flats.map((n) => n.id), cureMin: CURE.flat,
        joins: boxJoins, hardware: rods.map(({ k }) => k),
        text: [
          ...rods.map(({ h }) => h.text),
          ...flats.map((n) => `Glue the ${lc(n.name)} (#${n.id}) in place.`),
          ...boxJoins.map((j) => `Attach the ${lc(unitName(nodeById.get(j.a).unit))} to the ${lc(unitName(nodeById.get(j.b).unit))}.`),
          ...note,
        ],
      });
    } else if (units.length && note.length) {
      steps.at(-1).text.push(...note);
    }
    const where = def.placement === 'wall' ? `on the ${item.wall || 'back'} wall` : 'on the floor';
    push({
      kind: 'place', title: `Place the ${lc(g.title)}`, group: g.title, unit: units[0] || flats[0]?.unit,
      parts: units.length ? [] : flats.map((n) => n.id), cureMin: CURE.place,
      text: [
        units.length ? `Glue the ${lc(g.title)} ${where} where the plan shows it.` : `Glue ${ids(flats)} ${where} where the plan shows it.`,
        ...(!units.length ? note : []),
      ],
    });
  }
  // ---------------------------------------------------------------- roof
  if (lid.size) {
    const ns = graph.nodes.filter((n) => lid.has(n.id));
    const shellText = roofNotes;
    const roofText = (roomRoofGroup(kit, compiled) || shellGroups.find((g) => g.title === 'Roof'))?.steps || [];
    const others = ns.filter((n) => n.role !== 'roof' && !n.face);
    push({
      title: 'Put the roof on', group: ns[0].group, unit: ns[0].unit, parts: ns.map((n) => n.id), cureMin: CURE.room,
      text: [
        ...(shellText.length ? shellText : ns.some((n) => n.face) ? [`Test the lights and check the inside, then glue ${ids(ns.filter((n) => n.face))} on along every joint.`] : []),
        ...roofText,
        ...others.map((n) => `Glue the ${lc(n.name)} (#${n.id}) onto the roof.`),
      ].filter((x, i, a) => x && a.indexOf(x) === i),
    });
  }
  return steps;
}

/** Plain-language list of the joint kinds used in a step. */
export const stepJointKinds = (step) => [...new Set(step.joints.map((j) => JOINT_KINDS[j.kind]))];
