// T3 laser export: kerf compensation, laser SVG and DXF. Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { placementTransform } from '../src/nest.js';
import { polygonArea, rectPoly, distToPolys, pointInPolygon } from '../src/geometry.js';
import { kerfOffset, offsetPolygon, laserSheetSVG, laserSheetDXF, LASER_COLORS, laserFileName } from '../src/export/laser.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const width = (poly) => Math.max(...poly.map((p) => p[0])) - Math.min(...poly.map((p) => p[0]));

// ------------------------------------------------------------ polygon offset
test('offsetPolygon grows a square outward by d whatever its winding', () => {
  const sq = rectPoly(0, 0, 50, 30);
  for (const poly of [sq, [...sq].reverse()]) {
    const out = offsetPolygon(poly, 0.5);
    assert.ok(near(Math.abs(polygonArea(out)), 51 * 31), `area ${polygonArea(out)}`);
    assert.equal(Math.sign(polygonArea(out)), Math.sign(polygonArea(poly)), 'winding kept');
  }
  const shrunk = offsetPolygon(sq, -0.5);
  assert.ok(near(Math.abs(polygonArea(shrunk)), 49 * 29));
});

test('offsetPolygon keeps every new edge exactly d from the original outline', () => {
  // a finger-joint-like comb: concave and convex corners
  const comb = [[0, 0], [60, 0], [60, 10], [50, 10], [50, 5], [40, 5], [40, 10], [20, 10], [20, 5], [10, 5], [10, 10], [0, 10]];
  const d = 0.1;
  const out = offsetPolygon(comb, d);
  assert.equal(out.length, comb.length, 'right-angle joints add no vertices');
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    assert.ok(near(distToPolys(mid, [comb]), d, 1e-9), `edge ${i} at ${distToPolys(mid, [comb])}`);
    assert.ok(!pointInPolygon(mid, comb), `edge ${i} moved outward`);
  }
});

test('offsetPolygon ignores duplicate and collinear points', () => {
  const poly = [[0, 0], [10, 0], [10, 0], [20, 0], [20, 10], [0, 10]];
  const out = offsetPolygon(poly, 1);
  assert.ok(near(Math.abs(polygonArea(out)), 22 * 12));
});

test('sharp corners are bevelled instead of spiking out', () => {
  const sliver = [[0, 0], [100, 0], [0, 2]]; // ~1° tip
  const d = 0.2;
  const out = offsetPolygon(sliver, d);
  for (const p of out) assert.ok(distToPolys(p, [sliver]) <= 4 * d + 1e-9, `vertex ${p} is ${distToPolys(p, [sliver])} away`);
});

// ---------------------------------------------------------- kerf on parts
test('kerf compensation: outlines grow, holes and slots shrink, by kerf/2', () => {
  const kerf = 0.2;
  const outer = rectPoly(0, 0, 100, 80), hole = rectPoly(40, 30, 20, 20);
  const [o, h] = kerfOffset([outer, hole], kerf);
  assert.ok(near(width(o), 100.2), `outline ${width(o)}`);
  assert.ok(near(width(h), 19.8), `hole ${width(h)}`);
  // holes stay holes even if listed first or wound the same way as the outline
  const [h2, o2] = kerfOffset([[...hole].reverse(), outer], kerf);
  assert.ok(near(width(h2), 19.8));
  assert.ok(near(width(o2), 100.2));
});

test('kerf 0 leaves parts untouched', () => {
  const polys = [rectPoly(0, 0, 10, 10)];
  assert.deepEqual(kerfOffset(polys, 0), polys);
});

test('a finger-joint notch cut with kerf comes out exactly the nominal width', () => {
  const kit = defaultKit();
  const part = compileKit(kit).parts.find((p) => p.polys[0].length > 12); // a finger-jointed panel
  assert.ok(part, 'found a jointed panel');
  const kerf = 0.15;
  const [comp] = kerfOffset(part.polys, kerf);
  // simulating the beam: growing the compensated path inward by kerf/2 again
  // (the material the laser burns) recovers the nominal area
  const burnt = offsetPolygon(comp, -kerf / 2);
  assert.ok(near(Math.abs(polygonArea(burnt)), Math.abs(polygonArea(part.polys[0])), 1e-6));
  assert.ok(Math.abs(polygonArea(comp)) > Math.abs(polygonArea(part.polys[0])));
});

// ---------------------------------------------------------------- laser SVG
const compiled = compileKit(defaultKit());
const sheet = compiled.sheets[0];
const numbers = (d) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);

