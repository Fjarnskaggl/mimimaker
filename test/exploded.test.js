// T4: an exploded view for each build step, drawn with the existing SVG renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit, CATALOG } from '../src/catalog.js';
import { buildSteps } from '../src/build/steps.js';
import { faceParts, explodedFaces, explodedViewSVG } from '../src/build/exploded.js';

const gap = { w: 90, h: 230, d: 180 };
const setup = (kit) => { const compiled = compileKit(kit); return { kit, compiled, steps: buildSteps(kit, compiled) }; };
const centroid = (f) => {
  const pts = f.polys[0];
  return pts.reduce((s, p) => s.map((v, k) => v + p[k] / pts.length), [0, 0, 0]);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const area2d = (poly) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const area3d = (poly) => {
  let c = [0, 0, 0];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    c = [c[0] + p[1] * q[2] - p[2] * q[1], c[1] + p[2] * q[0] - p[0] * q[2], c[2] + p[0] * q[1] - p[1] * q[0]];
  });
  return Math.hypot(...c) / 2;
};

test('faceParts: every board panel and shell part owns a 3D face of the same shape', () => {
  const kits = [defaultKit(), { ...defaultKit(), shell: { type: 'bookshop', gap, clearance: 2, params: {} } }];
  for (const kit of kits) {
    const { compiled } = setup(kit);
    const owner = faceParts(kit, compiled);
    assert.equal(owner.length, compiled.faces3d.length);
    const kindOf = new Map(compiled.usedMats.map((m) => [m.id, m.kind]));
    for (const p of compiled.parts.filter((q) => kindOf.get(q.material) === 'board')) {
      const k = owner.indexOf(p.id);
      assert.ok(k >= 0, `#${p.id} ${p.group} – ${p.name} has a face`);
      assert.ok(Math.abs(area3d(compiled.faces3d[k].polys[0]) - area2d(p.polys[0])) < 0.5, `#${p.id} shape matches`);
    }
    // every solid face belongs to some part (only the LED glows don't)
    compiled.faces3d.forEach((f, k) => { if (!f.glow) assert.ok(owner[k] != null, `face ${k} (layer ${f.layer}) has an owner`); });
  }
});

test('faceParts: a fold-up card net owns all the faces of its box', () => {
  const kit = defaultKit();
  const { compiled } = setup(kit);
  const owner = faceParts(kit, compiled);
  const net = compiled.parts.find((p) => p.name === 'Nightstand net');
  const item = kit.items.findIndex((i) => i.type === 'nightstand');
  const mine = compiled.faces3d.map((f, k) => (f.item === item ? owner[k] : null)).filter((x) => x != null);
  assert.ok(mine.length >= 5);
  assert.ok(mine.every((id) => id === net.id));
});

test('room box: the walls fly out from the middle; nothing from later steps is drawn', () => {
  const { kit, compiled, steps } = setup(defaultKit());
  const faces = explodedFaces(kit, compiled, steps, 1);
  const moving = faces.filter((f) => f.moving);
  assert.ok(moving.length >= 4);
  const mid = [compiled.dims.W / 2, compiled.dims.D / 2, compiled.dims.H / 2];
  for (const f of moving) {
    const c = centroid(f.source);
    const out = [c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]];
    assert.ok(Math.hypot(...f.offset) > 5, 'pulled apart');
    assert.ok(dot(f.offset, out) > 0, `part #${f.part} moves outwards`);
  }
  assert.ok(faces.every((f) => steps[0].parts.includes(f.part)), 'only the room box is drawn');
});

test('shelves slide in from the front; earlier parts stay put; later parts are hidden', () => {
  const kit = defaultKit();
  const { compiled, steps } = setup(kit);
  const slide = steps.find((s) => /^Slide the shelves/.test(s.title));
  const faces = explodedFaces(kit, compiled, steps, slide.n);
  const shelves = faces.filter((f) => f.moving);
  assert.ok(shelves.length);
  for (const f of shelves) assert.ok(slide.parts.includes(f.part) && f.offset[1] < 0, 'out of the open front');
  const before = new Set(steps.slice(0, slide.n - 1).flatMap((s) => s.parts));
  for (const f of faces.filter((x) => !x.moving)) {
    assert.ok(before.has(f.part), `#${f.part} was built earlier`);
    assert.deepEqual(f.offset, [0, 0, 0]);
  }
});

