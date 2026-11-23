// SVG output: Cricut Design Space cut files and on-screen sheet previews.
//
// Cut files use millimetre units and three colour-coded groups so Design
// Space imports them as separate layers: black = Cut, magenta = Score,
// blue = Draw (part numbers, optional).

import { placementTransform } from './nest.js';
import { strokeText } from './labels.js';

export const LAYER_COLORS = { cut: '#000000', score: '#d81b60', draw: '#1e63c6' };

const f = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const pathD = (polys, T) => polys.map((poly) => 'M' + poly.map((p) => T(p).map(f).join(' ')).join('L') + 'Z').join('');
const linesD = (segs, T) => segs.map((seg) => 'M' + seg.map((p) => T(p).map(f).join(' ')).join('L')).join('');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Design Space–ready SVG for one sheet. */
export function sheetCutSVG(sheet, { drawLabels = false, title = '' } = {}) {
  const cut = [], score = [], draw = [];
  for (const pl of sheet.placements) {
    const T = placementTransform(pl);
    const p = pl.part;
    cut.push(`<path id="part-${p.id}" d="${pathD(p.polys, T)}"/>`);
    if (p.scores.length) score.push(`<path id="score-${p.id}" d="${linesD(p.scores, T)}"/>`);
    if (drawLabels) {
      // keep numbers upright on the mat even when the part is rotated
      const [lx, ly] = T([p.label.x, p.label.y]);
      const segs = strokeText(String(p.id), lx, ly, Math.min(p.label.size, 4));
      draw.push(`<path id="label-${p.id}" d="${linesD(segs, ([x, y]) => [x, 2 * ly - y])}"/>`);
    }
  }
  const w = f(sheet.w), h = f(sheet.h);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<title>${esc(title)}</title>
<g id="cut" fill="none" fill-rule="evenodd" stroke="${LAYER_COLORS.cut}" stroke-width="0.25">
${cut.join('\n')}
</g>
${score.length ? `<g id="score" fill="none" stroke="${LAYER_COLORS.score}" stroke-width="0.25">\n${score.join('\n')}\n</g>` : ''}
${draw.length ? `<g id="draw" fill="none" stroke="${LAYER_COLORS.draw}" stroke-width="0.3" stroke-linecap="round">\n${draw.join('\n')}\n</g>` : ''}
</svg>
`;
}

/** Coloured preview of a sheet with part numbers (for the UI and the guide). */
export function sheetPreviewSVG(sheet, { highlight = null, className = '' } = {}) {
  const color = sheet.material.color;
  const items = sheet.placements.map((pl) => {
    const T = placementTransform(pl);
    const p = pl.part;
    const [lx, ly] = T([p.label.x, p.label.y]);
    const size = Math.max(2.2, Math.min(p.label.size * 1.15, 6));
    const hl = highlight === p.id ? ' hl' : '';
    return `<g class="part${hl}" data-part="${p.id}"><title>#${p.id} ${esc(p.group)} – ${esc(p.name)} (${f(p.w)}×${f(p.h)} mm)</title>`
      + `<path class="cut" d="${pathD(p.polys, T)}" fill="${color}" fill-rule="evenodd"/>`
      + (p.scores.length ? `<path class="score" d="${linesD(p.scores, T)}"/>` : '')
      + `<text x="${f(lx)}" y="${f(ly)}" font-size="${f(size)}" dominant-baseline="central" text-anchor="middle">${p.id}</text></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" class="sheet-svg ${className}" viewBox="0 0 ${f(sheet.w)} ${f(sheet.h)}" role="img" aria-label="${esc(sheet.material.name)} sheet ${sheet.index}">`
    + `<rect class="sheet-bg" x="0" y="0" width="${f(sheet.w)}" height="${f(sheet.h)}" rx="2"/>`
    + items.join('')
    + '</svg>';
}

export function sheetFileName(sheet) {
  const slug = sheet.material.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `sheet-${slug}-${sheet.index}.svg`;
}
