// T6 structured motif shapes for the print-then-cut renderer (#53).
// symbolShapes() gives the same motif that textureSVG() draws with <use>,
// as plain paths and circles in unit coordinates, so a PDF writer can draw it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symbolShapes, textureSVG, TEXTURES } from '../src/textures/index.js';

const sprig = TEXTURES.find((t) => t.id === 'wallpaper-sprig');
const COMMANDS = /^[MLHVQCZ0-9.\-\s]+$/;

test('symbolShapes("sprig") is the motif textureSVG draws, as paths and circles', () => {
  const p = { ...sprig.params, colors: ['#111111', '#225533', '#cc4411'] };
  const shapes = symbolShapes('sprig', p);
  assert.ok(shapes.length >= 2);
  for (const s of shapes) {
    assert.ok(['path', 'circle'].includes(s.type), s.type);
    if (s.type === 'path') assert.match(s.d, COMMANDS, 'absolute M L H V Q C Z only');
  }
  const path = shapes.find((s) => s.type === 'path');
  assert.equal(path.fill, '#225533');
  assert.equal(path.stroke, '#225533');
  assert.ok(path.width > 0 && path.width < 0.5, 'stroke width in unit coordinates');
  const dot = shapes.find((s) => s.type === 'circle');
  assert.deepEqual([dot.cx, dot.cy, dot.r, dot.fill], [0, -0.65, 0.2, '#cc4411']);

  // the very same geometry as the SVG symbol
  const svg = textureSVG('wallpaper-sprig', { width: 40, height: 40, params: { colors: p.colors } });
  assert.ok(svg.includes(`d="${path.d}"`), 'same path data as SYMBOLS.sprig');
  assert.ok(svg.includes(`<circle cx="0" cy="-0.65" r="0.2" fill="#cc4411"/>`));
});

test('every motif a texture places has structured shapes, in about −1…1', () => {
  for (const t of TEXTURES) {
    const used = new Set();
    // a box big enough to place motifs if the texture has any
    // (textureSVG keeps working unchanged alongside)
    const svg = textureSVG(t.id, { width: 60, height: 60 });
    for (const m of svg.matchAll(/<use href="#[^"]*-([a-z]+)"/g)) used.add(m[1]);
    for (const name of used) {
      const shapes = symbolShapes(name, t.params);
      assert.ok(shapes.length, `${t.id}: ${name}`);
      for (const s of shapes) {
        const nums = s.type === 'circle' ? [s.cx - s.r, s.cx + s.r, s.cy - s.r, s.cy + s.r] : s.d.match(/-?[\d.]+/g).map(Number);
        for (const v of nums) assert.ok(Math.abs(v) <= 1.2, `${name} stays in unit coordinates`);
      }
    }
  }
});

test('symbolShapes rejects unknown motifs', () => {
  assert.throws(() => symbolShapes('nope', {}), /unknown symbol/i);
});
