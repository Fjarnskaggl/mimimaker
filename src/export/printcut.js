// Print-then-cut: textured parts (wallpaper, flooring, anything whose
// material has a look from src/textures/look.js) packed into Cricut Design
// Space's print area, so a home printer prints the texture and the Cricut
// cuts around it. Format agreed with T6 in #53.
//
//   SVG per print sheet: one group per part, its texture clipped to the cut
//     outline. In Design Space: upload, select a part, Flatten, Make It.
//   PDF: a how-to page, then each print sheet at 100% with a 1 mm bleed and
//     thin cut lines, for other printers or cutting by hand.

import { textureShapes, symbolShapes, TEXTURES } from '../textures/index.js';
import { resolveLook } from '../textures/look.js';
import { packParts, placementTransform } from '../nest.js';
import { bbox, polygonArea } from '../geometry.js';
import { kerfOffset } from './laser.js';
import { PdfCanvas, pdfDocument } from './pdf.js';

/** Design Space's Print Then Cut area: 6.75 × 9.25 in. */
export const PRINT_AREA = { w: 6.75 * 25.4, h: 9.25 * 25.4 };
/** Texture printed past each cut line, in mm. */
export const PRINT_BLEED = 1;
const PART_GAP = 2; // between neighbouring bleeds

const f = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sheet';

// ------------------------------------------------------------------ paths
/** Absolute M L H V Q C Z path data → [{ op, pts }]; H and V become L. */
export function parsePath(d) {
  const tokens = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  const cmds = [];
  let i = 0, op = null, cur = [0, 0], start = [0, 0];
  const num = () => {
    const v = Number(tokens[i++]);
    if (!Number.isFinite(v)) throw new Error(`Bad path data "${d}"`);
    return v;
  };
  const ARGS = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, Z: 0 };
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) {
      op = tokens[i++];
      if (!(op in ARGS)) throw new Error(`Unsupported path command "${op}"`);
      if (op === 'Z') { cmds.push({ op: 'Z' }); cur = start; continue; }
    } else if (op === 'M') op = 'L'; // implicit lineto after moveto
    else if (!op || op === 'Z') throw new Error(`Bad path data "${d}"`);
    if (op === 'M') { cur = [num(), num()]; start = cur; cmds.push({ op: 'M', pts: [cur] }); }
    else if (op === 'L') { cur = [num(), num()]; cmds.push({ op: 'L', pts: [cur] }); }
    else if (op === 'H') { cur = [num(), cur[1]]; cmds.push({ op: 'L', pts: [cur] }); }
    else if (op === 'V') { cur = [cur[0], num()]; cmds.push({ op: 'L', pts: [cur] }); }
    else if (op === 'Q') { const c = [num(), num()]; cur = [num(), num()]; cmds.push({ op: 'Q', pts: [c, cur] }); }
    else if (op === 'C') { const a = [num(), num()], b = [num(), num()]; cur = [num(), num()]; cmds.push({ op: 'C', pts: [a, b, cur] }); }
  }
  return cmds;
}

/** [{ op, pts }] → SVG path data. */
export function pathD(cmds) {
  return cmds.map((c) => c.op + (c.pts ? c.pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' ') : '')).join('');
}

const mapCmds = (cmds, T) => cmds.map((c) => (c.pts ? { op: c.op, pts: c.pts.map(T) } : c));
const loopCmds = (loop) => loop.map((p, i) => ({ op: i ? 'L' : 'M', pts: [p] })).concat({ op: 'Z' });

