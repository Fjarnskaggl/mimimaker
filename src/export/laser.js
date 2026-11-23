// Laser cutter export: kerf-compensated SVG and DXF.
//
// A laser burns away a strip of material (the kerf) centred on the path it
// follows. To keep parts at their nominal size the cut path is moved out of
// the material by kerf/2: outlines grow, holes and slots shrink. Finger-joint
// notches and fit-test slots therefore come out exactly as designed.
//
// Layers (as colours in SVG, as named layers in DXF), the convention most
// laser software (LightBurn, xTool Creative Space, LaserGRBL) maps to
// separate operations:
//   cut     #ff0000 / CUT      – through-cut, kerf-compensated
//   score   #0000ff / SCORE    – fold lines: low-power vector score, not offset
//   engrave #000000 / ENGRAVE  – single-stroke part numbers (line engrave)

import { placementTransform } from '../nest.js';
import { strokeText } from '../labels.js';
import { cleanPolygon, polygonArea, pointInPolygon } from '../geometry.js';

export const LASER_COLORS = { cut: '#ff0000', score: '#0000ff', engrave: '#000000' };
export const DEFAULT_KERF = 0.1; // mm, a typical diode/CO₂ laser on thin board
const MITER_LIMIT = 2; // × |d|; sharper convex corners are bevelled

/**
 * Offset a simple closed polygon by d (mm): positive grows it, negative
 * shrinks it, regardless of winding. Corners are mitred; convex corners
 * sharper than the miter limit are bevelled.
 */
export function offsetPolygon(poly, d) {
  const pts = cleanPolygon(poly);
  const n = pts.length;
  if (!d || n < 3) return pts.map((p) => [p[0], p[1]]);
  const s = Math.sign(polygonArea(pts)) || 1;
  // outward unit normal of edge i (pts[i] → pts[i+1])
  const normals = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    return [(s * dy) / len, (-s * dx) / len];
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const n1 = normals[(i + n - 1) % n], n2 = normals[i];
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    const cross = n1[0] * n2[1] - n1[1] * n2[0]; // >0 where the outline turns the way it winds
    const k = 1 + dot;
    const bulges = cross * s * d > 0; // the offset corner sticks out past p
    if (bulges && (k < 1e-12 || Math.sqrt(2 / k) > MITER_LIMIT)) {
      out.push([p[0] + n1[0] * d, p[1] + n1[1] * d], [p[0] + n2[0] * d, p[1] + n2[1] * d]);
    } else {
      const m = d / Math.max(k, 1e-12);
      out.push([p[0] + (n1[0] + n2[0]) * m, p[1] + (n1[1] + n2[1]) * m]);
    }
  }
  return out;
}

/** How many of the other loops enclose loop i (even = outline, odd = hole). */
function depths(polys) {
  return polys.map((poly, i) => polys.reduce((c, other, j) => {
    if (j === i || Math.abs(polygonArea(other)) <= Math.abs(polygonArea(poly))) return c;
    const inside = poly.filter((p) => pointInPolygon(p, other)).length;
    return c + (inside * 2 > poly.length ? 1 : 0);
  }, 0));
}

/** Kerf-compensate a part's loops: outlines grow and holes shrink by kerf/2. */
export function kerfOffset(polys, kerf) {
  if (!kerf) return polys;
  const dep = depths(polys);
  return polys.map((poly, i) => offsetPolygon(poly, (dep[i] % 2 ? -kerf : kerf) / 2));
}

const f = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Everything on a sheet in sheet coordinates (mm, y-down):
 * cut loops (closed), score and engrave polylines (open).
 */
export function laserGeometry(sheet, { kerf = DEFAULT_KERF, engraveLabels = true } = {}) {
  const cut = [], score = [], engrave = [];
  for (const pl of sheet.placements) {
    const T = placementTransform(pl);
    const p = pl.part;
    cut.push({ id: p.id, loops: kerfOffset(p.polys, kerf).map((poly) => poly.map(T)) });
    if (p.scores?.length) score.push({ id: p.id, lines: p.scores.map((seg) => seg.map(T)) });
    if (engraveLabels && p.label) {
      // keep numbers upright on the sheet even when the part is rotated
      const [lx, ly] = T([p.label.x, p.label.y]);
      const segs = strokeText(String(p.id), lx, ly, Math.min(p.label.size, 4));
      engrave.push({ id: p.id, lines: segs.map((seg) => seg.map(([x, y]) => [x, 2 * ly - y])) });
    }
  }
  return { cut, score, engrave };
}

