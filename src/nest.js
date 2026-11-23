// Packing parts onto material sheets: shelf packing (instant, by bounding
// box) and true-shape nesting (src/export/trueshape.js).

import { nestTrueShape } from './export/trueshape.js';

export const SHEET_MARGIN = 6;
export const PART_GAP = 3;

/**
 * Pack parts (each with w, h in mm) onto as few sheetW × sheetH sheets as
 * possible using first-fit decreasing-height shelves. Parts may rotate 90°.
 * Sheet coordinates are y-down; placements give each part's top-left corner.
 */
export function packParts(parts, sheetW, sheetH, { margin = SHEET_MARGIN, gap = PART_GAP } = {}) {
  const W = sheetW - 2 * margin, H = sheetH - 2 * margin;
  const items = [], oversize = [];
  for (const part of parts) {
    const fitsN = part.w <= W && part.h <= H;
    const fitsR = part.h <= W && part.w <= H;
    if (!fitsN && !fitsR) { oversize.push(part); continue; }
    const rot = fitsR && (!fitsN || part.h > part.w);
    items.push({ part, rot, w: rot ? part.h : part.w, h: rot ? part.w : part.h });
  }
  items.sort((a, b) => b.h - a.h || b.w - a.w);

  const sheets = [];
  const place = (sh, it) => {
    for (const shelf of sh.shelves) {
      if (it.h <= shelf.h && shelf.x + it.w <= W) {
        sh.placements.push({ part: it.part, rot: it.rot, w: it.w, h: it.h, x: margin + shelf.x, y: margin + shelf.y });
        shelf.x += it.w + gap;
        return true;
      }
    }
    if (sh.usedH + it.h <= H) {
      const shelf = { y: sh.usedH, h: it.h, x: it.w + gap };
      sh.shelves.push(shelf);
      sh.usedH += it.h + gap;
      sh.placements.push({ part: it.part, rot: it.rot, w: it.w, h: it.h, x: margin, y: margin + shelf.y });
      return true;
    }
    return false;
  };
  for (const it of items) {
    if (!sheets.some((sh) => place(sh, it))) {
      const sh = { shelves: [], usedH: 0, placements: [] };
      sheets.push(sh);
      place(sh, it);
    }
  }
  return { sheets: sheets.map((s) => ({ w: sheetW, h: sheetH, placements: s.placements })), oversize };
}

/**
 * Map a point in part coordinates (y-up) to sheet coordinates (y-down).
 * Placements turn by `angle` (0/90/180/270); older ones only carry `rot`
 * (true = 90°).
 */
export function placementTransform(pl) {
  const { w: pw, h: ph } = pl.part;
  const angle = pl.angle ?? (pl.rot ? 90 : 0);
  const turn = angle === 90 ? ([px, py]) => [py, pw - px]
    : angle === 180 ? ([px, py]) => [pw - px, ph - py]
      : angle === 270 ? ([px, py]) => [ph - py, px]
        : ([px, py]) => [px, py];
  return (p) => {
    const [x, y] = turn(p);
    return [pl.x + x, pl.y + (pl.h - y)];
  };
}

/**
 * Best of shelf packing and true-shape nesting: the true-shape layout when it
 * needs no more sheets, otherwise the shelf layout. `method` says which.
 */
export function nestParts(parts, sheetW, sheetH, { margin = SHEET_MARGIN, gap = PART_GAP, ...opts } = {}) {
  const shelf = packParts(parts, sheetW, sheetH, { margin, gap });
  const shaped = nestTrueShape(parts, sheetW, sheetH, { margin, gap, ...opts });
  return shaped.sheets.length <= shelf.sheets.length && shaped.oversize.length <= shelf.oversize.length
    ? { ...shaped, method: 'true-shape' }
    : { ...shelf, method: 'shelf' };
}