/** Sutherland–Hodgman: the part of a closed loop inside an axis-aligned rectangle. */
export function clipToRect(loop, x, y, w, h) {
  const edges = [
    [(p) => p[0] >= x, (a, b) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x + w, (a, b) => [x + w, a[1] + ((b[1] - a[1]) * (x + w - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y, (a, b) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y]],
    [(p) => p[1] <= y + h, (a, b) => [a[0] + ((b[0] - a[0]) * (y + h - a[1])) / (b[1] - a[1]), y + h]],
  ];
  let out = loop;
  for (const [inside, cross] of edges) {
    const pts = out;
    out = [];
    pts.forEach((p, i) => {
      const prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(p)) {
        if (!inside(prev)) out.push(cross(prev, p));
        out.push(p);
      } else if (inside(prev)) out.push(cross(prev, p));
    });
    if (!out.length) return [];
  }
  return Math.abs(polygonArea(out)) > 1e-9 ? out : [];
}

// ------------------------------------------------------------- the parts
const KNOWN = new Set(TEXTURES.map((t) => t.id));
const suffix = (k) => (k < 26 ? '' : String.fromCharCode(96 + Math.floor(k / 26))) + String.fromCharCode(97 + (k % 26));
/** Parts that get printed: [{ part, look }] where the part's material has a look. */
export function printableParts(compiled, kit) {
  const look = resolveLook(kit);
  for (const [mat, spec] of Object.entries(look)) if (!KNOWN.has(spec?.id)) delete look[mat]; // e.g. a retired texture in an old kit
  return compiled.parts.filter((p) => look[p.material]).map((part) => ({ part, look: look[part.material] }));
}

/**
 * A part too big for a W × H area, cut into a grid of panels that fit (ids
 * 7a, 7b…). Each panel remembers where it sat in the whole part
 * (printSource) so the texture runs on across the seams. Parts that fit come
 * back unchanged.
 */
export function splitPart(part, W, H) {
  // the same strict test as packParts, so nothing that passes here is rejected there
  const fits = (w, h) => (w <= W && h <= H) || (h <= W && w <= H);
  if (fits(part.w, part.h)) return [part];
  W -= 1e-6; H -= 1e-6; // panels a float-hair under the limit
  const grids = [[Math.ceil(part.w / W), Math.ceil(part.h / H)], [Math.ceil(part.w / H), Math.ceil(part.h / W)]];
  const [cols, rows] = grids.sort((a, b) => a[0] * a[1] - b[0] * b[1])[0];
  const pw = part.w / cols, ph = part.h / rows;
  const panels = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const polys = part.polys.map((loop) => clipToRect(loop, c * pw, r * ph, pw, ph));
    if (!polys[0].length) continue;
    const kept = polys.filter((l) => l.length);
    const bb = bbox(kept);
    panels.push({ part: kept, bb });
  }
  return panels.map(({ part: polys, bb }, k) => {
    const w = bb.w, h = bb.h;
    return {
      ...part,
      id: `${part.id}${suffix(k)}`,
      name: `${part.name} (panel ${k + 1} of ${panels.length})`,
      polys: polys.map((l) => l.map(([x, y]) => [x - bb.x0, y - bb.y0])),
      scores: [], w, h,
      label: { x: w / 2, y: h / 2, size: 3 },
      printSource: { w: part.w, h: part.h, dx: bb.x0, dy: bb.y0 },
    };
  });
}

/**
 * Textured parts packed onto print-area sheets, one material per sheet.
 * Placements carry their look. Returns { sheets, split, oversize }: ids of
 * parts cut into panels, and of any that still could not be placed.
 */
export function printSheets(compiled, kit, { area = PRINT_AREA, bleed = PRINT_BLEED, gap = PART_GAP } = {}) {
  const items = printableParts(compiled, kit);
  const sheets = [], split = [], oversize = [];
  const mats = compiled.usedMats || [];
  for (const mat of mats) {
    const mine = items.filter((x) => x.part.material === mat.id);
    if (!mine.length) continue;
    const lookOf = new Map();
    const parts = mine.flatMap(({ part, look }) => {
      const panels = splitPart(part, area.w - 2 * bleed, area.h - 2 * bleed);
      if (panels.length > 1) split.push(part.id);
      for (const p of panels) lookOf.set(p, look);
      return panels;
    });
    const packed = packParts(parts, area.w, area.h, { margin: bleed, gap: 2 * bleed + gap });
    oversize.push(...packed.oversize.map((p) => p.id)); // should stay empty: splitPart makes everything fit
    packed.sheets.forEach((s, i) => sheets.push({
      ...s,
      placements: s.placements.map((pl) => ({ ...pl, look: lookOf.get(pl.part) })),
      material: mat, index: i + 1, count: packed.sheets.length,
    }));
  }
  return { sheets, split, oversize };
}

