import { num, cnt } from './params.js';

export const LIBRARY = [
  {
    id: 'ladder', label: 'Library ladder', theme: 'Library', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 25, 70), num('h', 'Height', 80, 260), cnt('rungs', 'Rungs', 3, 12)],
    defaults: { w: 45, h: 200, rungs: 7 },
    size: ['w', 'max(2, w * 0.1)', 'h'],
    let: { rail: 'max(2, w * 0.14)', n: 'round(rungs)', rung: 'max(1.5, h * 0.02)', gap: '(h - (n + 1) * rung) / n' },
    components: [{
      kind: 'flat', name: 'Ladder', plane: { upright: { y: 0 } },
      polys: [
        { rect: [0, 0, 'w', 'h'] },
        { repeat: 'n', as: 'k', each: { rect: ['rail', 'rung + k * (gap + rung)', 'w - 2 * rail', 'gap'] } },
      ],
    }],
    note: 'Lean the ladder against the bookshelf; cut two and glue them back to back if it feels flimsy.',
  },
  {
    id: 'books', label: 'Book stack', theme: 'Library', placement: 'floor', mat: 'card',
    params: [num('w', 'Width', 10, 60), num('d', 'Depth', 8, 40), num('h', 'Book thickness', 2, 10), cnt('count', 'Books', 1, 6)],
    defaults: { w: 30, d: 22, h: 4, count: 3 },
    size: ['w', 'd', 'h * round(count)'],
    components: [{
      repeat: 'round(count)', as: 'k', let: { shrink: '1 - 0.08 * (k % 3)' },
      each: {
        kind: 'box', name: 'Book {k + 1}', size: ['w * shrink', 'd * shrink', 'h'], faces: 'all',
        at: ['(w * (1 - shrink)) / 2', '(d * (1 - shrink)) / 2', 'k * h'],
      },
    }],
  },
];
