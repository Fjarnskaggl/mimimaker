// The app's CSS variables (styles.css) must match the design system's tokens
// (docs/design-system/tokens.json) in both themes. Change both together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync(new URL('../docs/design-system/tokens.json', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const norm = (v) => v.replace(/\s+/g, ' ').replace(/([(,\s])0\./g, '$1.').trim().toLowerCase();

/** The custom properties set in the first CSS block that starts with `selector {`. */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `styles.css has a "${selector}" block`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], norm(m[2])]));
}

const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };

test('colours and shadows match the design system in the light and dark themes', () => {
  for (const t of [...tokens.color.tokens, ...tokens.shadow.tokens]) {
    assert.equal(light[t.name], norm(t.value.light), `light --${t.name}`);
    assert.equal(dark[t.name], norm(t.value.dark), `dark --${t.name}`);
  }
});

test('spacing, radius and fonts match the design system', () => {
  for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens]) assert.equal(light[t.name], norm(t.value), `--${t.name}`);
  for (const [name, value] of Object.entries(tokens.type.families)) assert.equal(light[`font-${name}`], norm(value), `--font-${name}`);
});

test('layout sizes match the design system', () => {
  for (const t of tokens.layout.tokens) {
    assert.equal(light[t.name], norm(t.value), `--${t.name}`);
  }
});

test('the dark theme also follows the system colour scheme unless light is chosen', () => {
  const auto = css.match(/@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)\s*{([^}]*)}/);
  assert.ok(auto, 'styles.css has a prefers-color-scheme dark block');
  const vars = Object.fromEntries([...auto[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], norm(m[2])]));
  for (const t of tokens.color.tokens) {
    if (t.value.dark !== t.value.light) assert.equal(vars[t.name], norm(t.value.dark), `auto-dark --${t.name}`);
  }
});