// ---------------------------------------------------------- texture shapes
const hexRGB = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
};
const mix = (a, b, k) => { // a over b at opacity k
  const [x, y] = [hexRGB(a), hexRGB(b)];
  return '#' + x.map((v, i) => Math.round((v * k + y[i] * (1 - k)) * 255).toString(16).padStart(2, '0')).join('');
};

/**
 * A placement's texture as sheet-mm drawables:
 * { kind: 'path', cmds, fill?, opacity?, flat?, stroke?, width? } | { kind: 'circle', cx, cy, r, fill }.
 * `flat` is the fill with its opacity baked in (for the PDF).
 */
export function placementTexture(pl, { scale = 12, bleed = PRINT_BLEED } = {}) {
  const look = pl.look;
  const src = pl.part.printSource || { w: pl.part.w, h: pl.part.h, dx: 0, dy: 0 };
  const tex = textureShapes(look.id, { width: src.w + 2 * bleed, height: src.h + 2 * bleed, scale, seed: look.seed ?? 1, params: look.params || {} });
  const T = placementTransform(pl);
  // texture box (y down, origin top-left of the bleed box) → part (y up) → sheet
  const M = ([tx, ty]) => T([tx - bleed - src.dx, src.h + bleed - ty - src.dy]);
  const bg = tex.shapes[0].fill;
  const x0 = pl.x - bleed, y0 = pl.y - bleed, x1 = pl.x + pl.w + bleed, y1 = pl.y + pl.h + bleed;
  const visible = (pts, pad = 0) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return Math.max(...xs) + pad >= x0 && Math.min(...xs) - pad <= x1 && Math.max(...ys) + pad >= y0 && Math.min(...ys) - pad <= y1;
  };
  const out = [];
  const addPath = (cmds, s) => {
    const pts = cmds.flatMap((c) => c.pts || []);
    if (!pts.length || !visible(pts, s.width || 0)) return;
    out.push({ kind: 'path', cmds, fill: s.fill, opacity: s.opacity, flat: s.fill && s.opacity != null && s.opacity < 1 ? mix(s.fill, bg, s.opacity) : s.fill, stroke: s.stroke, width: s.width });
  };
  for (const s of tex.shapes) {
    if (s.type === 'rect') {
      addPath(mapCmds(loopCmds([[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]]), M), s);
    } else if (s.type === 'path') {
      addPath(mapCmds(parsePath(s.d), M), s);
    } else if (s.type === 'use') {
      const a = (s.angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      const U = ([u, v]) => M([s.x + s.size * (u * cos - v * sin), s.y + s.size * (u * sin + v * cos)]);
      for (const m of symbolShapes(s.symbol, tex.params)) {
        if (m.type === 'circle') {
          const [cx, cy] = U([m.cx, m.cy]), r = m.r * s.size;
          if (visible([[cx, cy]], r)) out.push({ kind: 'circle', cx, cy, r, fill: m.fill });
        } else {
          addPath(mapCmds(parsePath(m.d), U), { ...m, width: m.width != null ? m.width * s.size : undefined });
        }
      }
    }
  }
  return out;
}

const outlineD = (pl, polys = pl.part.polys) => {
  const T = placementTransform(pl);
  return polys.map((loop) => pathD(loopCmds(loop.map(T)))).join('');
};

