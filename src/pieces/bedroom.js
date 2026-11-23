import { num, cnt } from './params.js';

const drawerBox = (name, style) => [{
  kind: 'box', name, size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0],
  scores: { front: [{ fronts: { style: `'${style}'`, count: 'round(count)', w: 'w', h: 'h' } }] },
}];

export const BEDROOM = [
  {
    id: 'bed', label: 'Bed', theme: 'Bedroom', placement: 'floor', mat: 'board',
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
    params: [num('w', 'Width', 10, 120), num('d', 'Depth', 10, 80), num('h', 'Height', 10, 120), cnt('count', 'Drawers', 1, 4)],
    defaults: { w: 45, d: 40, h: 55, count: 2 },
    components: drawerBox('Nightstand', 'drawers'),
  },
  {
    id: 'dresser', label: 'Chest of drawers', theme: 'Bedroom', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 40, 200), num('d', 'Depth', 25, 70), num('h', 'Height', 40, 140), cnt('count', 'Drawers', 2, 7)],
    defaults: { w: 100, d: 45, h: 95, count: 4 },
    components: drawerBox('Dresser', 'drawers'),
  },
  {
    id: 'wardrobe', label: 'Wardrobe', theme: 'Bedroom', placement: 'floor', mat: 'board',
    params: [num('w', 'Width', 30, 300), num('d', 'Depth', 20, 100), num('h', 'Height', 60, 280), cnt('count', 'Doors', 1, 4)],
    defaults: { w: 100, d: 60, h: 200, count: 2 },
    components: drawerBox('Wardrobe', 'doors'),
  },
];
