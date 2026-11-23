import { num, cnt, sel } from './params.js';

export const BASICS = [
  {
    id: 'bookshelf', label: 'Bookshelf', theme: 'Basics', placement: 'floor', mat: 'board',
    tags: ['storage', 'books'], difficulty: 2,
    params: [num('w', 'Width', 10, 300), num('d', 'Depth', 10, 100), num('h', 'Height', 20, 300), cnt('shelves', 'Shelves', 0, 8)],
    defaults: { w: 80, d: 30, h: 180, shelves: 3 },
    components: [{
      kind: 'box', name: 'Bookshelf', size: ['w', 'd', 'h'], faces: ['bottom', 'top', 'left', 'right', 'back'],
      shelves: { even: 'round(shelves)', h: 'h' }, at: [0, 0, 0],
    }],
    note: 'Slide the shelves into their slots before closing the second side panel.',
  },
  {
    id: 'cabinet', label: 'Cabinet / dresser', theme: 'Basics', placement: 'floor', mat: 'board',
    tags: ['storage', 'drawers'], difficulty: 1,
    params: [num('w', 'Width', 10, 300), num('d', 'Depth', 10, 100), num('h', 'Height', 10, 250), sel('style', 'Front', ['drawers', 'doors', 'plain']), cnt('count', 'Drawers / doors', 1, 8)],
    defaults: { w: 90, d: 45, h: 85, style: 'drawers', count: 3 },
    components: [{
      kind: 'box', name: 'Cabinet', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0],
      scores: { front: [{ fronts: { style: 'style', count: 'round(count)', w: 'w', h: 'h' } }] },
    }],
    note: 'Score lines on the front mark drawer or door gaps; glue on tiny bead handles if you like.',
  },
  {
    id: 'table', label: 'Table', theme: 'Basics', placement: 'floor', mat: 'board',
    tags: ['table', 'dining'], difficulty: 1,
    params: [num('w', 'Width', 20, 300), num('d', 'Depth', 20, 200), num('h', 'Height', 20, 120)],
    defaults: { w: 120, d: 70, h: 75 },
    components: [{ kind: 'box', name: 'Table', size: ['w', 'd', 'h'], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  {
    id: 'chair', label: 'Chair', theme: 'Basics', placement: 'floor', mat: 'board',
    tags: ['seating', 'dining'], difficulty: 1,
    params: [num('w', 'Width', 30, 120), num('d', 'Depth', 30, 120), num('seat', 'Seat height', 20, 70), num('back', 'Back height', 50, 140)],
    defaults: { w: 45, d: 45, seat: 45, back: 90 },
    size: ['w', 'd', 'max(seat, back)'],
    components: [
      { kind: 'box', name: 'Seat', size: ['w', 'd - t', 'seat'], faces: ['top', 'left', 'right'], at: [0, 0, 0] },
      { kind: 'flat', name: 'Backrest', polys: [{ arch: [0, 0, 'w', 'back', 'w * 0.25'] }], plane: { upright: { y: 'd - t' } } },
    ],
    note: 'Glue the backrest against the back edges of the seat sides.',
  },
  {
    id: 'bench', label: 'Bench / coffee table', theme: 'Basics', placement: 'floor', mat: 'board',
    tags: ['seating', 'table'], difficulty: 1,
    params: [num('w', 'Width', 20, 300), num('d', 'Depth', 15, 120), num('h', 'Height', 10, 80)],
    defaults: { w: 100, d: 40, h: 45 },
    components: [{ kind: 'box', name: 'Bench', size: ['w', 'd', 'h'], faces: ['top', 'left', 'right'], at: [0, 0, 0] }],
  },
  {
    id: 'desk', label: 'Desk', theme: 'Basics', placement: 'floor', mat: 'board',
    tags: ['table', 'work'], difficulty: 1,
    params: [num('w', 'Width', 30, 250), num('d', 'Depth', 20, 120), num('h', 'Height', 30, 120)],
    defaults: { w: 120, d: 60, h: 75 },
    components: [{ kind: 'box', name: 'Desk', size: ['w', 'd', 'h'], faces: ['top', 'left', 'right', 'back'], at: [0, 0, 0] }],
  },
];
