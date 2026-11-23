// Every 3D mesh wears a texture: printed parts show the pattern that prints
// on the print-then-cut sheets, everything else shows its raw material
// (chipboard fleck, basswood grain, card fibre, felt, clear sheet). Only LED
// glows are plain.
// New pieces, shells and props fail here if they render without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit, CATALOG, defaultMaterialFor } from '../src/catalog.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';
import { compileKit } from '../src/kit.js';
import { SHELLS } from '../src/shells/index.js';
import { DEFAULT_MATERIALS } from '../src/materials.js';
import { TEXTURES, textureShapes } from '../src/textures/index.js';
import { resolveLook, faceTexture, materialFinish } from '../src/textures/look.js';
import { printableParts } from '../src/export/printcut.js';

const ids = new Set(TEXTURES.map((t) => t.id));
const gap = { w: 120, h: 230, d: 180 };

function lit(kit, leds, power = {}) {
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, kind: 'battery', supply: 'aa2', ...power };
  kit.lighting.leds = leds;
  return kit;
}

/** Every room type, shell, roof, piece, material and prop the compiler draws. */
function scenes() {
  const out = ROOM_TYPES.map((rt) => [`room type ${rt.id}`, applyRoomType(defaultKit(), rt.id)]);
  // one of every catalog piece, in its default material
  const all = defaultKit();
  all.items = Object.entries(CATALOG).map(([type, def]) => ({
    type, material: defaultMaterialFor(def, all.materials), params: {}, x: 1, y: 1, rot: 0, wall: 'back', pos: 20, elev: 20,
  }));
  out.push(['every catalog piece', all]);
  // every material, and a custom one the app doesn't know
  const mats = defaultKit();
  mats.materials = [...mats.materials, { id: 'custom1', name: 'Mystery board', thickness: 1.2, kind: 'board', tool: 'knife', sheet: [300, 300], color: '#7a8f6b' }];
  mats.items = mats.materials.map((m) => ({ type: m.kind === 'fabric' ? 'rug' : 'cabinet', material: m.id, params: {}, x: 1, y: 1 }));
  out.push(['every material', mats]);
  // shells (two-storey with both stair kinds, nook with and without a gable)
  for (const type of Object.keys(SHELLS)) out.push([`shell ${type}`, { ...defaultKit(), shell: { type, gap, clearance: 2, params: {} } }]);
  out.push(['shell twostorey spiral', { ...defaultKit(), shell: { type: 'twostorey', gap, clearance: 2, params: { stairs: 'spiral' } } }]);
  out.push(['shell nook gable', { ...defaultKit(), shell: { type: 'nook', gap, clearance: 2, params: { gable: true } } }]);
  // a gable roof on a room box
  const roof = defaultKit();
  roof.room = { ...roof.room, roof: { type: 'gable', pitch: 40 } };
  out.push(['gable roof', roof]);
  // trimmed openings, a hidden base, a fan, a turntable and a sound grille
  const props = lit(defaultKit(), [
    { mount: 'ceiling', x: 150, y: 100, effect: 'fan', sizeMm: 60 },
    { mount: 'floor', x: 100, y: 100, effect: 'turntable', sizeMm: 50 },
    { mount: 'wall', wall: 'left', pos: 60, elev: 150, effect: 'sound' },
    { mount: 'wall', wall: 'back', pos: 60, elev: 150, color: 'warm' },
  ], { mount: 'base' });
  props.room = { ...props.room, ceiling: true };
  props.openings = [
    { wall: 'back', kind: 'window', pos: 200, sill: 90, width: 50, height: 60, trim: true },
    { wall: 'left', kind: 'door', pos: 120, width: 45, height: 120, trim: true },
  ];
  out.push(['trim, hidden base and moving parts', props]);
  return out;
}

test('every 3D mesh except LED glows has a texture, in every room, shell, piece and material', () => {
  for (const [name, kit] of scenes()) {
    const look = resolveLook(kit);
    const faces = compileKit(kit).faces3d;
    assert.ok(faces.length > 0, name);
    const bare = [];
    faces.forEach((f, i) => {
      if (f.glow) return;
      const spec = faceTexture(f, kit, look);
      if (!spec || !ids.has(spec.id)) bare.push(`#${i} layer ${f.layer} item ${f.item} material ${f.material} colour ${f.color}`);
    });
    assert.deepEqual(bare, [], `${name}: meshes without a texture`);
  }
});

