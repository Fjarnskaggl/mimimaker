// T4: joint graph and step generator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit, CATALOG } from '../src/catalog.js';
import { jointGraph } from '../src/build/joints.js';
import { buildSteps } from '../src/build/steps.js';

function kitWith(type, material, params = {}) {
  const kit = defaultKit();
  kit.items = [{ type, params: { ...CATALOG[type].defaults, ...params }, material, x: 10, y: 10, rot: 0, wall: 'back', pos: 150, elev: 150 }];
  return kit;
}
const build = (kit) => {
  const compiled = compileKit(kit);
  const graph = jointGraph(kit, compiled);
  return { compiled, graph, steps: buildSteps(kit, compiled, graph) };
};
const partId = (compiled, name) => {
  const p = compiled.parts.find((q) => q.name === name);
  assert.ok(p, `part "${name}" exists`);
  return p.id;
};
const hasJoint = (graph, a, b, kind) => graph.joints.some((j) => j.kind === kind && ((j.a === a && j.b === b) || (j.a === b && j.b === a)));
const stepOf = (steps, id) => steps.findIndex((s) => s.parts.includes(id));

test('board bookshelf: finger joints between panels, shelves slot into both sides and back', () => {
  const { compiled, graph } = build(kitWith('bookshelf', 'bass16'));
  const P = (n) => partId(compiled, `Bookshelf ${n}`);
  assert.ok(hasJoint(graph, P('bottom'), P('left'), 'finger'));
  assert.ok(hasJoint(graph, P('back'), P('right'), 'finger'));
  assert.ok(hasJoint(graph, P('top'), P('back'), 'finger'));
  assert.ok(!hasJoint(graph, P('top'), P('bottom'), 'finger'), 'top and bottom do not touch');
  for (const k of [1, 2, 3]) {
    for (const side of ['left', 'right', 'back']) assert.ok(hasJoint(graph, P(`shelf ${k}`), P(side), 'slot'), `shelf ${k} → ${side}`);
  }
  const node = graph.nodes.find((n) => n.id === P('shelf 1'));
  assert.equal(node.role, 'shelf');
  assert.equal(node.unit, 'Bookshelf/Bookshelf');
});

test('bookshelf: shelves come before the second side panel', () => {
  const { compiled, steps } = build(kitWith('bookshelf', 'bass16'));
  const P = (n) => partId(compiled, `Bookshelf ${n}`);
  const left = stepOf(steps, P('left')), right = stepOf(steps, P('right'));
  const second = Math.max(left, right);
  for (const k of [1, 2, 3]) assert.ok(stepOf(steps, P(`shelf ${k}`)) < second, `shelf ${k} before second side`);
  assert.ok(stepOf(steps, P('bottom')) <= Math.min(left, right), 'base first');
  assert.ok(stepOf(steps, P('top')) >= second, 'top closes the box');
});

test('room box: walls finger-joint the floor; overlays glue flat; room is built first', () => {
  const { compiled, graph, steps } = build(defaultKit());
  const floor = partId(compiled, 'Floor'), back = partId(compiled, 'Back wall'), left = partId(compiled, 'Left wall');
  assert.ok(hasJoint(graph, floor, back, 'finger'));
  assert.ok(hasJoint(graph, back, left, 'finger'));
  assert.ok(hasJoint(graph, partId(compiled, 'Back wallpaper'), back, 'flat'));
  assert.ok(hasJoint(graph, partId(compiled, 'Floor covering'), floor, 'flat'));
  assert.ok(hasJoint(graph, partId(compiled, 'Back window frame'), back, 'flat'));
  assert.equal(stepOf(steps, floor), 0);
  // wallpaper goes on before the trim frames that sit on top of it, and before furniture
  assert.ok(stepOf(steps, partId(compiled, 'Back wallpaper')) < stepOf(steps, partId(compiled, 'Back window frame')));
  assert.ok(stepOf(steps, partId(compiled, 'Back wallpaper')) < stepOf(steps, partId(compiled, 'Bookshelf left')));
});