const loopsD = (loops) => loops.map((l) => 'M' + l.map((p) => p.map(f).join(' ')).join('L') + 'Z').join('');
const linesD = (lines) => lines.map((l) => 'M' + l.map((p) => p.map(f).join(' ')).join('L')).join('');

/** Laser-ready SVG for one sheet (mm units, hairline strokes). */
export function laserSheetSVG(sheet, { kerf = DEFAULT_KERF, engraveLabels = true, title = '' } = {}) {
  const g = laserGeometry(sheet, { kerf, engraveLabels });
  const w = f(sheet.w), h = f(sheet.h);
  const group = (id, items, body) => items.length
    ? `<g id="${id}" fill="none" stroke="${LASER_COLORS[id]}" stroke-width="0.01">\n${items.map(body).join('\n')}\n</g>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<title>${esc(title)}</title>
<desc>Laser cut file. Red = cut (kerf ${f(kerf)} mm compensated), blue = score, black = engrave. Import at 100%.</desc>
${group('cut', g.cut, (c) => `<path id="part-${c.id}" d="${loopsD(c.loops)}"/>`)}${group('score', g.score, (c) => `<path id="score-${c.id}" d="${linesD(c.lines)}"/>`)}${group('engrave', g.engrave, (c) => `<path id="label-${c.id}" d="${linesD(c.lines)}"/>`)}</svg>
`;
}

// ---------------------------------------------------------------------- DXF
// AutoCAD R12 ASCII: the most widely readable flavour (LightBurn, RDWorks,
// Inkscape, LibreCAD, Fusion). Units are millimetres, y-up.

const DXF_LAYERS = [['CUT', 1], ['SCORE', 5], ['ENGRAVE', 7]]; // ACI colours: red, blue, white/black

/** Laser-ready DXF for one sheet. */
export function laserSheetDXF(sheet, { kerf = DEFAULT_KERF, engraveLabels = true } = {}) {
  const g = laserGeometry(sheet, { kerf, engraveLabels });
  const out = [];
  const pair = (code, value) => out.push(String(code), String(value));
  const Y = (y) => sheet.h - y;
  const polyline = (layer, pts, closed) => {
    pair(0, 'POLYLINE'); pair(8, layer); pair(66, 1);
    pair(10, 0); pair(20, 0); pair(30, 0); pair(70, closed ? 1 : 0);
    for (const [x, y] of pts) { pair(0, 'VERTEX'); pair(8, layer); pair(10, f(x)); pair(20, f(Y(y))); pair(30, 0); }
    pair(0, 'SEQEND'); pair(8, layer);
  };

  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1009');
  pair(9, '$INSUNITS'); pair(70, 4);
  pair(9, '$MEASUREMENT'); pair(70, 1);
  pair(9, '$EXTMIN'); pair(10, 0); pair(20, 0); pair(30, 0);
  pair(9, '$EXTMAX'); pair(10, f(sheet.w)); pair(20, f(sheet.h)); pair(30, 0);
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, DXF_LAYERS.length);
  for (const [name, color] of DXF_LAYERS) {
    pair(0, 'LAYER'); pair(2, name); pair(70, 0); pair(62, color); pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const c of g.cut) for (const loop of c.loops) polyline('CUT', loop, true);
  for (const c of g.score) for (const line of c.lines) polyline('SCORE', line, false);
  for (const c of g.engrave) for (const line of c.lines) polyline('ENGRAVE', line, false);
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return out.join('\n') + '\n';
}

export function laserFileName(sheet, ext = 'svg') {
  const slug = sheet.material.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `laser-${slug}-${sheet.index}.${ext}`;
}
