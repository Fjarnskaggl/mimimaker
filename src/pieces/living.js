import { num, cnt } from './params.js';

/** Sofa and armchair share one construction: seat, two arms, arched back. */
const sofaParts = (seatName = 'Seat') => [
  { kind: 'box', name: seatName, size: ['w - 2 * a', 'dd', 'seat'], faces: 'all', at: ['a', 0, 0] },
  { kind: 'box', name: 'Left arm', size: ['a', 'dd', 'armh'], faces: 'all', at: [0, 0, 0] },
  { kind: 'box', name: 'Right arm', size: ['a', 'dd', 'armh'], faces: 'all', at: ['w - a', 0, 0] },
  { kind: 'flat', name: 'Back', polys: [{ arch: [0, 0, 'w', 'back', 'min(w * 0.08, back * 0.3)'] }], plane: { upright: { y: 'dd' } } },
];
const sofaLets = { a: 'min(arm, w / 3)', dd: 'd - t' };

export const LIVING = [
  {
    id: 'sofa', label: 'Sofa', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['seating', 'cosy'], difficulty: 2,
    params: [num('w', 'Width', 80, 320), num('d', 'Depth', 50, 120), num('seat', 'Seat height', 25, 60), num('back', 'Back height', 50, 120), num('arm', 'Arm width', 8, 40), num('armh', 'Arm height', 40, 90)],
    defaults: { w: 200, d: 85, seat: 42, back: 82, arm: 18, armh: 60 },
    size: ['w', 'd', 'max(back, armh)'],
    let: sofaLets,
    components: sofaParts(),
    note: 'Glue the arms to the seat ends, then the back across all three. Felt or fabric scraps make good cushions.',
  },
  {
    id: 'armchair', label: 'Armchair', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['seating', 'cosy'], difficulty: 2,
    params: [num('w', 'Width', 50, 140), num('d', 'Depth', 50, 120), num('seat', 'Seat height', 25, 60), num('back', 'Back height', 50, 130), num('arm', 'Arm width', 8, 30), num('armh', 'Arm height', 40, 90)],
    defaults: { w: 90, d: 85, seat: 42, back: 90, arm: 16, armh: 62 },
    size: ['w', 'd', 'max(back, armh)'],
    let: sofaLets,
    components: sofaParts(),
    note: 'Glue the arms to the seat, then the back on behind.',
  },
  {
    id: 'fireplace', label: 'Fireplace', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['cosy', 'light', 'arch'], difficulty: 2,
    params: [num('w', 'Width', 60, 220), num('d', 'Depth', 20, 70), num('h', 'Height', 60, 160)],
    defaults: { w: 120, d: 35, h: 105 },
    size: ['w', 'd', 'h + 4'],
    let: { ow: 'w * 0.56', oh: 'h * 0.58', ov: 'min(w * 0.05, 6)' },
    components: [
      { kind: 'box', name: 'Fireplace', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0], holes: { front: [{ arch: ['(w - ow) / 2', 't + 1', 'ow', 'oh'] }] } },
      { kind: 'box', name: 'Mantel', size: ['w + 2 * ov', 'd + ov', 'max(3 * t, h * 0.05)'], faces: 'all', at: ['-ov', '-ov', 'h'] },
    ],
    note: 'Put an amber LED on the floor inside the opening for a glowing fire. Glue the mantel on top, overhanging the front and sides.',
  },
  {
    id: 'tvstand', label: 'TV / media unit', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['storage', 'media'], difficulty: 1,
    params: [num('w', 'Width', 60, 250), num('d', 'Depth', 25, 60), num('h', 'Height', 30, 90), cnt('shelves', 'Shelves', 0, 2)],
    defaults: { w: 150, d: 40, h: 50, shelves: 1 },
    components: [{ kind: 'box', name: 'Media unit', size: ['w', 'd', 'h'], faces: ['bottom', 'top', 'left', 'right', 'back'], shelves: { even: 'round(shelves)', h: 'h' }, at: [0, 0, 0] }],
  },
  {
    id: 'floorlamp', label: 'Floor lamp', theme: 'Living room', placement: 'floor', mat: 'card',
    tags: ['light', 'cosy'], difficulty: 2,
    params: [num('w', 'Shade width', 20, 60), num('h', 'Height', 80, 200), num('shade', 'Shade height', 15, 50)],
    defaults: { w: 35, h: 160, shade: 28 },
    size: ['w', 'w', 'h'],
    let: { base: 'w * 0.7', pole: 'max(1.5, w * 0.08)', poleH: 'h - shade * 0.6' },
    components: [
      { kind: 'box', name: 'Base', size: ['base', 'base', 'max(2, h * 0.03)'], faces: 'all', at: ['(w - base) / 2', '(w - base) / 2', 0] },
      { kind: 'flat', name: 'Pole', polys: [{ rect: [0, 0, 'pole', 'poleH'] }], plane: { upright: { x: '(w - pole) / 2', y: 'w / 2' } } },
      { kind: 'box', name: 'Shade', size: ['w', 'w', 'shade'], faces: ['front', 'back', 'left', 'right'], at: [0, 0, 'h - shade'] },
    ],
    note: 'Pair it with a floor LED: thread the wire up the pole and tuck the bulb inside the shade. Use vellum or thin paper for a softer glow.',
  },
  {
    id: 'sideboard', label: 'Sideboard', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['storage', 'dining'], difficulty: 2,
    params: [num('w', 'Width', 80, 240), num('d', 'Depth', 30, 60), num('h', 'Height', 50, 110), cnt('count', 'Doors', 2, 6)],
    defaults: { w: 160, d: 45, h: 80, count: 3 },
    let: { top: 'max(2 * t, h * 0.04)', ov: 'min(w * 0.03, 3)' },
    components: [
      {
        kind: 'box', name: 'Sideboard', size: ['w - 2 * ov', 'd - ov', 'h - top'], faces: 'all', at: ['ov', 'ov', 0],
        scores: { front: [{ fronts: { style: "'doors'", count: 'round(count)', w: 'w - 2 * ov', h: 'h - top' } }] },
      },
      { kind: 'box', name: 'Top', size: ['w', 'd', 'top'], faces: 'all', at: [0, 0, 'h - top'] },
    ],
    note: 'Build the body, then glue the top on so it overhangs the front and both ends evenly. A strip of washi tape along the top edge looks like veneer.',
  },
];
