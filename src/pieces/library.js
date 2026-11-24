import { num, cnt } from './params.js';

export const LIBRARY = [
  {
    id: 'ladder', label: 'Library ladder', theme: 'Library', placement: 'floor', mat: 'board',
    tags: ['books'], difficulty: 2,
    params: [num('w', 'Width', 25, 70), num('h', 'Height', 80, 260), cnt('rungs', 'Rungs', 3, 12)],
    defaults: { w: 45, h: 200, rungs: 7 },
    size: ['w', 'h * 0.5', 'h'],
    let: {
      rail: 'max(3, w * 0.14)', s: 0.2, c: 'sqrt(1 - s * s)', L: 'h / c',
      rung: 'max(3, L * 0.02)', n: 'max(1, min(round(rungs), floor((L - rung) / (rung + 3))))', gap: '(L - (n + 1) * rung) / n', back: '2 * s * L + 2 * c * t',
    },
    components: [
      {
        repeat: 2, as: 'k', each: {
          kind: 'flat', name: "{k == 0 ? 'Front ladder' : 'Back ladder'}",
          plane: { custom: { o: [0, 'k * back', 's * t'], U: [1, 0, 0], V: [0, 'k == 0 ? s : -s', 'c'], n: [0, 'k == 0 ? -c : c', 's'] } },
          polys: [
            { rect: [0, 0, 'w', 'L'] },
            { repeat: 'n', as: 'j', each: { rect: ['rail', 'rung + j * (gap + rung)', 'w - 2 * rail', 'gap'] } },
          ],
        },
      },
    ],
    note: 'A library step ladder: lean the two ladders together so their top edges meet, glue along the top, and it stands on its own. Slide it against a bookshelf.',
  },
  {
    id: 'books', label: 'Book stack', theme: 'Library', placement: 'floor', mat: 'card',
    tags: ['books', 'accessory'], difficulty: 1,
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
  {
    id: 'windowseat', label: 'Window seat', theme: 'Library', placement: 'floor', mat: 'board',
    tags: ['seating', 'cosy', 'books'], difficulty: 1,
    params: [num('w', 'Width', 60, 200), num('d', 'Depth', 35, 70), num('h', 'Height', 35, 55), cnt('count', 'Front panels', 1, 4)],
    defaults: { w: 120, d: 45, h: 45, count: 2 },
    let: { ci: 'min(w, d) * 0.04' },
    components: [
      { kind: 'box', name: 'Window seat', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0], scores: { front: [{ fronts: { style: "'doors'", count: 'round(count)', w: 'w', h: 'h' } }] } },
      { kind: 'flat', name: 'Cushion', material: 'felt', plane: { floor: { z: 'h' } }, surface: true, polys: [{ rect: ['ci', 'ci', 'w - 2 * ci', 'd - 2 * ci'] }] },
    ],
    note: 'Set it under a window; the cushion is cut from felt — glue it on top and add a couple of tiny rolled-felt pillows.',
  },
  {
    id: 'stepcupboard', label: 'Step cupboard', theme: 'Library', placement: 'floor', mat: 'board',
    tags: ['storage', 'stairs'], difficulty: 2,
    params: [num('w', 'Width', 60, 200), num('d', 'Depth', 25, 50), num('h', 'Tallest step', 60, 200), cnt('steps', 'Steps', 3, 6)],
    defaults: { w: 120, d: 35, h: 120, steps: 4 },
    let: { n: 'round(steps)', sw: 'w / n', b: 'min(max(t + 1, sw * 0.12), sw / 4)' },
    components: [{
      repeat: 'n', as: 'k', let: { sh: 'h * (k + 1) / n' },
      each: {
        kind: 'box', name: 'Step {k + 1}', size: ['sw', 'd', 'sh'], faces: 'all', at: ['k * sw', 0, 0],
        scores: { front: [{ rect: ['b', 'b', 'sw - 2 * b', 'sh - 2 * b'] }] },
      },
    }],
    note: 'Glue the steps side by side, lowest first, so they rise like a staircase; each scored outline is a cupboard door. Tuck it under a staircase or against a wall.',
  },
  {
    id: 'filingcabinet', label: 'Filing cabinet', theme: 'Library', placement: 'floor', mat: 'board',
    tags: ['storage', 'office'], difficulty: 1,
    params: [num('w', 'Width', 35, 60), num('d', 'Depth', 40, 70), num('h', 'Height', 50, 140), cnt('count', 'Drawers', 2, 5)],
    defaults: { w: 45, d: 60, h: 130, count: 4 },
    let: { n: 'round(count)', hw: 'w * 0.3', hh: 'max(1, h * 0.012)' },
    components: [{
      kind: 'box', name: 'Filing cabinet', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0],
      scores: { front: [
        { fronts: { style: "'drawers'", count: 'n', w: 'w', h: 'h' } },
        { repeat: 'n', as: 'k', each: { rect: ['(w - hw) / 2', 't + (k + 0.7) * (h - 2 * t) / n', 'hw', 'hh'] } },
      ] },
    }],
    note: 'Score lines mark each drawer and its pull; ink the pulls silver and add a tiny paper label above each.',
  },
];
