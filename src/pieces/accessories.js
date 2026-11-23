// The accessory generator: small cardstock pieces that dress a room —
// books, food, signs, posters and plants. Flat ones are cut and glued in
// place; the bakery treats fold up into tiny boxes. `seed` parameters use
// hash(k, seed) so a row of books varies but repeats for the same seed.

import { num, cnt, sel } from './params.js';

export const ACCESSORIES = [
  {
    id: 'bookrow', label: 'Row of books', theme: 'Accessories', placement: 'floor', mat: 'card',
    tags: ['accessory', 'books'], difficulty: 1,
    params: [cnt('count', 'Books', 3, 20), num('h', 'Tallest book', 10, 35), num('th', 'Spine thickness', 1, 6), num('d', 'Depth', 10, 25), cnt('seed', 'Variation', 1, 99)],
    defaults: { count: 8, h: 24, th: 3, d: 17, seed: 7 },
    size: ['th * round(count)', 'd', 'h'],
    components: [{
      repeat: 'round(count)', as: 'k', let: { bh: 'h * (0.68 + 0.32 * hash(k, seed))' },
      each: {
        kind: 'flat', name: 'Book {k + 1}', plane: { upright: { y: 'd / 2' } },
        polys: [{ rect: ['k * th', 0, 'th', 'bh'] }],
        scores: [{ line: [['k * th', 'bh * 0.12'], ['(k + 1) * th', 'bh * 0.12']] }, { line: [['k * th', 'bh * 0.86'], ['(k + 1) * th', 'bh * 0.86']] }],
      },
    }],
    note: 'Cut the spines from several colours of card, ink a title between the two score bands, and glue them side by side on a shelf. Change "Variation" for a different row.',
  },
  {
    id: 'bakery', label: 'Bakery treats', theme: 'Accessories', placement: 'floor', mat: 'card',
    tags: ['accessory', 'food'], difficulty: 1,
    params: [sel('kind', 'Treat', ['cake', 'loaf', 'pie']), num('w', 'Size', 8, 40)],
    defaults: { kind: 'cake', w: 20 },
    size: ['w', "kind == 'loaf' ? w * 0.5 : w", "kind == 'cake' ? w * 0.6 : kind == 'loaf' ? w * 0.4 : w * 0.2"],
    let: {
      D: "kind == 'loaf' ? w * 0.5 : w",
      H: "kind == 'cake' ? w * 0.6 : kind == 'loaf' ? w * 0.4 : w * 0.2",
    },
    components: [{
      kind: 'box', name: "{kind == 'cake' ? 'Cake' : kind == 'loaf' ? 'Loaf' : 'Pie'}", size: ['w', 'D', 'H'], faces: 'all', at: [0, 0, 0],
      scores: {
        front: [{ when: "kind == 'cake'", repeat: 2, as: 'k', each: { line: [[0, 'H * (k + 1) / 3'], ['w', 'H * (k + 1) / 3']] } }],
        top: [
          { when: "kind == 'cake'", circle: ['w / 2', 'D / 2', 'w * 0.35'] },
          { when: "kind == 'loaf'", repeat: 3, as: 'k', each: { line: [['w * (0.25 + 0.25 * k) - D * 0.15', 'D * 0.2'], ['w * (0.25 + 0.25 * k) + D * 0.15', 'D * 0.8']] } },
          { when: "kind == 'pie'", repeat: 2, as: 'k', each: { line: [['w * (k + 1) / 3', 'D * 0.1'], ['w * (k + 1) / 3', 'D * 0.9']] } },
          { when: "kind == 'pie'", repeat: 2, as: 'k', each: { line: [['w * 0.1', 'D * (k + 1) / 3'], ['w * 0.9', 'D * (k + 1) / 3']] } },
        ],
      },
    }],
    note: 'Fold it up from white or brown card; the score lines are cake layers, loaf slashes or pie lattice — trace them with a brown or pink pen. A dab of white glue makes icing.',
  },
  {
    id: 'sign', label: 'Hanging sign', theme: 'Accessories', placement: 'wall', mat: 'card',
    tags: ['accessory', 'sign', 'wall-mounted'], difficulty: 1,
    params: [num('w', 'Width', 15, 80), num('h', 'Height', 8, 40), sel('shape', 'Shape', ['rect', 'oval', 'tag']), num('border', 'Border', 0, 5, 0.5)],
    defaults: { w: 40, h: 15, shape: 'rect', border: 1.5 },
    size: ['w', 0, 'h'],
    let: { r: 'max(0.3, min(w, h) * 0.05)', b: 'min(border, min(w, h) / 4)' },
    components: [{
      kind: 'flat', name: 'Sign', wall: true, surface: true,
      polys: [
        { when: "shape == 'rect'", rect: [0, 0, 'w', 'h'] },
        { when: "shape == 'oval'", ellipse: ['w / 2', 'h / 2', 'w / 2', 'h / 2', 48] },
        { when: "shape == 'tag'", poly: [[0, 0], ['w', 0], ['w', 'h * 0.7'], ['w * 0.8', 'h'], ['w * 0.2', 'h'], [0, 'h * 0.7']] },
        { circle: ['w * 0.25', 'h * 0.75', 'r', 16] },
        { circle: ['w * 0.75', 'h * 0.75', 'r', 16] },
      ],
      scores: [
        { when: "b > 0 && shape == 'rect'", rect: ['b', 'b', 'w - 2 * b', 'h - 2 * b'] },
        { when: "b > 0 && shape == 'oval'", ellipse: ['w / 2', 'h / 2', 'w / 2 - b', 'h / 2 - b', 48] },
      ],
    }],
    note: 'Letter the sign inside the border, thread fine thread or wire through the two holes and hang it from a pin or a beam.',
  },
  {
    id: 'poster', label: 'Poster', theme: 'Accessories', placement: 'wall', mat: 'card',
    tags: ['accessory', 'art', 'wall-mounted'], difficulty: 1,
    params: [num('w', 'Width', 10, 120), sel('shape', 'Shape', ['portrait', 'landscape', 'square']), num('margin', 'Margin', 0, 8, 0.5)],
    defaults: { w: 40, shape: 'portrait', margin: 2 },
    size: ['w', 0, "shape == 'portrait' ? w * 1.4 : shape == 'landscape' ? w * 0.7 : w"],
    let: { H: "shape == 'portrait' ? w * 1.4 : shape == 'landscape' ? w * 0.7 : w", m: 'min(margin, w / 4, H / 4)' },
    components: [{
      kind: 'flat', name: 'Poster', wall: true, surface: true,
      polys: [{ rect: [0, 0, 'w', 'H'] }],
      scores: [{ when: 'm > 0', rect: ['m', 'm', 'w - 2 * m', 'H - 2 * m'] }],
    }],
    note: 'Glue a printed picture inside the scored margin (or draw your own), then stick the poster flat on the wall with a glue stick.',
  },
  {
    id: 'littleplant', label: 'Little plant', theme: 'Accessories', placement: 'floor', mat: 'card',
    tags: ['accessory', 'plant', 'green'], difficulty: 1,
    params: [num('p', 'Pot width', 5, 25), num('h', 'Plant height', 5, 40), sel('kind', 'Leaves', ['succulent', 'fern', 'grass'])],
    defaults: { p: 10, h: 15, kind: 'succulent' },
    size: ['p * 1.6', 'p', 'p * 0.45 + h'],
    let: { W: 'p * 1.6', lobes: "kind == 'succulent' ? 2.5 : kind == 'fern' ? 5.5 : 9.5" },
    components: [
      { kind: 'box', name: 'Pot', size: ['p', 'p', 'p * 0.9'], faces: ['bottom', 'front', 'back', 'left', 'right'], at: ['(W - p) / 2', 0, 0] },
      { kind: 'flat', name: 'Leaves', plane: { upright: { y: 'p / 2', z: 'p * 0.45' } }, polys: [{ plant: ['W', 'h', 'lobes'] }] },
    ],
    note: 'Fold the pot, cut the leaves from green card and slot them in; dot the pot with glue and "soil". Line several up on a window sill.',
  },
];
