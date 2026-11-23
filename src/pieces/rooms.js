// Room types (src/templates.js) name pieces by id and store only the
// parameters that differ from the piece's defaults. This module expands
// them into full kit items and validates every reference a room type makes.
// It reads the plain piece data, not catalog.js, so templates.js can use it
// without an import cycle.

import { PIECES } from './index.js';
import { DEFAULT_MATERIALS } from '../materials.js';
import { LED_COLORS, POWER_KINDS } from '../lighting.js';

const BY_ID = Object.fromEntries(PIECES.map((p) => [p.id, p]));
const MATERIAL_IDS = DEFAULT_MATERIALS.map((m) => m.id);
const WALLS = ['back', 'left', 'right'];
const OPENING_KINDS = ['window', 'arch', 'round', 'door', 'archdoor'];
const MOUNTS = ['wall', 'floor', 'ceiling'];
const ROTATIONS = [0, 90, 180, 270];
const ITEM_FIELDS = ['type', 'params', 'material', 'name', 'x', 'y', 'rot', 'wall', 'pos', 'elev'];
const ID_RE = /^[a-z][a-z0-9-]*$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';
const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** A kit item with the piece's defaults filled in for every parameter it leaves out. */
export function expandItem(item) {
  const piece = BY_ID[item.type];
  if (!piece) throw new Error(`Unknown piece "${item.type}"`);
  return { ...item, params: { ...piece.defaults, ...(item.params || {}) } };
}

