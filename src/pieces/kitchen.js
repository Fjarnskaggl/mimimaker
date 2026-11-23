import { num, cnt } from './params.js';

const doorsFront = (count) => ({ fronts: { style: "'doors'", count, w: 'w', h: 'h' } });

export const KITCHEN = [
  {
    id: 'counter', label: 'Base cabinet', theme: 'Kitchen', placement: 'floor', mat: 'board',
    tags: ['storage', 'cooking'], difficulty: 1,
    params: [num('w', 'Width', 30, 300), num('d', 'Depth', 40, 80), num('h', 'Height', 70, 110), cnt('count', 'Doors', 1, 6)],
    defaults: { w: 100, d: 60, h: 90, count: 2 },
    components: [{ kind: 'box', name: 'Base cabinet', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0], scores: { front: [doorsFront('round(count)')], top: [] } }],
  },
  {
    id: 'sink', label: 'Sink unit', theme: 'Kitchen', placement: 'floor', mat: 'board',
    tags: ['water', 'cooking'], difficulty: 2,
    params: [num('w', 'Width', 50, 200), num('d', 'Depth', 40, 80), num('h', 'Height', 70, 110)],
    defaults: { w: 80, d: 60, h: 90 },
    components: [{
      kind: 'box', name: 'Sink unit', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0], scores: { front: [doorsFront(2)] },
      holes: { top: [{ arch: ['w * 0.22', 'd * 0.25', 'w * 0.56', 'd * 0.5', 'min(w, d) * 0.08'] }] },
    }],
    note: 'Glue a scrap of silver card under the top for the basin, and a bent paperclip for the tap.',
  },
  {
    id: 'stove', label: 'Stove', theme: 'Kitchen', placement: 'floor', mat: 'board',
    tags: ['cooking', 'appliance'], difficulty: 1,
    params: [num('w', 'Width', 45, 120), num('d', 'Depth', 45, 80), num('h', 'Height', 70, 110)],
    defaults: { w: 60, d: 60, h: 90 },
    let: { r: 'min(w, d) * 0.14' },
    components: [{
      kind: 'box', name: 'Stove', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0],
      scores: {
        top: [
          { circle: ['w * 0.3', 'd * 0.3', 'r'] }, { circle: ['w * 0.7', 'd * 0.3', 'r'] },
          { circle: ['w * 0.3', 'd * 0.7', 'r'] }, { circle: ['w * 0.7', 'd * 0.7', 'r'] },
        ],
        front: [{ rect: ['w * 0.12', 'h * 0.12', 'w * 0.76', 'h * 0.58'] }, { line: [['t + 0.6', 'h * 0.8'], ['w - t - 0.6', 'h * 0.8']] }],
      },
    }],
    note: 'Score lines mark the burners and oven door; colour them in with a fine pen.',
  },
  {
    id: 'fridge', label: 'Fridge', theme: 'Kitchen', placement: 'floor', mat: 'board',
    tags: ['cooking', 'appliance'], difficulty: 1,
    params: [num('w', 'Width', 45, 100), num('d', 'Depth', 45, 80), num('h', 'Height', 80, 210)],
    defaults: { w: 70, d: 65, h: 180 },
    components: [{
      kind: 'box', name: 'Fridge', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0],
      scores: { front: [
        { line: [['t + 0.6', 'h * 0.64'], ['w - t - 0.6', 'h * 0.64']] },
        { line: [['w * 0.85', 'h * 0.5'], ['w * 0.85', 'h * 0.6']] },
        { line: [['w * 0.85', 'h * 0.68'], ['w * 0.85', 'h * 0.78']] },
      ] },
    }],
  },
  {
    id: 'uppercabinet', label: 'Wall cabinet', theme: 'Kitchen', placement: 'wall', mat: 'board',
    tags: ['storage', 'wall-mounted'], difficulty: 2,
    params: [num('w', 'Width', 30, 200), num('d', 'Depth', 20, 45), num('h', 'Height', 30, 100), cnt('count', 'Doors', 1, 4)],
    defaults: { w: 80, d: 35, h: 70, count: 2 },
    components: [{ kind: 'box', name: 'Wall cabinet', size: ['w', 'd', 'h'], faces: 'all', at: [0, 0, 0], scores: { front: [doorsFront('round(count)')] } }],
    note: 'Glue it to the wall with its back flat against the wallpaper; hold it for a minute while the glue grabs.',
  },
  {
    id: 'wallshelf', label: 'Open wall shelf', theme: 'Kitchen', placement: 'wall', mat: 'board',
    tags: ['storage', 'wall-mounted'], difficulty: 2,
    params: [num('w', 'Width', 30, 200), num('d', 'Depth', 10, 40), num('h', 'Height', 20, 100), cnt('shelves', 'Shelves', 0, 4)],
    defaults: { w: 80, d: 30, h: 60, shelves: 1 },
    components: [{ kind: 'box', name: 'Wall shelf', size: ['w', 'd', 'h'], faces: ['bottom', 'top', 'left', 'right', 'back'], shelves: { even: 'round(shelves)', h: 'h' }, at: [0, 0, 0] }],
  },
  {
    id: 'island', label: 'Kitchen island', theme: 'Kitchen', placement: 'floor', mat: 'board',
    tags: ['cooking', 'storage', 'dining'], difficulty: 2,
    params: [num('w', 'Width', 80, 240), num('d', 'Depth', 50, 120), num('h', 'Height', 85, 100), num('over', 'Seating overhang', 0, 40), cnt('count', 'Doors', 1, 6)],
    defaults: { w: 140, d: 80, h: 90, over: 25, count: 3 },
    let: { top: 'max(2 * t, 3, h * 0.04)' },
    components: [
      { kind: 'box', name: 'Island', size: ['w', 'd - over', 'h - top'], faces: 'all', at: [0, 0, 0], scores: { front: [doorsFront('round(count)')] } },
      { kind: 'box', name: 'Worktop', size: ['w', 'd', 'top'], faces: 'all', at: [0, 0, 'h - top'] },
    ],
    note: 'Glue the worktop flush with the door side so the overhang sticks out at the back; slide bar stools under it.',
  },
];
