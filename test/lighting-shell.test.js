// Shell lights feed the LED planner (#16): an alley's cavity and backdrop
// LEDs get wire paths along the cavity floor, out of the back-wall holes the
// shell already cuts, then along the outside to the power box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShell } from '../src/shells/index.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { ledMapSVG, ledRows } from '../src/ledmap.js';
import { pointInPolygon } from '../src/geometry.js';

const gap = { w: 100, h: 230, d: 180 };
const alley = (params = {}, t = 2) => buildShell({ type: 'alley', gap, clearance: 2, params }, { t });
const withShell = (type, params = {}) => ({ ...defaultKit(), shell: { type, gap, clearance: 2, params } });
const len3 = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(...p.map((v, k) => v - pts[i][k])), 0);

test('alley lights carry a wire path that leaves through a hole in the back wall', () => {
  for (const [params, t] of [[{}, 2], [{ buildings: 4, litRatio: 1, seed: 5 }, 1.5], [{ backdrop: false }, 2]]) {
    const sh = alley(params, t);
    const back = sh.parts.find((p) => p.key === 'shell-back');
    const { W, D } = sh.dims;
    assert.ok(sh.lights.length > 0);
    for (const l of sh.lights) {
      assert.ok(l.wire, `${l.building} has a wire`);
      const { path, exit } = l.wire;
      assert.deepEqual(path[0], l.p, 'starts at the LED');
      const end = path.at(-1);
      assert.ok(Math.abs(end[1] - (D - t)) < 1e-9, 'ends on the back wall\'s inner face');
      assert.deepEqual([end[0], end[2]], exit, 'at the exit hole');
      // the exit is one of the holes the shell already cuts in its back wall
      assert.ok(back.polys.slice(1).some((h) => pointInPolygon(exit, h)), `exit ${exit} is a cut hole`);
      // runs square to the walls, along the floor channel, inside the shell
      for (let i = 1; i < path.length; i++) {
        const moved = path[i].map((v, k) => Math.abs(v - path[i - 1][k]) > 1e-9).filter(Boolean).length;
        assert.ok(moved <= 1, 'axis-aligned segments');
      }
      for (const [x, y, z] of path) assert.ok(x > t && x < W - t && y >= 0 && y <= D - t && z >= t, 'inside the shell');
      if (l.side === 'left' || l.side === 'right') {
        const cx = l.p[0];
        assert.ok(path.every(([x]) => x === cx), 'stays in its own cavity');
      }
    }
  }
});

test('an alley with lighting on: every shell LED is planned, wired to the power box', () => {
  const kit = withShell('alley');
  const r = compileKit(kit);
  assert.ok(!r.warnings.some((w) => w.level === 'error' || /power box is off/.test(w.msg)), JSON.stringify(r.warnings));
  const L = r.lighting;
  assert.equal(L.enabled, true);
  assert.equal(L.leds.length, r.shell.lights.length);
  assert.equal(L.circuit.count, L.leds.length);
  L.leds.forEach((led, i) => {
    const l = r.shell.lights[i];
    assert.equal(led.label, `L${i + 1}`);
    assert.equal(led.face, 'back');
    assert.equal(led.color, l.color);
    assert.match(led.name, /Left|Right|Backdrop/);
    // the map shows the LED where it sits, seen through the back wall
    assert.deepEqual(led.p, [l.p[0], l.p[2]]);
    assert.deepEqual(led.inside[0], led.p);
    assert.deepEqual(led.inside.at(-1), l.wire.exit);
    // outside: from the hole to the power box
    assert.deepEqual(led.route[0], l.wire.exit);
    assert.deepEqual(led.route.at(-1), L.power.p);
    const outside = led.route.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - led.route[k][0], p[1] - led.route[k][1]), 0);
    assert.ok(Math.abs(led.length - (len3(l.wire.path) + r.dims.t + outside)) < 1e-6, 'inside run + wall + outside run');
    assert.ok(led.leadCm >= led.length / 10 && led.leadCm % 5 === 0);
  });
  // the power box sits on the back wall even though the room's own was further out
  assert.ok(L.power.p[0] > 0 && L.power.p[0] < r.dims.W && L.power.p[1] > 0 && L.power.p[1] < r.dims.H);
  // LEDs that share a cavity share its hole: no extra holes in the back wall
  const back = r.parts.find((p) => p.group === 'Shell' && p.name === 'Back wall');
  const plain = compileKit({ ...kit, lighting: { ...kit.lighting, enabled: false } });
  const backOff = plain.parts.find((p) => p.group === 'Shell' && p.name === 'Back wall');
  assert.equal(back.polys.length, backOff.polys.length);
  assert.equal(plain.lighting.enabled, false, 'lighting off stays off');
});

test('shells without wired lights keep the room LEDs set aside', () => {
  const r = compileKit(withShell('bookshop'));
  assert.equal(r.lighting.enabled, false);
  assert.ok(r.shell.lights.length > 0, 'spots still glow in 3D');
});

test('LED map and table show alley LEDs inside the shell, with the inside run dashed', () => {
  const r = compileKit(withShell('alley'));
  const svg = ledMapSVG(r);
  for (const led of r.lighting.leds) assert.ok(svg.includes(`>${led.label}</text>`), led.label);
  assert.equal((svg.match(/class="inside"/g) || []).length, r.lighting.leds.length);
  const rows = ledRows(r);
  assert.equal(rows.length, r.lighting.leds.length);
  assert.ok(rows.some((row) => row.where === 'Left cavity'));
  assert.ok(rows.some((row) => row.where === 'Right cavity'));
  assert.ok(rows.some((row) => row.where === 'Backdrop cavity'));
  // a plain room's map has no inside runs
  assert.ok(!ledMapSVG(compileKit(defaultKit())).includes('class="inside"'));
});
