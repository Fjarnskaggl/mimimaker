// Two-storey shell: the open-front nook split into two storeys by an upper
// floor slotted into both side walls and the back wall, with an optional
// stair up through a stairwell in the front-left corner (straight up the left
// wall, src/shells/stairs.js, or spiral round a dowel post, src/shells/spiral.js),
// and internal walls (each with a doorway) that split a storey into two rooms.
//
// With a stair the upper floor is two boards: the main floor beside the
// stairwell, and a landing strip behind the stair top. A rail guards the
// stairwell edge. Internal walls are tabbed into the floor below them: the
// ground wall into the shell floor (the upper floor then rests on it, so it
// goes in first), the upstairs wall into the upper floor and the roof.

import { nookWalls } from './nook.js';
import { buildStairs } from './stairs.js';
import { pickSteps } from './staircase.js';
import { buildSpiralStairs, spiralMinRadius } from './spiral.js';
import { ellipsePoly, panelOutline, profilePlain, profileTabs, rectPoly } from '../geometry.js';

export const TWOSTOREY_DEFAULTS = {
  floorHeight: 0.5, stairs: 'straight', stairWidth: 0, spiralRadius: 0, steps: 0, risers: true, rail: true,
  groundWall: true, upperWall: true, wallPos: 0.65,
};

export const TWOSTOREY_PARAMS = [
  { key: 'floorHeight', label: 'Upper floor height (share of the inside)', type: 'num', min: 0.3, max: 0.7, step: 0.05 },
  { key: 'stairs', label: 'Stairs', type: 'choice', options: [['none', 'None'], ['straight', 'Straight'], ['spiral', 'Spiral']] },
  { key: 'stairWidth', label: 'Straight stair width (0 = auto)', type: 'num', min: 0, max: 80, step: 1, unit: 'mm' },
  { key: 'spiralRadius', label: 'Spiral radius (0 = auto)', type: 'num', min: 0, max: 50, step: 1, unit: 'mm' },
  { key: 'steps', label: 'Steps (0 = auto)', type: 'int', min: 0, max: 40 },
  { key: 'risers', label: 'Closed risers (straight stair)', type: 'bool' },
  { key: 'rail', label: 'Stairwell rail', type: 'bool' },
  { key: 'groundWall', label: 'Wall on the ground floor', type: 'bool' },
  { key: 'upperWall', label: 'Wall upstairs', type: 'bool' },
  { key: 'wallPos', label: 'Wall position (share of the width)', type: 'num', min: 0.2, max: 0.8, step: 0.05 },
];

/** Least clear height of a storey (mm). */
const STOREY_MIN = 40;
/** Slots are this much bigger than their tabs all round (mm). */
const CLEAR = 0.1;
/** Board left under a doorway (mm). */
const SILL = 3;
/** A comfortable stair pitch (rise / going), and the walkable range around it. */
const PITCH = 0.72, PITCH_RANGE = [0.4, 1.2];
const STAIR_HINT = 'move the upper floor down, use a deeper shelf gap (gap depth), or change the step count';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));
const tabCount = (L) => (L > 50 ? 2 : 1);
const tabsOf = (profile) => profile.filter((s) => s.d < 0);

