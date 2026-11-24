// The accessory generator: small cardstock pieces in their own theme —
// books, food, signs, posters and plants — with seeded variety.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, THEMES, defaultKit } from '../src/catalog.js';
import { compileKit } from '../src/kit.js';
import { PIECES } from '../src/pieces/index.js';
import { validatePieces } from '../src/pieces/schema.js';
import { pointInPolygon, polygonArea } from '../src/geometry.js';

const ACCESSORIES = ['bookrow', 'bakery', 'sign', 'poster', 'littleplant'];
const S = 10 / 24;
function model(id, raw = {}) {
  const def = CATALOG[id];
  const all = { ...def.defaults, ...raw };
  return Object.fromEntries(def.params.map((q) => [q.key, q.unit === 'cm' ? all[q.key] * S : all[q.key]]));
}
const build = (id, raw, t = 0.38) => CATALOG[id].build(model(id, raw), { t });
const extremes = (def) => ['min', 'max'].map((end) => Object.fromEntries(def.params.map((q) => [q.key,
  q.type === 'select' ? q.options[end === 'min' ? 0 : q.options.length - 1] : q[end]])));
const selectCases = (def) => def.params.filter((q) => q.type === 'select').flatMap((q) => q.options.map((o) => ({ ...def.defaults, [q.key]: o })));

function extent(c) {
  const at = c.at || [0, 0, 0];
  if (c.kind === 'box') return [at, c.size.map((v, i) => at[i] + v)];
  const pts = c.polys.flat();
  if (c.wall) return [[Math.min(...pts.map((p) => p[0])), 0, Math.min(...pts.map((p) => p[1]))], [Math.max(...pts.map((p) => p[0])), 0, Math.max(...pts.map((p) => p[1]))]];
  const { o, U, V } = c.plane;
  const w = pts.map(([u, v]) => [0, 1, 2].map((i) => at[i] + o[i] + U[i] * u + V[i] * v));
  return [[0, 1, 2].map((i) => Math.min(...w.map((p) => p[i]))), [0, 1, 2].map((i) => Math.max(...w.map((p) => p[i])))];
}

test('accessories have their own theme of valid cardstock pieces', () => {
  assert.equal(THEMES.at(-1), 'Accessories');
  assert.deepEqual(validatePieces(PIECES), []);
  const ids = Object.values(CATALOG).filter((d) => d.theme === 'Accessories').map((d) => d.id);
  assert.deepEqual(ids, ACCESSORIES);
  for (const id of ACCESSORIES) {
    const def = CATALOG[id];
    assert.equal(def.mat, 'card', id);
    assert.ok(def.tags.includes('accessory'), `${id} is tagged accessory`);
    assert.ok(def.note && def.note.length > 20, `${id} has a note`);
  }
});

test('accessories build finite geometry inside their footprint for every option and extreme', () => {
  for (const id of ACCESSORIES) {
    const def = CATALOG[id];
    for (const raw of [def.defaults, ...extremes(def), ...selectCases(def)]) {
      const p = model(id, raw);
      const comps = def.build(p, { t: 0.38 });
      assert.ok(comps.length > 0 && !/null|NaN|Infinity/.test(JSON.stringify(comps)), `${id} ${JSON.stringify(raw)}`);
      const lim = def.size(p);
      for (const c of comps) {
        const [lo, hi] = extent(c);
        for (let i = 0; i < 3; i++) assert.ok(lo[i] > -0.01 && hi[i] < lim[i] + 0.01, `${id} ${c.name} axis ${i} (${JSON.stringify(raw)})`);
        if (c.polys) for (const poly of c.polys) assert.ok(Math.abs(polygonArea(poly)) > 0.001, `${id} ${c.name} polygon has area`);
      }
    }
  }
});

test('accessories compile on cardstock without errors or warnings at their defaults', () => {
  for (const id of ACCESSORIES) {
    const kit = defaultKit();
    kit.items = [{ type: id, params: { ...CATALOG[id].defaults }, material: 'card110', x: 10, y: 10, rot: 0, wall: 'back', pos: 150, elev: 150 }];
    const r = compileKit(kit);
    assert.deepEqual(r.warnings.filter((w) => w.level !== 'info').map((w) => w.msg ?? w), [], id);
    assert.ok(r.groups.at(-1).parts.length > 0, `${id} has parts`);
  }
});

test('row of books: one solid block per book, heights vary with the seed but repeat for the same seed', () => {
  const books = build('bookrow', { count: 9, seed: 7 });
  assert.equal(books.length, 9);
  assert.ok(books.every((b) => b.kind === 'box' && b.solid), 'laminated card blocks');
  const heights = (b) => b.map((c) => c.size[2]);
  const h = heights(books);
  assert.ok(new Set(h.map((x) => x.toFixed(4))).size > 3, 'heights vary');
  for (const x of h) assert.ok(x <= model('bookrow').h + 1e-9);
  assert.deepEqual(heights(build('bookrow', { count: 9, seed: 7 })), h, 'same seed, same row');
  assert.notDeepEqual(heights(build('bookrow', { count: 9, seed: 8 })), h, 'another seed, another row');
});

test('poster: aspect follows its shape; a zero margin has no score', () => {
  const box = (raw) => { const [c] = build('poster', raw); const [lo, hi] = extent(c); return (hi[2] - lo[2]) / (hi[0] - lo[0]); };
  assert.ok(Math.abs(box({ shape: 'portrait' }) - 1.4) < 1e-9);
  assert.ok(Math.abs(box({ shape: 'landscape' }) - 0.7) < 1e-9);
  assert.ok(Math.abs(box({ shape: 'square' }) - 1) < 1e-9);
  assert.equal(build('poster', { margin: 0 })[0].scores.length, 0);
  assert.equal(build('poster', { margin: 2 })[0].scores.length, 4);
});

test('hanging sign: two string holes inside the outline, whatever the shape', () => {
  for (const shape of CATALOG.sign.params.find((q) => q.key === 'shape').options) {
    const [s] = build('sign', { shape });
    assert.equal(s.wall, true);
    assert.equal(s.polys.length, 3, `${shape}: outline + two holes`);
    for (const hole of s.polys.slice(1)) for (const p of hole) assert.ok(pointInPolygon(p, s.polys[0]), `${shape} hole inside`);
  }
});

test('bakery treats: cake, loaf and pie differ in shape and scored decoration', () => {
  const [cake] = build('bakery', { kind: 'cake' });
  const [loaf] = build('bakery', { kind: 'loaf' });
  const [pie] = build('bakery', { kind: 'pie' });
  assert.ok(cake.size[2] > pie.size[2] * 2, 'cake is tall, pie is flat');
  assert.ok(loaf.size[1] < loaf.size[0], 'loaf is long');
  assert.equal(cake.scores.front.length, 2, 'cake layers');
  assert.equal(loaf.scores.top.length, 3, 'loaf slashes');
  assert.equal(pie.scores.top.length, 4, 'pie lattice');
});

test('little plant: leaf shape changes with the kind', () => {
  const leaves = (kind) => build('littleplant', { kind }).find((c) => c.name === 'Leaves').polys[0];
  const kinds = CATALOG.littleplant.params.find((q) => q.key === 'kind').options;
  const shapes = kinds.map((k) => JSON.stringify(leaves(k)));
  assert.equal(new Set(shapes).size, kinds.length);
  assert.ok(build('littleplant').some((c) => c.kind === 'box' && c.name === 'Pot'));
});
