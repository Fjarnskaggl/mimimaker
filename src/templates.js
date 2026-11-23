// Room types: complete starter layouts (room, openings, furniture, lights and
// a colour scheme for the papers). All measurements are real-world cm.
//
// Floor items: x = distance from the left wall, y = distance from the back
// wall to the item's back, rot = 0 (facing out), 90 (against the left wall),
// 270 (against the right wall). Wall items: pos = centre along the wall
// (back wall from the left, side walls from the front), elev = centre height.
//
// Items name a piece by id and list only the parameters that differ from
// that piece's defaults; expandKit() fills the rest in, so every kit a room
// type produces is complete. validateRoomType() in src/pieces/rooms.js
// checks every reference (tests run it on all room types).

import { expandItem } from './pieces/rooms.js';

const lights = (power, leds) => ({ enabled: true, holeDiameter: 3, power, leds });

export const ROOM_TYPES = [
  {
    id: 'reading-nook',
    name: 'Reading nook',
    blurb: 'Bookshelf, armchair and a glowing floor lamp under an arched window.',
    colors: { paper: '#e8c4bb', card65: '#c9d8e2', card110: '#f3efe4' },
    kit: {
      name: 'Cozy Reading Nook',
      room: { width: 300, depth: 220, height: 260, ceiling: false, material: 'chip2', wallpaper: { enabled: true, material: 'paper' }, floor: { enabled: true, material: 'card65' }, trimMaterial: 'card110' },
      openings: [
        { wall: 'back', kind: 'arch', pos: 175, sill: 90, width: 80, height: 120, trim: true },
        { wall: 'right', kind: 'archdoor', pos: 130, sill: 0, width: 85, height: 210, trim: true },
      ],
      items: [
        { type: 'bookshelf', material: 'bass16', x: 15, y: 0, rot: 0 },
        { type: 'armchair', params: { w: 70, d: 65, seat: 40, back: 85, arm: 12, armh: 55 }, material: 'chip15', x: 135, y: 70, rot: 0 },
        { type: 'nightstand', material: 'card110', x: 245, y: 10, rot: 0 },
        { type: 'floorlamp', material: 'card110', x: 210, y: 75, rot: 0 },
        { type: 'rug', params: { w: 150, d: 100 }, material: 'felt', x: 100, y: 60, rot: 0 },
        { type: 'frame', params: { h: 55 }, material: 'card110', wall: 'back', pos: 262, elev: 160 },
      ],
      lighting: lights({ wall: 'back', pos: 280, elev: 25, kind: 'battery' }, [
        { name: 'Wall sconce', mount: 'wall', wall: 'back', pos: 115, elev: 200, color: 'warm' },
        { name: 'Floor lamp', mount: 'floor', x: 227, y: 92, color: 'warm' },
      ]),
    },
  },
  {
    id: 'bedroom',
    name: 'Cozy bedroom',
    blurb: 'Double bed, bedside tables with reading lights, wardrobe and rug.',
    colors: { paper: '#d9d3ea', card65: '#e9dcc7', card110: '#fbf8f2' },
    kit: {
      name: 'Cozy Bedroom',
      room: { width: 320, depth: 260, height: 260, ceiling: false, material: 'chip2', wallpaper: { enabled: true, material: 'paper' }, floor: { enabled: true, material: 'card65' }, trimMaterial: 'card110' },
      openings: [
        { wall: 'back', kind: 'window', pos: 160, sill: 125, width: 80, height: 80, trim: true },
        { wall: 'right', kind: 'door', pos: 60, sill: 0, width: 85, height: 205, trim: true },
      ],
      items: [
        { type: 'bed', material: 'chip15', x: 90, y: 0, rot: 0 },
        { type: 'nightstand', material: 'chip15', x: 40, y: 0, rot: 0 },
        { type: 'nightstand', material: 'chip15', x: 235, y: 0, rot: 0 },
        { type: 'wardrobe', material: 'bass16', x: 0, y: 150, rot: 90 },
        { type: 'rug', params: { w: 160, shape: 'rect' }, material: 'felt', x: 80, y: 160, rot: 0 },
        { type: 'curtains', params: { h: 110 }, material: 'card110', wall: 'back', pos: 160, elev: 160 },
        { type: 'frame', params: { w: 45, h: 35, border: 4 }, material: 'card110', wall: 'right', pos: 170, elev: 150 },
      ],
      lighting: lights({ wall: 'back', pos: 160, elev: 30, kind: 'battery' }, [
        { name: 'Left reading light', mount: 'wall', wall: 'back', pos: 62, elev: 120, color: 'warm' },
        { name: 'Right reading light', mount: 'wall', wall: 'back', pos: 257, elev: 120, color: 'warm' },
      ]),
    },
  },
  {
    id: 'kitchen',
    name: 'Cottage kitchen',
    blurb: 'Fitted units with sink, stove and fridge, wall cabinets with under-cabinet lights, and a dining table.',
    colors: { paper: '#cfe0cf', card65: '#e7d2b5', card110: '#fbf7ee' },
    kit: {
      name: 'Cottage Kitchen',
      room: { width: 320, depth: 240, height: 260, ceiling: false, material: 'chip2', wallpaper: { enabled: true, material: 'paper' }, floor: { enabled: true, material: 'card65' }, trimMaterial: 'card110' },
      openings: [
        { wall: 'back', kind: 'window', pos: 210, sill: 110, width: 70, height: 60, trim: true },
        { wall: 'right', kind: 'door', pos: 90, sill: 0, width: 80, height: 205, trim: true },
      ],
      items: [
        { type: 'fridge', material: 'chip15', x: 0, y: 0, rot: 0 },
        { type: 'counter', material: 'chip15', x: 70, y: 0, rot: 0 },
        { type: 'sink', material: 'chip15', x: 170, y: 0, rot: 0 },
        { type: 'stove', material: 'chip15', x: 250, y: 0, rot: 0 },
        { type: 'uppercabinet', material: 'chip15', wall: 'back', pos: 120, elev: 190 },
        { type: 'wallshelf', params: { w: 50, h: 50 }, material: 'chip15', wall: 'back', pos: 285, elev: 185 },
        { type: 'table', params: { w: 110, d: 75 }, material: 'bass16', x: 105, y: 135, rot: 0 },
        { type: 'chair', material: 'bass16', x: 50, y: 150, rot: 90 },
        { type: 'chair', material: 'bass16', x: 225, y: 150, rot: 270 },
        { type: 'plant', material: 'card110', x: 10, y: 195, rot: 0 },
      ],
      lighting: lights({ wall: 'back', pos: 30, elev: 25, kind: 'usb' }, [
        { name: 'Under cabinet', mount: 'wall', wall: 'back', pos: 120, elev: 150, color: 'warm' },
        { name: 'Under shelf', mount: 'wall', wall: 'back', pos: 285, elev: 155, color: 'warm' },
      ]),
    },
  },
  {
    id: 'bathroom',
    name: 'Bathroom',
    blurb: 'Bathtub under a round window, vanity with mirror light, and toilet.',
    colors: { paper: '#cde6ec', card65: '#f1f1ee', card110: '#ffffff' },
    kit: {
      name: 'Seaside Bathroom',
      room: { width: 240, depth: 200, height: 250, ceiling: false, material: 'chip2', wallpaper: { enabled: true, material: 'paper' }, floor: { enabled: true, material: 'card65' }, trimMaterial: 'card110' },
      openings: [
        { wall: 'back', kind: 'round', pos: 200, sill: 140, width: 50, height: 50, trim: true },
        { wall: 'right', kind: 'door', pos: 150, sill: 0, width: 70, height: 200, trim: true },
      ],
      items: [
        { type: 'bathtub', material: 'card110', x: 0, y: 0, rot: 0 },
        { type: 'vanity', material: 'chip15', x: 195, y: 100, rot: 270 },
        { type: 'mirror', params: { w: 50 }, material: 'card110', wall: 'right', pos: 60, elev: 150 },
        { type: 'toilet', material: 'card110', x: 0, y: 110, rot: 90 },
        { type: 'rug', params: { w: 80, d: 50, shape: 'rect' }, material: 'felt', x: 90, y: 110, rot: 0 },
        { type: 'plant', params: { w: 20, h: 22, leaf: 50 }, material: 'card110', x: 175, y: 10, rot: 0 },
      ],
      lighting: lights({ wall: 'right', pos: 20, elev: 30, kind: 'battery' }, [
        { name: 'Mirror light', mount: 'wall', wall: 'right', pos: 60, elev: 190, color: 'cool' },
      ]),
    },
  },
  {
    id: 'cafe',
    name: 'Little café',
    blurb: 'Counter with stools, display shelving, menu board, café tables and pendant lights.',
    colors: { paper: '#f2dcc2', card65: '#c4a888', card110: '#2f2b28' },
    kit: {
      name: 'Corner Café',
      room: { width: 340, depth: 240, height: 270, ceiling: true, material: 'chip2', wallpaper: { enabled: true, material: 'paper' }, floor: { enabled: true, material: 'card65' }, trimMaterial: 'card110' },
      openings: [
        { wall: 'back', kind: 'arch', pos: 120, sill: 100, width: 50, height: 100, trim: true },
        { wall: 'right', kind: 'archdoor', pos: 50, sill: 0, width: 90, height: 215, trim: true },
      ],
      items: [
        { type: 'displayshelf', material: 'bass16', x: 10, y: 0, rot: 0 },
        { type: 'cafecounter', material: 'chip15', x: 150, y: 0, rot: 0 },
        { type: 'chalkboard', params: { w: 100 }, material: 'card110', wall: 'back', pos: 240, elev: 185 },
        { type: 'stool', material: 'chip15', x: 180, y: 75, rot: 0 },
        { type: 'stool', material: 'chip15', x: 245, y: 75, rot: 0 },
        { type: 'cafetable', material: 'bass16', x: 55, y: 150, rot: 0 },
        { type: 'chair', material: 'bass16', x: 5, y: 157, rot: 90 },
        { type: 'cafetable', material: 'bass16', x: 200, y: 150, rot: 0 },
        { type: 'chair', material: 'bass16', x: 262, y: 157, rot: 270 },
        { type: 'plant', params: { leaf: 80 }, material: 'card65', x: 300, y: 205, rot: 0 },
      ],
      lighting: lights({ wall: 'back', pos: 320, elev: 240, kind: 'usb' }, [
        { name: 'Pendant over left table', mount: 'ceiling', x: 85, y: 180, color: 'warm' },
        { name: 'Pendant over right table', mount: 'ceiling', x: 230, y: 180, color: 'warm' },
        { name: 'Counter light', mount: 'ceiling', x: 240, y: 40, color: 'amber' },
      ]),
    },
  },
  {
    id: 'living-room',
    name: 'Living room',
    blurb: 'Sofa, fireplace with a flickering glow, media unit and TV, floor lamp and rug.',
    colors: { paper: '#e6d9c3', card65: '#b9c8b3', card110: '#26262b' },
    kit: {
      name: 'Fireside Living Room',
      room: { width: 360, depth: 260, height: 260, ceiling: false, material: 'chip2', wallpaper: { enabled: true, material: 'paper' }, floor: { enabled: true, material: 'card65' }, trimMaterial: 'card110' },
      openings: [
        { wall: 'back', kind: 'window', pos: 42, sill: 100, width: 50, height: 100, trim: true },
      ],
      items: [
        { type: 'sofa', material: 'chip15', x: 80, y: 0, rot: 0 },
        { type: 'bench', params: { d: 50, h: 42 }, material: 'bass16', x: 130, y: 120, rot: 0 },
        { type: 'fireplace', material: 'chip15', x: 0, y: 70, rot: 90 },
        { type: 'tvstand', material: 'bass16', x: 320, y: 60, rot: 270 },
        { type: 'tv', material: 'card110', wall: 'right', pos: 125, elev: 110 },
        { type: 'floorlamp', material: 'card65', x: 290, y: 5, rot: 0 },
        { type: 'rug', params: { w: 220, d: 120, shape: 'rect' }, material: 'felt', x: 70, y: 110, rot: 0 },
        { type: 'frame', params: { w: 60, h: 40, border: 4 }, material: 'card110', wall: 'back', pos: 180, elev: 170 },
      ],
      lighting: lights({ wall: 'back', pos: 340, elev: 25, kind: 'battery' }, [
        { name: 'Fire glow', mount: 'floor', x: 17, y: 130, color: 'amber' },
        { name: 'Floor lamp', mount: 'floor', x: 307, y: 22, color: 'warm' },
      ]),
    },
  },
  {
    id: 'library',
    name: 'Library & study',
    blurb: 'Tall bookshelves with a ladder, writing desk, reading armchair and desk lamp.',
    colors: { paper: '#2f4b45', card65: '#a07a58', card110: '#e9dfc9' },
    kit: {
      name: 'Old Library',
      room: { width: 300, depth: 240, height: 270, ceiling: false, material: 'chip2', wallpaper: { enabled: true, material: 'paper' }, floor: { enabled: true, material: 'card65' }, trimMaterial: 'card110' },
      openings: [
        { wall: 'back', kind: 'arch', pos: 232, sill: 110, width: 55, height: 100, trim: true },
      ],
      items: [
        { type: 'bookshelf', params: { h: 210, shelves: 4 }, material: 'bass16', x: 0, y: 0, rot: 0 },
        { type: 'bookshelf', params: { h: 210, shelves: 4 }, material: 'bass16', x: 80, y: 0, rot: 0 },
        { type: 'ladder', material: 'bass16', x: 55, y: 31, rot: 0 },
        { type: 'desk', params: { w: 110 }, material: 'bass16', x: 177, y: 0, rot: 0 },
        { type: 'chair', material: 'bass16', x: 210, y: 65, rot: 180 },
        { type: 'armchair', material: 'chip15', x: 15, y: 140, rot: 0 },
        { type: 'rug', params: { w: 120 }, material: 'felt', x: 125, y: 130, rot: 0 },
        { type: 'books', params: { h: 5 }, material: 'card110', x: 255, y: 195, rot: 0 },
        { type: 'frame', params: { h: 30, border: 4 }, material: 'card110', wall: 'left', pos: 120, elev: 170 },
      ],
      lighting: lights({ wall: 'back', pos: 165, elev: 25, kind: 'battery' }, [
        { name: 'Desk lamp', mount: 'wall', wall: 'back', pos: 190, elev: 115, color: 'warm' },
        { name: 'Reading light', mount: 'wall', wall: 'left', pos: 57, elev: 150, color: 'warm' },
      ]),
    },
  },
  {
    id: 'studio',
    name: 'Attic studio',
    blurb: 'Daybed under fairy lights, writing desk, dresser and a wall shelf for plants.',
    colors: { paper: '#f2e2b6', card65: '#d6c09d', card110: '#fffaf0' },
    kit: {
      name: 'Attic Studio',
      room: { width: 300, depth: 240, height: 250, ceiling: false, material: 'chip2', wallpaper: { enabled: true, material: 'paper' }, floor: { enabled: true, material: 'card65' }, trimMaterial: 'card110' },
      openings: [
        { wall: 'back', kind: 'window', pos: 240, sill: 100, width: 60, height: 80, trim: true },
        { wall: 'right', kind: 'door', pos: 50, sill: 0, width: 80, height: 200, trim: true },
      ],
      items: [
        { type: 'bed', params: { w: 90, h: 40, head: 80 }, material: 'chip15', x: 0, y: 150, rot: 90 },
        { type: 'dresser', params: { w: 90 }, material: 'bass16', x: 60, y: 0, rot: 0 },
        { type: 'desk', params: { w: 100, d: 55 }, material: 'bass16', x: 190, y: 0, rot: 0 },
        { type: 'chair', material: 'bass16', x: 217, y: 60, rot: 180 },
        { type: 'wallshelf', material: 'bass16', wall: 'back', pos: 105, elev: 165 },
        { type: 'plant', material: 'card65', x: 10, y: 0, rot: 0 },
        { type: 'rug', params: { w: 120, d: 80, shape: 'round' }, material: 'felt', x: 70, y: 55, rot: 0 },
        { type: 'frame', params: { border: 4 }, material: 'card110', wall: 'right', pos: 170, elev: 150 },
      ],
      lighting: lights({ wall: 'back', pos: 20, elev: 25, kind: 'battery' }, [
        { name: 'Desk lamp', mount: 'wall', wall: 'back', pos: 195, elev: 110, color: 'warm' },
        { name: 'Fairy lights', mount: 'wall', wall: 'left', pos: 45, elev: 120, color: 'warm' },
      ]),
    },
  },
];

/** A room type's kit with every item's parameters filled in from the piece defaults. */
export function expandKit(kit) {
  return { ...structuredClone(kit), items: (kit.items || []).map((it) => expandItem(structuredClone(it))) };
}

export const LIBRARY_KIT = expandKit(ROOM_TYPES[0].kit);

/** A copy of `kit` laid out as room type `id`, keeping the scale, machine and materials. */
export function applyRoomType(kit, id) {
  const type = ROOM_TYPES.find((r) => r.id === id);
  if (!type) return kit;
  const next = { ...kit, ...expandKit(type.kit) };
  next.roomType = id; // remembered so the room's look survives renames and share links (T6)
  next.materials = kit.materials.map((m) => (type.colors?.[m.id] ? { ...m, color: type.colors[m.id] } : { ...m }));
  return next;
}
