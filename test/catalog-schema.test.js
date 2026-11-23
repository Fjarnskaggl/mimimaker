import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePiece, validatePieces, FACES, SHAPES, SCORES, PLANES } from '../src/pieces/schema.js';

// Reference pieces in the declarative format (they mirror today's sofa,
// bookshelf, rug and book stack).
const sofa = {
  id: 'sofa', label: 'Sofa', theme: 'Living room', placement: 'floor', mat: 'board',
  params: [
    { key: 'w', label: 'Width', type: 'number', min: 80, max: 320, step: 1, unit: 'cm' },
    { key: 'd', label: 'Depth', type: 'number', min: 50, max: 120, step: 1, unit: 'cm' },
    { key: 'seat', label: 'Seat height', type: 'number', min: 25, max: 60, step: 1, unit: 'cm' },
    { key: 'back', label: 'Back height', type: 'number', min: 50, max: 120, step: 1, unit: 'cm' },
    { key: 'arm', label: 'Arm width', type: 'number', min: 8, max: 40, step: 1, unit: 'cm' },
    { key: 'armh', label: 'Arm height', type: 'number', min: 40, max: 90, step: 1, unit: 'cm' },
  ],
  defaults: { w: 200, d: 85, seat: 42, back: 82, arm: 18, armh: 60 },
  size: ['w', 'd', 'max(back, armh)'],
  let: { a: 'min(arm, w / 3)', dd: 'd - t' },
  components: [
    { kind: 'box', name: 'Seat', size: ['w - 2 * a', 'dd', 'seat'], faces: 'all', at: ['a', 0, 0] },
    { kind: 'box', name: 'Left arm', size: ['a', 'dd', 'armh'], faces: 'all' },
    { kind: 'box', name: 'Right arm', size: ['a', 'dd', 'armh'], faces: 'all', at: ['w - a', 0, 0] },
    { kind: 'flat', name: 'Back', polys: [{ arch: [0, 0, 'w', 'back', 'min(w * 0.08, back * 0.3)'] }], plane: { upright: { y: 'dd' } } },
  ],
  note: 'Glue the arms to the seat ends, then the back across all three.',
};

const bookshelf = {
  id: 'bookshelf', label: 'Bookshelf', theme: 'Basics', placement: 'floor', mat: 'board',
  params: [
    { key: 'w', label: 'Width', type: 'number', min: 10, max: 300, unit: 'cm' },
    { key: 'd', label: 'Depth', type: 'number', min: 10, max: 100, unit: 'cm' },
    { key: 'h', label: 'Height', type: 'number', min: 20, max: 300, unit: 'cm' },
    { key: 'shelves', label: 'Shelves', type: 'number', min: 0, max: 8, step: 1 },
    { key: 'style', label: 'Front', type: 'select', options: ['open', 'doors'] },
  ],
  defaults: { w: 80, d: 30, h: 180, shelves: 3, style: 'open' },
  components: [{
    kind: 'box', name: 'Bookshelf', size: ['w', 'd', 'h'], faces: ['bottom', 'top', 'left', 'right', 'back'],
    shelves: { even: 'round(shelves)', h: 'h' },
    scores: { top: [{ line: [[0, 0], ['w', 0]] }, { fronts: { style: 'style', count: 2, w: 'w', h: 'h' } }] },
  }],
};

const rug = {
  id: 'rug', label: 'Rug', theme: 'Decor', placement: 'floor', mat: 'fabric',
  params: [
    { key: 'w', label: 'Width', type: 'number', min: 10, max: 400, unit: 'cm' },
    { key: 'd', label: 'Depth', type: 'number', min: 10, max: 400, unit: 'cm' },
    { key: 'shape', label: 'Shape', type: 'select', options: ['oval', 'rect', 'round'] },
  ],
  defaults: { w: 140, d: 90, shape: 'oval' },
  size: ['w', "shape == 'round' ? w : d", 0],
  components: [{
    kind: 'flat', name: 'Rug', surface: true, plane: { floor: { z: 0.05 } },
    polys: [
      { when: "shape == 'rect'", rect: [0, 0, 'w', 'd'] },
      { when: "shape == 'round'", ellipse: ['w / 2', 'w / 2', 'w / 2', 'w / 2', 64] },
      { when: "shape == 'oval'", ellipse: ['w / 2', 'd / 2', 'w / 2', 'd / 2', 64] },
    ],
  }],
};

