// Staircase shell: the open-front nook with a straight stair up the left
// wall, from the open front to a landing across the back.
//
// The landing is slotted into both side walls and the back wall (like the
// bookshop shelves); the stair (src/shells/stairs.js) is glued to the left
// wall and the floor, and its last rise lands on the landing top. A rail with
// baluster gaps guards the landing edge beside the stair.

import { nookWalls } from './nook.js';
import { buildStairs } from './stairs.js';
import { panelOutline, profilePlain, profileTabs, rectPoly } from '../geometry.js';

export const STAIRCASE_DEFAULTS = {
  landingHeight: 0.5, landingDepth: 0, stairWidth: 0, steps: 0, risers: true, rail: true,
};

export const STAIRCASE_PARAMS = [
  { key: 'landingHeight', label: 'Landing height (share of the inside)', type: 'num', min: 0.25, max: 0.75, step: 0.05 },
  { key: 'landingDepth', label: 'Landing depth (0 = auto)', type: 'num', min: 0, max: 150, step: 1, unit: 'mm' },
  { key: 'stairWidth', label: 'Stair width (0 = auto)', type: 'num', min: 0, max: 80, step: 1, unit: 'mm' },
  { key: 'steps', label: 'Steps (0 = auto)', type: 'int', min: 0, max: 40 },
  { key: 'risers', label: 'Closed risers', type: 'bool' },
  { key: 'rail', label: 'Landing rail', type: 'bool' },
];

/** Headroom above and below the landing (mm). */
const HEADROOM = 30;
/** A comfortable pitch: rise / going (a full-size stair is about 0.7). */
const PITCH = 0.72;
const CLEAR = 0.1;

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));
const tabCount = (L) => (L > 50 ? 2 : 1);
const tabsOf = (profile) => profile.filter((s) => s.d < 0);

/**
 * Steps for a stair that climbs `zTop` over `run` (mm) to a landing: `want`
 * if given, else the count whose pitch is closest to a comfortable one.
 */
export function pickSteps(zTop, run, t, want = 0) {
  const fits = (n) => n >= 2 && zTop / n >= t + 2 && run / (n - 1) >= 3 * t;
  let n = clampInt(want, 0, 40);
  if (!n) {
    let best = Infinity;
    for (let c = 2; c <= 40; c++) {
      if (!fits(c)) continue;
      const err = Math.abs(zTop / c / (run / (c - 1)) - PITCH);
      if (err < best) { best = err; n = c; }
    }
  }
  if (!n || !fits(n)) {
    throw new Error(`${n || 'No'} steps fit a ${zTop.toFixed(0)} mm climb over ${run.toFixed(0)} mm — make the landing lower or shallower, or change the step count.`);
  }
  return n;
}