// --------------------------------------------------------------------- SVG
/** Design Space SVG for one print sheet: each part a group, texture clipped to its outline. */
export function printSheetSVG(sheet, { scale = 12, title = '' } = {}) {
  const groups = sheet.placements.map((pl) => {
    const id = pl.part.id;
    const body = placementTexture(pl, { scale }).map((d) => {
      if (d.kind === 'circle') return `<circle cx="${f(d.cx)}" cy="${f(d.cy)}" r="${f(d.r)}" fill="${d.fill}"/>`;
      return `<path d="${pathD(d.cmds)}" fill="${d.fill || 'none'}"${d.fill && d.opacity != null && d.opacity < 1 ? ` fill-opacity="${f(d.opacity)}"` : ''}`
        + `${d.stroke ? ` stroke="${d.stroke}" stroke-width="${f(d.width)}" stroke-linecap="round"` : ''}/>`;
    }).join('');
    return `<g id="print-${esc(id)}"><title>#${esc(id)} ${esc(pl.part.name)}</title>`
      + `<clipPath id="clip-${esc(id)}" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="${outlineD(pl)}"/></clipPath>`
      + `<g clip-path="url(#clip-${esc(id)})">${body}</g></g>`;
  });
  const w = f(sheet.w), h = f(sheet.h);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<title>${esc(title)}</title>
${groups.join('\n')}
</svg>
`;
}

export const printSheetFileName = (sheet) => `print-sheet-${slug(sheet.material.name)}-${sheet.index}.svg`;

// --------------------------------------------------------------------- PDF
const HOWTO = [
  ['Cricut Design Space (Print Then Cut)', true],
  ['1. Upload each print-sheet SVG from the print-then-cut folder (New project > Upload).'],
  ['2. Add it to the canvas at its original size. Each part is a group: select it'],
  ['    and click Flatten, so Design Space prints the texture and cuts the outline.'],
  ['3. Make It, then Send to Printer with Add Bleed switched on. Design Space adds'],
  ['    its own registration box around the parts: keep it clean and uncovered.'],
  ['4. Load the printed sheet on the mat as Design Space shows, and cut.'],
  ['    If cuts drift from the print, run Print Then Cut Calibration first.'],
  [''],
  ['Other printers, or cutting by hand', true],
  ['The next pages are the 6.75 x 9.25 in print area at 100% (actual size).'],
  ['Turn off "fit to page". Textures run 1 mm past the thin cut lines (bleed).'],
  ['Print on the material named on each page, then cut on the lines.'],
  ['Sheet pages come after these instructions, in this order:'],
];

function howToPages(sheets, title) {
  const pages = [];
  let c = new PdfCanvas(PRINT_AREA.w, PRINT_AREA.h);
  let y = 14;
  const line = (text) => { // wraps long lines, continues on a new page at the bottom
    const words = text.split(' ');
    let cur = '';
    const flush = () => {
      if (y > PRINT_AREA.h - 10) { pages.push(c.page()); c = new PdfCanvas(PRINT_AREA.w, PRINT_AREA.h); y = 14; }
      c.fillColor(0.2, 0.2, 0.2).text(10, y, 7.5, cur);
      y += 4.6;
      cur = '    ';
    };
    for (const w of words) {
      if (cur.trim() && (cur + ' ' + w).length > 100) flush();
      cur = cur.trim() ? `${cur} ${w}` : `${cur}${w}`;
    }
    flush();
  };
  c.fillColor(0, 0, 0).text(10, y, 12, `${title ? `${title} - ` : ''}print then cut`);
  y += 9;
  for (const [line, bold] of HOWTO) {
    c.fillColor(bold ? 0 : 0.2, bold ? 0 : 0.2, bold ? 0 : 0.2).text(10, y, bold ? 9 : 7.5, line);
    y += bold ? 6 : 4.6;
  }
  y += 4;
  c.fillColor(0, 0, 0).text(10, y, 9, 'Sheets');
  y += 6;
  const lines = sheets.map((s) => `${s.material.name} ${s.index}/${s.count} - parts ${s.placements.map((pl) => `#${pl.part.id}`).join(' ')}`);
  lines.forEach((l, k) => line(`Sheet page ${k + 1}: ${l}`));
  pages.push(c.page());
  return pages;
}

function sheetPage(sheet, { scale, bleed }) {
  const c = new PdfCanvas(sheet.w, sheet.h);
  const draw = (cmds) => {
    for (const cmd of cmds) {
      const [a, b, p] = cmd.pts || [];
      if (cmd.op === 'M') c.moveTo(...a);
      else if (cmd.op === 'L') c.lineTo(...a);
      else if (cmd.op === 'C') c.curveTo(...a, ...b, ...p);
      else if (cmd.op === 'Q') { // quadratic → cubic from the current point
        const q0 = cmd.from;
        c.curveTo(q0[0] + (2 / 3) * (a[0] - q0[0]), q0[1] + (2 / 3) * (a[1] - q0[1]), b[0] + (2 / 3) * (a[0] - b[0]), b[1] + (2 / 3) * (a[1] - b[1]), ...b);
      } else if (cmd.op === 'Z') c.closePath();
    }
  };
  const withFrom = (cmds) => { // remember each Q's start point
    let cur = [0, 0], start = [0, 0];
    return cmds.map((cmd) => {
      const out = cmd.op === 'Q' ? { ...cmd, from: cur } : cmd;
      if (cmd.op === 'M') start = cmd.pts[0];
      if (cmd.op === 'Z') cur = start; else cur = cmd.pts[cmd.pts.length - 1];
      return out;
    });
  };
  for (const pl of sheet.placements) {
    const T = placementTransform(pl);
    c.save();
    for (const loop of kerfOffset(pl.part.polys, 2 * bleed)) c.polyline(loop.map(T), true);
    c.clip();
    for (const d of placementTexture(pl, { scale, bleed })) {
      if (d.kind === 'circle') {
        const k = 0.5523 * d.r, { cx, cy, r } = d;
        c.fillColor(...hexRGB(d.fill)).moveTo(cx + r, cy)
          .curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r).curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
          .curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r).curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
          .closePath().fill();
        continue;
      }
      const cmds = withFrom(d.cmds);
      if (d.flat) { c.fillColor(...hexRGB(d.flat)); draw(cmds); c.fill(); }
      if (d.stroke) { c.strokeColor(...hexRGB(d.stroke)).lineWidth(d.width).lineCap(1); draw(cmds); c.stroke(); }
    }
    c.restore();
  }
  // thin cut lines on top
  c.strokeColor(0.15, 0.15, 0.15).lineWidth(0.12).lineCap(0).dash([]);
  for (const pl of sheet.placements) {
    const T = placementTransform(pl);
    for (const loop of pl.part.polys) c.polyline(loop.map(T), true);
  }
  c.stroke();
  return c.page();
}

/** How-to page plus one print-area page per sheet. */
export function printCutPDF(sheets, { scale = 12, title = '', bleed = PRINT_BLEED } = {}) {
  const pages = [...howToPages(sheets, title), ...sheets.map((s) => sheetPage(s, { scale, bleed }))];
  return pdfDocument(pages, { title: title ? `${title} – print then cut` : 'Print then cut' });
}

export function printCutReadme(sheets, split = [], oversize = []) {
  return 'Print then cut: textured parts (wallpaper, flooring) to print on a home printer and cut on a Cricut.\n'
    + 'Every sheet fits Design Space\'s 6.75 × 9.25 in print area.\n\n'
    + 'Design Space: upload each print-sheet SVG, keep its size, select each part and click Flatten,\n'
    + 'then Make It and send to your printer with Add Bleed on. Leave Design Space\'s registration box\n'
    + 'uncovered when you load the sheet. If cuts drift from the print, run Print Then Cut Calibration.\n\n'
    + 'print-then-cut.pdf has the same sheets at 100% with a 1 mm bleed and thin cut lines,\n'
    + 'for other printers or cutting by hand. Turn off "fit to page" when printing.\n'
    + (split.length ? `\nParts ${split.map((id) => `#${id}`).join(', ')} are bigger than the print area, so they come in panels (a, b, ...). Butt the panels together when you glue them; the pattern lines up across the seam.\n` : '')
    + (oversize.length ? `\nParts ${oversize.map((id) => `#${id}`).join(', ')} could not be placed in the print area and are missing here: cut them from the plain sheets.\n` : '')
    + '\nThese parts are also on the plain cut sheets: cut either the plain or the printed version.\n'
    + `\nSheets: ${sheets.map((s) => `${s.material.name} ${s.index}/${s.count}`).join(', ')}\n`;
}

/** The print-then-cut folder for the kit zip; [] when nothing is textured. */
export function kitPrintCutFiles(compiled, kit) {
  const { sheets, split, oversize } = printSheets(compiled, kit);
  if (!sheets.length) return [];
  const scale = kit.scale;
  return [
    ...sheets.map((s) => ({ name: `print-then-cut/${printSheetFileName(s)}`, data: printSheetSVG(s, { scale, title: `${kit.name} – print ${s.material.name} ${s.index}` }) })),
    { name: 'print-then-cut/print-then-cut.pdf', data: printCutPDF(sheets, { scale, title: kit.name }) },
    { name: 'print-then-cut/README.txt', data: printCutReadme(sheets, split, oversize) },
  ];
}
