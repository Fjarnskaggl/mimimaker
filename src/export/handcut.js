// Hand-cut templates: every cut sheet printed at 1:1 on A4 or Letter, split
// into overlapping tiles when a sheet is bigger than the paper. Print, trim
// along the dashed lines, tape the tiles together, glue onto the board and cut
// with a craft knife.

import { PdfCanvas, pdfDocument } from './pdf.js';
import { placementTransform } from '../nest.js';

export const PAPER = { a4: [210, 297], letter: [215.9, 279.4] };
export const PAPER_NAMES = { a4: 'A4', letter: 'US Letter' };

/**
 * Tiles covering a W × H mm sheet with printable-area-sized pieces of paper.
 * Neighbouring tiles overlap by `overlap` mm. Tiles are row-major.
 */
export function tileGrid(W, H, paper = 'a4', { margin = 10, overlap = 10 } = {}) {
  const [pw, ph] = PAPER[paper].map((v) => v - 2 * margin);
  const count = (L, P) => (L <= P ? 1 : Math.ceil((L - overlap) / (P - overlap)));
  const cols = count(W, pw), rows = count(H, ph);
  const tiles = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    tiles.push({ col, row, x: col * (pw - overlap), y: row * (ph - overlap), w: pw, h: ph });
  }
  return { cols, rows, tiles };
}

/**
 * The part of a sheet worth printing: the parts' bounding box plus `pad` mm,
 * clamped to the sheet. Empty sheet margins would only cost paper.
 */
export function contentBox(sheet, pad = 3) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pl of sheet.placements) {
    x0 = Math.min(x0, pl.x); y0 = Math.min(y0, pl.y);
    x1 = Math.max(x1, pl.x + pl.w); y1 = Math.max(y1, pl.y + pl.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: sheet.w, h: sheet.h };
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(sheet.w, x1 + pad); y1 = Math.min(sheet.h, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const tileName = (t) => `${String.fromCharCode(65 + t.row)}${t.col + 1}`;

/** One page description per tile: { width, height, content, tileCount }. */
export function handCutPages(sheets, { paper = 'a4', margin = 10, overlap = 10, title = '' } = {}) {
  const [PW, PH] = PAPER[paper];
  const pages = [];
  sheets.forEach((sheet, k) => {
    const box = contentBox(sheet);
    const grid = tileGrid(box.w, box.h, paper, { margin, overlap });
    const n = grid.tiles.length;
    for (const tile of grid.tiles) {
      const c = new PdfCanvas(PW, PH);
      const at = (x, y) => [margin + x - box.x - tile.x, margin + y - box.y - tile.y];
      // header and footer live in the margins, outside the clip
      c.fillColor(0, 0, 0);
      c.text(margin, margin - 3.5, 8, `${title ? `${title} · ` : ''}Sheet ${k + 1}: ${sheet.material.name} ${sheet.index}/${sheet.count} · tile ${tileName(tile)} of ${n}${n > 1 ? ` (${grid.rows} rows × ${grid.cols} columns)` : ''}`);
      const barY = PH - margin + 5;
      c.strokeColor(0, 0, 0).lineWidth(0.3).dash([]);
      c.moveTo(margin, barY).lineTo(margin + 50, barY).stroke();
      for (const t of [0, 10, 20, 30, 40, 50]) c.moveTo(margin + t, barY - (t % 50 ? 1 : 2)).lineTo(margin + t, barY).stroke();
      c.text(margin + 53, barY + 1, 7, 'Print at 100% (actual size): this bar must measure 50 mm.');

      c.save().clipRect(margin, margin, tile.w, tile.h);
      // sheet outline
      c.strokeColor(0.7, 0.7, 0.7).lineWidth(0.2).dash([]);
      c.rect(...at(box.x, box.y), box.w, box.h).stroke();
      // cut lines, then score (fold) lines, then part numbers
      c.strokeColor(0, 0, 0).lineWidth(0.3).dash([]);
      for (const pl of sheet.placements) {
        const T = placementTransform(pl);
        for (const loop of pl.part.polys) c.polyline(loop.map((p) => at(...T(p))), true);
      }
      c.stroke();
      const scored = sheet.placements.filter((pl) => pl.part.scores?.length);
      if (scored.length) {
        c.strokeColor(0.85, 0.1, 0.38).lineWidth(0.25).dash([1.5, 1]);
        for (const pl of scored) {
          const T = placementTransform(pl);
          for (const seg of pl.part.scores) c.polyline(seg.map((p) => at(...T(p))));
        }
        c.stroke().dash([]);
      }
      c.fillColor(0.12, 0.39, 0.78);
      for (const pl of sheet.placements) {
        if (!pl.part.label) continue;
        const [x, y] = at(...placementTransform(pl)([pl.part.label.x, pl.part.label.y]));
        const size = Math.max(5, Math.min(10, pl.part.label.size * 2.4));
        c.text(x, y + size * 0.35 / 2.83, size, String(pl.part.id), { align: 'center' });
      }
      c.restore();

      // overlap guides: where the neighbouring tiles start and end
      if (n > 1) {
        c.save().clipRect(margin, margin, tile.w, tile.h);
        c.strokeColor(0.45, 0.45, 0.45).lineWidth(0.2).dash([2, 1.5]);
        const x0 = tile.x, x1 = tile.x + tile.w, y0 = tile.y, y1 = tile.y + tile.h;
        const lines = [];
        if (tile.col > 0) lines.push([[x0 + overlap, y0], [x0 + overlap, y1]]);
        if (tile.col < grid.cols - 1) lines.push([[x1 - overlap, y0], [x1 - overlap, y1]]);
        if (tile.row > 0) lines.push([[x0, y0 + overlap], [x1, y0 + overlap]]);
        if (tile.row < grid.rows - 1) lines.push([[x0, y1 - overlap], [x1, y1 - overlap]]);
        const g = (x, y) => [margin + x - tile.x, margin + y - tile.y]; // tile coordinates
        for (const [a, b] of lines) c.moveTo(...g(...a)).lineTo(...g(...b));
        c.stroke().dash([]).restore();
        c.fillColor(0.3, 0.3, 0.3);
        c.text(PW - margin, margin - 3.5, 7, 'Overlap the dashed bands of neighbouring tiles, then tape.', { align: 'right' });
      }
      pages.push({ ...c.page(), tileCount: n });
    }
  });
  return pages;
}

/** The whole kit as a printable hand-cut PDF. */
export function handCutPDF(sheets, opts = {}) {
  return pdfDocument(handCutPages(sheets, opts), { title: opts.title ? `${opts.title} – hand-cut templates` : 'Hand-cut templates' });
}

export const handCutFileName = (paper = 'a4') => `hand-cut-templates-${paper}.pdf`;
