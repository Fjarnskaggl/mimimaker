// Bookshop corner shell: the open-front nook with a bookcase built in.
//
// Shelves run across the back wall, tabbed into slots in both side walls and
// the back wall. An optional second run of shelves goes down the left wall
// at the same heights, slotted into it and meeting the back shelves at the
// corner. A small finger-jointed counter stands against the right wall,
// leaving a walkway in front of the shelves.
//
// Coordinates as everywhere in src/shells: x width, y depth (open front at
// y = 0), z up; a part's material runs t along −n from its plane.

import { nookWalls } from './nook.js';
import { wiredLight } from './wire.js';
import { buildBox, faceFrame, FACES } from '../box.js';
import { panelOutline, profilePlain, profileTabs, rectPoly } from '../geometry.js';

export const BOOKSHOP_DEFAULTS = {
  shelves: 4, backDepth: 22, sideShelves: true, sideDepth: 18, counter: true, counterHeight: 0,
};

export const BOOKSHOP_PARAMS = [
  { key: 'shelves', label: 'Shelves', type: 'int', min: 1, max: 10 },
  { key: 'backDepth', label: 'Back shelf depth', type: 'num', min: 10, max: 60, step: 1, unit: 'mm' },
  { key: 'sideShelves', label: 'Shelves down the left wall', type: 'bool' },
  { key: 'sideDepth', label: 'Side shelf depth', type: 'num', min: 10, max: 40, step: 1, unit: 'mm' },
  { key: 'counter', label: 'Counter', type: 'bool' },
  { key: 'counterHeight', label: 'Counter height (0 = auto)', type: 'num', min: 0, max: 120, step: 1, unit: 'mm' },
];

/** Room left for books between shelves (mm). */
const MIN_BOOK = 12;
/** Slots are this much bigger than their tabs all round (mm). */
const CLEAR = 0.1;

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));
const tabCount = (L) => (L > 50 ? 2 : 1);
const tabsOf = (profile) => profile.filter((s) => s.d < 0);