const books = {
  id: 'books', label: 'Book stack', theme: 'Library', placement: 'floor', mat: 'card',
  params: [
    { key: 'w', label: 'Width', type: 'number', min: 10, max: 60, unit: 'cm' },
    { key: 'h', label: 'Book thickness', type: 'number', min: 2, max: 10, unit: 'cm' },
    { key: 'count', label: 'Books', type: 'number', min: 1, max: 6, step: 1 },
  ],
  defaults: { w: 30, h: 4, count: 3 },
  size: ['w', 'w', 'h * round(count)'],
  components: [{
    repeat: 'round(count)', as: 'k',
    let: { f: '1 - 0.08 * (k % 3)' },
    each: { kind: 'box', name: 'Book {k + 1}', size: ['w * f', 'w * f', 'h'], faces: 'all', at: [0, 0, 'k * h'] },
  }],
};

const frame = {
  id: 'frame', label: 'Picture frame', theme: 'Decor', placement: 'wall', mat: 'card',
  params: [{ key: 'w', label: 'Width', type: 'number', min: 5, max: 200, unit: 'cm' }],
  defaults: { w: 40 },
  size: ['w', 0, 'w'],
  components: [{ kind: 'flat', name: 'Frame', wall: true, surface: true, polys: [{ rect: [0, 0, 'w', 'w'] }, { circle: ['w / 2', 'w / 2', 'w / 3'] }], scores: [{ circle: ['w / 2', 'w / 2', 'w / 4'] }] }],
};

const clone = (x) => structuredClone(x);
const errs = (piece) => validatePiece(piece);
function expectError(mutate, pattern, base = sofa) {
  const p = clone(base);
  mutate(p);
  const e = errs(p);
  assert.ok(e.some((m) => pattern.test(m)), `expected ${pattern} in ${JSON.stringify(e, null, 1)}`);
}

test('reference pieces validate cleanly', () => {
  for (const p of [sofa, bookshelf, rug, books, frame]) assert.deepEqual(errs(p), [], p.id);
});

test('pieces are plain JSON', () => {
  for (const p of [sofa, bookshelf, rug, books, frame]) assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
  expectError((p) => { p.size = [() => 1, 'd', 'h']; }, /size\[0\]: expected an expression/);
});

test('header fields are checked', () => {
  expectError((p) => { delete p.id; }, /^sofa|id: required/);
  expectError((p) => { p.id = 'Big Sofa'; }, /id: must be lower-case letters, digits and dashes/);
  expectError((p) => { p.placement = 'ceiling'; }, /placement: must be one of floor, wall/);
  expectError((p) => { p.mat = 'wood'; }, /mat: must be one of board, card, fabric/);
  expectError((p) => { p.label = ''; }, /label: required/);
  expectError((p) => { p.theme = 3; }, /theme: required/);
  expectError((p) => { p.colour = 'red'; }, /colour: unknown field/);
});

test('params and defaults must agree', () => {
  expectError((p) => { p.params[1].key = 'w'; }, /params\[1\]\.key: duplicate "w"/);
  expectError((p) => { p.params[0].min = 400; }, /params\[0\]: min is above max/);
  expectError((p) => { p.params[0].unit = 'in'; }, /params\[0\]\.unit: must be one of cm/);
  expectError((p) => { delete p.defaults.seat; }, /defaults\.seat: missing/);
  expectError((p) => { p.defaults.w = 999; }, /defaults\.w: 999 is outside 80…320/);
  expectError((p) => { p.defaults.extra = 1; }, /defaults\.extra: not a parameter/);
  expectError((p) => { p.defaults.style = 'glass'; }, /defaults\.style: "glass" is not an option/, bookshelf);
  expectError((p) => { p.params[4].options = []; }, /params\[4\]\.options: needs at least one option/, bookshelf);
  expectError((p) => { p.params[0].key = 't'; }, /params\[0\]\.key: "t" is reserved/);
});

test('expressions must parse and only use known names', () => {
  expectError((p) => { p.size[2] = 'max(back, armh'; }, /size\[2\]: expected "\)"/);
  expectError((p) => { p.components[0].size[0] = 'w - 2 * arms'; }, /components\[0\]\.size\[0\]: unknown name "arms"/);
  expectError((p) => { p.size[2] = 'max(back, armh) + t'; }, /size\[2\]: unknown name "t" \(size only sees parameters\)/);
  expectError((p) => { p.size[0] = 'a'; }, /size\[0\]: unknown name "a" \(size only sees parameters\)/);
  expectError((p) => { delete p.size; }, /size: required unless the piece has w, d and h parameters/);
  expectError((p) => { p.let.a = 'min(arm, w / 3) + dd'; }, /let\.a: unknown name "dd"/);
  expectError((p) => { p.let.w = '1'; }, /let\.w: "w" is already a parameter/);
  expectError((p) => { p.components[0].name = 'Seat {k}'; }, /components\[0\]\.name: unknown name "k"/);
  expectError((p) => { p.components[0].each.name = 'Book {j}'; }, /components\[0\]\.each\.name: unknown name "j"/, books);
  expectError((p) => { p.components[0].as = 'w'; }, /components\[0\]\.as: "w" is already defined/, books);
});

