// New catalogue pieces (beyond the original 37). Each batch adds its ids to
// NEW; the generic checks run on all of them, the specific ones pin down
// what makes each piece that piece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, defaultKit } from '../src/catalog.js';
import { compileKit } from '../src/kit.js';
import { PIECES } from '../src/pieces/index.js';
import { validatePieces } from '../src/pieces/schema.js';
import { polygonArea } from '../src/geometry.js';

const NEW = {
  sideboard: 'Living room',
  bunkbed: 'Bedroom',
  island: 'Kitchen',
  bathcabinet: 'Bathroom',
  coatrack: 'Decor',
  wallclock: 'Decor',
  // batch 2
  piano: 'Living room',
  firescreen: 'Living room',
  lamptable: 'Living room',
  pottedtree: 'Decor',
  windowseat: 'Library',
  dressingtable: 'Bedroom',
  crib: 'Bedroom',
};
const S = 10 / 24; // cm → model mm at the default 1:24 scale

function model(id, raw = {}) {
  const def = CATALOG[id];
  const all = { ...def.defaults, ...raw };
  return Object.fromEntries(def.params.map((q) => [q.key, q.unit === 'cm' ? all[q.key] * S : all[q.key]]));
}
const build = (id, raw, t = 1.5) => CATALOG[id].build(model(id, raw), { t });
const extremes = (def) => ['min', 'max'].map((end) => Object.fromEntries(def.params.map((q) => [q.key,
  q.type === 'select' ? q.options[end === 'min' ? 0 : q.options.length - 1] : q[end]])));

/** Corners of every component in item space (boxes and floor-piece flats). */
function extent(c) {
  const at = c.at || [0, 0, 0];
  if (c.kind === 'box') return [at, c.size.map((v, i) => at[i] + v)];
  const pts = c.polys.flat();
  if (c.wall) return [[Math.min(...pts.map((p) => p[0])), 0, Math.min(...pts.map((p) => p[1]))], [Math.max(...pts.map((p) => p[0])), 0, Math.max(...pts.map((p) => p[1]))]];
  const { o, U, V } = c.plane;
  const world = pts.map(([u, v]) => [0, 1, 2].map((i) => at[i] + o[i] + U[i] * u + V[i] * v));
  return [[0, 1, 2].map((i) => Math.min(...world.map((w) => w[i]))), [0, 1, 2].map((i) => Math.max(...world.map((w) => w[i])))];
}

test('the new pieces are in the catalogue, valid, tagged, in the right theme', () => {
  assert.deepEqual(validatePieces(PIECES), []);
  for (const [id, theme] of Object.entries(NEW)) {
    const def = CATALOG[id];
    assert.ok(def, `${id} exists`);
    assert.equal(def.theme, theme, id);
    assert.ok(def.tags.length > 0 && [1, 2, 3].includes(def.difficulty), `${id} metadata`);
    assert.ok(def.note && def.note.length > 20, `${id} has an assembly note`);
  }
  assert.ok(Object.keys(CATALOG).length >= 37 + Object.keys(NEW).length);
});

test('new pieces build finite geometry inside their footprint at defaults, min and max', () => {
  for (const id of Object.keys(NEW)) {
    const def = CATALOG[id];
    for (const raw of [def.defaults, ...extremes(def)]) {
      for (const t of [1.5, 0.38]) {
        const p = model(id, raw);
        const comps = def.build(p, { t });
        assert.ok(comps.length > 0, id);
        const json = JSON.stringify(comps);
        assert.ok(!/null|NaN|Infinity/.test(json), `${id} has only finite numbers (${JSON.stringify(raw)})`);
        const [W, D, H] = def.size(p);
        for (const c of comps) {
          const [lo, hi] = extent(c);
          const lim = [W, D, H];
          for (let i = 0; i < 3; i++) {
            assert.ok(lo[i] > -0.01 && hi[i] < lim[i] + 0.01, `${id} ${c.name} axis ${i}: ${lo[i].toFixed(2)}…${hi[i].toFixed(2)} within 0…${lim[i].toFixed(2)} (${JSON.stringify(raw)}, t=${t})`);
          }
          if (c.polys) for (const poly of c.polys) assert.ok(Math.abs(polygonArea(poly)) > 0.01, `${id} ${c.name} has no degenerate polygons`);
        }
      }
    }
  }
});

