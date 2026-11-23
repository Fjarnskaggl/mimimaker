// T6 room palettes and texture mapping (src/textures/look.js): which texture
// goes on which surface, and how it is laid onto each face in 3D.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit } from '../src/catalog.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';
import { compileKit } from '../src/kit.js';
import { TEXTURES } from '../src/textures/index.js';
import { ROOM_PALETTES, roomTypeOf, defaultLook, resolveLook, faceMaterial, textureFrame } from '../src/textures/look.js';

const ids = new Set(TEXTURES.map((t) => t.id));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const close = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

test('every room type has a palette: a wall and a floor texture that exist, with colours', () => {
  for (const rt of ROOM_TYPES) {
    const p = ROOM_PALETTES[rt.id];
    assert.ok(p, `palette for ${rt.id}`);
    for (const role of ['wall', 'floor']) {
      assert.ok(ids.has(p[role].id), `${rt.id} ${role}: ${p[role].id}`);
      assert.ok(Array.isArray(p[role].params?.colors) && p[role].params.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${rt.id} ${role} colours`);
    }
  }
  assert.ok(ROOM_PALETTES.default, 'a fallback palette for custom rooms');
  // palettes differ between rooms (it's a palette, not one look for all)
  assert.ok(new Set(ROOM_TYPES.map((rt) => JSON.stringify(ROOM_PALETTES[rt.id]))).size >= 6);
});

test('roomTypeOf recognises each room type, and returns null for a renamed kit', () => {
  for (const rt of ROOM_TYPES) assert.equal(roomTypeOf(applyRoomType(defaultKit(), rt.id)), rt.id);
  assert.equal(roomTypeOf({ ...defaultKit(), name: 'My own room' }), null);
});

test('defaultLook puts the room palette on the wallpaper and floor materials', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  const look = defaultLook(kit);
  assert.deepEqual(look[kit.room.wallpaper.material].id, ROOM_PALETTES.cafe.wall.id);
  assert.deepEqual(look[kit.room.floor.material].id, ROOM_PALETTES.cafe.floor.id);
  for (const spec of Object.values(look)) assert.ok(Number.isInteger(spec.seed), 'seeded');
  // no wallpaper → no wall texture
  const bare = { ...kit, room: { ...kit.room, wallpaper: { ...kit.room.wallpaper, enabled: false } } };
  assert.equal(defaultLook(bare)[kit.room.wallpaper.material], undefined);
  // custom room falls back to the default palette
  assert.equal(defaultLook({ ...kit, name: 'Mine' })[kit.room.floor.material].id, ROOM_PALETTES.default.floor.id);
});

test('resolveLook: the kit’s own choices (kit.look.textures) win over the palette; null turns a texture off', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  const wall = kit.room.wallpaper.material, floor = kit.room.floor.material;
  const chosen = { ...kit, look: { textures: { [wall]: { id: 'wallpaper-sprig' }, [floor]: null } } };
  const look = resolveLook(chosen);
  assert.equal(look[wall].id, 'wallpaper-sprig');
  assert.ok(Number.isInteger(look[wall].seed));
  assert.equal(look[floor], undefined);
  assert.deepEqual(resolveLook(kit), defaultLook(kit));
});

test('faceMaterial: vertical overlays are wallpaper, upward ones are floor; shell and furniture are untextured', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  const faces = compileKit(kit).faces3d;
  const walls = faces.filter((f) => f.layer === 1 && Math.abs(f.n[2]) < 0.5);
  const floors = faces.filter((f) => f.layer === 1 && f.n[2] > 0.5);
  assert.ok(walls.length >= 3 && floors.length >= 1);
  for (const f of walls) assert.equal(faceMaterial(f, kit), kit.room.wallpaper.material);
  for (const f of floors) assert.equal(faceMaterial(f, kit), kit.room.floor.material);
  for (const f of faces.filter((x) => x.layer !== 1)) assert.equal(faceMaterial(f, kit), null);
  // an explicit material id on a face (if the compiler adds one) is used as is
  assert.equal(faceMaterial({ ...walls[0], material: 'chip2' }, kit), 'chip2');
});

test('textureFrame: wallpaper hangs upright (texture y runs down the wall), floors lie flat, in mm', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  for (const f of compileKit(kit).faces3d.filter((x) => x.layer === 1)) {
    const { X, Y } = textureFrame(f);
    assert.ok(close(Math.hypot(...X), 1) && close(Math.hypot(...Y), 1), 'unit axes');
    assert.ok(close(dot(X, Y), 0) && close(dot(X, f.n), 0) && close(dot(Y, f.n), 0), 'in the face plane');
    if (Math.abs(f.n[2]) < 0.5) {
      assert.deepEqual(Y, [0, 0, -1], 'down the wall');
      assert.ok(close(X[2], 0), 'x is horizontal');
    } else {
      assert.ok(close(Math.abs(X[0]), 1) || close(Math.abs(X[1]), 1), 'floor x along a room axis');
    }
    // texture coordinates are mm along those axes
    const { uv } = textureFrame(f);
    const p = f.polys[0][0], q = [p[0] + X[0] * 5, p[1] + X[1] * 5, p[2] + X[2] * 5];
    assert.ok(close(uv(q)[0] - uv(p)[0], 5, 1e-9) && close(uv(q)[1] - uv(p)[1], 0, 1e-9));
  }
});

// ------------------------------------------------- kit.roomType (coordinator ask on #36)
import { encodeKit, decodeKit } from '../src/share.js';

test('applyRoomType records kit.roomType, replacing any earlier one', () => {
  for (const rt of ROOM_TYPES) assert.equal(applyRoomType(defaultKit(), rt.id).roomType, rt.id);
  assert.equal(applyRoomType(applyRoomType(defaultKit(), 'cafe'), 'kitchen').roomType, 'kitchen');
});

test('kit.roomType survives a share link', async () => {
  const kit = applyRoomType(defaultKit(), 'library');
  assert.equal((await decodeKit(await encodeKit(kit))).roomType, 'library');
});

test('roomTypeOf prefers kit.roomType, so renaming a kit keeps its palette; old kits fall back to the name', () => {
  const renamed = { ...applyRoomType(defaultKit(), 'cafe'), name: 'Our corner café' };
  assert.equal(roomTypeOf(renamed), 'cafe');
  assert.equal(defaultLook(renamed)[renamed.room.wallpaper.material].id, ROOM_PALETTES.cafe.wall.id);
  const old = applyRoomType(defaultKit(), 'kitchen');
  delete old.roomType;
  assert.equal(roomTypeOf(old), 'kitchen', 'name match for kits saved before roomType existed');
  assert.equal(roomTypeOf({ ...old, roomType: 'no-such-room' }), 'kitchen', 'unknown ids fall back too');
});

// ---------------------------------------------------------- texture picker logic
import { textureChoices, textureChoice, setTextureChoice } from '../src/textures/look.js';

test('textureChoices: one row per textured surface, offering wall/floor textures (not book spines)', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  const rows = textureChoices(kit);
  assert.deepEqual(rows.map((r) => r.role), ['wall', 'floor']);
  assert.equal(rows[0].material, kit.room.wallpaper.material);
  assert.equal(rows[1].material, kit.room.floor.material);
  for (const r of rows) {
    assert.ok(r.label && r.paletteName, 'labelled, and names the palette texture');
    assert.ok(r.options.some((o) => o.id === 'tiles') && r.options.some((o) => o.id === 'wood-planks'));
    assert.ok(!r.options.some((o) => o.id === 'book-spines'), 'decor textures are not surfaces');
  }
  assert.equal(rows[0].paletteName, 'Brick');
  // no wallpaper → no wall row
  const bare = { ...kit, room: { ...kit.room, wallpaper: { ...kit.room.wallpaper, enabled: false } } };
  assert.deepEqual(textureChoices(bare).map((r) => r.role), ['floor']);
});

test('setTextureChoice: "" follows the palette, "none" switches off, an id overrides; the kit is not mutated', () => {
  const kit = applyRoomType(defaultKit(), 'cafe');
  const floor = kit.room.floor.material;
  const a = setTextureChoice(kit, floor, 'tiles');
  assert.deepEqual(a.look.textures[floor], { id: 'tiles' });
  assert.equal(textureChoice(a, floor), 'tiles');
  assert.equal(resolveLook(a)[floor].id, 'tiles');
  assert.equal(kit.look, undefined, 'original kit untouched');

  const b = setTextureChoice(a, floor, 'none');
  assert.equal(b.look.textures[floor], null);
  assert.equal(textureChoice(b, floor), 'none');
  assert.equal(resolveLook(b)[floor], undefined);

  const c = setTextureChoice(b, floor, '');
  assert.equal(textureChoice(c, floor), '');
  assert.equal(c.look, undefined, 'no overrides left → no look key at all');
  assert.deepEqual(resolveLook(c), defaultLook(kit));
  assert.throws(() => setTextureChoice(kit, floor, 'nope'), /unknown texture/i);
});

test('palettes are ready for upcoming room types (bakery, music-room; #67), before T1 adds them', () => {
  for (const id of ['bakery', 'music-room']) {
    const p = ROOM_PALETTES[id];
    assert.ok(p, `palette for ${id}`);
    for (const role of ['wall', 'floor']) {
      assert.ok(ids.has(p[role].id), `${id} ${role}: ${p[role].id}`);
      assert.ok(p[role].params.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${id} ${role} colours`);
    }
  }
  assert.notDeepEqual(ROOM_PALETTES.bakery, ROOM_PALETTES['music-room']);
});
