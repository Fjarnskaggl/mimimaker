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
    let: { top: 'max(2 * t, 3, h * 0.04)', ov: 'min(w * 0.03, 3)' },
    components: [
      {
        kind: 'box', name: 'Sideboard', size: ['w - 2 * ov', 'd - ov', 'h - top'], faces: 'all', at: ['ov', 'ov', 0],
        scores: { front: [{ fronts: { style: "'doors'", count: 'round(count)', w: 'w - 2 * ov', h: 'h - top' } }] },
      },
      { kind: 'box', name: 'Top', size: ['w', 'd', 'top'], faces: 'all', at: [0, 0, 'h - top'] },
    ],
    note: 'Build the body, then glue the top on so it overhangs the front and both ends evenly. A strip of washi tape along the top edge looks like veneer.',
  },
  {
    id: 'piano', label: 'Upright piano', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['music', 'cosy'], difficulty: 3,
    params: [num('w', 'Width', 100, 170), num('d', 'Depth', 40, 70), num('h', 'Height', 100, 140), cnt('octaves', 'Octaves', 3, 7)],
    defaults: { w: 145, d: 55, h: 120, octaves: 5 },
    let: {
      kd: 'd * 0.35', kh: 'h * 0.55', kt: 'max(3, 2 * t, h * 0.06)', lw: 'max(4, 2 * t + 1, w * 0.04)',
      kw: 'w * 0.86', m: '(w - kw) / 2', n: '7 * round(octaves)',
    },
    components: [
      { kind: 'box', name: 'Piano', size: ['w', 'd - kd', 'h'], faces: 'all', at: [0, 'kd', 0], scores: { front: [{ rect: ['w * 0.08', 'kh + h * 0.08', 'w * 0.84', 'h * 0.3'] }] } },
      {
        kind: 'box', name: 'Keybed', size: ['w', 'kd', 'kt'], faces: 'all', at: [0, 0, 'kh - kt'],
        scores: { top: [{ repeat: 'n - 1', as: 'k', each: { line: [['m + (k + 1) * kw / n', 0], ['m + (k + 1) * kw / n', 'kd']] } }] },
      },
      { repeat: 2, as: 'i', each: { kind: 'box', name: 'Leg {i + 1}', size: ['lw', 'kd', 'kh - kt'], faces: 'all', at: ['i * (w - lw)', 0, 0] } },
    ],
    note: 'Build the body and the keybed, glue the keybed to the body front at the scored height, then the two legs underneath. Ink alternate pairs and threes of black keys between the scores.',
  },
  {
    id: 'firescreen', label: 'Fire screen', theme: 'Living room', placement: 'floor', mat: 'card',
    tags: ['cosy', 'screen'], difficulty: 1,
    params: [num('w', 'Width', 50, 120), num('h', 'Height', 40, 90), num('border', 'Frame', 1, 8)],
    defaults: { w: 80, h: 60, border: 3 },
    size: ['w', 'max(2, w * 0.05)', 'h'],
    let: { gap: 'w * 0.02', pw: '(w - 2 * gap) / 3', b: 'min(border, pw / 4)' },
    components: [{
      repeat: 3, as: 'k', let: { x0: 'k * (pw + gap)' },
      each: {
        kind: 'flat', name: 'Panel {k + 1}', plane: { upright: { y: 'max(2, w * 0.05) / 2' } },
        polys: [{ arch: ['x0', 0, 'pw', 'h'] }, { arch: ['x0 + b', 'b', 'pw - 2 * b', 'h - 2 * b'] }],
      },
    }],
    note: 'Cut it from black card; glue gold thread or wire mesh behind the openings, then hinge the three panels with tape so the screen stands in a zigzag in front of the fireplace.',
  },
  {
    id: 'lamptable', label: 'Lamp table', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['table', 'light'], difficulty: 1,
    params: [num('w', 'Width', 30, 70), num('h', 'Height', 40, 75)],
    defaults: { w: 45, h: 55 },
    size: ['w', 'w', 'h'],
    components: [
      { kind: 'box', name: 'Lamp table', size: ['w', 'w', 'h'], faces: ['top', 'left', 'right'], shelves: { even: 1, h: 'h' }, at: [0, 0, 0] },
      { kind: 'flat', name: 'Round top', plane: { floor: { z: 'h' } }, surface: true, polys: [{ circle: ['w / 2', 'w / 2', 'w / 2', 64] }] },
    ],
    note: 'Glue the round top (patterned card looks like a tablecloth) centred on the square top. Put a small LED inside a bead lampshade on top.',
  },
];