test('laser SVG has cut / score / engrave layers in laser colours with hairline strokes', () => {
  const svg = laserSheetSVG(sheet, { kerf: 0.1, title: 'Test' });
  assert.match(svg, /width="\d+(\.\d+)?mm"/);
  assert.match(svg, new RegExp(`<g id="cut"[^>]*stroke="${LASER_COLORS.cut}"[^>]*stroke-width="0.01"`));
  assert.match(svg, new RegExp(`<g id="engrave"[^>]*stroke="${LASER_COLORS.engrave}"`));
  const cutPaths = svg.match(/<path id="part-\d+"/g) || [];
  assert.equal(cutPaths.length, sheet.placements.length);
  const labels = svg.match(/<path id="label-\d+"/g) || [];
  assert.equal(labels.length, sheet.placements.length, 'part numbers engraved by default');
  assert.ok(!/id="engrave"/.test(laserSheetSVG(sheet, { engraveLabels: false })), 'engrave layer optional');
  const cutDs = [...svg.match(/<g id="cut"[\s\S]*?<\/g>/)[0].matchAll(/ d="([^"]*)"/g)].map((m) => m[1]).join(' ');
  for (const v of numbers(cutDs)) {
    assert.ok(v >= -1 && v <= Math.max(sheet.w, sheet.h) + 1, `coordinate ${v} on the sheet`);
  }
});

test('laser SVG score lines are not kerf-offset', () => {
  const withScores = compiled.sheets.find((s) => s.placements.some((pl) => pl.part.scores.length));
  if (!withScores) return;
  const a = laserSheetSVG(withScores, { kerf: 0 }).match(/<g id="score"[\s\S]*?<\/g>/)[0];
  const b = laserSheetSVG(withScores, { kerf: 0.3 }).match(/<g id="score"[\s\S]*?<\/g>/)[0];
  assert.equal(a, b);
});

// ---------------------------------------------------------------------- DXF
function parseDXF(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);
  const polylines = [];
  let cur = null;
  for (let i = 0; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (code === 0 && val === 'POLYLINE') cur = { layer: null, flags: 0, pts: [] };
    else if (code === 0 && val === 'VERTEX') cur.pts.push([NaN, NaN]);
    else if (code === 0 && val === 'SEQEND') { polylines.push(cur); cur = null; }
    else if (cur && code === 8 && !cur.pts.length) cur.layer = val;
    else if (cur && code === 70 && !cur.pts.length) cur.flags = Number(val);
    else if (cur && cur.pts.length && code === 10) cur.pts.at(-1)[0] = Number(val);
    else if (cur && cur.pts.length && code === 20) cur.pts.at(-1)[1] = Number(val);
  }
  return { pairs, polylines };
}

test('DXF is R12 ASCII in millimetres with CUT/SCORE/ENGRAVE layers', () => {
  const dxf = laserSheetDXF(sheet, { kerf: 0.1 });
  const { pairs, polylines } = parseDXF(dxf);
  assert.deepEqual(pairs.at(-1), [0, 'EOF']);
  assert.ok(pairs.some(([c, v]) => c === 1 && v === 'AC1009'), 'R12');
  const ins = pairs.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  assert.deepEqual(pairs[ins + 1], [70, '4'], 'millimetres');
  for (const name of ['CUT', 'SCORE', 'ENGRAVE']) assert.ok(pairs.some(([c, v]) => c === 2 && v === name), `layer ${name}`);
  const cut = polylines.filter((p) => p.layer === 'CUT');
  assert.equal(cut.length, sheet.placements.reduce((s, pl) => s + pl.part.polys.length, 0), 'one closed polyline per outline/hole');
  for (const p of cut) {
    assert.equal(p.flags & 1, 1, 'closed');
    for (const [x, y] of p.pts) assert.ok(x >= -1 && x <= sheet.w + 1 && y >= -1 && y <= sheet.h + 1, `${x},${y} on sheet`);
  }
  assert.ok(polylines.some((p) => p.layer === 'ENGRAVE'));
});

test('DXF without kerf matches the sheet layout, flipped to y-up', () => {
  const { polylines } = parseDXF(laserSheetDXF(sheet, { kerf: 0, engraveLabels: false }));
  const pl = sheet.placements[0];
  const T = placementTransform(pl);
  const want = pl.part.polys[0].map((p) => { const [x, y] = T(p); return [x, sheet.h - y]; });
  const got = polylines.filter((p) => p.layer === 'CUT')[0].pts;
  assert.equal(got.length, want.length);
  got.forEach((p, i) => { assert.ok(near(p[0], want[i][0], 1e-3) && near(p[1], want[i][1], 1e-3), `${p} vs ${want[i]}`); });
});

test('laser file names', () => {
  assert.equal(laserFileName(sheet, 'dxf'), laserFileName(sheet, 'svg').replace(/svg$/, 'dxf'));
  assert.match(laserFileName(sheet, 'svg'), /^laser-[a-z0-9-]+-\d+\.svg$/);
});
