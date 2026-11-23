// Pure logic behind the shell panel (src/ui/t2.js): which Room box fields a
// shell takes over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKit } from '../src/catalog.js';
import { roomLocks, setShellType } from '../src/ui/t2.js';

test('room locks: none without a shell', () => {
  assert.deepEqual(roomLocks(defaultKit()), { size: false, overlays: false, note: null });
});

test('room locks: a nook sizes the room, overlays stay free', () => {
  const kit = defaultKit();
  setShellType(kit, 'nook');
  const l = roomLocks(kit);
  assert.equal(l.size, true);
  assert.equal(l.overlays, false);
  assert.match(l.note, /Sized by the shell — change the shelf gap/);
});

test('room locks: an alley also takes over wallpaper and floor', () => {
  const kit = defaultKit();
  setShellType(kit, 'alley');
  const l = roomLocks(kit);
  assert.equal(l.size, true);
  assert.equal(l.overlays, true);
  assert.match(l.note, /shelf gap/);
  assert.match(l.note, /wallpaper|floor/i);
});

test('room locks: switching the shell off frees the room again', () => {
  const kit = defaultKit();
  setShellType(kit, 'alley');
  setShellType(kit, '');
  assert.deepEqual(roomLocks(kit), { size: false, overlays: false, note: null });
});
