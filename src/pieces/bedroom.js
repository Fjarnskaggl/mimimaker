import { num, cnt } from './params.js';

const drawerBox = (name, style) => [{
  kind: 'box', name, size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0],
  scores: { front: [{ fronts: { style: `'${style}'`, count: 'round(count)', w: 'w', h: 'h' } }] },
}];

export const BEDROOM = [
  {
    id: 'bed', label: 'Bed', theme: 'Bedroom', placement: 'floor', mat: 'board',
    tags: ['sleep'], difficulty: 1,
    params: [num('w', 'Width', 60, 220), num('d', 'Length', 120, 240), num('h', 'Base height', 15, 80), num('head', 'Headboard height', 40, 160)],
    defaults: { w: 140, d: 200, h: 45, head: 100 },
    size: ['w', 'd', 'max(h, head)'],
    components: [
      { kind: 'box', name: 'Bed base', size: ['w', 'd - t', 'h'], faces: 'all', at: [0, 0, 0] },
      { kind: 'flat', name: 'Headboard', polys: [{ arch: [0, 0, 'w', 'head', 'min(w * 0.12, head * 0.3)'] }], plane: { upright: { y: 'd - t' } } },
    ],
    note: 'Glue the headboard flat against the back of the base, bottom edges flush. A felt rectangle makes a quick blanket.',
  },
  {
    id: 'nightstand', label: 'Nightstand', theme: 'Bedroom', placement: 'floor', mat: 'board',
    tags: ['storage', 'drawers', 'sleep'], difficulty: 1,
    params: [num('w', 'Width', 10, 120), num('d', 'Depth', 10, 80), num('h', 'Height', 10, 120), cnt('count', 'Drawers', 1, 4)],
    defaults: { w: 45, d: 40, h: 55, count: 2 },
    components: drawerBox('Nightstand', 'drawers'),
  },
  {
    id: 'dresser', label: 'Chest of drawers', theme: 'Bedroom', placement: 'floor', mat: 'board',
    tags: ['storage', 'drawers'], difficulty: 1,
    params: [num('w', 'Width', 40, 200), num('d', 'Depth', 25, 70), num('h', 'Height', 40, 140), cnt('count', 'Drawers', 2, 7)],
    defaults: { w: 100, d: 45, h: 95, count: 4 },
    components: drawerBox('Dresser', 'drawers'),
  },
  {
    id: 'wardrobe', label: 'Wardrobe', theme: 'Bedroom', placement: 'floor', mat: 'board',
    tags: ['storage', 'clothes'], difficulty: 1,
    params: [num('w', 'Width', 30, 300), num('d', 'Depth', 20, 100), num('h', 'Height', 60, 280), cnt('count', 'Doors', 1, 4)],
    defaults: { w: 100, d: 60, h: 200, count: 2 },
    components: drawerBox('Wardrobe', 'doors'),
  },
  {
    id: 'bunkbed', label: 'Bunk bed', theme: 'Bedroom', placement: 'floor', mat: 'board',
    tags: ['sleep', 'kids'], difficulty: 3,
    params: [num('w', 'Width', 70, 140), num('d', 'Length', 160, 220), num('h', 'Lower deck height', 20, 50), num('H', 'Total height', 120, 200), num('deck', 'Deck thickness', 10, 30)],
    defaults: { w: 90, d: 200, h: 35, H: 160, deck: 20 },
    size: ['w', 'd', 'H'],
    let: { rail: 'max(3, w * 0.08)', up: 'H * 0.55', dd: 'd - 2 * t' },
    components: [
      { kind: 'box', name: 'Lower deck', size: ['w', 'dd', 'h'], faces: 'all', at: [0, 't', 0] },
      { kind: 'box', name: 'Upper deck', size: ['w', 'dd', 'deck'], faces: 'all', at: [0, 't', 'up'] },
      {
        repeat: 2, as: 'k', each: {
          kind: 'flat', name: "{k == 0 ? 'Foot end' : 'Head end'}", plane: { upright: { y: 'k * (d - t)' } },
          polys: [
            { rect: [0, 0, 'w', 'H'] },
            { rect: ['rail', 'h', 'w - 2 * rail', 'up - h'] },
            { rect: ['rail', 'up + deck', 'w - 2 * rail', 'H - up - deck - rail'] },
          ],
        },
      },
    ],
    note: 'Glue both decks to one end panel first, check they are square, then add the other end. Lean a library ladder against the side to climb up.',
  },
];
