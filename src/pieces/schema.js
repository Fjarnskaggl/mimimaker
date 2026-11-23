// Declarative piece format: vocabulary and validator.
//
// A piece is plain JSON (see piece.schema.json and README.md in this folder).
// validatePiece() checks the structure *and* the meaning: every expression
// parses, reads only names that exist where it is used, defaults sit inside
// their ranges, and wall/floor rules hold. It returns a list of messages,
// each starting with a path such as "sofa.components[0].size[1]: …";
// an empty list means the piece is valid.

import { compileExpr, templateExprs, FUNCTIONS, CONSTANTS } from './expr.js';

export const FACES = ['bottom', 'top', 'front', 'back', 'left', 'right'];
export const PLACEMENTS = ['floor', 'wall'];
export const MATS = ['board', 'card', 'fabric'];
export const KINDS = ['box', 'flat'];
export const UNITS = ['cm'];
export const RESERVED = ['t'];

/** Cut shapes: key → [min, max] argument count (poly takes a point list). */
export const SHAPE_ARGS = { rect: [4, 4], arch: [4, 6], ellipse: [4, 5], circle: [3, 4], plant: [2, 2], drape: [3, 3] };
export const SHAPES = [...Object.keys(SHAPE_ARGS), 'poly'];
/** Score (fold/engrave) line sets. */
export const SCORE_ARGS = { rect: [4, 4], circle: [3, 4], ellipse: [4, 5] };
export const SCORES = [...Object.keys(SCORE_ARGS), 'line', 'loop', 'fronts'];
/** Ways to stand a flat part up in the piece. */
export const PLANES = ['upright', 'floor', 'custom'];

const HEADER = ['id', 'label', 'theme', 'placement', 'mat', 'params', 'defaults', 'size', 'let', 'components', 'note', 'tags', 'difficulty'];
const BOX_FIELDS = ['kind', 'name', 'size', 'at', 'faces', 'shelves', 'scores', 'holes', 'when', 'material'];
const FLAT_FIELDS = ['kind', 'name', 'polys', 'scores', 'plane', 'wall', 'surface', 'at', 'when', 'material'];
const REPEAT_FIELDS = ['repeat', 'as', 'let', 'each', 'when'];
const IDENT_RE = /^[A-Za-z_]\w*$/;
const ID_RE = /^[a-z][a-z0-9-]*$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';

