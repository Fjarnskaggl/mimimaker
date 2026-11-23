// T4: the joint graph and build steps take book-nook shells' explicit joints
// (compiled.shell.joints, from src/shells/) instead of guessing from names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { jointGraph, itemGroups } from '../src/build/joints.js';
import { buildSteps } from '../src/build/steps.js';

const gap = { w: 90, h: 230, d: 180 };
const SHELLS = [['nook', {}], ['nook', { gable: true }], ['alley', {}], ['bookshop', {}], ['staircase', {}], ['greenhouse', {}]];
const withShell = (type, params = {}) => ({ ...defaultKit(), shell: { type, gap, clearance: 2, params } });
const build = (kit) => {
  const compiled = compileKit(kit);
  const graph = jointGraph(kit, compiled);
  return { compiled, graph, steps: buildSteps(kit, compiled, graph) };
};
const id = (compiled, name) => {
  const p = compiled.parts.find((q) => q.name === name);
  assert.ok(p, `part "${name}" exists`);
  return p.id;
};
const key = (j) => [j.a, j.b].sort((x, y) => x - y).join('-') + j.kind;
const stepOf = (steps, pid) => steps.findIndex((s) => s.parts.includes(pid));

for (const [type, params] of SHELLS) {
  const label = `${type}${params.gable ? ' + gable' : ''}`;

  test(`${label}: every shell joint is in the graph exactly as the shell declares it`, () => {
    const kit = withShell(type, params);
    const { compiled, graph } = build(kit);
    assert.ok(compiled.shell.joints.length);
    const have = new Set(graph.joints.map(key));
    for (const j of compiled.shell.joints) assert.ok(have.has(key(j)), `shell joint ${j.a}–${j.b} (${j.kind})`);
    // no name-guessed joints between shell parts
    const shellIds = new Set(compiled.shell.joints.flatMap((j) => [j.a, j.b]));
    const declared = new Set(compiled.shell.joints.map(key));
    for (const j of graph.joints) {
      if (shellIds.has(j.a) && shellIds.has(j.b)) assert.ok(declared.has(key(j)), `invented joint ${j.a}–${j.b} (${j.kind})`);
    }
  });

  test(`${label}: steps build every part exactly once, and no step is untitled`, () => {
    const kit = withShell(type, params);
    const { compiled, steps } = build(kit);
    const seen = new Map();
    for (const s of steps) {
      assert.ok(!/\bthe\s*$|the\s+:/i.test(s.title) && !/ {2}/.test(s.title), `title "${s.title}"`);
      for (const p of s.parts) { assert.ok(!seen.has(p), `part #${p} built twice`); seen.set(p, s.n); }
    }
    for (const p of compiled.parts) assert.ok(seen.has(p.id), `part #${p.id} ${p.name} is never built`);
    // a shell's structure is never "placed" like a piece of furniture
    assert.ok(!steps.some((s) => s.kind === 'place' && compiled.shell.joints.some((j) => s.parts.includes(j.a))));
  });

  test(`${label}: each step's joints are only to parts already built or built in it`, () => {
    const { steps } = build(withShell(type, params));
    const built = new Set();
    for (const s of steps) {
      for (const p of s.parts) built.add(p);
      for (const j of s.joints) assert.ok(built.has(j.a) && built.has(j.b), `step ${s.n} "${s.title}" joins ${j.a}–${j.b} before both exist`);
    }
  });

  test(`${label}: the roof goes on after the inside is finished`, () => {
    const kit = withShell(type, params);
    const { compiled, steps } = build(kit);
    const roof = stepOf(steps, id(compiled, 'Roof'));
    const inside = compiled.parts.filter((p) => !['Roof', 'Gable', 'Left roof', 'Right roof', 'Roof pane'].includes(p.name));
    for (const p of inside) assert.ok(stepOf(steps, p.id) < roof, `${p.name} before the roof`);
  });
}

test('bookshop: shelves slot in after the first side wall and before the second', () => {
  const { compiled, steps } = build(withShell('bookshop'));
  const first = stepOf(steps, id(compiled, 'Left wall'));
  const second = stepOf(steps, id(compiled, 'Right wall'));
  assert.ok(first < second);
  for (const n of [1, 2, 3, 4]) {
    const s = stepOf(steps, id(compiled, `Back shelf ${n}`));
    assert.ok(first < s && s < second, `back shelf ${n}`);
  }
  assert.ok(stepOf(steps, id(compiled, 'Floor')) <= first);
});

test('nook: furniture is placed on the shell floor and overlays glue to shell walls', () => {
  const kit = withShell('nook');
  const { compiled, graph } = build(kit);
  const floor = id(compiled, 'Floor'), back = id(compiled, 'Back wall');
  const has = (a, b, kind, note) => graph.joints.some((j) => j.kind === kind && (!note || j.note === note) && ((j.a === a && j.b === b) || (j.a === b && j.b === a)));
  assert.ok(has(id(compiled, 'Back wallpaper'), back, 'flat'));
  assert.ok(has(id(compiled, 'Floor covering'), floor, 'flat'));
  assert.ok(has(id(compiled, 'Bookshelf back'), floor, 'flat', 'place in room'));
  // the item groups line up with the kit's items, past the shell groups
  const titles = [...itemGroups(kit, compiled).keys()].map((g) => g.title);
  assert.equal(titles[0], 'Bookshelf');
});

test('room box with a gable roof: the roof is jointed to the box and built last', () => {
  const kit = defaultKit();
  kit.room.roof = { type: 'gable', pitch: 40 };
  const { compiled, graph, steps } = build(kit);
  const gable = id(compiled, 'Gable'), left = id(compiled, 'Left roof'), right = id(compiled, 'Right roof');
  const has = (a, b, kind) => graph.joints.some((j) => j.kind === kind && ((j.a === a && j.b === b) || (j.a === b && j.b === a)));
  assert.ok(has(left, gable, 'finger') && has(right, gable, 'finger') && has(left, right, 'flat'));
  assert.ok(has(gable, id(compiled, 'Back wall'), 'flat'));
  const titles = [...itemGroups(kit, compiled).keys()].map((g) => g.title);
  assert.equal(titles[0], 'Bookshelf', 'the roof group is not mistaken for an item');
  const roof = stepOf(steps, gable);
  assert.equal(roof, steps.length - 1 - [...steps].reverse().findIndex((s) => s.parts.length), 'last build step');
});
