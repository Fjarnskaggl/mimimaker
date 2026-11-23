// Shell registry. A shell is the structure of a book nook or room box beyond
// a single open box: walls plus any built-in layers, sized from a shelf gap.
//
// buildShell(spec, { t, fingerWidth }) → {
//   type, dims: { W, D, H, t, inner: { x0, y0, z0, W, D, H } },
//   parts: [{ key, name, group, role, material?, polys: [outline, ...holes], scores, plane: { o, U, V, n } }],
//   joints: [{ a: partKey, b: partKey, kind: 'finger' | 'slot' | 'glue-tab' | 'flat' (see build/joints.js JOINT_KINDS) }],
//   lights: [{ p: [x, y, z], color, … }],  // suggested LED spots
//   steps: [{ group, text }], warnings: [{ level, msg }], minFinger, …type-specific data
// }
// All sizes are physical mm (book nooks are sized to a real shelf). Axes as in
// box.js: x width, y depth with the open front at y = 0, z up. A part's
// visible face lies on its plane and its material runs t along −n.

import { shellSize as sizeFromGap } from './fit.js';
import { buildNook } from './nook.js';
import { buildAlley, ALLEY_PARAMS, ALLEY_DEFAULTS } from './alley.js';
import { buildBookshop, BOOKSHOP_PARAMS, BOOKSHOP_DEFAULTS } from './bookshop.js';

/** Outer W × H × D of a shell that slides into `gap` (see fit.js). */
export function shellSize(spec) {
  return sizeFromGap(spec);
}

export const SHELLS = {
  // furnishable: furniture, openings, overlays and LEDs go inside it like a room box
  nook: { label: 'Book nook (open box)', params: [], defaults: {}, build: buildNook, furnishable: true },
  alley: { label: 'Alley with lit facades', params: ALLEY_PARAMS, defaults: ALLEY_DEFAULTS, build: buildAlley, furnishable: false },
  bookshop: { label: 'Bookshop corner', params: BOOKSHOP_PARAMS, defaults: BOOKSHOP_DEFAULTS, build: buildBookshop, furnishable: false },
};

/** `holes`: face → polygons (wall panel coords) to cut through the shell walls. */
/** `materials`: the kit's materials, so a shell type can cut some parts from another (thinner) one. */
export function buildShell(spec, { t, fingerWidth = 0, holes = {}, materials }) {
  const def = SHELLS[spec.type];
  if (!def) throw new Error(`Unknown shell type "${spec.type}".`);
  const { W, H, D } = sizeFromGap(spec);
  const res = def.build({ W, D, H, t, fingerWidth, holes, materials, material: spec.material }, { ...def.defaults, ...(spec.params || {}) });
  const warnings = [...res.warnings];
  if (res.minFinger < 3) {
    warnings.push({ level: 'warn', msg: `Shell finger joints are only ${res.minFinger.toFixed(1)} mm wide — the Knife Blade is cleaner above 3 mm.` });
  }
  // parts default to the shell's material; a type may pick another per part
  const parts = spec.material === undefined ? res.parts
    : res.parts.map((p) => (p.material === undefined ? { ...p, material: spec.material } : p));
  return {
    ...res,
    parts,
    type: spec.type,
    dims: { W, D, H, t, inner: { x0: t, y0: 0, z0: t, W: W - 2 * t, D: D - t, H: H - 2 * t } },
    warnings,
  };
}
