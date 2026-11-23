// Shells in the kit compiler: `kit.shell` replaces the room box with the
// shell's parts. A nook keeps furniture, openings, overlays and LEDs working
// inside an effective room (its interior in real cm); an alley is the whole
// scene, so room contents are set aside with a note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { buildShell } from '../src/shells/index.js';
import { shellRoom } from '../src/shells/kit.js';

const gap = { w: 90, h: 230, d: 180 };
const withShell = (type, extra = {}) => ({ ...defaultKit(), shell: { type, gap, clearance: 2, params: {}, ...extra } });

test('shellRoom: the effective room is the shell interior in real cm', () => {
  const kit = withShell('nook');
  const t = kit.materials.find((m) => m.id === kit.room.material).thickness;
  const sh = buildShell({ ...kit.shell, material: kit.room.material }, { t });
  const { room } = shellRoom(kit);
  const cm = (mm) => (mm * kit.scale) / 10;
  assert.ok(Math.abs(room.width - cm(sh.dims.inner.W)) < 1e-9);
  assert.ok(Math.abs(room.depth - cm(sh.dims.inner.D)) < 1e-9);
  assert.ok(Math.abs(room.height - cm(sh.dims.inner.H)) < 1e-9);
  assert.equal(room.ceiling, true, 'a nook has a roof');
  assert.equal(shellRoom(defaultKit()), null, 'no shell, no change');
});

test('a nook shell replaces the room box and keeps the furniture', () => {
  const kit = withShell('nook');
  kit.openings = [{ wall: 'back', kind: 'window', pos: 50, sill: 60, width: 40, height: 60, trim: false }];
  const r = compileKit(kit);
  const sh = buildShell({ ...kit.shell, material: kit.room.material }, { t: 2 });
  assert.deepEqual([r.dims.W, r.dims.D, r.dims.H].map((v) => +v.toFixed(9)), [sh.dims.W, sh.dims.D, sh.dims.H]);
  assert.ok(!r.groups.some((g) => g.title === 'Room box'), 'no room box');
  const walls = r.parts.filter((p) => p.group === 'Shell');
  assert.equal(walls.length, 5);
  const back = walls.find((p) => p.name === 'Back wall');
  assert.ok(back.polys.length >= 2, 'the window is cut through the shell back wall');
  for (const item of kit.items) assert.ok(r.groups.some((g) => g.title.startsWith(item.name || '')), 'items still compile');
  assert.ok(r.parts.length > walls.length + 5, 'furniture parts are there too');
  assert.ok(!r.warnings.some((w) => w.level === 'error'), JSON.stringify(r.warnings));
  // the shell's joint graph comes through with kit part ids
  assert.equal(r.shell.type, 'nook');
  const ids = new Set(walls.map((p) => p.id));
  assert.equal(r.shell.joints.length, 8);
  for (const j of r.shell.joints) assert.ok(ids.has(j.a) && ids.has(j.b));
});

test('an alley shell is the whole scene: room contents set aside with a note', () => {
  const kit = withShell('alley');
  const r = compileKit(kit);
  const groups = new Set(r.parts.map((p) => p.group));
  for (const g of ['Shell', 'Left facade', 'Right facade', 'Backdrop']) assert.ok(groups.has(g), g);
  assert.ok(![...groups].some((g) => kit.items.some((it) => it.name && g.startsWith(it.name))));
  assert.ok(!groups.has('Wallpaper') && !groups.has('Flooring'));
  assert.ok(r.warnings.some((w) => w.level === 'info' && /alley/i.test(w.msg)), 'explains where the furniture went');
  assert.ok(!r.warnings.some((w) => w.level === 'error'), JSON.stringify(r.warnings));
  // every shell part is in the 3D preview, and the LED spots glow
  const shellFaces = r.faces3d.filter((f) => f.layer === 0);
  assert.equal(shellFaces.length, r.parts.length);
  assert.ok(r.faces3d.filter((f) => f.glow).length >= r.shell.lights.length);
  assert.ok(r.shell.lights.length > 0);
  // steps come through per group
  for (const g of ['Left facade', 'Backdrop']) assert.ok(r.groups.find((q) => q.title === g).steps.length > 0, g);
  // every part lands on a sheet
  const placed = r.sheets.flatMap((s) => s.placements.map((p) => p.part.id));
  assert.equal(placed.length, r.parts.length);
});

test('a shell needs board: cardstock rooms fall back to the first board, with a note', () => {
  const kit = withShell('nook');
  kit.room.material = 'card110';
  const r = compileKit(kit);
  const walls = r.parts.filter((p) => p.group === 'Shell');
  assert.equal(walls.length, 5);
  assert.ok(walls.every((p) => r.usedMats.find((m) => m.id === p.material).kind === 'board'));
  assert.ok(r.warnings.some((w) => /board/i.test(w.msg)));
});

test('kits without a shell compile exactly as before', () => {
  const a = compileKit(defaultKit());
  const b = compileKit({ ...defaultKit(), shell: null });
  assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
  assert.equal(a.shell, null);
});

test('a bad shell spec is reported, not thrown', () => {
  const kit = withShell('alley');
  kit.shell.gap = { w: 40, h: 200, d: 150 };
  kit.shell.params = { layers: 3, cavity: 10 };
  const r = compileKit(kit);
  assert.ok(r.warnings.some((w) => w.level === 'error' && /street/i.test(w.msg)));
});
