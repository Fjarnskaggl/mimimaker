// The "Card and chipboard" theme (approved 2026-11-24): kraft desk, cardstock
// panels, a cardboard stage, an ink main button by day and caramel at night,
// caramel for the selected tab, and the blue ballpoint as the only cool
// colour. These tests pin the approved colours, check every text and control
// pair for WCAG AA in both themes, and keep green and teal out of the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync(new URL('../docs/design-system/tokens.json', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** Custom properties set in the first CSS block that starts with `selector {`. */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `styles.css has a "${selector}" block`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
}
const THEMES = { light: block(':root'), dark: { ...block(':root'), ...block(':root[data-theme="dark"]') } };

function rgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `${hex} is a #rrggbb colour`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function hueSat(hex) {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s };
}

test('the design system is the approved Card and chipboard theme', () => {
  assert.deepEqual(tokens.color.themes.map((t) => t.name), ['Card and chipboard', 'Cardboard at night']);
  const v = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
  const want = {
    paper: ['#c29a66', '#17120e'], surface: ['#f6eedc', '#2c241d'], stage: ['#dcc7a0', '#211a14'], ink: ['#24190e', '#f6ecd9'],
    primary: ['#2a1d10', '#e2b47e'], caramel: ['#e2b47e', '#e2b47e'], select: ['#2340a8', '#a9baff'],
  };
  for (const [name, [light, dark]] of Object.entries(want)) assert.deepEqual(v[name], { light, dark }, name);
});

// [text or control, background, minimum ratio]. 4.5 for text, 3 for control edges, icons and selection.
const PAIRS = [
  ['ink', 'paper', 4.5], ['ink', 'surface', 4.5], ['ink', 'surface-sunken', 4.5], ['ink', 'stage', 4.5],
  ['ink-muted', 'surface', 4.5], ['ink-muted', 'surface-sunken', 4.5], ['ink-muted', 'primary-soft', 4.5],
  ['on-primary', 'primary', 4.5], ['ink', 'primary-soft', 4.5], ['on-caramel', 'caramel', 4.5],
  ['line-control', 'surface', 3], ['line-control', 'surface-sunken', 3], ['ink', 'surface', 3],
  ['primary', 'surface', 3], ['primary', 'paper', 3],
  ['select', 'stage', 3], ['select', 'surface', 3], ['select', 'surface-sunken', 3], ['select', 'paper', 3], ['select', 'select-halo', 3],
  ['focus', 'surface', 3], ['focus', 'surface-sunken', 3], ['focus', 'paper', 3], ['focus', 'stage', 3],
  ['score', 'surface', 3], ['score', 'surface-sunken', 3], ['score', 'stage', 3], ['warning', 'stage', 3],
  ['success', 'surface', 4.5], ['success', 'success-soft', 4.5], ['ink', 'success-soft', 4.5],
  ['warning', 'surface', 4.5], ['warning', 'warning-soft', 4.5], ['ink', 'warning-soft', 4.5],
  ['danger', 'surface', 4.5], ['danger', 'danger-soft', 4.5], ['ink', 'danger-soft', 4.5],
  ['on-glow', 'glow', 4.5], ['ink', 'glow-soft', 4.5],
  ['ink', 'plan-floor', 4.5], ['plan-wall-fill', 'plan-floor', 3], ['plan-piece-line', 'plan-piece', 3],
];

for (const [name, vars] of Object.entries(THEMES)) {
  test(`every text and control pair passes WCAG AA in the ${name} theme`, () => {
    const bad = PAIRS.map(([a, b, min]) => [a, b, min, contrast(vars[a], vars[b])]).filter(([, , min, c]) => c < min);
    assert.deepEqual(bad.map(([a, b, min, c]) => `${a} on ${b}: ${c.toFixed(2)} < ${min}`), []);
  });

  test(`a caramel selection reads at 3:1 against its panel in the ${name} theme, by its fill or its lip`, () => {
    for (const bg of ['surface', 'surface-sunken']) {
      const best = Math.max(contrast(vars.caramel, vars[bg]), contrast(vars['caramel-edge'], vars[bg]));
      assert.ok(best >= 3, `caramel on ${bg}: ${best.toFixed(2)}`);
    }
  });

  test(`success, warning and danger look different from each other in the ${name} theme`, () => {
    const dist = (a, b) => Math.hypot(...rgb(vars[a]).map((c, i) => (c - rgb(vars[b])[i]) * 255));
    for (const [a, b] of [['success', 'warning'], ['warning', 'danger'], ['success', 'danger']]) {
      assert.ok(dist(a, b) > 60, `${a} vs ${b}: ${dist(a, b).toFixed(0)}`);
    }
  });

  test(`no green or teal in the ${name} theme`, () => {
    const greens = Object.entries(vars)
      .filter(([, v]) => /^#[0-9a-f]{6}$/.test(v))
      .filter(([k]) => k !== 'plan-window') // the window glass on the floor plan is pale sky, not an accent
      .filter(([, v]) => { const { h, s } = hueSat(v); return s > 0.15 && h >= 70 && h <= 200; });
    assert.deepEqual(greens.map(([k, v]) => `--${k}: ${v}`), []);
  });
}
