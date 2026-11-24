// T6 procedural print-then-cut textures (src/textures/index.js).
// Shapes are in mm on the printed sheet; pattern sizes are real-world cm
// divided by the kit scale (1:N).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTURES, textureShapes, textureSVG } from '../src/textures/index.js';

const IDS = ['wood-planks', 'tiles', 'brick', 'wallpaper-stripes', 'wallpaper-sprig', 'book-spines',
  'chipboard', 'wood-grain', 'card-fibre', 'felt', 'clear-sheet']; // raw material finishes for unprinted parts
const close = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const rects = (s) => s.shapes.filter((x) => x.type === 'rect' && !x.background);
const mm = (cm, scale) => (cm * 10) / scale;

test('registry lists every texture with a name, kind and default params', () => {
  assert.deepEqual(TEXTURES.map((t) => t.id).sort(), [...IDS].sort());
  for (const t of TEXTURES) {
    assert.ok(t.name && typeof t.name === 'string');
    assert.ok(['floor', 'wall', 'decor', 'material'].includes(t.kind), t.id);
    assert.ok(Array.isArray(t.params.colors) && t.params.colors.length >= 2, `${t.id} has a palette`);
  }
});

test('every texture starts with a background covering the whole box, and stays near it', () => {
  for (const id of IDS) {
    const s = textureShapes(id, { width: 80, height: 50, scale: 12 });
    const bg = s.shapes[0];
    assert.ok(bg.background && bg.x <= 0 && bg.y <= 0 && bg.x + bg.w >= 80 && bg.y + bg.h >= 50, id);
    for (const sh of s.shapes) if (sh.type === 'rect') {
      assert.ok(sh.x < 80 && sh.y < 50 && sh.x + sh.w > 0 && sh.y + sh.h > 0, `${id}: rect overlaps the box`);
    }
  }
});

test('textures are deterministic for a seed and change with it', () => {
  for (const id of IDS) {
    const a = textureSVG(id, { width: 60, height: 40, seed: 7 });
    assert.equal(a, textureSVG(id, { width: 60, height: 40, seed: 7 }), id);
    assert.notEqual(a, textureSVG(id, { width: 60, height: 40, seed: 8 }), id);
  }
  assert.throws(() => textureSVG('nope', { width: 10, height: 10 }), /unknown texture/i);
});

test('textureSVG is a standalone mm-sized SVG clipped to its box', () => {
  const svg = textureSVG('brick', { width: 72.5, height: 40 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="72\.5mm" height="40mm" viewBox="0 0 72\.5 40"/);
  assert.match(svg, /<clipPath id="[\w-]+"><rect x="0" y="0" width="72\.5" height="40"\/><\/clipPath>/);
  assert.match(svg, /<\/svg>$/);
  // two textures on one page must not share clip ids
  const id = (s) => s.match(/<clipPath id="([\w-]+)"/)[1];
  assert.notEqual(id(svg), id(textureSVG('brick', { width: 72.5, height: 40, seed: 2 })));
});

test('wood planks: rows as wide as a real plank at the kit scale, joints staggered, palette colours', () => {
  for (const scale of [6, 12, 24]) {
    const colors = ['#a0703c', '#b5834a', '#8d6233'];
    const s = textureShapes('wood-planks', { width: 120, height: 80, scale, params: { plankWidth: 12, colors } });
    const planks = rects(s);
    const rows = [...new Set(planks.map((p) => p.y.toFixed(4)))].map(Number).sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) assert.ok(close(rows[i] - rows[i - 1], mm(12, scale), 1e-6), `row pitch at 1:${scale}`);
    for (const p of planks) assert.ok(colors.includes(p.fill), `plank colour ${p.fill}`);
    // butt joints in neighbouring rows don't line up
    const joints = (y) => planks.filter((p) => close(p.y, y)).map((p) => p.x).filter((x) => x > 0.5 && x < 119.5);
    for (let i = 1; i < rows.length; i++) {
      for (const x of joints(rows[i])) assert.ok(joints(rows[i - 1]).every((x2) => Math.abs(x - x2) > 1), `row ${i} joint at ${x}`);
    }
  }
});

