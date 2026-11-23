// Step generator: turns the joint graph into ordered, grouped build steps.
//
// Order: room shell → wallpaper & flooring → window/door trim → lighting →
// each piece of furniture (built, then placed in the room).
// Inside a board box: base, back and first side → shelves → second side,
// front and top, so shelves always slide in before the second side closes
// them in.
//
// step: { n, kind, title, group, unit, parts, joints, text[], cureMin }
//   kind: build | place | info
//   joints: joints made in this step (to this step's parts or earlier ones)
//   cureMin: how long to let the glue set before moving on (glue timers)

import { jointGraph, itemGroups, JOINT_KINDS, ROOM_UNIT } from './joints.js';

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
    if (units.length && (flats.length || boxJoins.length)) {
      push({
        title: flats.length ? `Finish the ${lc(g.title)}` : `Join the ${lc(g.title)}`, group: g.title, unit: units[0], parts: flats.map((n) => n.id), cureMin: CURE.flat,
        joins: boxJoins,
        text: [
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
  return steps;
}

/** Plain-language list of the joint kinds used in a step. */
export const stepJointKinds = (step) => [...new Set(step.joints.map((j) => JOINT_KINDS[j.kind]))];
