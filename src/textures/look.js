// Room palettes and how textures are laid onto the 3D model.
//
// A "look" maps material ids to texture specs { id, params, seed }. It comes
// from the room type's palette, overridden by the kit's own choices in
// kit.look.textures (null switches a texture off). The same specs feed
// textureSVG(), so the 3D view shows what would be printed.

import { ROOM_TYPES } from '../templates.js';
import { TEXTURES } from './index.js';

const wall = (id, colors, extra = {}) => ({ id, params: { colors, ...extra } });
const floor = wall;

/** Curated wall and floor textures per room type (original colourways). */
export const ROOM_PALETTES = {
  'reading-nook': { wall: wall('wallpaper-sprig', ['#efe2cc', '#7f9a6c', '#c97a62']), floor: floor('wood-planks', ['#9c6c42', '#a97a4e', '#8e6039', '#a3714a']) },
  bedroom: { wall: wall('wallpaper-sprig', ['#eadfe6', '#8aa38a', '#d58aa0']), floor: floor('wood-planks', ['#b98f63', '#c49b70', '#ad845a', '#bf956a']) },
  kitchen: { wall: wall('wallpaper-stripes', ['#f1ead8', '#b9cdb4'], { stripeWidth: 3 }), floor: floor('tiles', ['#efe9dd', '#33424a', '#c9c1b3'], { checker: true, tileSize: 20 }) },
  bathroom: { wall: wall('tiles', ['#e6f0f0', '#cfe0e2', '#b9c9cb'], { tileSize: 10 }), floor: floor('tiles', ['#dfe8ea', '#5b7f8a', '#b4c2c4'], { checker: true, tileSize: 15 }) },
  cafe: { wall: wall('brick', ['#a4553d', '#94493a', '#b4654a', '#8a4636', '#d8cfc0']), floor: floor('wood-planks', ['#6e4a2e', '#7a5434', '#654229', '#73502f']) },
  'living-room': { wall: wall('wallpaper-stripes', ['#efe0c8', '#d9b99a'], { stripeWidth: 5 }), floor: floor('wood-planks', ['#a57449', '#b17f52', '#986a42', '#a9784c']) },
  library: { wall: wall('wallpaper-stripes', ['#2f4a3e', '#294236'], { stripeWidth: 4 }), floor: floor('wood-planks', ['#5e3d26', '#6a462c', '#553722', '#62402a']) },
  studio: { wall: wall('wallpaper-sprig', ['#f2ede3', '#8f9fb4', '#e0a35c']), floor: floor('wood-planks', ['#c8a57a', '#d2b085', '#bd9a70', '#cba87d']) },
  // room types from T1 (#67); colourways as suggested there
  bakery: { wall: wall('tiles', ['#f6efe2', '#f2d9d0', '#e8c9bf'], { tileSize: 8 }), floor: floor('tiles', ['#efe7da', '#8a5a44', '#c9b9a6'], { checker: true, tileSize: 18 }) },
  'music-room': { wall: wall('wallpaper-stripes', ['#e9e2f0', '#c9bcd8'], { stripeWidth: 4 }), floor: floor('wood-planks', ['#7b5436', '#86603e', '#6f4b30', '#80593a']) },
  default: { wall: wall('wallpaper-stripes', ['#efe3cf', '#d8b9a0']), floor: floor('wood-planks', ['#a5764a', '#b6875a', '#93653d', '#aa7b4c']) },
};

/**
 * The room type a kit was started from: kit.roomType (set by applyRoomType),
 * else matched by name for kits saved before it existed; null for custom rooms.
 */
export function roomTypeOf(kit) {
  if (kit?.roomType && ROOM_TYPES.some((rt) => rt.id === kit.roomType)) return kit.roomType;
  return ROOM_TYPES.find((rt) => rt.kit?.name === kit?.name)?.id ?? null;
}

const seedFor = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
};