test('tiles: square tiles on a grid with grout gaps; checker alternates colours', () => {
  const s = textureShapes('tiles', { width: 100, height: 60, scale: 12, params: { tileSize: 20, grout: 0.4, checker: true, colors: ['#f2efe8', '#2f3a40', '#c9c3b8'] } });
  const tiles = rects(s);
  const pitch = mm(20, 12);
  for (const t of tiles) {
    assert.ok(close(t.w, pitch - 0.4, 1e-6) && close(t.h, pitch - 0.4, 1e-6), 'tile size');
    const i = Math.round((t.x - 0.2) / pitch), j = Math.round((t.y - 0.2) / pitch);
    assert.ok(close(t.x, i * pitch + 0.2, 1e-6) && close(t.y, j * pitch + 0.2, 1e-6), 'on the grid');
    assert.equal(t.fill, (i + j) % 2 ? '#2f3a40' : '#f2efe8', 'checker');
  }
  assert.equal(s.shapes[0].fill, '#c9c3b8', 'grout is the last colour');
});

test('brick: running bond, alternate courses offset by half a brick', () => {
  const s = textureShapes('brick', { width: 90, height: 45, scale: 12, params: { brickLength: 21.5, brickHeight: 6.5, mortar: 1 } });
  const bricks = rects(s);
  const courseH = mm(6.5 + 1, 12), len = mm(21.5 + 1, 12);
  const course = (b) => Math.round(b.y / courseH);
  for (const b of bricks) {
    assert.ok(close(b.h, mm(6.5, 12), 1e-6));
    const offset = course(b) % 2 ? len / 2 : 0;
    const k = (b.x + offset) / len;
    assert.ok(close(k, Math.round(k), 1e-6), `brick at x=${b.x} in course ${course(b)}`);
  }
  assert.ok(new Set(bricks.map(course)).size >= 5);
});

test('wallpaper stripes: full-height stripes of the given width, alternating colours', () => {
  const s = textureShapes('wallpaper-stripes', { width: 50, height: 70, scale: 12, params: { stripeWidth: 6, colors: ['#e8d9c4', '#c98f7a'] } });
  const st = rects(s);
  assert.ok(st.length >= 2);
  for (const r of st) {
    assert.ok(r.y <= 0 && r.y + r.h >= 70, 'full height');
    assert.ok(close(r.w, mm(6, 12), 1e-6));
    assert.equal(r.fill, '#c98f7a');
  }
  assert.equal(s.shapes[0].fill, '#e8d9c4');
});

test('wallpaper sprig: motifs spread over the area at a density set by the repeat', () => {
  const small = textureShapes('wallpaper-sprig', { width: 40, height: 40, scale: 12 });
  const big = textureShapes('wallpaper-sprig', { width: 80, height: 80, scale: 12 });
  const motifs = (s) => s.shapes.filter((x) => x.motif).length;
  assert.ok(motifs(small) >= 4);
  assert.ok(motifs(big) > motifs(small) * 3, `${motifs(big)} vs ${motifs(small)}`);
});

test('book spines: side by side without overlap, varied, within the shelf', () => {
  const s = textureShapes('book-spines', { width: 60, height: 20, scale: 12 });
  const spines = rects(s).filter((r) => r.spine).sort((a, b) => a.x - b.x);
  assert.ok(spines.length >= 8);
  for (let i = 0; i < spines.length; i++) {
    const b = spines[i];
    assert.ok(b.x >= 0 && b.x + b.w <= 60 + 1e-9, 'inside the width');
    assert.ok(b.h <= 20 + 1e-9 && b.h >= 20 * 0.6, 'height fits the shelf');
    assert.ok(close(b.y + b.h, 20, 1e-9), 'standing on the shelf');
    if (i) assert.ok(b.x >= spines[i - 1].x + spines[i - 1].w - 1e-9, 'no overlap');
  }
  assert.ok(new Set(spines.map((b) => b.h.toFixed(2))).size > 3, 'heights vary');
  assert.ok(new Set(spines.map((b) => b.fill)).size > 2, 'colours vary');
});

test('a full mat of texture stays a reasonable file size', () => {
  for (const id of IDS) {
    const svg = textureSVG(id, { width: 300, height: 300, scale: 12 });
    assert.ok(svg.length < 400_000, `${id}: ${svg.length} bytes`);
  }
});
