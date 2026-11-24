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
    let: {
      base: 'w * 0.7', bh: 'max(3, h * 0.03)', d: 'max(1.5, min(3, w * 0.08))', hole: 'd / 2 + 0.1',
      rim: 'max(1.5, w * 0.06)', arm: 'd + 3.4', q: '(w - 2 * rim - arm) / 2',
    },
    components: [
      { kind: 'box', name: 'Base', size: ['base', 'base', 'bh'], faces: 'all', at: ['(w - base) / 2', '(w - base) / 2', 0], holes: { top: [{ circle: ['base / 2', 'base / 2', 'hole', 24] }] } },
      { kind: 'rod', name: 'Stem', stock: 'tube', d: 'd', from: ['w / 2', 'w / 2', 't'], to: ['w / 2', 'w / 2', 'h'] },
      { kind: 'box', name: 'Shade', size: ['w', 'w', 'shade'], faces: ['front', 'back', 'left', 'right'], at: [0, 0, 'h - t - shade'] },
      {
        kind: 'flat', name: 'Shade spider', plane: { floor: { z: 'h' } },
        polys: [
          { rect: [0, 0, 'w', 'w'] },
          { when: 'q >= 1.5', rect: ['rim', 'rim', 'q', 'q'] }, { when: 'q >= 1.5', rect: ['w - rim - q', 'rim', 'q', 'q'] },
          { when: 'q >= 1.5', rect: ['rim', 'w - rim - q', 'q', 'q'] }, { when: 'q >= 1.5', rect: ['w - rim - q', 'w - rim - q', 'q', 'q'] },
          { circle: ['w / 2', 'w / 2', 'hole', 24] },
        ],
      },
    ],
    note: 'Fold the base and glue the stem upright through the hole in its top, standing on its floor. Fold the shade into a tube, glue the spider across its top edge, then thread the spider’s hub down the stem and glue it. Run the LED wires up inside the tube; vellum or thin paper makes the shade glow softly.',
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
  {
    id: 'loveseat', label: 'Loveseat', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['seating', 'cosy'], difficulty: 2,
    params: [num('w', 'Width', 100, 160), num('d', 'Depth', 60, 100), num('seat', 'Seat height', 30, 50), num('back', 'Back height', 60, 100), num('arm', 'Arm width', 8, 25), num('armh', 'Arm height', 45, 75)],
    defaults: { w: 140, d: 80, seat: 42, back: 80, arm: 14, armh: 58 },
    size: ['w', 'd', 'max(back, armh)'],
    let: { a: 'min(arm, w / 4)', dd: 'd - t', sw: 'w - 2 * a' },
    components: [
      { kind: 'box', name: 'Seat', size: ['sw', 'dd', 'seat'], faces: 'all', at: ['a', 0, 0], scores: { top: [{ line: [['sw / 2', 0], ['sw / 2', 'dd']] }] } },
      { kind: 'box', name: 'Left arm', size: ['a', 'dd', 'armh'], faces: 'all', at: [0, 0, 0] },
      { kind: 'box', name: 'Right arm', size: ['a', 'dd', 'armh'], faces: 'all', at: ['w - a', 0, 0] },
      { kind: 'flat', name: 'Back', polys: [{ arch: [0, 0, 'w', 'back', 'min(w * 0.12, back * 0.35)'] }], plane: { upright: { y: 'dd' } } },
    ],
    note: 'Glue the arms to the seat, then the back across all three. The score line splits the seat into two cushions — cover each with a felt square.',
  },
  {
    id: 'cornersofa', label: 'Corner sofa', theme: 'Living room', placement: 'floor', mat: 'board',
    tags: ['seating', 'cosy'], difficulty: 3,
    params: [num('w', 'Width', 180, 320), num('l', 'Return length', 140, 260), num('d', 'Seat depth', 70, 100), num('seat', 'Seat height', 30, 50), num('back', 'Back height', 60, 100), num('arm', 'Arm width', 10, 25), num('armh', 'Arm height', 45, 75)],
    defaults: { w: 240, l: 180, d: 85, seat: 42, back: 80, arm: 15, armh: 58 },
    size: ['w', 'l', 'max(back, armh)'],
    let: { a: 'min(arm, d / 3)' },
    components: [
      { kind: 'box', name: 'Long seat', size: ['w - a - t', 'd - t', 'seat'], faces: 'all', at: ['t', 'l - d', 0] },
      { kind: 'box', name: 'Return seat', size: ['d - t', 'l - d - a', 'seat'], faces: 'all', at: ['t', 'a', 0] },
      { kind: 'box', name: 'Right arm', size: ['a', 'd - t', 'armh'], faces: 'all', at: ['w - a', 'l - d', 0] },
      { kind: 'box', name: 'Front arm', size: ['d - t', 'a', 'armh'], faces: 'all', at: ['t', 0, 0] },
      { kind: 'flat', name: 'Long back', plane: { upright: { y: 'l - t' } }, polys: [{ rect: [0, 0, 'w', 'back'] }] },
      { kind: 'flat', name: 'Side back', plane: { custom: { o: [0, 0, 0], U: [0, 1, 0], V: [0, 0, 1], n: [-1, 0, 0] } }, polys: [{ rect: [0, 0, 'l - t', 'back'] }] },
    ],
    note: 'Glue the two backs together at the corner first, then the long seat and the return seat against them, and the arms at the two open ends. Fits snugly into a room corner.',
  },
];
