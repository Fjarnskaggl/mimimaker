// The basic book-nook shell: a finger-jointed box with an open front
// (bottom, top, two sides, back), sized to slide into a shelf gap.

import { buildBox, faceFrame, FACES } from '../box.js';
import { buildGableRoof, gableRise } from './roof.js';

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
  // finger joints: every pair of walls that share an edge
  const joints = [];
  SHELL_FACES.forEach((f, i) => SHELL_FACES.slice(i + 1).forEach((g) => {
    if (FACES[f].nb.includes(g)) joints.push({ a: `shell-${f}`, b: `shell-${g}`, kind: 'finger' });
  }));
  return { parts, joints, minFinger: res.minFinger };
}

export const NOOK_DEFAULTS = { gable: false, pitch: 40 };
export const NOOK_PARAMS = [
  { key: 'gable', label: 'Gable roof', type: 'bool' },
  { key: 'pitch', label: 'Roof pitch', type: 'num', min: 20, max: 60, step: 5, unit: '°' },
];

const pitchOf = (params) => Math.max(20, Math.min(60, Number(params?.pitch) || NOOK_DEFAULTS.pitch));

/** Height of the box itself: the whole gap, less the roof when there is one. */
export function nookBoxHeight({ W, H, t }, params = {}) {
  return params.gable ? H - gableRise(W, t, pitchOf(params)) : H;
}

export function buildNook(dims, params = {}) {
  const { W, D, H, t, fingerWidth } = dims;
  const Hb = nookBoxHeight(dims, params);
  if (params.gable && Hb - 2 * t < 30) {
    throw new Error(`A ${pitchOf(params)}° gable roof needs ${(H - Hb).toFixed(0)} mm of the ${H.toFixed(0)} mm gap, leaving too little room inside — lower the roof pitch or use a taller gap.`);
  }
  const walls = nookWalls({ ...dims, H: Hb });
  const out = {
    parts: walls.parts,
    joints: walls.joints,
    minFinger: walls.minFinger,
    lights: [],
    warnings: [],
    steps: [
      { group: 'Shell', text: 'Dry-fit the floor, back and side walls — the fingers only go together one way. Glue one joint at a time and check the corners are square.' },
      { group: 'Shell', text: 'Decorate and light the inside before gluing the roof on last; the open front faces out from the shelf.' },
    ],
    boxH: Hb,
  };
  if (params.gable) {
    const roof = buildGableRoof({ W, D, t, pitch: pitchOf(params), z0: Hb, fingerWidth });
    out.parts = [...out.parts, ...roof.parts];
    out.joints = [
      ...out.joints, ...roof.joints,
      { a: 'roof-gable', b: 'shell-back', kind: 'flat' },
      { a: 'roof-left', b: 'shell-left', kind: 'flat' },
      { a: 'roof-right', b: 'shell-right', kind: 'flat' },
    ];
    out.minFinger = Math.min(out.minFinger, roof.minFinger);
    out.lights.push({ p: [W / 2, D / 2, Hb + roof.rise * 0.35], color: 'warm' });
    out.steps.push(
      { group: 'Roof', text: 'Glue the gable upright on the back wall\'s top edge, flush with the back.' },
      { group: 'Roof', text: 'Slide the left roof\'s tabs into the notches on the left of the gable, resting it on the left wall, then the right roof the same way — it tucks under the left one at the ridge. Glue along the walls, the gable and the ridge.' },
    );
    out.roof = { box: Hb, rise: roof.rise, ridgeGap: roof.ridgeGap, pitch: roof.pitch, joints: roof.strips };
  }
  return out;
}
