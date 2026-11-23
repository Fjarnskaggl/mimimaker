// LED planning: wire holes through the panels, and wire routes along the
// outside of the room box to the power box (battery pack or USB).
//
// Routes are computed on an unfolded "cross" of the room's outer surfaces,
// with the back wall in the middle, the side walls folded out to its sides
// and the ceiling / floor folded out above and below it:
//
//              [ ceiling ]
//   [ left ]   [  back   ]   [ right ]
//              [  floor  ]
//
// Net coordinates are millimetres as seen from INSIDE the room (x right,
// y up, origin at the back wall's bottom-left corner). The map is drawn
// mirrored (seen from behind), which is the side you work on when wiring.

import { ellipsePoly, pointInPolygon, bbox } from './geometry.js';
import { planCircuit, supplyFor } from './lighting/circuit.js';
import { EFFECTS, effectOf, effectLoad, effectWarnings } from './lighting/effects.js';
import { planCutouts } from './lighting/cutouts.js';
import { planCover, coverRange } from './lighting/cover.js';
import { wiredLights, planShellLed } from './lighting/shell.js';
import { baseLayout } from './lighting/base.js';
import { effectHoles, planMotion } from './lighting/motion.js';

export const LED_COLORS = {
  warm: { name: 'Warm white', hex: '#ffc767' },
  cool: { name: 'Cool white', hex: '#dfeeff' },
  amber: { name: 'Amber', hex: '#ff9b3d' },
  pink: { name: 'Pink', hex: '#ff8cc6' },
  green: { name: 'Green', hex: '#8ef0a0' },
};
export const POWER_KINDS = {
  battery: 'Battery box with switch (2×AA, 2×AAA or CR2032)',
  usb: 'USB cable with inline switch',
};
export const WIRE_COLORS = ['#e0582f', '#2f7fe0', '#2aa36b', '#b04fd6', '#d1a20f', '#14a3b8', '#d6336c', '#6b7a1f'];

/** Map a point in a room panel's (u, v) coordinates onto the unfolded net. */
export function netPoint(face, u, v, { W, D, H }) {
  switch (face) {
    case 'back': return [u, v];
    case 'left': return [u - D, v];
    case 'right': return [W + D - u, v];
    case 'top': return [u, H + D - v];
    case 'bottom': return [u, v - D];
    default: throw new Error(`no net position for ${face}`);
  }
}

/** Rectangle of each face on the net. */
export function netFaces(dims, ceiling) {
  const { W, D, H } = dims;
  const faces = [
    { face: 'back', name: 'Back wall', x0: 0, y0: 0, x1: W, y1: H },
    { face: 'left', name: 'Left wall', x0: -D, y0: 0, x1: 0, y1: H },
    { face: 'right', name: 'Right wall', x0: W, y0: 0, x1: W + D, y1: H },
    { face: 'bottom', name: 'Floor', x0: 0, y0: -D, x1: W, y1: 0 },
  ];
  if (ceiling) faces.push({ face: 'top', name: 'Ceiling', x0: 0, y0: H, x1: W, y1: H + D });
  return faces;
}

// Point where a route leaves `face` for the back wall, keeping its other coordinate.
function seam(face, [x, y], { W, H }) {
  switch (face) {
    case 'left': return [0, y];
    case 'right': return [W, y];
    case 'top': return [x, H];
    case 'bottom': return [x, 0];
    default: return [x, y];
  }
}

const segHitsBox = ([ax, ay], [bx, by], b) => {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  return x1 > b.x0 && x0 < b.x1 && y1 > b.y0 && y0 < b.y1;
};
const pathLength = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/**
 * Route from a to b ({face, p: net point}) along the outside surfaces,
 * through the back wall when they're on different faces. Tries both L-shaped
 * orders on the back wall and prefers one that avoids the openings.
 */
export function routeWire(a, b, dims, obstacles = []) {
  const start = a.p, end = b.p;
  const crosses = (pts) => obstacles.some((o) => pts.slice(1).some((p, i) => segHitsBox(pts[i], p, o)));
  const clean = (pts) => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
  const options = [];
  if (a.face === b.face) {
    options.push([start, [end[0], start[1]], end], [start, [start[0], end[1]], end]);
  } else {
    const e1 = a.face === 'back' ? start : seam(a.face, start, dims);
    const e2 = b.face === 'back' ? end : seam(b.face, end, dims);
    for (const mid of [[e2[0], e1[1]], [e1[0], e2[1]]]) options.push([start, e1, mid, e2, end]);
  }
  const routes = options.map(clean);
  const clear = routes.find((r) => !crosses(r));
  return { points: clear || routes[0], crossesOpening: !clear };
}