/** Validate one room type. Returns messages like "kitchen.kit.items[0].type: …"; empty means valid. */
export function validateRoomType(rt) {
  const errors = [];
  const root = str(rt?.id) ? rt.id : 'room type';
  const err = (path, msg) => errors.push(`${root}${path ? `.${path}` : ''}: ${msg}`);
  if (!isObj(rt)) { err('', 'must be an object'); return errors; }
  const oneOf = (path, v, list) => { if (!list.includes(v)) err(path, `must be one of ${list.join(', ')}`); };
  const positive = (path, v) => { if (!num(v) || v <= 0) err(path, 'must be a positive number'); };
  const number = (path, v) => { if (!num(v)) err(path, 'must be a number'); };
  const material = (path, v) => { if (!MATERIAL_IDS.includes(v)) err(path, `unknown material "${v}"`); };

  if (!str(rt.id) || !ID_RE.test(rt.id)) err('id', 'lower-case letters, digits and dashes');
  for (const k of ['name', 'blurb']) if (!str(rt[k])) err(k, 'required');
  if (rt.colors !== undefined) {
    if (!isObj(rt.colors)) err('colors', 'must map material ids to colours');
    else for (const [k, v] of Object.entries(rt.colors)) {
      if (!MATERIAL_IDS.includes(k)) err(`colors.${k}`, 'not a material id');
      else if (typeof v !== 'string' || !HEX_RE.test(v)) err(`colors.${k}`, 'must be a #rrggbb colour');
    }
  }
  const kit = rt.kit;
  if (!isObj(kit)) { err('kit', 'required'); return errors; }
  if (!str(kit.name)) err('kit.name', 'required');

  // room
  const room = kit.room;
  if (!isObj(room)) err('kit.room', 'required');
  else {
    for (const k of ['width', 'depth', 'height']) positive(`kit.room.${k}`, room[k]);
    material('kit.room.material', room.material);
    for (const k of ['wallpaper', 'floor']) {
      if (room[k] !== undefined) {
        if (!isObj(room[k])) err(`kit.room.${k}`, 'must be { enabled, material }');
        else material(`kit.room.${k}.material`, room[k].material);
      }
    }
    if (room.trimMaterial !== undefined) material('kit.room.trimMaterial', room.trimMaterial);
  }

  // openings
  (Array.isArray(kit.openings) ? kit.openings : []).forEach((o, i) => {
    const at = `kit.openings[${i}]`;
    if (!isObj(o)) { err(at, 'must be an object'); return; }
    oneOf(`${at}.wall`, o.wall, WALLS);
    oneOf(`${at}.kind`, o.kind, OPENING_KINDS);
    for (const k of ['width', 'height']) positive(`${at}.${k}`, o[k]);
    for (const k of ['pos', 'sill']) number(`${at}.${k}`, o[k]);
  });

  // items
  if (!Array.isArray(kit.items)) err('kit.items', 'must be a list');
  else kit.items.forEach((it, i) => {
    const at = `kit.items[${i}]`;
    if (!isObj(it)) { err(at, 'must be an object'); return; }
    for (const k of Object.keys(it)) if (!ITEM_FIELDS.includes(k)) err(`${at}.${k}`, 'unknown field');
    const piece = BY_ID[it.type];
    if (!piece) { err(`${at}.type`, `unknown piece "${it.type}"`); return; }
    if (it.params !== undefined && !isObj(it.params)) err(`${at}.params`, 'must be an object');
    for (const [k, v] of Object.entries(isObj(it.params) ? it.params : {})) {
      const q = piece.params.find((p) => p.key === k);
      if (!q) err(`${at}.params.${k}`, `${piece.id} has no such parameter`);
      else if (q.type === 'number') {
        if (!num(v)) err(`${at}.params.${k}`, 'must be a number');
        else if (v < q.min || v > q.max) err(`${at}.params.${k}`, `${v} is outside ${q.min}…${q.max}`);
      } else if (!q.options.includes(v)) err(`${at}.params.${k}`, `"${v}" is not an option`);
    }
    material(`${at}.material`, it.material);
    if (piece.placement === 'wall') {
      if (it.wall === undefined || it.pos === undefined || it.elev === undefined) err(at, 'a wall piece needs wall, pos and elev');
      if (it.wall !== undefined) oneOf(`${at}.wall`, it.wall, WALLS);
      for (const k of ['pos', 'elev']) if (it[k] !== undefined) number(`${at}.${k}`, it[k]);
      for (const k of ['x', 'y', 'rot']) if (it[k] !== undefined) err(`${at}.${k}`, 'wall pieces are placed with pos and elev');
    } else {
      if (it.x === undefined || it.y === undefined || it.rot === undefined) err(at, 'a floor piece needs x, y and rot');
      for (const k of ['x', 'y']) if (it[k] !== undefined) number(`${at}.${k}`, it[k]);
      if (it.rot !== undefined && !ROTATIONS.includes(it.rot)) err(`${at}.rot`, 'must be 0, 90, 180 or 270');
      for (const k of ['wall', 'pos', 'elev']) if (it[k] !== undefined) err(`${at}.${k}`, k === 'wall' ? "floor pieces don't hang on a wall" : 'floor pieces are placed with x and y');
    }
  });

  // lighting
  const L = kit.lighting;
  if (L !== undefined) {
    if (!isObj(L)) err('kit.lighting', 'must be an object');
    else {
      if (isObj(L.power)) {
        oneOf('kit.lighting.power.kind', L.power.kind, Object.keys(POWER_KINDS));
        oneOf('kit.lighting.power.wall', L.power.wall, WALLS);
      } else if (L.enabled) err('kit.lighting.power', 'required when lights are on');
      (Array.isArray(L.leds) ? L.leds : []).forEach((led, i) => {
        const at = `kit.lighting.leds[${i}]`;
        if (!isObj(led)) { err(at, 'must be an object'); return; }
        oneOf(`${at}.mount`, led.mount, MOUNTS);
        oneOf(`${at}.color`, led.color, Object.keys(LED_COLORS));
        if (led.mount === 'wall') {
          if (led.wall === undefined || led.pos === undefined || led.elev === undefined) err(at, 'a wall light needs wall, pos and elev');
          else oneOf(`${at}.wall`, led.wall, WALLS);
        } else if (MOUNTS.includes(led.mount) && (!num(led.x) || !num(led.y))) {
          err(at, `a ${led.mount} light needs x and y`);
        }
      });
    }
  }
  return errors;
}

/** Validate every room type, plus unique ids. */
export function validateRoomTypes(list) {
  const errors = [];
  const seen = new Set();
  for (const rt of list) {
    errors.push(...validateRoomType(rt));
    if (rt?.id !== undefined) {
      if (seen.has(rt.id)) errors.push(`${rt.id}: duplicate id "${rt.id}"`);
      seen.add(rt.id);
    }
  }
  return errors;
}
