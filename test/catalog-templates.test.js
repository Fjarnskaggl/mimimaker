// Room types: they name pieces by id and store only the parameters that
// differ from the piece's defaults; a validator checks every reference.
// The snapshot pins the kits room types produce, so slimming the data can't
// change a single design. Regenerate (only for an intended change) with:
//
//   UPDATE_SNAPSHOTS=1 node --test test/catalog-templates.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';
import { defaultKit } from '../src/catalog.js';
import { PIECES } from '../src/pieces/index.js';
import { validateRoomType, validateRoomTypes, expandItem } from '../src/pieces/rooms.js';

const FILE = new URL('./catalog-templates-snapshot.json', import.meta.url);
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const digest = (v) => createHash('sha256').update(canon(v)).digest('hex').slice(0, 16);

test('room types produce exactly the kits they always did', () => {
  const now = { defaultKit: digest(defaultKit()) };
  for (const rt of ROOM_TYPES) now[rt.id] = digest(applyRoomType(defaultKit(), rt.id));
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(FILE)) {
    writeFileSync(FILE, `${JSON.stringify(now, null, 1)}\n`);
    return;
  }
  assert.deepEqual(now, JSON.parse(readFileSync(FILE, 'utf8')));
});

test('every room type is valid', () => {
  for (const rt of ROOM_TYPES) assert.deepEqual(validateRoomType(rt), [], rt.id);
  assert.deepEqual(validateRoomTypes(ROOM_TYPES), []);
});

test('room types name pieces by id and keep only parameters that differ from the defaults', () => {
  const byId = Object.fromEntries(PIECES.map((p) => [p.id, p]));
  for (const rt of ROOM_TYPES) {
    for (const [i, item] of rt.kit.items.entries()) {
      const piece = byId[item.type];
      assert.ok(piece, `${rt.id} item ${i}: "${item.type}" is a piece id`);
      for (const [k, v] of Object.entries(item.params || {})) {
        assert.notEqual(v, piece.defaults[k], `${rt.id} item ${i} (${item.type}): ${k} = ${v} is the default, leave it out`);
      }
    }
  }
});

test('expandItem fills in the piece defaults', () => {
  assert.deepEqual(expandItem({ type: 'table', params: { w: 90 }, x: 1, y: 2, rot: 0 }).params, { w: 90, d: 70, h: 75 });
  assert.deepEqual(expandItem({ type: 'table', x: 1, y: 2, rot: 0 }).params, { w: 120, d: 70, h: 75 });
  assert.throws(() => expandItem({ type: 'nope' }), /Unknown piece "nope"/);
});

const base = () => structuredClone(ROOM_TYPES.find((r) => r.id === 'kitchen'));
function expectError(mutate, pattern) {
  const rt = base();
  mutate(rt);
  const e = validateRoomType(rt);
  assert.ok(e.some((m) => pattern.test(m)), `expected ${pattern} in ${JSON.stringify(e, null, 1)}`);
}

test('the validator catches broken room types', () => {
  expectError((rt) => { rt.id = 'Cottage Kitchen'; }, /^Cottage Kitchen\.id: lower-case/);
  expectError((rt) => { rt.name = ''; }, /kitchen\.name: required/);
  expectError((rt) => { delete rt.blurb; }, /kitchen\.blurb: required/);
  expectError((rt) => { rt.colors.paper = 'green'; }, /kitchen\.colors\.paper: must be a #rrggbb colour/);
  expectError((rt) => { rt.colors.velvet = '#ffffff'; }, /kitchen\.colors\.velvet: not a material id/);
  // pieces
  expectError((rt) => { rt.kit.items[0].type = 'fridgerator'; }, /kitchen\.kit\.items\[0\]\.type: unknown piece "fridgerator"/);
  expectError((rt) => { rt.kit.items[0].params = { colour: 3 }; }, /items\[0\]\.params\.colour: fridge has no such parameter/);
  expectError((rt) => { rt.kit.items[0].params = { h: 999 }; }, /items\[0\]\.params\.h: 999 is outside 80…210/);
  expectError((rt) => { rt.kit.items.push({ type: 'rug', params: { shape: 'star' }, material: 'felt', x: 0, y: 0, rot: 0 }); }, /params\.shape: "star" is not an option/);
  expectError((rt) => { rt.kit.items[0].material = 'oak'; }, /items\[0\]\.material: unknown material "oak"/);
  // placement
  expectError((rt) => { delete rt.kit.items[0].x; }, /items\[0\]: a floor piece needs x, y and rot/);
  expectError((rt) => { rt.kit.items[0].rot = 45; }, /items\[0\]\.rot: must be 0, 90, 180 or 270/);
  expectError((rt) => { rt.kit.items[0].wall = 'back'; }, /items\[0\]\.wall: floor pieces don't hang on a wall/);
  const wallIdx = (rt) => rt.kit.items.findIndex((it) => it.type === 'uppercabinet');
  expectError((rt) => { delete rt.kit.items[wallIdx(rt)].elev; }, /items\[\d\]: a wall piece needs wall, pos and elev/);
  expectError((rt) => { rt.kit.items[wallIdx(rt)].wall = 'front'; }, /items\[\d\]\.wall: must be one of back, left, right/);
  expectError((rt) => { rt.kit.items[wallIdx(rt)].x = 3; }, /items\[\d\]\.x: wall pieces are placed with pos and elev/);
  expectError((rt) => { rt.kit.items[0].size = 3; }, /items\[0\]\.size: unknown field/);
  // room, openings, lights
  expectError((rt) => { rt.kit.room.width = -1; }, /kit\.room\.width: must be a positive number/);
  expectError((rt) => { rt.kit.room.material = 'brick'; }, /kit\.room\.material: unknown material "brick"/);
  expectError((rt) => { rt.kit.room.wallpaper.material = 'brick'; }, /kit\.room\.wallpaper\.material: unknown material "brick"/);
  expectError((rt) => { rt.kit.openings[0].kind = 'porthole'; }, /openings\[0\]\.kind: must be one of window, arch, round, door, archdoor/);
  expectError((rt) => { rt.kit.openings[0].wall = 'ceiling'; }, /openings\[0\]\.wall: must be one of back, left, right/);
  expectError((rt) => { rt.kit.openings[0].width = 0; }, /openings\[0\]\.width: must be a positive number/);
  expectError((rt) => { rt.kit.lighting.power.kind = 'solar'; }, /lighting\.power\.kind: must be one of battery, usb/);
  expectError((rt) => { rt.kit.lighting.leds[0].color = 'ultraviolet'; }, /lighting\.leds\[0\]\.color: must be one of warm, cool, amber, pink, green/);
  expectError((rt) => { rt.kit.lighting.leds[0].mount = 'ceiling'; delete rt.kit.lighting.leds[0].wall; }, /lighting\.leds\[0\]: a ceiling light needs x and y/);
  expectError((rt) => { rt.kit.lighting.leds[0].mount = 'roof'; }, /lighting\.leds\[0\]\.mount: must be one of wall, floor, ceiling/);
});

test('room type ids are unique', () => {
  const e = validateRoomTypes([...ROOM_TYPES, structuredClone(ROOM_TYPES[0])]);
  assert.ok(e.some((m) => /duplicate id "reading-nook"/.test(m)), e.join('\n'));
});