test('armchair: three boxes, the flat back glues onto the seat, and every box is placed in the room', () => {
  const { compiled, graph, steps } = build(defaultKit());
  const backrest = compiled.parts.find((p) => p.group === 'Armchair' && p.name === 'Back').id;
  const node = graph.nodes.find((n) => n.id === backrest);
  assert.equal(node.role, 'flat');
  assert.ok(graph.joints.some((j) => j.kind === 'flat' && (j.a === backrest || j.b === backrest)));
  const units = new Set(graph.nodes.filter((n) => n.group === 'Armchair' && n.role === 'panel').map((n) => n.unit));
  assert.deepEqual([...units].sort(), ['Armchair/Left arm', 'Armchair/Right arm', 'Armchair/Seat']);
  const place = steps.find((s) => s.group === 'Armchair' && s.kind === 'place');
  assert.ok(place, 'a place-in-room step');
  assert.ok(steps.indexOf(place) > stepOf(steps, backrest));
});

test('card pieces: one-piece nets fold, card shelves glue in with tabs', () => {
  const { compiled, graph, steps } = build(kitWith('bookshelf', 'card110'));
  const net = partId(compiled, 'Bookshelf net');
  assert.equal(graph.nodes.find((n) => n.id === net).role, 'net');
  assert.ok(hasJoint(graph, partId(compiled, 'Bookshelf shelf 1'), net, 'glue-tab'));
  assert.ok(stepOf(steps, net) < stepOf(steps, partId(compiled, 'Bookshelf shelf 1')));
});

test('card room box: separate pieces join with glue tabs', () => {
  const kit = defaultKit();
  kit.room.material = 'card110';
  const { compiled, graph } = build(kit);
  assert.ok(hasJoint(graph, partId(compiled, 'Floor'), partId(compiled, 'Back wall'), 'glue-tab'));
});

test('every part is in exactly one step and steps are numbered with glue cure times', () => {
  for (const kit of [defaultKit(), kitWith('sofa', 'chip15'), kitWith('wardrobe', 'card110'), kitWith('rug', 'felt')]) {
    const { compiled, steps } = build(kit);
    const seen = steps.flatMap((s) => s.parts).sort((a, b) => a - b);
    assert.deepEqual(seen, compiled.parts.map((p) => p.id));
    steps.forEach((s, i) => {
      assert.equal(s.n, i + 1);
      assert.ok(s.text.length > 0, `step ${s.n} has instructions`);
      assert.ok(s.cureMin >= 0);
    });
  }
});

test('within a unit, each step joins something already built', () => {
  for (const type of Object.keys(CATALOG)) {
    for (const material of ['chip15', 'card110']) {
      const { graph, steps } = build(kitWith(type, material));
      const built = new Set();
      for (const s of steps) {
        if (s.kind === 'place' || s.kind === 'info') continue;
        const unitBuilt = s.parts.some((id) => graph.joints.some((j) => (j.a === id && built.has(j.b)) || (j.b === id && built.has(j.a))));
        const units = new Set(s.parts.map((id) => graph.nodes.find((n) => n.id === id).unit));
        const startsUnit = [...units].every((u) => !graph.nodes.some((n) => n.unit === u && built.has(n.id)));
        assert.ok(unitBuilt || startsUnit, `${type}/${material} step ${s.n} "${s.title}" floats`);
        s.parts.forEach((id) => built.add(id));
      }
    }
  }
});

test('lighting adds a wiring step after the room and before furniture', () => {
  const kit = defaultKit();
  const { steps } = build(kit);
  const i = steps.findIndex((s) => s.group === 'Lighting');
  if (kit.lighting?.enabled && kit.lighting.leds?.length) {
    assert.ok(i > 0);
    const firstItem = steps.findIndex((s) => s.group === 'Bookshelf');
    assert.ok(i < firstItem);
  } else assert.equal(i, -1);
});

test('the place-in-room joint belongs to the place step, not to building the piece', () => {
  const { steps } = build(defaultKit());
  for (const s of steps) {
    const placing = s.joints.filter((j) => j.note === 'place in room');
    if (s.kind === 'place') assert.equal(placing.length, 1, `${s.title} glues the piece into the room`);
    else assert.deepEqual(placing, [], `${s.title} should not include placing the piece`);
  }
});