/** Palette textures for the kit's wallpaper and floor materials. */
export function defaultLook(kit) {
  const pal = ROOM_PALETTES[roomTypeOf(kit)] || ROOM_PALETTES.default;
  const look = {};
  const room = kit?.room || {};
  if (room.floor?.enabled && room.floor.material) look[room.floor.material] = { ...pal.floor, seed: seedFor(room.floor.material) };
  if (room.wallpaper?.enabled && room.wallpaper.material) look[room.wallpaper.material] = { ...pal.wall, seed: seedFor(room.wallpaper.material) };
  return look;
}

/** The palette look with the kit's own choices (kit.look.textures) applied. */
export function resolveLook(kit) {
  const look = defaultLook(kit);
  for (const [mat, spec] of Object.entries(kit?.look?.textures || {})) {
    if (spec == null) delete look[mat];
    else look[mat] = { params: {}, seed: seedFor(mat), ...spec };
  }
  return look;
}

/**
 * Which material a 3D face is made of, where it matters for texturing:
 * the face's own `material` if the compiler gives one, else wallpaper for
 * vertical overlays and flooring for upward ones. Null for everything else.
 */
export function faceMaterial(face, kit) {
  if (face.material) return face.material;
  if (face.layer !== 1 || face.glow) return null;
  const room = kit?.room || {};
  if (face.n[2] > 0.5) return room.floor?.enabled ? room.floor.material : null;
  if (Math.abs(face.n[2]) < 0.5) return room.wallpaper?.enabled ? room.wallpaper.material : null;
  return null;
}

const normalize = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

/**
 * Texture axes for a face, in world mm: wallpaper hangs upright (y runs down
 * the wall), floors lie along the room's x/y. uv(p) gives sheet mm, measured
 * from the world origin so patterns line up across neighbouring faces.
 */
export function textureFrame(face) {
  const n = normalize(face.n);
  let X, Y;
  if (Math.abs(n[2]) < 0.5) {
    Y = [0, 0, -1];
    X = normalize([-n[1], n[0], 0]); // horizontal, in the wall
  } else {
    X = [1, 0, 0];
    Y = n[2] > 0 ? [0, 1, 0] : [0, -1, 0];
  }
  const uv = (p) => [p[0] * X[0] + p[1] * X[1] + p[2] * X[2], p[0] * Y[0] + p[1] * Y[1] + p[2] * Y[2]];
  return { X, Y, uv };
}

// ------------------------------------------------------------ texture picker
const SURFACE_TEXTURES = TEXTURES.filter((t) => t.kind === 'wall' || t.kind === 'floor');

/**
 * Rows for the texture picker: one per textured surface the kit has, with the
 * palette texture's name and the textures that can go there.
 */
export function textureChoices(kit) {
  const pal = ROOM_PALETTES[roomTypeOf(kit)] || ROOM_PALETTES.default;
  const room = kit?.room || {};
  const name = (id) => TEXTURES.find((t) => t.id === id)?.name || id;
  const options = SURFACE_TEXTURES.map((t) => ({ id: t.id, name: t.name }));
  const rows = [];
  if (room.wallpaper?.enabled && room.wallpaper.material) rows.push({ role: 'wall', label: 'Wallpaper', material: room.wallpaper.material, paletteName: name(pal.wall.id), options });
  if (room.floor?.enabled && room.floor.material) rows.push({ role: 'floor', label: 'Floor', material: room.floor.material, paletteName: name(pal.floor.id), options });
  return rows;
}

/** The picker value for a material: '' = room palette, 'none' = off, else a texture id. */
export function textureChoice(kit, material) {
  const t = kit?.look?.textures;
  if (!t || !(material in t)) return '';
  return t[material] == null ? 'none' : t[material].id;
}

/** A copy of the kit with the picker value applied (empty overrides are removed). */
export function setTextureChoice(kit, material, value) {
  if (value && value !== 'none' && !TEXTURES.some((t) => t.id === value)) throw new Error(`Unknown texture "${value}"`);
  const textures = { ...(kit.look?.textures || {}) };
  if (!value) delete textures[material];
  else textures[material] = value === 'none' ? null : { id: value };
  const next = { ...kit };
  const look = { ...(kit.look || {}), textures };
  if (!Object.keys(textures).length) delete look.textures;
  if (Object.keys(look).length) next.look = look;
  else delete next.look;
  return next;
}