export function buildStaircase({ W, D, H, t, fingerWidth, holes = {} }, params) {
  const P = { ...STAIRCASE_DEFAULTS, ...params };
  const Wi = W - 2 * t, Di = D - t, Hi = H - 2 * t;
  const parts = [], joints = [], lights = [], warnings = [];
  const link = (a, b, kind) => joints.push({ a, b, kind });

  const zTop = clamp(P.landingHeight, 0.25, 0.75) * Hi; // landing top above the floor
  if (Hi - zTop < HEADROOM || zTop - t < HEADROOM) {
    throw new Error(`The inside is only ${Hi.toFixed(0)} mm tall — a landing needs ${HEADROOM} mm of headroom above and below it. Use a taller shelf gap.`);
  }
  const dL = P.landingDepth > 0 ? clamp(P.landingDepth, 30, Di * 0.6) : Di * 0.35;
  const sw = P.stairWidth > 0 ? clamp(P.stairWidth, 15, Wi * 0.6) : clamp(Wi * 0.32, 18, Wi * 0.6);
  const run = Di - dL; // the stair starts at the open front and runs to the landing

  const n = pickSteps(zTop, run, t, P.steps);
  const rise = zTop / n, going = run / (n - 1);

  // ---------------------------------------------------------------- stairs
  const stair = buildStairs({ steps: n, rise, going, width: sw, t, risers: !!P.risers, topLanding: true, origin: [t, 0, t] });
  parts.push(...stair.parts);
  joints.push(...stair.joints);
  link('stair-stringer-left', 'shell-left', 'flat');
  link('stair-stringer-left', 'shell-bottom', 'flat');
  link('stair-stringer-right', 'shell-bottom', 'flat');

  // --------------------------------------------------------------- landing
  const wallHoles = { ...holes };
  for (const f of ['left', 'right', 'back']) wallHoles[f] = [...(holes[f] || [])];
  const slot = (u0, u1, v0) => rectPoly(u0 - CLEAR, v0 - CLEAR, u1 - u0 + 2 * CLEAR, t + 2 * CLEAR);
  const sideTabs = profileTabs(dL, t, tabCount(dL));
  const backTabs = profileTabs(Wi, t, tabCount(Wi));
  const yL = Di - dL, zUnder = t + zTop - t; // landing front edge; underside (world z)
  parts.push({
    key: 'landing', name: 'Landing', group: 'Landing', role: 'landing', scores: [],
    polys: [panelOutline(Wi, dL, [profilePlain(Wi), sideTabs, backTabs, sideTabs])],
    plane: { o: [t, yL, t + zTop], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] },
  });
  for (const s of tabsOf(sideTabs)) {
    wallHoles.left.push(slot(yL + s.a0, yL + s.a1, zUnder));
    wallHoles.right.push(slot(yL + s.a0, yL + s.a1, zUnder));
  }
  for (const s of tabsOf(backTabs)) wallHoles.back.push(slot(t + s.a0, t + s.a1, zUnder));
  for (const wall of ['left', 'right', 'back']) link('landing', `shell-${wall}`, 'slot');
  link('stair-stringer-left', 'landing', 'flat');
  link('stair-stringer-right', 'landing', 'flat');
  if (P.risers) link(`stair-riser-${n - 1}`, 'landing', 'flat');

  // ------------------------------------------------------------------ rail
  const railH = Math.min(18, (Hi - zTop) * 0.5);
  if (P.rail && railH >= 10) {
    const L = Wi - sw;
    const gapW = 4, post = 3, band = 3;
    const count = Math.floor((L - post) / (gapW + post));
    const start = (L - (count * (gapW + post) - post)) / 2; // centre the gaps
    const gaps = Array.from({ length: count }, (_, i) => rectPoly(start + i * (gapW + post), band, gapW, railH - 2 * band));
    parts.push({
      key: 'rail', name: 'Landing rail', group: 'Landing', role: 'rail', scores: [],
      polys: [rectPoly(0, 0, L, railH), ...gaps],
      plane: { o: [t + sw, yL, t + zTop], U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] },
    });
    link('rail', 'landing', 'flat');
  }

  lights.push(
    { p: [t + sw + (Wi - sw) / 2, yL + dL / 2, zUnder - 2], color: 'warm' },
    { p: [W / 2, yL + dL / 2, Math.min(H - t - 3, t + zTop + 25)], color: 'warm' },
  );

  // ----------------------------------------------------------------- shell
  const shell = nookWalls({ W, D, H, t, fingerWidth, holes: wallHoles });
  parts.unshift(...shell.parts);
  joints.unshift(...shell.joints);

  const steps = [
    { group: 'Shell', text: 'Dry-fit the floor and back wall with one side wall — leave the roof off and check every slot is clear.' },
    { group: 'Landing', text: 'Push the landing\'s tabs into the slots in the back wall and the first side wall, then close up with the other side wall and glue the shell.' },
    { group: 'Stairs', text: `Build the stair on the bench: slot the ${n - 1} treads into one stringer, add the other stringer${P.risers ? ', then glue the risers in behind each step' : ''}. Keep it square.` },
    { group: 'Stairs', text: 'Glue the stair against the left wall, its foot at the open front and its top against the landing.' },
    ...(P.rail && railH >= 10 ? [{ group: 'Landing', text: 'Glue the rail along the landing edge, leaving the top of the stair open.' }] : []),
    { group: 'Shell', text: 'Add an LED under the landing and one above it, then glue the roof on.' },
  ];

  return { parts, joints, lights, steps, warnings, minFinger: shell.minFinger, staircase: { steps: n, rise, going, landing: { y: yL, depth: dL, top: t + zTop }, width: sw } };
}
