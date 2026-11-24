// The selection ink in 3D follows the theme: the blue ballpoint (--select)
// from the stage's CSS, the light ballpoint on a dark (night) stage, and
// never the old teal or green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectInk, SELECT_TINT, HOVER_TINT, SELECT_NIGHT } from '../src/render/webgl.js';
import { renderScene } from '../src/preview3d.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

const hue = (n) => {
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

test('the 3D selection ink is read from the stage\'s --select', () => {
  const css = (v) => ({ getPropertyValue: (name) => (name === '--select' ? v : '') });
  const saved = globalThis.getComputedStyle;
  try {
    globalThis.getComputedStyle = () => css(' #2340a8 ');
    assert.equal(selectInk({}, false), 0x2340a8, 'light theme: the ballpoint');
    globalThis.getComputedStyle = () => css('#a9baff');
    assert.equal(selectInk({}, false), 0xa9baff, 'dark theme: the light ballpoint');
    assert.equal(selectInk({}, true), SELECT_NIGHT, 'night stage: the light ballpoint, whatever the theme');
    globalThis.getComputedStyle = () => css('');
    assert.equal(selectInk({}, false), 0x2340a8, 'no stylesheet: the light-theme ballpoint');
  } finally { globalThis.getComputedStyle = saved; }
  assert.equal(selectInk(null, false), 0x2340a8, 'no element (no DOM)');
});

test('selection tints are blue, not teal or green', () => {
  for (const [name, c] of Object.entries({ SELECT_TINT, HOVER_TINT, SELECT_NIGHT })) {
    const h = hue(c);
    assert.ok(h != null && h >= 210 && h <= 250, `${name} 0x${c.toString(16)} has hue ${h}`);
  }
});

test('the SVG 3D preview outlines the selected piece in the ballpoint, not teal', () => {
  const svg = renderScene(compileKit(defaultKit()).faces3d, { selected: 1 });
  assert.match(svg, /class="sel"[^>]*stroke="#2340a8"/);
  assert.doesNotMatch(svg, /#1f7a8c/i);
});
