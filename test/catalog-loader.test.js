import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPiece } from '../src/pieces/load.js';
import { PIECES } from '../src/pieces/index.js';
import { validatePieces } from '../src/pieces/schema.js';
import { CATALOG, THEMES, itemSize } from '../src/catalog.js';

const num = (key, min = 0, max = 500) => ({ key, label: key, type: 'number', min, max, unit: 'cm' });
const piece = (extra) => ({
  id: 'thing', label: 'Thing', theme: 'Basics', placement: 'floor', mat: 'board',
  params: [num('w'), num('d'), num('h')], defaults: { w: 10, d: 20, h: 30 },
  components: [{ kind: 'box', name: 'Thing', size: ['w', 'd', 'h'], faces: 'all' }],
  ...extra,
});

test('a loaded piece keeps everything the app reads', () => {
  const def = loadPiece(piece({ note: 'Glue it.', tags: ['simple'], difficulty: 1 }));
  assert.equal(def.id, 'thing');
  assert.equal(def.label, 'Thing');
  assert.equal(def.group, 'Basics', 'the picker groups by `group`');
  assert.equal(def.theme, 'Basics');
  assert.equal(def.placement, 'floor');
  assert.equal(def.mat, 'board');
  assert.equal(def.note, 'Glue it.');
  assert.deepEqual(def.defaults, { w: 10, d: 20, h: 30 });
  assert.deepEqual(def.params.map((q) => q.key), ['w', 'd', 'h']);
  assert.deepEqual(def.size({ w: 1, d: 2, h: 3 }), [1, 2, 3], 'size defaults to [w, d, h]');
  assert.deepEqual(def.build({ w: 1, d: 2, h: 3 }, { t: 0.5 }), [
    { kind: 'box', name: 'Thing', size: [1, 2, 3], faces: ['bottom', 'top', 'front', 'back', 'left', 'right'] },
  ]);
});

test('lets, t, at, shelves and front scores evaluate like code', () => {
  const def = loadPiece(piece({
    params: [num('w'), num('d'), num('h'), { key: 'n', label: 'n', type: 'number', min: 0, max: 5, step: 1 }, { key: 'style', label: 'Front', type: 'select', options: ['drawers', 'doors'] }],
    defaults: { w: 10, d: 20, h: 30, n: 2, style: 'drawers' },
    let: { dd: 'd - t' },
    components: [{
      kind: 'box', name: 'Cab', size: ['w', 'dd', 'h'], faces: ['top', 'left'], at: [1, 'dd', 0],
      shelves: { even: 'n', h: 'h' },
      scores: { front: [{ fronts: { style: 'style', count: 2, w: 'w', h: 'h' } }] },
      holes: { top: [{ rect: [1, 1, 2, 2] }] },
    }],
  }));
  const [c] = def.build({ w: 10, d: 20, h: 30, n: 2, style: 'drawers' }, { t: 1 });
  assert.deepEqual(c.size, [10, 19, 30]);
  assert.deepEqual(c.at, [1, 19, 0]);
  assert.deepEqual(c.faces, ['top', 'left']);
  const inner = 30 - 1 - 1;
  assert.deepEqual(c.shelves, [1 + inner / 3 - 0.5, 1 + (2 * inner) / 3 - 0.5]);
  assert.deepEqual(c.scores.front, [[[1.6, 15], [8.4, 15]]]);
  assert.deepEqual(c.holes.top, [[[1, 1], [3, 1], [3, 3], [1, 3]]]);
});

