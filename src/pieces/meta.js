// Library metadata for pieces: difficulty labels, real part counts and
// search. Part counts come from compiling the piece alone in a small room,
// so they always match what the cut files will contain.

import { compileKit } from '../kit.js';
import { CATALOG, defaultKit } from '../catalog.js';

export const DIFFICULTY = { 1: 'Easy', 2: 'Medium', 3: 'Tricky' };

/** The material used to count parts for each material kind. */
const COUNT_MATERIAL = { board: 'chip15', card: 'card110', fabric: 'felt' };

const counts = new Map();

/**
 * Number of cut parts a piece makes in each material kind, at its default
 * parameters (or with `params` overriding some of them). Pass `kinds` to
 * count only some kinds; each count compiles the piece once and is cached.
 */
export function partCount(id, params = {}, kinds = Object.keys(COUNT_MATERIAL)) {
  const def = CATALOG[id];
  if (!def) throw new Error(`Unknown piece "${id}"`);
  const out = {};
  for (const kind of kinds) {
    const material = COUNT_MATERIAL[kind];
    if (!material) throw new Error(`Unknown material kind "${kind}"`);
    const key = `${id} ${kind} ${JSON.stringify(params)}`;
    if (!counts.has(key)) {
      const kit = defaultKit();
      kit.items = [{ type: id, params: { ...def.defaults, ...params }, material, x: 0, y: 0, rot: 0, wall: 'back', pos: 150, elev: 130 }];
      kit.lighting = { ...kit.lighting, enabled: false, leds: [] };
      counts.set(key, compileKit(kit).groups.at(-1).parts.length);
    }
    out[kind] = counts.get(key);
  }
  return out;
}

/** Everything a library card shows about a piece. */
export function pieceInfo(id) {
  const def = CATALOG[id];
  if (!def) throw new Error(`Unknown piece "${id}"`);
  return {
    id,
    label: def.label,
    theme: def.theme,
    placement: def.placement,
    mat: def.mat,
    tags: def.tags || [],
    difficulty: def.difficulty,
    difficultyLabel: DIFFICULTY[def.difficulty],
    parts: partCount(id, {}, [def.mat || 'board'])[def.mat || 'board'],
  };
}

/**
 * Find pieces whose label, id or tags contain every word of `query`
 * (case-insensitive), optionally limited to a theme, tag or difficulty.
 * Results keep catalogue order.
 */
export function searchPieces(query = '', { theme, tag, difficulty } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return Object.values(CATALOG).filter((def) => {
    if (theme && def.theme !== theme) return false;
    if (tag && !(def.tags || []).includes(tag)) return false;
    if (difficulty && def.difficulty !== difficulty) return false;
    const hay = [def.label, def.id, ...(def.tags || [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Every tag in the catalogue with how many pieces carry it, sorted by tag. */
export function allTags() {
  const n = new Map();
  for (const def of Object.values(CATALOG)) for (const t of def.tags || []) n.set(t, (n.get(t) || 0) + 1);
  return [...n.keys()].sort().map((tag) => ({ tag, count: n.get(tag) }));
}