/** Validate one piece definition. Returns an array of error messages. */
export function validatePiece(piece) {
  const errors = [];
  const root = str(piece?.id) ? piece.id : 'piece';
  const err = (path, msg) => errors.push(`${root}${path ? (path.startsWith('[') ? path : `.${path}`) : ''}: ${msg}`);
  if (!isObj(piece)) { err('', 'must be an object'); return errors; }

  const oneOf = (path, v, list) => { if (!list.includes(v)) err(path, `must be one of ${list.join(', ')}`); };
  const unknownFields = (path, obj, allowed) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(path ? `${path}.${k}` : k, 'unknown field');
  };

  // ------------------------------------------------------------- header
  unknownFields('', piece, HEADER);
  if (!str(piece.id)) err('id', 'required');
  else if (!ID_RE.test(piece.id)) err('id', 'must be lower-case letters, digits and dashes');
  for (const k of ['label', 'theme']) if (!str(piece[k])) err(k, 'required');
  oneOf('placement', piece.placement, PLACEMENTS);
  oneOf('mat', piece.mat, MATS);
  if (piece.note !== undefined && typeof piece.note !== 'string') err('note', 'must be text');
  if (piece.tags !== undefined) {
    if (!Array.isArray(piece.tags)) err('tags', 'must be a list of words');
    else piece.tags.forEach((tag, i) => {
      if (typeof tag !== 'string' || !ID_RE.test(tag)) err(`tags[${i}]`, 'lower-case words only (letters, digits, dashes)');
      else if (piece.tags.indexOf(tag) !== i) err(`tags[${i}]`, `duplicate "${tag}"`);
    });
  }
  if (piece.difficulty !== undefined && ![1, 2, 3].includes(piece.difficulty)) err('difficulty', 'must be 1, 2 or 3');

  // ------------------------------------------------------------- params
  const params = Array.isArray(piece.params) ? piece.params : [];
  if (!Array.isArray(piece.params)) err('params', 'must be a list');
  const keys = new Set();
  params.forEach((q, i) => {
    const at = `params[${i}]`;
    if (!isObj(q)) { err(at, 'must be an object'); return; }
    if (!str(q.key) || !IDENT_RE.test(q.key)) err(`${at}.key`, 'must be a name like w or armh');
    else if (RESERVED.includes(q.key)) err(`${at}.key`, `"${q.key}" is reserved`);
    else if (keys.has(q.key)) err(`${at}.key`, `duplicate "${q.key}"`);
    else keys.add(q.key);
    if (!str(q.label)) err(`${at}.label`, 'required');
    if (q.type === 'number') {
      unknownFields(at, q, ['key', 'label', 'type', 'min', 'max', 'step', 'unit']);
      if (!Number.isFinite(q.min) || !Number.isFinite(q.max)) err(at, 'min and max are required numbers');
      else if (q.min > q.max) err(at, 'min is above max');
      if (q.step !== undefined && !(q.step > 0)) err(`${at}.step`, 'must be positive');
      if (q.unit !== undefined) oneOf(`${at}.unit`, q.unit, UNITS);
    } else if (q.type === 'select') {
      unknownFields(at, q, ['key', 'label', 'type', 'options']);
      if (!Array.isArray(q.options) || q.options.length === 0) err(`${at}.options`, 'needs at least one option');
      else if (!q.options.every(str)) err(`${at}.options`, 'must be words');
    } else err(`${at}.type`, 'must be one of number, select');
  });

  // ----------------------------------------------------------- defaults
  if (!isObj(piece.defaults)) err('defaults', 'must be an object');
  else {
    for (const q of params) {
      if (!isObj(q) || !keys.has(q.key)) continue;
      const v = piece.defaults[q.key];
      if (v === undefined) { err(`defaults.${q.key}`, 'missing'); continue; }
      if (q.type === 'number') {
        if (!Number.isFinite(v)) err(`defaults.${q.key}`, 'must be a number');
        else if (v < q.min || v > q.max) err(`defaults.${q.key}`, `${v} is outside ${q.min}…${q.max}`);
      } else if (q.type === 'select' && Array.isArray(q.options) && !q.options.includes(v)) {
        err(`defaults.${q.key}`, `"${v}" is not an option`);
      }
    }
    for (const k of Object.keys(piece.defaults)) if (!keys.has(k)) err(`defaults.${k}`, 'not a parameter');
  }

  // -------------------------------------------------------- expressions
  const expr = (path, v, scope) => {
    let c;
    try { c = compileExpr(v); } catch (e) { err(path, e.message); return; }
    for (const n of c.names) if (!scope.has(n)) err(path, `unknown name "${n}"`);
  };
  const exprList = (path, v, scope, n) => {
    if (!Array.isArray(v) || v.length !== n) { err(path, `needs ${n} values`); return; }
    v.forEach((x, i) => expr(`${path}[${i}]`, x, scope));
  };
  const template = (path, v, scope) => {
    if (!str(v)) { err(path, 'required'); return; }
    for (const e of templateExprs(v)) expr(path, e, scope);
  };
  const defineLets = (path, lets, scope) => {
    if (lets === undefined) return scope;
    if (!isObj(lets)) { err(path, 'must be an object of name: expression'); return scope; }
    const inner = new Set(scope);
    for (const [name, v] of Object.entries(lets)) {
      if (!IDENT_RE.test(name)) err(`${path}.${name}`, 'not a valid name');
      else if (keys.has(name)) err(`${path}.${name}`, `"${name}" is already a parameter`);
      else if (inner.has(name) || Object.hasOwn(FUNCTIONS, name) || Object.hasOwn(CONSTANTS, name)) err(`${path}.${name}`, `"${name}" is already defined`);
      expr(`${path}.${name}`, v, inner);
      inner.add(name);
    }
    return inner;
  };

  // size is used for placement before any material is chosen: params only.
  if (piece.size !== undefined) {
    if (!Array.isArray(piece.size) || piece.size.length !== 3) err('size', 'needs 3 values');
    else piece.size.forEach((x, i) => {
      let c;
      try { c = compileExpr(x); } catch (e) { err(`size[${i}]`, e.message); return; }
      for (const n of c.names) if (!keys.has(n)) err(`size[${i}]`, `unknown name "${n}" (size only sees parameters)`);
    });
  } else if (!['w', 'd', 'h'].every((k) => keys.has(k))) {
    err('size', 'required unless the piece has w, d and h parameters');
  }

  let scope = new Set([...keys, ...RESERVED]);
  scope = defineLets('let', piece.let, scope);

  // ---------------------------------------------------- repeat wrapper
  // `{ repeat, as, let?, each, when? }` works for components, shapes and scores.
  const withRepeat = (path, item, scope, inner) => {
    if (isObj(item) && 'repeat' in item) {
      unknownFields(path, item, REPEAT_FIELDS);
      expr(`${path}.repeat`, item.repeat, scope);
      if (item.when !== undefined) expr(`${path}.when`, item.when, scope);
      let s = scope;
      if (!str(item.as)) err(`${path}.as`, 'required');
      else if (!IDENT_RE.test(item.as)) err(`${path}.as`, 'not a valid name');
      else if (scope.has(item.as)) err(`${path}.as`, `"${item.as}" is already defined`);
      else s = new Set([...scope, item.as]);
      s = defineLets(`${path}.let`, item.let, s);
      if (item.each === undefined) err(`${path}.each`, 'required');
      else withRepeat(`${path}.each`, item.each, s, inner);
      return;
    }
    if (isObj(item) && item.when !== undefined) expr(`${path}.when`, item.when, scope);
    inner(path, item, scope);
  };
  const list = (path, v, scope, inner, what, { min = 0 } = {}) => {
    if (!Array.isArray(v)) { err(path, `must be a list of ${what}s`); return; }
    if (v.length < min) { err(path, `needs at least one ${what}`); return; }
    v.forEach((x, i) => withRepeat(`${path}[${i}]`, x, scope, inner));
  };
  const points = (path, pts, scope, min, exact) => {
    if (!Array.isArray(pts) || (exact ? pts.length !== min : pts.length < min)) {
      err(path, exact ? `needs ${min} points` : `needs at least ${min} points`);
      return;
    }
    pts.forEach((p, i) => exprList(`${path}[${i}]`, p, scope, 2));
  };
  const argList = (path, v, scope, [lo, hi]) => {
    if (!Array.isArray(v) || v.length < lo || v.length > hi) { err(path, lo === hi ? `needs ${lo} values` : `needs ${lo} to ${hi} values`); return; }
    v.forEach((x, i) => expr(`${path}[${i}]`, x, scope));
  };
  const single = (path, item, vocab) => {
    if (!isObj(item)) { err(path, 'must be an object'); return null; }
    const found = Object.keys(item).filter((k) => k !== 'when');
    if (found.length !== 1) { err(path, `exactly one shape key, got ${found.join(', ') || 'none'}`); return null; }
    if (!vocab.includes(found[0])) { err(path, `unknown ${vocab === SHAPES ? 'shape' : 'score'} "${found[0]}" (use ${vocab.join(', ')})`); return null; }
    return found[0];
  };

  const shape = (path, item, scope) => {
    const k = single(path, item, SHAPES);
    if (!k) return;
    if (k === 'poly') points(`${path}.poly`, item.poly, scope, 3);
    else argList(`${path}.${k}`, item[k], scope, SHAPE_ARGS[k]);
  };
  const score = (path, item, scope) => {
    const k = single(path, item, SCORES);
    if (!k) return;
    if (k === 'line') points(`${path}.line`, item.line, scope, 2, true);
    else if (k === 'loop') points(`${path}.loop`, item.loop, scope, 3);
    else if (k === 'fronts') {
      const f = item.fronts;
      if (!isObj(f)) { err(`${path}.fronts`, 'must be an object'); return; }
      unknownFields(`${path}.fronts`, f, ['style', 'count', 'w', 'h', 'from', 'to']);
      for (const r of ['style', 'count', 'w', 'h']) {
        if (f[r] === undefined) err(`${path}.fronts.${r}`, 'required');
        else expr(`${path}.fronts.${r}`, f[r], scope);
      }
      for (const o of ['from', 'to']) if (f[o] !== undefined) expr(`${path}.fronts.${o}`, f[o], scope);
    } else argList(`${path}.${k}`, item[k], scope, SCORE_ARGS[k]);
  };

  const plane = (path, pl, scope) => {
    const k = isObj(pl) ? Object.keys(pl) : [];
    if (k.length !== 1 || !PLANES.includes(k[0])) { err(path, `must be one of ${PLANES.join(', ')}`); return; }
    const v = pl[k[0]];
    if (!isObj(v)) { err(`${path}.${k[0]}`, 'must be an object'); return; }
    if (k[0] === 'custom') {
      unknownFields(`${path}.custom`, v, ['o', 'U', 'V', 'n']);
      for (const a of ['o', 'U', 'V', 'n']) exprList(`${path}.custom.${a}`, v[a], scope, 3);
    } else {
      const allowed = k[0] === 'upright' ? ['x', 'y', 'z'] : ['z'];
      unknownFields(`${path}.${k[0]}`, v, allowed);
      for (const a of allowed) if (v[a] !== undefined) expr(`${path}.${k[0]}.${a}`, v[a], scope);
    }
  };

  const faceMap = (path, v, scope, each) => {
    if (!isObj(v)) { err(path, 'must be an object keyed by face'); return; }
    for (const [f, l] of Object.entries(v)) {
      if (!FACES.includes(f)) err(`${path}.${f}`, 'not a box face');
      else list(`${path}.${f}`, l, scope, each, each === shape ? 'shape' : 'score');
    }
  };

  const component = (path, c, scope) => {
    if (!isObj(c)) { err(path, 'must be an object'); return; }
    if (!KINDS.includes(c.kind)) { err(`${path}.kind`, `must be one of ${KINDS.join(', ')}`); return; }
    template(`${path}.name`, c.name, scope);
    if (c.at !== undefined) exprList(`${path}.at`, c.at, scope, 3);
    if (c.material !== undefined && !str(c.material)) err(`${path}.material`, 'must be a material id');
    if (c.kind === 'box') {
      for (const k of Object.keys(c)) {
        if (!BOX_FIELDS.includes(k)) err(`${path}.${k}`, FLAT_FIELDS.includes(k) ? 'only flat parts have this' : 'unknown field');
      }
      exprList(`${path}.size`, c.size, scope, 3);
      if (c.faces !== 'all') {
        if (!Array.isArray(c.faces)) err(`${path}.faces`, 'must be "all" or a list of faces');
        else if (c.faces.length === 0) err(`${path}.faces`, 'needs at least one face');
        else c.faces.forEach((f, i) => oneOf(`${path}.faces[${i}]`, f, FACES));
      }
      if (c.shelves !== undefined) {
        if (Array.isArray(c.shelves)) c.shelves.forEach((x, i) => expr(`${path}.shelves[${i}]`, x, scope));
        else if (isObj(c.shelves)) {
          unknownFields(`${path}.shelves`, c.shelves, ['even', 'h', 'top']);
          for (const r of ['even', 'h']) {
            if (c.shelves[r] === undefined) err(`${path}.shelves.${r}`, 'required');
            else expr(`${path}.shelves.${r}`, c.shelves[r], scope);
          }
          if (c.shelves.top !== undefined && typeof c.shelves.top !== 'boolean') err(`${path}.shelves.top`, 'must be true or false');
        } else err(`${path}.shelves`, 'must be a list of heights or { even, h }');
      }
      if (c.scores !== undefined) faceMap(`${path}.scores`, c.scores, scope, score);
      if (c.holes !== undefined) faceMap(`${path}.holes`, c.holes, scope, shape);
    } else {
      for (const k of Object.keys(c)) {
        if (!FLAT_FIELDS.includes(k)) err(`${path}.${k}`, BOX_FIELDS.includes(k) ? 'only box parts have this' : 'unknown field');
      }
      list(`${path}.polys`, c.polys, scope, shape, 'shape', { min: 1 });
      if (c.scores !== undefined) list(`${path}.scores`, c.scores, scope, score, 'score');
      for (const b of ['wall', 'surface']) if (c[b] !== undefined && typeof c[b] !== 'boolean') err(`${path}.${b}`, 'must be true or false');
      if (c.wall && piece.placement !== 'wall') err(`${path}.wall`, 'only wall pieces can hang flats on the wall');
      else if (piece.placement === 'wall' && !c.wall) err(path, 'wall pieces hang flats with wall: true');
      else if (!c.wall && c.plane === undefined) err(path, 'a flat needs a plane, or wall: true');
      if (c.plane !== undefined) {
        if (c.wall) err(`${path}.plane`, 'wall flats take the wall as their plane');
        else plane(`${path}.plane`, c.plane, scope);
      }
    }
  };

  list('components', piece.components, scope, component, 'component', { min: 1 });
  return errors;
}

/** Validate a whole catalogue: each piece, plus unique ids. */
export function validatePieces(pieces) {
  const errors = [];
  const seen = new Set();
  for (const p of pieces) {
    errors.push(...validatePiece(p));
    if (p?.id !== undefined) {
      if (seen.has(p.id)) errors.push(`${p.id}: duplicate id "${p.id}"`);
      seen.add(p.id);
    }
  }
  return errors;
}