test('new pieces compile to cut parts in board and card without errors', () => {
  for (const id of Object.keys(NEW)) {
    for (const material of ['chip15', 'card110']) {
      const kit = defaultKit();
      kit.items = [{ type: id, params: { ...CATALOG[id].defaults }, material, x: 10, y: 10, rot: 0, wall: 'back', pos: 150, elev: 150 }];
      const r = compileKit(kit);
      assert.deepEqual(r.warnings.filter((w) => w.level === 'error'), [], `${id} in ${material}`);
      assert.ok(r.groups.at(-1).parts.length > 0, `${id} in ${material} has parts`);
    }
  }
});

test('new pieces compile without warnings at their defaults on every board', () => {
  for (const id of Object.keys(NEW)) {
    for (const material of ['chip2', 'chip15', 'bass16', 'bass08']) {
      const kit = defaultKit();
      kit.items = [{ type: id, params: { ...CATALOG[id].defaults }, material, x: 10, y: 10, rot: 0, wall: 'back', pos: 150, elev: 150 }];
      const warnings = compileKit(kit).warnings.filter((w) => w.level !== 'info').map((w) => w.msg ?? w);
      assert.deepEqual(warnings, [], `${id} in ${material}`);
    }
  }
});

test('sideboard: a door-fronted body under an overhanging top', () => {
  const [body, top] = build('sideboard');
  assert.equal(body.kind, 'box');
  assert.equal(body.scores.front.length, 3 - 1, 'three doors → two gap lines');
  assert.ok(top.size[0] > body.size[0] && top.size[1] > body.size[1], 'top overhangs');
  assert.ok(Math.abs(top.at[2] - body.size[2]) < 1e-9, 'top sits on the body');
});

test('bunk bed: two decks between open-framed end panels', () => {
  const comps = build('bunkbed');
  const decks = comps.filter((c) => c.kind === 'box');
  assert.equal(decks.length, 2);
  assert.ok(decks[1].at[2] > decks[0].at[2] + decks[0].size[2], 'upper deck is above the lower one');
  const ends = comps.filter((c) => c.kind === 'flat');
  assert.equal(ends.length, 2);
  for (const e of ends) assert.equal(e.polys.length, 3, `${e.name}: outline + two openings`);
});

test('kitchen island: worktop overhangs the back for stools', () => {
  const [body, top] = build('island', { d: 80, over: 25 });
  assert.ok(Math.abs(top.size[1] - body.size[1] - 25 * S) < 1e-9);
  assert.equal(body.at?.[1] ?? 0, 0, 'body is flush with the front');
  const none = build('island', { over: 0 });
  assert.ok(Math.abs(none[1].size[1] - none[0].size[1]) < 1e-9);
});

test('bathroom cabinet hangs on the wall with a scored mirror door', () => {
  assert.equal(CATALOG.bathcabinet.placement, 'wall');
  const [box] = build('bathcabinet', { count: 2 });
  assert.equal(box.kind, 'box');
  assert.ok(box.scores.front.length >= 1 + 4, 'door gap + mirror outline');
});

test('coat stand: one outline with two hook arms, on a base', () => {
  const comps = build('coatrack');
  const stand = comps.find((c) => c.kind === 'flat');
  assert.equal(stand.polys.length, 1);
  assert.equal(stand.polys[0].length, 12, 'post + two arms');
  assert.ok(comps.some((c) => c.kind === 'box' && c.name === 'Base'));
});

