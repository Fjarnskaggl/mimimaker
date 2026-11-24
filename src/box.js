// Finger-jointed boxes for rigid sheet materials (chipboard, basswood).
//
// A box has outer dimensions W (x, width) × D (y, depth, front at y=0) ×
// H (z, height) and any subset of its six faces. Every panel is drawn at its
// full outer size; along each shared edge the t-wide strip is split into an
// odd number of segments, a few tabs placed for stability (see jointSegments),
// and the higher-ranked panel keeps the end segments.
// Because ranks are a strict order, each corner cube ends up in exactly one
// panel, so the parts interlock with no gaps and no overlaps.

import { profilePlain, jointSegments, profileJoint, narrowestSegment, profileTabs, panelOutline, rectPoly } from './geometry.js';

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
 * Smallest tab or notch (mm) a cutter makes cleanly in a material: below this
 * the Knife Blade tears board and the Fine-Point Blade drags card, while a
 * laser's thin kerf manages finer detail. Joints never go narrower.
 */
export const MIN_FEATURE = { knife: 3, rotary: 4, fine: 1.5, laser: 1 };
export function minJointFeature(machine, material) {
  if (machine?.family === 'laser') return MIN_FEATURE.laser;
  return MIN_FEATURE[material?.tool] ?? MIN_FEATURE.fine;
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
 * @param {number} [o.minFeature] smallest tab or notch the cutter makes cleanly
 *   (mm, see minJointFeature); raises the finger width when it is smaller.
 *   Shelf tabs are 1–2 per edge, or none (glued in) when the shelf is too
 *   shallow for a tab and the board between its slots; minFinger reports them.
 */
export function buildBox({ W, D, H, t, faces, fingerWidth, holes = {}, scores = {}, shelves = [], clearance = 0.1, minFeature = 0 }) {
  const present = new Set(faces);
  const fw = Math.max(fingerWidth > 0 ? fingerWidth : autoFingerWidth(t), minFeature);
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
    // tabs (and the board between their slots) no narrower than the cutter
    // makes cleanly; a shelf too shallow for even one tab is glued in on its edges
    const tabs = (L) => [L > 25 ? 2 : 1, 1, 0].find((k) => k === 0 || L / (2 * k + 1) - 2 * clearance >= minFeature);
    const side = profileTabs(Ds, t, tabs(Ds));
    const back = present.has('back') ? profileTabs(Wi, t, tabs(Wi)) : profilePlain(Wi);
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
      const segs = jointSegments(L, fw, t);
      minFinger = Math.min(minFinger, narrowestSegment(segs));
      return profileJoint(segs, t, RANK[f] > RANK[g]);
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
