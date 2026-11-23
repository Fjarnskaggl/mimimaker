// The basic book-nook shell: a finger-jointed box with an open front
// (bottom, top, two sides, back), sized to slide into a shelf gap.

import { buildBox, faceFrame } from '../box.js';

export const SHELL_FACES = ['bottom', 'back', 'left', 'right', 'top'];
const FACE_NAMES = { bottom: 'Floor', top: 'Roof', back: 'Back wall', left: 'Left wall', right: 'Right wall' };

/** The five shell walls as shell parts. `holes` is face → polygons (panel coords). */
export function nookWalls({ W, D, H, t, fingerWidth, holes = {} }) {
  const res = buildBox({ W, D, H, t, faces: SHELL_FACES, holes, fingerWidth });
  const parts = res.panels.map((p) => ({
    key: `shell-${p.face}`,
    name: FACE_NAMES[p.face],
    group: 'Shell',
    role: 'shell',
    face: p.face,
    polys: [p.outline, ...p.holes],
    scores: p.scores,
    plane: faceFrame(p.face, W, D, H, t, 'inner'),
  }));
  return { parts, minFinger: res.minFinger };
}

export function buildNook(dims) {
  const { parts, minFinger } = nookWalls(dims);
  return {
    parts,
    minFinger,
    lights: [],
    warnings: [],
    steps: [
      { group: 'Shell', text: 'Dry-fit the floor, back and side walls — the fingers only go together one way. Glue one joint at a time and check the corners are square.' },
      { group: 'Shell', text: 'Decorate and light the inside before gluing the roof on last; the open front faces out from the shelf.' },
    ],
  };
}
