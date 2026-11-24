import { num } from './params.js';

export const BATHROOM = [
  {
    id: 'bathtub', label: 'Bathtub', theme: 'Bathroom', placement: 'floor', mat: 'board',
    tags: ['water'], difficulty: 1,
    params: [num('w', 'Length', 100, 200), num('d', 'Width', 55, 100), num('h', 'Height', 40, 70)],
    defaults: { w: 170, d: 75, h: 55 },
    components: [{ kind: 'box', name: 'Bathtub', size: ['w', 'd', 'h'], faces: ['bottom', 'front', 'back', 'left', 'right'], at: [0, 0, 0] }],
    note: 'Paint the inside white, or line it with white card. A layer of clear glue makes convincing water.',
  },
  {
    id: 'vanity', label: 'Vanity', theme: 'Bathroom', placement: 'floor', mat: 'board',
    tags: ['water', 'storage'], difficulty: 2,
    params: [num('w', 'Width', 40, 160), num('d', 'Depth', 30, 60), num('h', 'Height', 60, 100)],
    defaults: { w: 80, d: 45, h: 85 },
    components: [{
      kind: 'box', name: 'Vanity', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0],
      scores: { front: [{ fronts: { style: "'doors'", count: 2, w: 'w', h: 'h' } }] },
      holes: { top: [{ ellipse: ['w / 2', 'd * 0.5', 'w * 0.25', 'd * 0.22', 32] }] },
    }],
  },
  {
    id: 'toilet', label: 'Toilet', theme: 'Bathroom', placement: 'floor', mat: 'card',
    tags: ['water'], difficulty: 2,
    params: [num('w', 'Width', 30, 50), num('d', 'Depth', 50, 80), num('h', 'Height', 60, 90)],
    defaults: { w: 40, d: 68, h: 78 },
    size: ['w', 'd', 'h'],
    let: { tank: 'd * 0.28', seat: 'h * 0.52', bw: 'w * 0.9', bd: 'd - tank' },
    components: [
      { kind: 'box', name: 'Bowl', size: ['bw', 'bd', 'seat'], faces: 'all', at: ['(w - bw) / 2', 0, 0], scores: { top: [{ ellipse: ['bw / 2', 'bd / 2', 'bw * 0.38', 'bd * 0.4', 24] }] } },
      { kind: 'box', name: 'Tank', size: ['w', 'tank', 'h'], faces: 'all', at: [0, 'bd', 0] },
    ],
  },
  {
    id: 'bathcabinet', label: 'Mirror cabinet', theme: 'Bathroom', placement: 'wall', mat: 'board',
    tags: ['water', 'storage', 'wall-mounted'], difficulty: 2,
    params: [num('w', 'Width', 30, 100), num('d', 'Depth', 10, 25), num('h', 'Height', 40, 90), { key: 'count', label: 'Doors', type: 'number', min: 1, max: 2, step: 1 }],
    defaults: { w: 60, d: 15, h: 60, count: 1 },
    let: { b: 'max(t + 1.5, min(w, h) * 0.08)' },
    components: [{
      kind: 'box', name: 'Mirror cabinet', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0],
      scores: { front: [{ fronts: { style: "'doors'", count: 'round(count)', w: 'w', h: 'h' } }, { rect: ['b', 'b', 'w - 2 * b', 'h - 2 * b'] }] },
    }],
    note: 'Glue mirror card (or silver foil card) inside the scored outline, then hang it above the vanity with its back flat on the wall.',
  },
];