test('LED glows stay plain light, never textured', () => {
  const [, kit] = scenes().at(-1);
  const glows = compileKit(kit).faces3d.filter((f) => f.glow);
  assert.ok(glows.length);
  for (const f of glows) assert.equal(faceTexture(f, kit), null);
});

test('every cut part’s 3D faces name the material it is cut from (fan blades and turntables too)', () => {
  for (const [name, kit] of scenes()) {
    const known = new Set(kit.materials.map((m) => m.id));
    for (const f of compileKit(kit).faces3d) {
      if (f.glow) continue;
      assert.ok(known.has(f.material), `${name}: layer ${f.layer} face names "${f.material}"`);
    }
  }
});

test('printed parts look in 3D like their print-then-cut sheet', () => {
  let checked = 0;
  for (const [name, kit] of scenes()) {
    const compiled = compileKit(kit);
    const look = resolveLook(kit);
    const printed = new Map(printableParts(compiled, kit).map(({ part, look: l }) => [part.material, l]));
    for (const f of compiled.faces3d) {
      if (f.glow || !printed.has(f.material)) continue;
      assert.deepEqual(faceTexture(f, kit, look), printed.get(f.material), `${name}: ${f.material} face`);
      checked++;
    }
  }
  assert.ok(checked > 50, `printed faces checked: ${checked}`);
});

test('unprinted parts show their raw material: chipboard, basswood, card and felt each look different', () => {
  const kit = defaultKit();
  const finish = (id) => materialFinish(kit.materials.find((m) => m.id === id));
  const kinds = ['chip2', 'bass16', 'card110', 'felt', 'acetate'].map((id) => finish(id).id);
  assert.equal(new Set(kinds).size, kinds.length, `one finish per material family: ${kinds}`);
  assert.equal(finish('chip2').id, finish('chip15').id, 'both chipboards look like chipboard');
  for (const m of DEFAULT_MATERIALS) {
    const spec = materialFinish(m);
    assert.ok(ids.has(spec.id), m.id);
    assert.ok(spec.tile > 0, `${m.id}: a raw finish repeats on a small tile`);
    assert.ok(Number.isInteger(spec.seed));
    assert.equal(spec.params.colors[0], m.color, `${m.id}: based on the material's own colour`);
  }
  // recolouring a material recolours its finish
  const red = materialFinish({ ...kit.materials[0], color: '#aa3322' });
  assert.equal(red.params.colors[0], '#aa3322');
  // custom materials get a finish by kind
  assert.equal(materialFinish({ id: 'x', kind: 'board', color: '#999999', name: 'Plywood' }).id, finish('bass16').id);
  assert.equal(materialFinish({ id: 'y', kind: 'card', color: '#999999', name: 'Kraft' }).id, finish('card110').id);
  assert.equal(materialFinish({ id: 'z', kind: 'fabric', color: '#999999', name: 'Wool' }).id, finish('felt').id);
});

test('an unprinted face in a non-surface material falls back to its finish; switching a print texture off shows the raw material', () => {
  const kit = defaultKit();
  const faces = compileKit(kit).faces3d;
  const wall = faces.find((f) => f.layer === 1 && f.material === kit.room.wallpaper.material && Math.abs(f.n[2]) < 0.5);
  const box = faces.find((f) => f.layer === 0 && f.material === kit.room.material);
  assert.equal(faceTexture(wall, kit).id, resolveLook(kit)[kit.room.wallpaper.material].id, 'wallpaper is printed');
  assert.equal(faceTexture(box, kit).id, 'chipboard', 'the room box is bare chipboard');
  const off = { ...kit, look: { textures: { [kit.room.wallpaper.material]: null } } };
  const paper = off.materials.find((m) => m.id === kit.room.wallpaper.material);
  assert.deepEqual(faceTexture(wall, off), materialFinish(paper));
});

test('raw finishes are new material textures (kept out of the wall and floor picker), drawn on their tile', () => {
  const finishes = TEXTURES.filter((t) => t.kind === 'material').map((t) => t.id).sort();
  assert.deepEqual(finishes, ['card-fibre', 'chipboard', 'clear-sheet', 'felt', 'wood-grain']);
  for (const id of finishes) {
    const s = textureShapes(id, { width: 30, height: 30, seed: 3, params: { colors: ['#b8956a', '#a0805a', '#d0b080'] } });
    assert.ok(s.shapes.length > 5, `${id} has some detail`);
    for (const sh of s.shapes.slice(1)) {
      for (const c of [sh.fill, sh.stroke].filter(Boolean)) assert.match(c, /^#[0-9a-f]{6}$/i, `${id} colour ${c}`);
    }
  }
});