test('components are checked by kind', () => {
  expectError((p) => { p.components[0].kind = 'sphere'; }, /components\[0\]\.kind: must be one of box, flat/);
  expectError((p) => { p.components[0].size = ['w', 'd']; }, /components\[0\]\.size: needs 3 values/);
  expectError((p) => { p.components[0].faces = ['bottom', 'roof']; }, /components\[0\]\.faces\[1\]: must be one of/);
  expectError((p) => { p.components[0].faces = []; }, /components\[0\]\.faces: needs at least one face/);
  expectError((p) => { p.components[0].polys = []; }, /components\[0\]\.polys: only flat/);
  expectError((p) => { delete p.components[3].plane; }, /components\[3\]: a flat needs a plane, or wall: true/);
  expectError((p) => { p.components[3].plane = { sideways: {} }; }, /components\[3\]\.plane: must be one of/);
  expectError((p) => { p.components[3].polys = []; }, /components\[3\]\.polys: needs at least one shape/);
  expectError((p) => { p.components[0].holes = { roof: [] }; }, /components\[0\]\.holes\.roof: not a box face/);
  expectError((p) => { p.components = []; }, /components: needs at least one component/);
  expectError((p) => { p.components[0].shelves = { even: 2 }; }, /components\[0\]\.shelves\.h: required/, bookshelf);
  expectError((p) => { delete p.components[0].as; }, /components\[0\]\.as: required/, books);
});

test('wall pieces only use wall-mounted flats or boxes; floor pieces never do', () => {
  expectError((p) => { p.components[3].wall = true; delete p.components[3].plane; }, /components\[3\]\.wall: only wall pieces/);
  expectError((p) => { p.components[0].plane = { floor: { z: 0 } }; delete p.components[0].wall; }, /components\[0\]: wall pieces hang flats with wall: true/, frame);
});

test('shapes and scores are checked', () => {
  expectError((p) => { p.components[0].polys[0] = { star: [1, 2] }; }, /polys\[0\]: unknown shape/, frame);
  expectError((p) => { p.components[0].polys[0] = { rect: [0, 0, 'w'] }; }, /polys\[0\]\.rect: needs 4 values/, frame);
  expectError((p) => { p.components[0].polys[1] = { circle: ['w / 2', 'w / 2'] }; }, /polys\[1\]\.circle: needs 3 to 4 values/, frame);
  expectError((p) => { p.components[0].polys[0] = { poly: [[0, 0], [1, 1]] }; }, /polys\[0\]\.poly: needs at least 3 points/, frame);
  expectError((p) => { p.components[0].scores[0] = { zigzag: [] }; }, /scores\[0\]: unknown score/, frame);
  expectError((p) => { p.components[0].scores.top[0] = { line: [[0, 0]] }; }, /scores\.top\[0\]\.line: needs 2 points/, bookshelf);
  expectError((p) => { delete p.components[0].scores.top[1].fronts.w; }, /fronts\.w: required/, bookshelf);
  expectError((p) => { p.components[0].polys[0] = { rect: [0, 0, 'w', 'w'], arch: [0, 0, 'w', 'w'] }; }, /polys\[0\]: exactly one shape/, frame);
});

test('the catalogue as a whole has unique ids', () => {
  assert.deepEqual(validatePieces([sofa, bookshelf]), []);
  const e = validatePieces([sofa, clone(sofa)]);
  assert.ok(e.some((m) => /duplicate id "sofa"/.test(m)), e.join('\n'));
});

test('the published JSON Schema lists the same vocabulary as the validator', () => {
  const schema = JSON.parse(readFileSync(new URL('../src/pieces/piece.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  const defs = schema.$defs;
  assert.deepEqual(defs.face.enum, FACES);
  assert.deepEqual(Object.keys(defs.shape.properties).filter((k) => k !== 'when').sort(), [...SHAPES].sort());
  assert.deepEqual(Object.keys(defs.score.properties).filter((k) => k !== 'when').sort(), [...SCORES].sort());
  assert.deepEqual(Object.keys(defs.plane.properties).sort(), [...PLANES].sort());
});
