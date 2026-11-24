// Snapping for moving pieces, shared by the floor plan and the 3D move handles:
// grid, walls, and other pieces' edges and centres, with guides to draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapFloorMove, snapWallMove, snapRotation, footprint } from '../src/plan.js';

const room = { width: 300, depth: 220, height: 260 };
const kitWith = (items, openings = []) => ({ room, items, openings });
const box = (x, y, extra = {}) => ({ type: 'nightstand', x, y, rot: 0, ...extra });
const size = (it) => { const f = footprint(it); return [f.x1 - f.x0, f.y1 - f.y0]; };

test('snapFloorMove: off the grid snaps to the grid', () => {
  const kit = kitWith([box(50, 50)]);
  const r = snapFloorMove(kit, 0, 61.4, 88.2, { grid: 5, reach: 0 });
  assert.deepEqual([r.x, r.y], [60, 90]);
  assert.deepEqual(r.guides, []);
});

test('snapFloorMove: near a wall, the piece goes flush against it, with a guide', () => {
  const kit = kitWith([box(50, 50)]);
  const [w] = size(kit.items[0]);
  const r = snapFloorMove(kit, 0, 1.7, 80, { grid: 0, reach: 3 });
  assert.equal(r.x, 0, 'flush with the left wall');
  assert.ok(r.guides.some((g) => g.axis === 'x' && g.at === 0 && g.kind === 'wall'));
  const right = snapFloorMove(kit, 0, room.width - w - 2.2, 80, { grid: 0, reach: 3 });
  assert.equal(right.x, room.width - w, 'flush with the right wall');
});

test('snapFloorMove: edges and centres line up with other pieces, and pieces butt up flush', () => {
  const kit = kitWith([box(100, 40), box(200, 150)]);
  const [w, d] = size(kit.items[0]);
  // left edges line up (x0 = 100) though the pieces are far apart in y
  const a = snapFloorMove(kit, 1, 101.6, 150, { grid: 5, reach: 3 });
  assert.equal(a.x, 100);
  const g = a.guides.find((q) => q.axis === 'x');
  assert.equal(g.at, 100);
  assert.equal(g.kind, 'piece');
  assert.ok(g.from <= 40 && g.to >= 150, 'the guide spans both pieces');
  // flush: right edge of the mover against the left edge of the other
  const b = snapFloorMove(kit, 1, 100 - w - 1.2, 40, { grid: 5, reach: 3 });
  assert.equal(b.x, 100 - w);
  // centres line up in y
  const c = snapFloorMove(kit, 1, 200, 40 + 1.1, { grid: 0, reach: 3 });
  assert.equal(c.y, 40);
  assert.ok(c.guides.some((q) => q.axis === 'y'), 'with a guide');
  void d;
});

test('snapFloorMove: the nearest target wins, and a piece snapping takes precedence over the grid', () => {
  const kit = kitWith([box(103, 40), box(200, 150)]);
  const r = snapFloorMove(kit, 1, 102, 150, { grid: 5, reach: 3 });
  assert.equal(r.x, 103, 'aligned with the piece at 103, not the grid line at 100');
});

test('snapFloorMove: free (Alt) does no snapping but still keeps the piece in the room', () => {
  const kit = kitWith([box(100, 40), box(200, 150)]);
  const r = snapFloorMove(kit, 1, 101.6, 150.3, { grid: 5, reach: 3, free: true });
  assert.deepEqual([r.x, r.y], [101.6, 150.3]);
  assert.deepEqual(r.guides, []);
  const out = snapFloorMove(kit, 1, -20, 500, { free: true });
  const [, d] = size(kit.items[1]);
  assert.deepEqual([out.x, out.y], [0, room.depth - d]);
});

test('snapFloorMove: flat pieces (rugs) are ignored as targets, other pieces still count', () => {
  const kit = kitWith([{ type: 'rug', x: 120, y: 60, rot: 0 }, box(200, 150)]);
  const r = snapFloorMove(kit, 1, 121, 150, { grid: 0, reach: 3 });
  assert.equal(r.x, 121, 'no snap to a rug');
});

test('snapWallMove: along the wall, snaps to wall ends, openings and other wall pieces; up the wall to floor, ceiling and neighbours', () => {
  const frame = { type: 'frame', wall: 'back', pos: 60, elev: 160 };
  const other = { type: 'frame', wall: 'back', pos: 240, elev: 150 };
  const kit = kitWith([frame, other], [{ wall: 'back', kind: 'window', pos: 150, sill: 90, width: 80, height: 100 }]);
  const w = 30, h = 40; // the caller passes the piece's size on the wall
  // left edge onto the window's right edge (150 + 40 = 190)
  const a = snapWallMove(kit, { kind: 'item', index: 0 }, 190 + w / 2 + 1.5, 160, { w, h, grid: 5, reach: 3 });
  assert.equal(a.pos, 190 + w / 2);
  assert.ok(a.guides.some((g) => g.axis === 'pos' && g.at === 190));
  // centre onto the other frame's centre height (150)
  const b = snapWallMove(kit, { kind: 'item', index: 0 }, 60, 151.8, { w, h, grid: 5, reach: 3 });
  assert.equal(b.elev, 150);
  // top of the window (190) lines up with the piece's bottom
  const c = snapWallMove(kit, { kind: 'item', index: 0 }, 60, 190 + h / 2 + 1, { w, h, grid: 5, reach: 3 });
  assert.equal(c.elev, 190 + h / 2);
  // into the corner: flush with the wall end and the floor
  const d = snapWallMove(kit, { kind: 'item', index: 0 }, w / 2 + 2, h / 2 + 2.5, { w, h, grid: 0, reach: 3 });
  assert.deepEqual([d.pos, d.elev], [w / 2, h / 2]);
  // never off the wall
  const e = snapWallMove(kit, { kind: 'item', index: 0 }, -50, 900, { w, h, free: true });
  assert.deepEqual([e.pos, e.elev], [w / 2, room.height - h / 2]);
});

test('snapRotation: quarter turns from a drag angle', () => {
  assert.equal(snapRotation(0, 30), 0);
  assert.equal(snapRotation(0, 50), 90);
  assert.equal(snapRotation(90, 100), 180);
  assert.equal(snapRotation(0, -60), 270);
  assert.equal(snapRotation(270, 100), 0);
});

test('snapWallMove: with nothing in reach, the centre goes to the grid, not the left edge', () => {
  const kit = kitWith([{ type: 'frame', wall: 'back', pos: 150, elev: 150 }]);
  const r = snapWallMove(kit, { kind: 'item', index: 0 }, 121.3, 150, { w: 33, h: 0, grid: 5, reach: 0 });
  assert.equal(r.pos, 120, 'centre on the 5 cm grid');
});

test('snapFloorMove: no guide when the room edge pushes the piece off the line it snapped to', () => {
  const kit = kitWith([box(100, 40), box(200, 150)]);
  const [w] = size(kit.items[1]);
  // a target past the right wall: the snap lands outside, the clamp pulls it back
  kit.room = { ...room, width: 100 + w / 2 + 1 };
  const r = snapFloorMove(kit, 1, 100 + 0.5, 150, { grid: 0, reach: 3 });
  for (const g of r.guides.filter((q) => q.axis === 'x')) {
    const f = footprint({ ...kit.items[1], x: r.x, y: r.y });
    assert.ok([f.x0, (f.x0 + f.x1) / 2, f.x1].some((v) => Math.abs(v - g.at) < 1e-6), `guide at ${g.at} touches the piece (${f.x0}–${f.x1})`);
  }
});
