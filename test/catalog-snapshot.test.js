// Snapshot of what every catalogue piece builds today. The data-driven loader
// must reproduce these exactly, so the migration can't silently change a
// single cut line. Regenerate (only for an intended change) with:
//
//   UPDATE_SNAPSHOTS=1 node --test test/catalog-snapshot.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CATALOG, itemSize } from '../src/catalog.js';

const FILE = new URL('./catalog-snapshot.json', import.meta.url);
const SCALE = 10 / 24;
const THICKNESS = { board: 1.5, card: 0.38 };

/** Parameter sets worth pinning: defaults, all-min, all-max and every select option. */
function paramCases(def) {
  const cases = { defaults: { ...def.defaults } };
  const pick = (end) => Object.fromEntries(def.params.map((q) => [q.key,
    q.type === 'select' ? q.options[end ? q.options.length - 1 : 0] : end ? q.max : q.min]));
  cases.min = pick(false);
  cases.max = pick(true);
  for (const q of def.params.filter((x) => x.type === 'select')) {
    for (const o of q.options) cases[`${q.key}=${o}`] = { ...def.defaults, [q.key]: o };
  }
  return cases;
}

const toModel = (def, raw) => Object.fromEntries(def.params.map((q) => [q.key, q.unit === 'cm' ? raw[q.key] * SCALE : raw[q.key]]));

/**
 * Canonical JSON: numbers rounded to 1e-6 so harmless float noise can't fail
 * the test, and object keys sorted (key order never changes a cut line).
 */
const canon = (v) => JSON.stringify(v, (_, x) => {
  if (typeof x === 'number') return Math.round(x * 1e6) / 1e6 + 0;
  if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]));
  return x;
});
const digest = (v) => createHash('sha256').update(canon(v)).digest('hex').slice(0, 16);

export function buildCase(type, raw, t) {
  const def = CATALOG[type];
  const p = toModel(def, raw);
  return { size: itemSize(type, p), components: def.build(p, { t }) };
}

function snapshot() {
  const out = {};
  for (const [type, def] of Object.entries(CATALOG)) {
    const base = buildCase(type, def.defaults, THICKNESS.board);
    const entry = {
      label: def.label,
      // what the app reads besides build(): picker, forms, placement
      meta: digest({ label: def.label, group: def.group, placement: def.placement, mat: def.mat, params: def.params, defaults: def.defaults, note: def.note }),
      components: base.components.map((c) => `${c.kind}:${c.name}`),
      cases: {},
    };
    for (const [name, raw] of Object.entries(paramCases(def))) {
      for (const [mk, t] of Object.entries(THICKNESS)) entry.cases[`${name}@${mk}`] = digest(buildCase(type, raw, t));
    }
    out[type] = entry;
  }
  return out;
}

test('every catalogue piece builds exactly what the snapshot recorded', () => {
  const now = snapshot();
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(FILE)) {
    writeFileSync(FILE, `${JSON.stringify(now, null, 1)}\n`);
    return;
  }
  const want = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.deepEqual(Object.keys(now), Object.keys(want), 'same pieces, same order');
  for (const type of Object.keys(want)) assert.deepEqual(now[type], want[type], type);
});

test('the snapshot covers all 37 original pieces', () => {
  const want = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(Object.keys(want).length, 37);
  for (const type of Object.keys(want)) assert.ok(Object.keys(want[type].cases).length >= 6, type);
});
