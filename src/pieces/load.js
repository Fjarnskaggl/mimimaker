// Turn a declarative piece (plain JSON, see README.md) into the catalogue
// entry the engine uses: { label, group, params, defaults, size(p), build(p, ctx), … }.
// Expressions are compiled once, when the piece is loaded.

import { compileExpr, fillTemplate } from './expr.js';
import { validatePiece } from './schema.js';
import { ALL_FACES, X, Y, Z, SHAPE_FNS, SCORE_FNS, evenShelves, frontScores, loopScores } from './shapes.js';

const cache = new Map();
const ev = (src, env) => {
  let c = cache.get(src);
  if (!c) { c = compileExpr(src).fn; cache.set(src, c); }
  return c(env);
};
const vec = (list, env) => list.map((x) => ev(x, env));
const withLets = (lets, env) => {
  if (!lets) return env;
  const out = { ...env };
  for (const [k, v] of Object.entries(lets)) out[k] = ev(v, out);
  return out;
};

/** Expand `when` and `repeat` wrappers, calling `fn(item, env)` for each real entry. */
function expand(list, env, fn) {
  const out = [];
  for (const item of list) {
    if (item.when !== undefined && !ev(item.when, env)) continue;
    if ('repeat' in item) {
      const n = Math.max(0, Math.round(ev(item.repeat, env)));
      for (let k = 0; k < n; k++) out.push(...expand([item.each], withLets(item.let, { ...env, [item.as]: k }), fn));
    } else out.push(fn(item, env));
  }
  return out;
}

const shapeKey = (item) => Object.keys(item).find((k) => k !== 'when');

const shapes = (list, outer) => expand(list, outer, (item, env) => {
  const k = shapeKey(item);
  return k === 'poly' ? item.poly.map((p) => vec(p, env)) : SHAPE_FNS[k](...vec(item[k], env));
});

const scores = (list, outer) => expand(list, outer, (item, env) => {
  const k = shapeKey(item);
  if (k === 'line') return [item.line.map((p) => vec(p, env))];
  if (k === 'loop') return loopScores(item.loop.map((p) => vec(p, env)));
  if (k === 'fronts') {
    const f = item.fronts;
    const opts = {};
    if (f.from !== undefined) opts.from = ev(f.from, env);
    if (f.to !== undefined) opts.to = ev(f.to, env);
    return frontScores(ev(f.style, env), ev(f.count, env), ev(f.w, env), ev(f.h, env), env.t, opts);
  }
  return SCORE_FNS[k](...vec(item[k], env));
}).flat();

const byFace = (map, env, fn) => Object.fromEntries(Object.entries(map).map(([f, list]) => [f, fn(list, env)]));

function plane(pl, env) {
  if (pl.upright) {
    const u = pl.upright;
    const at = (k) => (u[k] === undefined ? 0 : ev(u[k], env));
    return { o: [at('x'), at('y'), at('z')], U: X, V: Z, n: [0, -1, 0] };
  }
  if (pl.floor) return { o: [0, 0, pl.floor.z === undefined ? 0 : ev(pl.floor.z, env)], U: X, V: Y, n: [0, 0, 1] };
  const c = pl.custom;
  return { o: vec(c.o, env), U: vec(c.U, env), V: vec(c.V, env), n: vec(c.n, env) };
}

function component(c, env) {
  const out = { kind: c.kind, name: fillTemplate(c.name, env) };
  if (c.kind === 'rod') {
    Object.assign(out, { stock: c.stock, d: ev(c.d, env), from: vec(c.from, env), to: vec(c.to, env) });
  } else if (c.kind === 'box') {
    out.size = vec(c.size, env);
    out.faces = c.faces === 'all' ? [...ALL_FACES] : [...c.faces];
    if (c.shelves !== undefined) {
      out.shelves = Array.isArray(c.shelves) ? vec(c.shelves, env)
        : evenShelves(ev(c.shelves.even, env), ev(c.shelves.h, env), env.t, c.shelves.top ?? true);
    }
    if (c.scores) out.scores = byFace(c.scores, env, scores);
    if (c.holes) out.holes = byFace(c.holes, env, shapes);
    if (c.solid) out.solid = true;
  } else {
    out.polys = shapes(c.polys, env);
    if (c.scores) out.scores = scores(c.scores, env);
    if (c.plane) out.plane = plane(c.plane, env);
    if (c.wall !== undefined) out.wall = c.wall;
    if (c.surface !== undefined) out.surface = c.surface;
  }
  if (c.at) out.at = vec(c.at, env);
  if (c.material) out.material = c.material;
  return out;
}

/** Load one piece definition. Throws with every validation message if it is invalid. */
export function loadPiece(json) {
  const errors = validatePiece(json);
  if (errors.length) throw new Error(`Invalid piece:\n${errors.join('\n')}`);
  const sizeExprs = json.size ?? ['w', 'd', 'h'];
  return {
    id: json.id,
    label: json.label,
    group: json.theme,
    theme: json.theme,
    placement: json.placement,
    mat: json.mat,
    params: structuredClone(json.params),
    defaults: { ...json.defaults },
    ...(json.note !== undefined && { note: json.note }),
    ...(json.tags && { tags: [...json.tags] }),
    ...(json.difficulty && { difficulty: json.difficulty }),
    size: (p) => vec(sizeExprs, p),
    build: (p, { t, mf = 1.5, board = false }) => {
      const env = withLets(json.let, { ...p, t, mf, board: board ? 1 : 0 });
      return expand(json.components, env, component);
    },
  };
}