test('when, repeat and name templates', () => {
  const def = loadPiece(piece({
    params: [num('w'), num('d'), num('h'), { key: 'count', label: 'n', type: 'number', min: 0, max: 6 }, { key: 'shape', label: 's', type: 'select', options: ['a', 'b'] }],
    defaults: { w: 10, d: 20, h: 30, count: 3, shape: 'a' },
    components: [
      { repeat: 'count', as: 'k', let: { z: 'k * h' }, each: { kind: 'box', name: 'Book {k + 1}', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 'z'] } },
      { when: "shape == 'b'", kind: 'box', name: 'Only b', size: [1, 1, 1], faces: 'all' },
      { kind: 'flat', name: 'Leaf', plane: { upright: { y: 'd' } }, polys: [
        { rect: [0, 0, 'w', 'h'] },
        { repeat: 2, as: 'i', each: { rect: ['1 + i * 3', 1, 2, 2] } },
        { when: "shape == 'b'", circle: [5, 5, 1] },
      ] },
    ],
  }));
  const out = def.build({ w: 10, d: 20, h: 30, count: 2.6, shape: 'a' }, { t: 1 });
  assert.deepEqual(out.map((c) => c.name), ['Book 1', 'Book 2', 'Book 3', 'Leaf'], 'repeat rounds its count');
  assert.deepEqual(out.map((c) => c.at?.[2]), [0, 30, 60, undefined]);
  assert.equal(out[3].polys.length, 3);
  assert.deepEqual(out[3].polys[2], [[4, 1], [6, 1], [6, 3], [4, 3]]);
  assert.deepEqual(out[3].plane, { o: [0, 20, 0], U: [1, 0, 0], V: [0, 0, 1], n: [0, -1, 0] });
  const b = def.build({ w: 10, d: 20, h: 30, count: 0, shape: 'b' }, { t: 1 });
  assert.deepEqual(b.map((c) => c.name), ['Only b', 'Leaf']);
  assert.equal(b[1].polys.length, 4, 'outline, two repeated holes and the circle');
});

test('flat planes and wall flats', () => {
  const floor = loadPiece(piece({ components: [{ kind: 'flat', name: 'Rug', surface: true, plane: { floor: { z: 0.05 } }, polys: [{ ellipse: [5, 5, 5, 5, 8] }] }] }));
  const [rug] = floor.build({ w: 10, d: 10, h: 0 }, { t: 1 });
  assert.deepEqual(rug.plane, { o: [0, 0, 0.05], U: [1, 0, 0], V: [0, 1, 0], n: [0, 0, 1] });
  assert.equal(rug.surface, true);
  assert.equal(rug.polys[0].length, 8);
  const wall = loadPiece(piece({ placement: 'wall', size: ['w', 0, 'h'], components: [{ kind: 'flat', name: 'Sign', wall: true, surface: true, polys: [{ rect: [0, 0, 'w', 'h'] }], scores: [{ rect: [1, 1, 2, 2] }, { line: [[0, 0], [1, 1]] }] }] }));
  const [sign] = wall.build({ w: 4, d: 0, h: 3 }, { t: 1 });
  assert.equal(sign.wall, true);
  assert.equal(sign.plane, undefined);
  assert.equal(sign.scores.length, 5);
  assert.deepEqual(wall.size({ w: 4, d: 9, h: 3 }), [4, 0, 3]);
});

test('invalid pieces are refused with the validator messages', () => {
  assert.throws(() => loadPiece(piece({ components: [{ kind: 'box', name: 'X', size: ['w', 'q', 'h'], faces: 'all' }] })), /thing\.components\[0\]\.size\[1\]: unknown name "q"/);
});

test('the whole catalogue is data: 37+ valid JSON pieces, loaded in theme order', () => {
  assert.ok(PIECES.length >= 37);
  assert.deepEqual(validatePieces(PIECES), []);
  assert.deepEqual(JSON.parse(JSON.stringify(PIECES)), PIECES, 'pieces are plain JSON');
  assert.deepEqual(Object.keys(CATALOG), PIECES.map((p) => p.id));
  for (const p of PIECES) {
    assert.ok(THEMES.includes(p.theme), `${p.id} has a known theme`);
    assert.equal(CATALOG[p.id].id, p.id);
    assert.equal(CATALOG[p.id].group, p.theme);
  }
  const themeOrder = PIECES.map((p) => THEMES.indexOf(p.theme));
  assert.deepEqual(themeOrder, [...themeOrder].sort((a, b) => a - b), 'pieces are listed theme by theme');
  assert.deepEqual(itemSize('sofa', { w: 100, d: 50, seat: 20, back: 40, arm: 10, armh: 30 }), [100, 50, 40]);
});