export function buildBookshop({ W, D, H, t, fingerWidth, holes = {} }, params) {
  const P = { ...BOOKSHOP_DEFAULTS, ...params };
  const Wi = W - 2 * t, Di = D - t, Hi = H - 2 * t;
  const n = clampInt(P.shelves, 1, 10);
  const sdB = clamp(P.backDepth, 8, Di * 0.5);
  const sdL = clamp(P.sideDepth, 8, Wi * 0.3);
  const warnings = [], parts = [], joints = [], lights = [];
  const link = (a, b, kind) => joints.push({ a, b, kind });

  // shelves split the height into n + 1 equal gaps for books
  const gapH = (Hi - n * t) / (n + 1);
  if (gapH < MIN_BOOK) {
    const most = Math.max(0, Math.floor((Hi - MIN_BOOK) / (MIN_BOOK + t)));
    throw new Error(`${n} shelves don't fit in a ${Hi.toFixed(0)} mm tall interior — at most ${most} shelves leave room for books.`);
  }
  const zs = Array.from({ length: n }, (_, k) => t + gapH * (k + 1) + t * k); // shelf undersides

  const wallHoles = { ...holes };
  for (const f of ['left', 'right', 'back']) wallHoles[f] = [...(holes[f] || [])];
  const slot = (u0, u1, v0) => rectPoly(u0 - CLEAR, v0 - CLEAR, u1 - u0 + 2 * CLEAR, t + 2 * CLEAR);

  // ---------------------------------------------------------- back shelves
  const yB = Di - sdB; // front edge of the back shelves
  const sideTabsB = profileTabs(sdB, t, 1);
  const backTabs = profileTabs(Wi, t, tabCount(Wi));
  const backOutline = panelOutline(Wi, sdB, [profilePlain(Wi), sideTabsB, backTabs, sideTabsB]);
  zs.forEach((z, k) => {
    const key = `shelf-back-${k}`;
    parts.push({
      key, name: `Back shelf ${k + 1}`, group: 'Bookshelves', role: 'shelf', run: 'back',
      polys: [backOutline], scores: [],
      plane: { o: [t, yB, z + t], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] },
    });
    for (const s of tabsOf(sideTabsB)) {
      wallHoles.left.push(slot(yB + s.a0, yB + s.a1, z));
      wallHoles.right.push(slot(yB + s.a0, yB + s.a1, z));
    }
    for (const s of tabsOf(backTabs)) wallHoles.back.push(slot(t + s.a0, t + s.a1, z));
    for (const wall of ['left', 'right', 'back']) link(key, `shell-${wall}`, 'slot');
  });

  // ---------------------------------------------------------- side shelves
  if (P.sideShelves) {
    const Ls = yB; // from the open front to the back shelves
    const leftTabs = profileTabs(Ls, t, tabCount(Ls));
    const outline = panelOutline(sdL, Ls, [profilePlain(sdL), profilePlain(Ls), profilePlain(sdL), leftTabs]);
    zs.forEach((z, k) => {
      const key = `shelf-side-${k}`;
      parts.push({
        key, name: `Side shelf ${k + 1}`, group: 'Bookshelves', role: 'shelf', run: 'side',
        polys: [outline], scores: [],
        plane: { o: [t, 0, z + t], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] },
      });
      for (const s of tabsOf(leftTabs)) wallHoles.left.push(slot(s.a0, s.a1, z));
      link(key, 'shell-left', 'slot');
      link(key, `shelf-back-${k}`, 'flat');
    });
  }

  // --------------------------------------------------------------- counter
  let counterBox = null;
  if (P.counter) {
    const cw = Math.max(20, Wi * 0.35);
    const cd = Math.min(30, Di * 0.22);
    const ch = P.counterHeight > 0 ? clamp(P.counterHeight, 15, Hi * 0.6) : clamp(Hi * 0.25, 20, Hi * 0.5);
    const cy0 = Math.min(Di * 0.35, yB - cd - 5);
    const origin = [W - t - cw, cy0, t];
    const faces = ['top', 'front', 'back', 'left', 'right'];
    const res = buildBox({ W: cw, D: cd, H: ch, t, faces, fingerWidth });
    for (const p of res.panels) {
      const fr = faceFrame(p.face, cw, cd, ch, t, 'inner');
      parts.push({
        key: `counter-${p.face}`, name: `Counter ${p.face}`, group: 'Counter', role: 'counter',
        polys: [p.outline, ...p.holes], scores: p.scores,
        plane: { ...fr, o: fr.o.map((v, i) => v + origin[i]) },
      });
    }
    faces.forEach((f, i) => faces.slice(i + 1).forEach((g) => {
      if (FACES[f].nb.includes(g)) link(`counter-${f}`, `counter-${g}`, 'finger');
    }));
    for (const f of ['front', 'back', 'left', 'right']) link(`counter-${f}`, 'shell-bottom', 'flat');
    link('counter-right', 'shell-right', 'flat');
    counterBox = { x0: origin[0], y0: cy0, w: cw, d: cd, h: ch };
    // over the counter: back at its height to the shelves' front, down onto the shelf below, then back
    const cx = origin[0] + cw / 2, zc = Math.min(H - t - 3, t + ch + 30);
    const below = zs.filter((z) => z + t <= zc).at(-1);
    const zw = below === undefined ? zc : Math.min(zc, below + t + 2);
    lights.push(wiredLight({
      p: [cx, cy0 + cd / 2, zc], name: 'Over the counter', where: 'Counter', backHoles: wallHoles.back,
      via: [[cx, yB - 1, zc], ...(zw < zc ? [[cx, yB - 1, zw]] : []), [cx, Di, zw]],
    }));
  }
  // under the top shelf, straight back
  const zTopLight = zs[n - 1] - 2;
  lights.unshift(wiredLight({
    p: [W / 2, yB + sdB / 2, zTopLight], name: 'Under the top shelf', where: 'Bookshelves', backHoles: wallHoles.back,
    via: [[W / 2, Di, zTopLight]],
  }));

  // ----------------------------------------------------------------- shell
  const shell = nookWalls({ W, D, H, t, fingerWidth, holes: wallHoles });
  parts.unshift(...shell.parts);
  joints.unshift(...shell.joints);

  const steps = [
    { group: 'Shell', text: 'Dry-fit the floor and back wall with both side walls — leave the roof off. The slots in the walls take the shelf tabs, so check every slot is clear before gluing.' },
    { group: 'Bookshelves', text: `Before the second side wall goes on, push the ${n} back shelves' tabs into the slots in the back wall and the first side wall, then close up with the other side wall and glue the shell.` },
    ...(P.sideShelves ? [{ group: 'Bookshelves', text: 'Slot the side shelves into the left wall from inside and glue each one\'s back edge to the front of the back shelf at the same height.' }] : []),
    ...(P.counter ? [{ group: 'Counter', text: 'Glue the counter together (its fingers only fit one way), then stand it on the floor against the right wall.' }] : []),
    { group: 'Shell', text: 'Fill the shelves with books — strips of card rolled or folded into spines, a few leaning — add an LED under the top shelf and one over the counter, then glue the roof on.' },
  ];

  return { parts, joints, lights, steps, warnings, minFinger: shell.minFinger, bookshop: { shelves: zs, backDepth: sdB, sideDepth: P.sideShelves ? sdL : 0, counter: counterBox } };
}