test('placing a piece lowers it onto the floor or brings it to its wall', () => {
  const { kit, compiled, steps } = setup(defaultKit());
  const shelf = steps.find((s) => s.kind === 'place' && s.group === 'Bookshelf');
  const moving = explodedFaces(kit, compiled, steps, shelf.n).filter((f) => f.moving);
  assert.ok(moving.length >= 5, 'the whole bookshelf moves');
  assert.ok(moving.every((f) => f.offset[2] > 0), 'shown lifted above the floor');
  const frame = steps.find((s) => s.kind === 'place' && s.group === 'Picture frame');
  const fm = explodedFaces(kit, compiled, steps, frame.n).filter((f) => f.moving);
  assert.ok(fm.length && fm.every((f) => f.offset[1] < 0), 'held off the back wall');
});

test('explodedViewSVG: an SVG for each build step with parts, none for wiring info', () => {
  const kit = defaultKit();
  kit.items.push({ type: 'bookshelf', params: { ...CATALOG.bookshelf.defaults }, material: 'card110', x: 1, y: 1, rot: 0 });
  const { compiled, steps } = setup(kit);
  for (const s of steps) {
    const svg = explodedViewSVG(kit, compiled, steps, s.n);
    if (s.kind === 'info') { assert.equal(svg, null); continue; }
    const drawn = explodedFaces(kit, compiled, steps, s.n).some((f) => f.moving);
    if (!drawn) continue;
    assert.match(svg, /^<svg[^>]*class="[^"]*exploded/);
    assert.match(svg, new RegExp(`aria-label="Exploded view of step ${s.n}`));
  }
  const shown = steps.filter((s) => explodedViewSVG(kit, compiled, steps, s.n));
  assert.ok(shown.length >= steps.filter((s) => s.kind !== 'info').length - 2, 'nearly every step gets a picture');
});

test('shell kits get exploded views too', () => {
  const kit = { ...defaultKit(), shell: { type: 'staircase', gap, clearance: 2, params: {} } };
  const { compiled, steps } = setup(kit);
  // the shell's own LEDs add an info step (wiring), which has no picture, as in room kits
  for (const s of steps) if (s.kind !== 'info') assert.ok(explodedViewSVG(kit, compiled, steps, s.n), `step ${s.n} ${s.title}`);
});

test('furniture is built on the bench: its steps show the piece alone, not the room', () => {
  const { kit, compiled, steps } = setup(defaultKit());
  const close = steps.find((s) => /^Close the bookshelf/.test(s.title));
  const faces = explodedFaces(kit, compiled, steps, close.n);
  const groupOf = new Map(compiled.parts.map((p) => [p.id, p.group]));
  assert.ok(faces.length && faces.every((f) => groupOf.get(f.part) === 'Bookshelf'));
});

test('shelves slide out of the open front of a turned bookshelf too', () => {
  const kit = defaultKit();
  const shelf = kit.items.find((i) => i.type === 'bookshelf');
  shelf.rot = 90;
  const { compiled, steps } = setup(kit);
  const slide = steps.find((s) => /^Slide the shelves/.test(s.title));
  const moving = explodedFaces(kit, compiled, steps, slide.n).filter((f) => f.moving);
  assert.ok(moving.length);
  for (const f of moving) assert.ok(Math.abs(f.offset[0]) > 5 * Math.abs(f.offset[1]), `turned front: ${f.offset}`);
});

test('a "$" in a step title does not break the SVG', () => {
  const kit = defaultKit();
  kit.items[0] = { ...kit.items[0], name: "Shelf $' $&" };
  const { compiled, steps } = setup(kit);
  const step = steps.find((s) => s.kind === 'place' && s.group === kit.items[0].name);
  const svg = explodedViewSVG(kit, compiled, steps, step.n);
  assert.ok(svg.includes(`aria-label="Exploded view of step ${step.n}: Place the shelf $' $&amp;"`));
  assert.equal((svg.match(/<svg/g) || []).length, 1);
});