test('wall clock: twelve hour ticks and two hands showing the set time', () => {
  const [face] = build('wallclock', { hour: 3, minute: 0 });
  assert.equal(face.wall, true);
  assert.equal(face.scores.length, 12 + 2);
  const r = model('wallclock').w / 2;
  const [hour, minute] = face.scores.slice(12);
  // 3:00 → hour hand points right (+x), minute hand straight up (+y)
  assert.ok(hour[1][0] > r + 1 && Math.abs(hour[1][1] - r) < 1e-6, `hour hand ${JSON.stringify(hour)}`);
  assert.ok(Math.abs(minute[1][0] - r) < 1e-6 && minute[1][1] > r + 1, `minute hand ${JSON.stringify(minute)}`);
  const half = build('wallclock', { hour: 6, minute: 30 })[0].scores.slice(12);
  assert.ok(half[1][1][1] < r - 1, '6:30 → minute hand points down');
});

// ------------------------------------------------------------------ batch 2

test('upright piano: a keybed with one score per white-key gap, on two legs, in front of the body', () => {
  const comps = build('piano', { octaves: 4 });
  const keybed = comps.find((c) => c.name === 'Keybed');
  assert.equal(keybed.scores.top.length, 7 * 4 - 1);
  assert.equal(comps.filter((c) => c.name.startsWith('Leg')).length, 2);
  const body = comps.find((c) => c.name === 'Piano');
  assert.ok(Math.abs(body.at[1] - keybed.size[1]) < 1e-9, 'body starts behind the keybed');
});

test('fire screen: three arched panels, each with an opening', () => {
  const panels = build('firescreen').filter((c) => c.kind === 'flat');
  assert.equal(panels.length, 3);
  for (const p of panels) assert.equal(p.polys.length, 2, p.name);
});

test('lamp table: one shelf and a round top lying on it', () => {
  const comps = build('lamptable');
  const box = comps.find((c) => c.kind === 'box');
  assert.equal(box.shelves.length, 1);
  const top = comps.find((c) => c.kind === 'flat');
  assert.deepEqual(top.plane.n, [0, 0, 1]);
  assert.ok(Math.abs(top.plane.o[2] - box.size[2]) < 1e-9, 'top sits at table height');
});

test('potted tree: a pot and two crossed crowns', () => {
  const comps = build('pottedtree');
  assert.ok(comps.some((c) => c.kind === 'box' && c.name === 'Pot'));
  const crowns = comps.filter((c) => c.name.startsWith('Crown'));
  assert.equal(crowns.length, 2);
  const normals = crowns.map((c) => c.plane.n.map(Math.abs));
  assert.deepEqual(normals.sort(), [[0, 1, 0], [1, 0, 0]], 'one faces front, one faces sideways');
});

test('window seat: a felt cushion lies on the seat', () => {
  const comps = build('windowseat');
  const seat = comps.find((c) => c.kind === 'box');
  const cushion = comps.find((c) => c.name === 'Cushion');
  assert.equal(cushion.material, 'felt');
  assert.ok(Math.abs(cushion.plane.o[2] - seat.size[2]) < 1e-9);
});

test('dressing table: a framed mirror stands on the back of the top', () => {
  const comps = build('dressingtable');
  const table = comps.find((c) => c.kind === 'box');
  const mirror = comps.find((c) => c.name === 'Mirror frame');
  assert.equal(mirror.polys.length, 2, 'frame with an opening for mirror card');
  assert.ok(Math.abs(mirror.plane.o[2] - table.size[2]) < 1e-9, 'stands on the top');
});

test('crib: slatted front and back, plain ends, raised base', () => {
  const comps = build('crib', { slats: 8 });
  const sides = comps.filter((c) => c.kind === 'flat' && c.name.startsWith('Side'));
  assert.equal(sides.length, 2);
  for (const s of sides) assert.equal(s.polys.length, 1 + 8 + 1, `${s.name}: outline + one gap between each pair of slats`);
  const ends = comps.filter((c) => c.kind === 'flat' && c.name.startsWith('End'));
  assert.equal(ends.length, 2);
  for (const e of ends) assert.deepEqual(e.plane.n.map(Math.abs), [1, 0, 0]);
  const base = comps.find((c) => c.kind === 'box');
  assert.ok(base.at[2] > 0, 'base is raised');
});