/**
 * @param lighting kit.lighting
 * @param ctx { s, t, W, D, H, Wi, Di, Hi, ceiling, wallInfo, openings, shellLights?, shellObstacles?, baseT? }
 *   baseT: thickness of the board a hidden base is cut from (default t)
 *   shellLights: LEDs a shell places itself, with wire paths to its own back-wall holes (lighting/shell.js)
 *   shellObstacles: windows in a shell's back wall (back panel polygons) for routes and the power box to avoid
 */
export function planLighting(lighting, ctx) {
  const warnings = [];
  const holes = {};
  const leds = [];
  if (!lighting?.enabled) return { enabled: false, leds, holes, warnings, parts: [], steps: [] };
  const { s, t, D, Wi, Di, Hi, wallInfo } = ctx;
  const r = Math.max(0.5, (lighting.holeDiameter || 3) / 2);

  const obstacles = ctx.openings.map((o) => {
    const b = bbox([o.poly.map(([u, v]) => netPoint(o.wall, u, v, ctx))]);
    return { x0: b.x0 - 0.5, y0: b.y0 - 0.5, x1: b.x1 + 0.5, y1: b.y1 + 0.5 };
  });
  // windows in a shell's back wall (#16): routes keep clear, the power box mustn't cover one
  for (const poly of ctx.shellObstacles || []) {
    const b = bbox([poly.map(([u, v]) => netPoint('back', u, v, ctx))]);
    obstacles.push({ x0: b.x0 - 0.5, y0: b.y0 - 0.5, x1: b.x1 + 0.5, y1: b.y1 + 0.5, window: true });
  }
  const inOpening = (face, u, v) => ctx.openings.some((o) => o.wall === face && pointInPolygon([u, v], o.poly));

  // power box (outside a wall)
  const pw = lighting.power || {};
  const pWall = wallInfo[pw.wall] ? pw.wall : 'back';
  const pu = wallInfo[pWall].u0 + (pw.pos ?? 0) * s, pv = t + (pw.elev ?? 0) * s;
  // hidden base (Rolife-style): the box sits under the room and the wires come in beside its hatch
  const base = pw.mount === 'base'
    ? baseLayout({ supply: supplyFor(pw), pos: pWall === 'back' ? pw.pos : undefined, switchAt: pw.switchAt, switchKind: pw.switch, W: ctx.W, D, t: ctx.baseT ?? t, s })
    : null;
  if (base && pWall !== 'back') {
    warnings.push({ level: 'info', msg: 'In the hidden base the battery box sits under the back of the room, in the middle — set the power box to the back wall to move it along.' });
  }
  const power = base
    ? { face: 'base', u: base.entry.x, v: 0, p: [base.entry.x, 0], kind: pw.kind || 'battery', base }
    : { face: pWall, u: pu, v: pv, p: netPoint(pWall, pu, pv, ctx), kind: pw.kind || 'battery' };
  if (base) warnings.push(...base.warnings);
  else if (pu < 0 || pu > wallInfo[pWall].u0 + wallInfo[pWall].len || pv < 0 || pv > t + Hi) {
    warnings.push(`The power box is off the ${pWall} wall — move it.`);
  }
  if (!base && pWall === 'back' && obstacles.some((o) => o.window && power.p[0] > o.x0 - 15 && power.p[0] < o.x1 + 15 && power.p[1] > o.y0 - 10 && power.p[1] < o.y1 + 10)) {
    warnings.push('The power box sits over a window in the back wall — move it lower or to one side.');
  }

  (lighting.leds || []).forEach((led, i) => {
    const label = `L${i + 1}`;
    const title = `${label}${led.name ? ` (${led.name})` : ''}`;
    let face, u, v;
    if (led.mount === 'ceiling' || led.mount === 'floor') {
      face = led.mount === 'ceiling' ? 'top' : 'bottom';
      if (face === 'top' && !ctx.ceiling) { warnings.push(`${title} is a ceiling light, but the room has no ceiling — turn the ceiling on or move it to a wall.`); return; }
      u = t + (led.x ?? 0) * s;
      v = D - t - (led.y ?? 0) * s;
      if (led.x < 0 || led.y < 0 || (led.x ?? 0) * s > Wi - 1 || (led.y ?? 0) * s > Di - 1) warnings.push(`${title} is outside the room.`);
    } else {
      face = wallInfo[led.wall] ? led.wall : 'back';
      const wi = wallInfo[face];
      u = wi.u0 + (led.pos ?? 0) * s;
      v = t + (led.elev ?? 0) * s;
      if (u < wi.u0 + r + 1 || u > wi.u0 + wi.len - r - 1 || v < t + r + 1 || v > t + Hi - r - 1) warnings.push(`${title} is off the ${face} wall.`);
      if (inOpening(face, u, v)) warnings.push(`${title} sits inside a window or door opening.`);
    }
    const place = face === 'top' || face === 'bottom'
      ? { face, mount: led.mount, start: u - t, span: Wi }
      : { face, mount: led.mount, start: u - wallInfo[face].u0, span: wallInfo[face].len };
    warnings.push(...effectWarnings(led, place, title));
    const fx = effectOf(led);
    const misplaced = (fx === 'fan' && face !== 'top') || (fx === 'turntable' && face !== 'bottom'); // effectWarnings says so
    for (const h of effectHoles(misplaced ? 'steady' : fx, u, v, r)) (holes[face] ||= []).push(h); // a motor's shaft hole, a speaker grille
    const p = netPoint(face, u, v, ctx);
    // into a hidden base, a floor light's wires drop straight through its hole
    const route = base && face === 'bottom' ? { points: [p], crossesOpening: false } : routeWire({ face, p }, power, ctx, obstacles);
    if (route.crossesOpening) warnings.push(`${label}'s wire would cross a window or door on the outside — tape it around the opening by hand.`);
    const inBase = !base ? 0 : face === 'bottom' ? base.floorRun(u, v) : base.inRun;
    const length = pathLength(route.points) + t + inBase;
    leds.push({
      label, name: led.name || '', mount: led.mount, face, u, v, p, color: led.color || 'warm',
      route: route.points, length, leadCm: Math.ceil((length / 10 + 3) / 5) * 5,
      effect: fx, load: effectLoad(led), misplaced,
      size: Math.min(200, Math.max(20, led.sizeMm ?? EFFECTS[fx]?.defaults?.sizeMm ?? 50)),
    });
  });
  // LEDs the shell places itself: its own holes, wired from there (#16)
  for (const light of wiredLights(ctx.shellLights)) {
    const led = planShellLed(light, leds.length, { power, t: t + (base ? base.inRun : 0), route: (a, b) => routeWire(a, b, ctx, obstacles) });
    if (led.crossesOpening) warnings.push(`${led.label}'s wire would cross a window or door on the outside — tape it around the opening by hand.`);
    leds.push(led);
  }
  if (!base && leds.some((l) => l.face === 'bottom')) {
    warnings.push({ level: 'info', msg: 'Floor lights feed their wires underneath the room — glue 3–4 mm feet (or felt pads) under the floor so the wires aren\'t pinched.' });
  }
  const circuit = planCircuit(leds.map((l) => l.load), supplyFor(pw));
  power.supply = circuit.supply.id;
  const cut = planCutouts({ ...power, mount: base ? 'base' : pw.mount }, ctx);
  power.mount = base ? 'base' : pw.mount === 'flush' ? 'flush' : 'outside';
  power.cutouts = cut.cutouts;
  for (const c of cut.cutouts) (holes[c.face] ||= []).push(c.poly);
  warnings.push(...cut.warnings);
  warnings.push(...circuit.warnings);
  const cover = planCover({ cover: lighting.cover, leds, power, openings: ctx.openings, W: ctx.W, H: ctx.H, s, t });
  warnings.push(...cover.warnings);
  const motion = planMotion(leds.filter((l) => !l.misplaced));
  return { enabled: true, leds, holes, power, holeDiameter: r * 2, warnings, circuit, parts: [...cover.parts, ...motion.parts], steps: [...cover.steps, ...motion.steps],
    coverRange: coverRange(circuit.supply.id, { W: ctx.W, H: ctx.H, s, t }) };
}
