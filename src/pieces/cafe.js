import { num, cnt } from './params.js';

export const CAFE = [
  {
    id: 'cafecounter', label: 'Shop counter', theme: 'Café', placement: 'floor', mat: 'board',
    tags: ['shop', 'counter'], difficulty: 1,
    params: [num('w', 'Width', 60, 300), num('d', 'Depth', 40, 90), num('h', 'Height', 80, 120), cnt('count', 'Front panels', 1, 8)],
    defaults: { w: 180, d: 60, h: 100, count: 4 },
    components: [{ kind: 'box', name: 'Counter', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0], scores: { front: [{ fronts: { style: "'doors'", count: 'round(count)', w: 'w', h: 'h' } }] } }],
    note: 'Glue a tiny cash register (a scrap block) and a cake stand (a button on a bead) on top.',
  },
  {
    id: 'stool', label: 'Bar stool', theme: 'Café', placement: 'floor', mat: 'board',
    tags: ['seating', 'shop'], difficulty: 1,
    params: [num('w', 'Width', 25, 50), num('d', 'Depth', 25, 50), num('h', 'Height', 40, 85)],
    defaults: { w: 35, d: 35, h: 75 },
    components: [{ kind: 'box', name: 'Stool', size: ['w', 'd', 'h'], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  {
    id: 'cafetable', label: 'Café table', theme: 'Café', placement: 'floor', mat: 'board',
    tags: ['table', 'shop'], difficulty: 1,
    params: [num('w', 'Width', 40, 100), num('d', 'Depth', 40, 100), num('h', 'Height', 60, 80)],
    defaults: { w: 60, d: 60, h: 75 },
    components: [{ kind: 'box', name: 'Café table', size: ['w', 'd', 'h'], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  {
    id: 'displayshelf', label: 'Display shelving', theme: 'Café', placement: 'floor', mat: 'board',
    tags: ['storage', 'shop'], difficulty: 2,
    params: [num('w', 'Width', 40, 200), num('d', 'Depth', 20, 60), num('h', 'Height', 80, 240), cnt('shelves', 'Shelves', 1, 6)],
    defaults: { w: 80, d: 35, h: 200, shelves: 4 },
    components: [{
      kind: 'box', name: 'Display shelving', size: ['w', 'd', 'h'], faces: ['bottom', 'top', 'left', 'right', 'back'],
      shelves: { even: 'round(shelves)', h: 'h' }, at: [0, 0, 0],
    }],
  },
  {
    id: 'chalkboard', label: 'Menu board', theme: 'Café', placement: 'wall', mat: 'card',
    tags: ['sign', 'shop', 'wall-mounted'], difficulty: 1,
    params: [num('w', 'Width', 20, 200), num('h', 'Height', 20, 150), num('border', 'Frame', 1, 15)],
    defaults: { w: 90, h: 60, border: 4 },
    size: ['w', 0, 'h'],
    let: { b: 'min(border, w / 3, h / 3)' },
    components: [{ kind: 'flat', name: 'Menu board', polys: [{ rect: [0, 0, 'w', 'h'] }], scores: [{ rect: ['b', 'b', 'w - 2 * b', 'h - 2 * b'] }], wall: true, surface: true }],
    note: 'Cut it from black card and write the menu with a white gel pen.',
  },
  {
    id: 'shopshelving', label: 'Shop shelving', theme: 'Café', placement: 'floor', mat: 'board',
    tags: ['shop', 'storage'], difficulty: 2,
    params: [num('w', 'Width', 60, 200), num('d', 'Depth', 30, 60), num('h', 'Height', 120, 220), cnt('shelves', 'Shelves', 1, 6), num('sign', 'Sign height', 10, 40)],
    defaults: { w: 100, d: 40, h: 180, shelves: 4, sign: 20 },
    size: ['w', 'd', 'h + sign'],
    let: { b: 'min(sign / 5, 2)' },
    components: [
      { kind: 'box', name: 'Shop shelving', size: ['w', 'd', 'h'], faces: ['bottom', 'top', 'left', 'right', 'back'], shelves: { even: 'round(shelves)', h: 'h' }, at: [0, 0, 0] },
      { kind: 'flat', name: 'Header sign', plane: { upright: { y: 'd - t', z: 'h' } }, polys: [{ rect: [0, 0, 'w', 'sign'] }], scores: [{ rect: ['b', 'b', 'w - 2 * b', 'sign - 2 * b'] }] },
    ],
    note: 'Glue the header sign upright along the back edge of the top and letter the shop name inside the scored border. Fill the shelves with accessory tins and jars.',
  },
  {
    id: 'barcounter', label: 'Bar counter', theme: 'Café', placement: 'floor', mat: 'board',
    tags: ['shop', 'counter', 'dining'], difficulty: 2,
    params: [num('w', 'Width', 80, 300), num('d', 'Depth', 40, 80), num('h', 'Height', 95, 120), num('ov', 'Bar overhang', 5, 30)],
    defaults: { w: 160, d: 60, h: 105, ov: 15 },
    let: { top: 'max(2 * t, 3, h * 0.04)', n: 'max(2, round(w / d))' },
    components: [
      {
        kind: 'box', name: 'Bar counter', size: ['w', 'd - ov', 'h - top'], faces: 'all', at: [0, 'ov', 0],
        scores: { front: [{ repeat: 'n - 1', as: 'k', each: { line: [['(k + 1) * w / n', 't + 1'], ['(k + 1) * w / n', 'h - top - t - 1']] } }] },
      },
      { kind: 'box', name: 'Bar top', size: ['w', 'd', 'top'], faces: 'all', at: [0, 0, 'h - top'] },
    ],
    note: 'Glue the bar top flush at the back so it overhangs the customer side; bar stools tuck under the overhang.',
  },
];