export function buildTwoStorey({ W, D, H, t, fingerWidth, holes = {} }, params) {
  const P = { ...TWOSTOREY_DEFAULTS, ...params };
  const Wi = W - 2 * t, Di = D - t, Hi = H - 2 * t;
  const parts = [], joints = [], lights = [], warnings = [];
  const stairSteps = [], railSteps = [];
  const link = (a, b, kind) => joints.push({ a, b, kind });
  const wallHoles = { ...holes };
  for (const f of ['left', 'right', 'back', 'bottom', 'top']) wallHoles[f] = [...(holes[f] || [])];
  // a slot for a tab of thickness t: u along the edge, v0 where the board starts
  const slotU = (u0, u1, v0) => rectPoly(u0 - CLEAR, v0 - CLEAR, u1 - u0 + 2 * CLEAR, t + 2 * CLEAR);
  const slotV = (u0, v0, v1) => rectPoly(u0 - CLEAR, v0 - CLEAR, t + 2 * CLEAR, v1 - v0 + 2 * CLEAR);

  const zF = clamp(P.floorHeight, 0.3, 0.7) * Hi; // underside of the upper floor (world z)
  const floorTop = t + zF;
  const ground = zF - t, upper = H - t - floorTop; // clear storey heights
  if (ground < STOREY_MIN || upper < STOREY_MIN) {
    throw new Error(`The inside is only ${Hi.toFixed(0)} mm tall — each storey needs at least ${STOREY_MIN} mm of headroom. Use a taller shelf gap or move the upper floor.`);
  }

  // ---------------------------------------------------------------- stairs
  const withStair = P.stairs === 'straight' || P.stairs === 'spiral';
  let sw = 0, run = 0, stair = null;
  if (P.stairs === 'spiral') {
    // a square stairwell in the front-left corner, the post 1 mm in from each side
    // big enough to cut, small enough to leave 30 mm of floor beside it and a 25 mm landing behind it
    const rMin = spiralMinRadius(t), rMax = Math.min((Wi - 30 - 2) / 2, (Di - 25 - 2) / 2);
    if (rMax < rMin) {
      throw new Error(`A spiral stair needs at least ${(2 * rMin + 32).toFixed(0)} mm of inside width and ${(2 * rMin + 27).toFixed(0)} mm of depth — use a wider, deeper shelf gap or the straight stair.`);
    }
    const R = clamp(P.spiralRadius > 0 ? P.spiralRadius : Math.min(Wi, Di) * 0.22, rMin, rMax);
    sw = 2 * R + 2;
    run = sw;
    const n = P.steps > 0 ? Math.round(clamp(P.steps, 3, 40)) : Math.max(3, Math.round(zF / clamp(R * 0.6, 8, 20)));
    const rise = zF / n;
    const turn = Math.min(30, 330 / (n - 1));
    const sp = buildSpiralStairs({ steps: n, rise, radius: R, t, center: [t + 1 + R, 1 + R], z0: t, turn, endAngle: 90, key: 'stair', baseKey: 'shell-bottom' });
    parts.push(...sp.parts);
    joints.push(...sp.joints);
    // the post stands in a hole through the floor, on the shelf, and stops below the roof
    wallHoles.bottom.push(ellipsePoly(sp.center[0], sp.center[1], sp.post.diameter / 2 + 0.1, sp.post.diameter / 2 + 0.1, 20));
    const post = { ...sp.post, length: Math.min(sp.post.length + t, H - 2 * t) };
    stair = { kind: 'spiral', steps: n, rise, turn, radius: R, center: sp.center, run, width: sw, post };
    stairSteps.push(
      { group: 'Stairs', text: `Cut a ${post.diameter} mm dowel (or a bamboo skewer) ${Math.floor(post.length)} mm long for the post. Push it down through the small hole in the floor near the front-left corner until it touches the shelf, and glue it upright.` },
      { group: 'Stairs', text: `Thread the ${n - 1} treads onto the post in order, each with its baluster glued under its outer end, standing on the tread below — every tread turns ${turn.toFixed(0)}° on from the last. The top tread points at the landing strip.` },
    );
  } else if (withStair) {
    sw = P.stairWidth > 0 ? clamp(P.stairWidth, 15, Wi * 0.5) : clamp(Wi * 0.28, 18, Wi * 0.45);
    // the run that gives a comfortable pitch, leaving a landing strip of 25 mm or more
    run = clamp(zF / PITCH, Math.min(Di * 0.4, Di - 25), Di - 25);
    const n = pickSteps(zF, run, t, P.steps, { pitch: PITCH_RANGE, hint: STAIR_HINT });
    const rise = zF / n, going = run / (n - 1);
    const st = buildStairs({ steps: n, rise, going, width: sw, t, risers: !!P.risers, topLanding: true, origin: [t, 0, t] });
    parts.push(...st.parts);
    joints.push(...st.joints);
    link('stair-stringer-left', 'shell-left', 'flat');
    link('stair-stringer-left', 'shell-bottom', 'flat');
    link('stair-stringer-right', 'shell-bottom', 'flat');
    link('stair-stringer-left', 'floor-landing', 'flat');
    link('stair-stringer-right', 'floor-landing', 'flat');
    if (P.risers) link(`stair-riser-${n - 1}`, 'floor-landing', 'flat');
    stair = { kind: 'straight', steps: n, rise, going, run, width: sw };
    stairSteps.push(
      { group: 'Stairs', text: `Build the stair on the bench: slot the ${n - 1} treads into one stringer, add the other stringer${P.risers ? ', then glue the risers in behind each step' : ''}. Keep it square.` },
      { group: 'Stairs', text: 'Glue the stair against the left wall, its foot at the open front and its top step against the landing strip.' },
    );
  }

  // ----------------------------------------------------------- upper floor
  const xa = t + sw, wa = Wi - sw; // main floor: beside the stairwell
  const sideT = profileTabs(Di, t, tabCount(Di));
  const backT = profileTabs(wa, t, tabCount(wa));
  parts.push({
    key: 'floor', name: 'Upper floor', group: 'Upper floor', role: 'floor', scores: [],
    polys: [panelOutline(wa, Di, [profilePlain(wa), sideT, backT, withStair ? profilePlain(Di) : sideT])],
    plane: { o: [xa, 0, floorTop], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] },
  });
  for (const s of tabsOf(sideT)) {
    wallHoles.right.push(slotU(s.a0, s.a1, zF));
    if (!withStair) wallHoles.left.push(slotU(s.a0, s.a1, zF));
  }
  for (const s of tabsOf(backT)) wallHoles.back.push(slotU(xa + s.a0, xa + s.a1, zF));
  link('floor', 'shell-right', 'slot');
  link('floor', 'shell-back', 'slot');
  if (!withStair) link('floor', 'shell-left', 'slot');
  const floorPlane = parts.at(-1);

  if (withStair) {
    const dL = Di - run;
    const lsT = profileTabs(dL, t, tabCount(dL)), lbT = profileTabs(sw, t, 1);
    parts.push({
      key: 'floor-landing', name: 'Landing strip', group: 'Upper floor', role: 'floor', scores: [],
      polys: [panelOutline(sw, dL, [profilePlain(sw), profilePlain(dL), lbT, lsT])],
      plane: { o: [t, run, floorTop], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] },
    });
    for (const s of tabsOf(lsT)) wallHoles.left.push(slotU(run + s.a0, run + s.a1, zF));
    for (const s of tabsOf(lbT)) wallHoles.back.push(slotU(t + s.a0, t + s.a1, zF));
    link('floor-landing', 'shell-left', 'slot');
    link('floor-landing', 'shell-back', 'slot');
    link('floor-landing', 'floor', 'flat');

    const railH = Math.min(18, upper * 0.4);
    if (P.rail && railH >= 10) {
      const gapW = 4, post = 3, band = 3;
      const count = Math.max(0, Math.floor((run - post) / (gapW + post)));
      const start = (run - (count * (gapW + post) - post)) / 2;
      const gaps = Array.from({ length: count }, (_, i) => rectPoly(start + i * (gapW + post), band, gapW, railH - 2 * band));
      parts.push({
        key: 'rail', name: 'Stairwell rail', group: 'Upper floor', role: 'rail', scores: [],
        polys: [rectPoly(0, 0, run, railH), ...gaps],
        plane: { o: [xa, 0, floorTop], U: [0, 1, 0], V: [0, 0, 1], n: [-1, 0, 0] },
      });
      link('rail', 'floor', 'flat');
      railSteps.push({ group: 'Upper floor', text: 'Glue the rail along the stairwell edge of the upper floor, leaving the top of the stair open.' });
    }
  }

  // -------------------------------------------------------- internal walls
  const xLo = t + sw + (withStair ? 10 : 15) + t, xHi = W - t - 15;
  let xp = clamp(t + clamp(P.wallPos, 0.2, 0.8) * Wi, xLo, xHi);
  const wantWalls = (P.groundWall ? 1 : 0) + (P.upperWall ? 1 : 0);
  if (wantWalls && xLo > xHi) {
    warnings.push({ level: 'warn', msg: 'There is no room beside the stair for an internal wall — make the gap wider or the stair narrower.' });
    xp = null;
  }
  const doorway = (h) => {
    const w = clamp(Di * 0.22, 14, 40);
    const dh = Math.min(h - 2 * SILL, Math.max(30, Math.min(h * 0.75, 60)));
    return { u0: Di * 0.65 - w / 2, w, h: dh };
  };
  const wallT = profileTabs(Di, t, tabCount(Di));
  const internal = (key, name, z0, h, { top, bottomInto, topInto }) => {
    const door = doorway(h);
    parts.push({
      key, name, group: 'Internal walls', role: 'partition', scores: [], doorway: { w: door.w, h: door.h },
      polys: [panelOutline(Di, h, [wallT, profilePlain(h), top ? wallT : profilePlain(Di), profilePlain(h)]), rectPoly(door.u0, SILL, door.w, door.h)],
      plane: { o: [xp, 0, z0], U: [0, 1, 0], V: [0, 0, 1], n: [1, 0, 0] },
    });
    // slots in the boards above and below, in their own (x, y) panel coordinates
    for (const s of tabsOf(wallT)) {
      bottomInto.holes.push(slotV(xp - t - bottomInto.x0, s.a0, s.a1));
      if (top) topInto.holes.push(slotV(xp - t - topInto.x0, s.a0, s.a1));
    }
    link(key, 'shell-back', 'flat');
  };
  const floorHoles = [];
  if (xp != null && P.groundWall) {
    internal('wall-ground', 'Ground floor wall', t, ground, { top: false, bottomInto: { holes: wallHoles.bottom, x0: 0 } });
    link('wall-ground', 'shell-bottom', 'slot');
    link('wall-ground', 'floor', 'flat');
  }
  if (xp != null && P.upperWall) {
    internal('wall-upper', 'Upstairs wall', floorTop, upper, { top: true, bottomInto: { holes: floorHoles, x0: xa }, topInto: { holes: wallHoles.top, x0: 0 } });
    link('wall-upper', 'floor', 'slot');
    link('wall-upper', 'shell-top', 'slot');
  }
  floorPlane.polys.push(...floorHoles);

  // ------------------------------------------------------------------ lights
  // upstairs, the left room starts beyond the stairwell
  const roomsAcross = (wall, x0) => (xp != null && wall ? [[x0, xp - t], [xp, W - t]] : [[x0, W - t]]);
  for (const [x0, x1] of roomsAcross(P.groundWall, t)) lights.push({ p: [(x0 + x1) / 2, Di / 2, zF - 2], color: 'warm' });
  for (const [x0, x1] of roomsAcross(P.upperWall, xa)) lights.push({ p: [(x0 + x1) / 2, Di / 2, H - t - 3], color: 'warm' });

  // ------------------------------------------------------------------- shell
  const shell = nookWalls({ W, D, H, t, fingerWidth, holes: wallHoles });
  parts.unshift(...shell.parts);
  joints.unshift(...shell.joints);
  const hasWall = (key) => parts.some((p) => p.key === key);
  const steps = [
    { group: 'Shell', text: 'Dry-fit the floor and back wall with one side wall — leave the other side and the roof off and check every slot is clear.' },
    ...(hasWall('wall-ground') ? [{ group: 'Internal walls', text: 'Paint or paper both sides of the ground-floor wall, then push its tabs into the slots in the floor, against the back wall. The upper floor rests on its top edge.' }] : []),
    { group: 'Upper floor', text: `Push the upper floor's tabs into the slots in the back wall and the first side wall${withStair ? ', then the landing strip behind the stairwell' : ''}, then close up with the other side wall and glue the shell.` },
    ...railSteps,
    ...stairSteps,
    ...(hasWall('wall-upper') ? [{ group: 'Internal walls', text: 'Paint or paper both sides of the upstairs wall, then push its tabs into the slots in the upper floor, against the back wall; the roof\'s slots take its top tabs.' }] : []),
    { group: 'Shell', text: 'Light both storeys (one LED in each room shown in the 3D view), then glue the roof on.' },
  ];

  return {
    parts, joints, lights, steps, warnings, minFinger: shell.minFinger,
    twostorey: { floorTop, ground, upper, stair, wall: xp },
  };
}
