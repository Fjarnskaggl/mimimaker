// Finger-jointed boxes for rigid sheet materials (chipboard, basswood).
//
// A box has outer dimensions W (x, width) × D (y, depth, front at y=0) ×
// H (z, height) and any subset of its six faces. Every panel is drawn at its
// full outer size; along each shared edge the t-wide strip is split into an
// odd number of fingers, and the higher-ranked panel keeps the end fingers.
// Because ranks are a strict order, each corner cube ends up in exactly one
// panel, so the parts interlock with no gaps and no overlaps.

import { profilePlain, fingerCount, profileFingers, profileTabs, panelOutline, rectPoly } from './geometry.js';

// Panel (u, v) axes and the neighbour on each edge (bottom, right, top, left).
export const FACES = {
  bottom: { dims: (W, D, H) => [W, D], nb: ['front', 'right', 'back', 'left'] },
  top: { dims: (W, D, H) => [W, D], nb: ['front', 'right', 'back', 'left'] },
  front: { dims: (W, D, H) => [W, H], nb: ['bottom', 'right', 'top', 'left'] },
  back: { dims: (W, D, H) => [W, H], nb: ['bottom', 'right', 'top', 'left'] },
  left: { dims: (W, D, H) => [D, H], nb: ['bottom', 'back', 'top', 'front'] },
  right: { dims: (W, D, H) => [D, H], nb: ['bottom', 'back', 'top', 'front'] },
};

export const FACE_NAMES = Object.keys(FACES);
export const RANK = { bottom: 3, top: 3, front: 2, back: 2, left: 1, right: 1 };

export function autoFingerWidth(t) {
  return Math.max(3, t * 3);
}

/**
 * Plane of a face in box coordinates: p = o + u·U + v·V, with outward or
 * inward normal. `inset` = material thickness for the inner surface.
 */
export function faceFrame(face, W, D, H, inset = 0, side = 'outer') {
  const inner = side === 'inner';
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  switch (face) {
    case 'bottom': return { o: [0, 0, inner ? inset : 0], U: X, V: Y, n: inner ? [0, 0, 1] : [0, 0, -1] };
    case 'top': return { o: [0, 0, inner ? H - inset : H], U: X, V: Y, n: inner ? [0, 0, -1] : [0, 0, 1] };
    case 'front': return { o: [0, inner ? inset : 0, 0], U: X, V: Z, n: inner ? [0, 1, 0] : [0, -1, 0] };
    case 'back': return { o: [0, inner ? D - inset : D, 0], U: X, V: Z, n: inner ? [0, -1, 0] : [0, 1, 0] };
    case 'left': return { o: [inner ? inset : 0, 0, 0], U: Y, V: Z, n: inner ? [1, 0, 0] : [-1, 0, 0] };
    case 'right': return { o: [inner ? W - inset : W, 0, 0], U: Y, V: Z, n: inner ? [-1, 0, 0] : [1, 0, 0] };
    default: throw new Error(`unknown face ${face}`);
  }
}

/**
 * @param {object} o
 * @param {number} o.W @param {number} o.D @param {number} o.H outer size (mm)
 * @param {number} o.t material thickness (mm)
 * @param {string[]} o.faces faces present
 * @param {object} [o.holes] face -> polygons (panel coords) to cut out
 * @param {object} [o.scores] face -> [[p,q],…] score lines (panel coords)
 * @param {number[]} [o.shelves] z of each shelf's underside (mm from outer bottom)
 */
export function buildBox({ W, D, H, t, faces, fingerWidth, holes = {}, scores = {}, shelves = [], clearance = 0.1 }) {
  const present = new Set(faces);
  const fw = fingerWidth > 0 ? fingerWidth : autoFingerWidth(t);
  let minFinger = Infinity;
  const slotHoles = { left: [], right: [], back: [] };
  const shelfPanels = [];

  if (shelves.length && !(present.has('left') && present.has('right'))) {
    throw new Error('Shelves need both a left and a right panel');
  }
  for (const z of shelves) {
    const Wi = W - 2 * t;
    const y0 = present.has('front') ? t : 0;
    const y1 = present.has('back') ? D - t : D;
    const Ds = y1 - y0;
    const side = profileTabs(Ds, t, Ds > 25 ? 2 : 1);
    const back = present.has('back') ? profileTabs(Wi, t, Wi > 25 ? 2 : 1) : profilePlain(Wi);
    const outline = panelOutline(Wi, Ds, [profilePlain(Wi), side, back, side]);
    const c = clearance;
    for (const s of side) if (s.d < 0) {
      const slot = rectPoly(y0 + s.a0 - c, z - c, s.a1 - s.a0 + 2 * c, t + 2 * c);
      slotHoles.left.push(slot);
      slotHoles.right.push(slot);
    }
    for (const s of back) if (s.d < 0) {
      slotHoles.back.push(rectPoly(t + s.a0 - c, z - c, s.a1 - s.a0 + 2 * c, t + 2 * c));
    }
    for (const seg of [...side, ...back]) if (seg.d < 0) minFinger = Math.min(minFinger, seg.a1 - seg.a0);
    shelfPanels.push({ kind: 'shelf', z, x0: t, y0, w: Wi, h: Ds, outline, holes: [] });
  }

  const panels = [];
  for (const f of faces) {
    const [w, h] = FACES[f].dims(W, D, H);
    const edges = FACES[f].nb.map((g, i) => {
      const L = i % 2 === 0 ? w : h;
      if (!present.has(g)) return profilePlain(L);
      const n = fingerCount(L, fw);
      minFinger = Math.min(minFinger, L / n);
      return profileFingers(L, t, n, RANK[f] > RANK[g]);
    });
    panels.push({
      kind: 'panel',
      face: f,
      w,
      h,
      outline: panelOutline(w, h, edges),
      holes: [...(holes[f] || []), ...(slotHoles[f] || [])],
      scores: scores[f] || [],
    });
  }
  return { panels, shelves: shelfPanels, minFinger };
}
