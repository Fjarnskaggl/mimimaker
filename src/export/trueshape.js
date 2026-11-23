// True-shape nesting: parts are packed by their real outlines (in 90° steps),
// not their bounding boxes, so L-shapes interlock, triangles pair up and small
// parts drop into window cut-outs.
//
// Method: conservative raster nesting. Each part, grown by half the gap, is
// rasterised onto a grid of `resolution` mm so that every cell it touches is
// marked. Two parts never share a cell, so their outlines are always at least
// `gap` apart. Parts are placed largest first, each at the lowest, then
// left-most free spot over four rotations, on the first sheet where it fits.
//
// `trueShapeCore` is self-contained (no imports, no outer variables) so the
// same code can run in a Web Worker built from its source text.

export function trueShapeCore() {
  const SQRT1_2 = Math.SQRT1_2;

  // Part coordinates (y-up, origin at bbox corner) → placement-local
  // coordinates (y-down, origin at the rotated bbox's top-left). Matches
  // placementTransform in src/nest.js.
  function local(angle, w, h) {
    if (angle === 90) return ([x, y]) => [y, x];
    if (angle === 180) return ([x, y]) => [w - x, y];
    if (angle === 270) return ([x, y]) => [h - y, w - x];
    return ([x, y]) => [x, h - y];
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /**
   * Occupancy mask of a part at an angle: rows of [a, b] cell runs relative
   * to the cell holding the part's top-left corner.
   */
  function makeMask(part, angle, r, d) {
    const swap = angle === 90 || angle === 270;
    const W = swap ? part.h : part.w, H = swap ? part.w : part.h;
    const T = local(angle, part.w, part.h);
    const loops = part.polys.map((l) => l.map(T));
    const pad = Math.ceil((d + r) / r) + 1;
    const i0 = -pad, j0 = -pad;
    const nW = Math.ceil(W / r) + 2 * pad, nH = Math.ceil(H / r) + 2 * pad;
    const occ = new Uint8Array(nW * nH);
    // interior (even-odd over all loops, so holes stay free)
    for (let j = 0; j < nH; j++) {
      const yc = (j + j0 + 0.5) * r;
      const xs = [];
      for (const l of loops) for (let k = 0; k < l.length; k++) {
        const [ax, ay] = l[k], [bx, by] = l[(k + 1) % l.length];
        if ((ay > yc) !== (by > yc)) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] / r - 0.5) - i0);
        const to = Math.min(nW - 1, Math.floor(xs[k + 1] / r - 0.5) - i0);
        for (let i = from; i <= to; i++) occ[j * nW + i] = 1;
      }
    }
    // a band of radius d (+ half a cell diagonal) around every edge
    const rad = d + r * SQRT1_2 + 1e-9;
    for (const l of loops) for (let k = 0; k < l.length; k++) {
      const [ax, ay] = l[k], [bx, by] = l[(k + 1) % l.length];
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - rad) / r) - i0);
      const x1 = Math.min(nW - 1, Math.floor((Math.max(ax, bx) + rad) / r) - i0);
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - rad) / r) - j0);
      const y1 = Math.min(nH - 1, Math.floor((Math.max(ay, by) + rad) / r) - j0);
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        if (occ[j * nW + i]) continue;
        if (distToSegment((i + i0 + 0.5) * r, (j + j0 + 0.5) * r, ax, ay, bx, by) <= rad) occ[j * nW + i] = 1;
      }
    }
    const rows = [];
    for (let j = 0; j < nH; j++) {
      const runs = [];
      let start = -1;
      for (let i = 0; i <= nW; i++) {
        const on = i < nW && occ[j * nW + i];
        if (on && start < 0) start = i;
        else if (!on && start >= 0) { runs.push([start + i0, i - 1 + i0]); start = -1; }
      }
      if (runs.length) rows.push({ k: j + j0, runs });
    }
    return { angle, W, H, rows };
  }

  function newSheet(GW, GH) {
    return { occ: Array.from({ length: GH }, () => new Uint8Array(GW)), pre: Array.from({ length: GH }, () => new Int32Array(GW + 1)), items: [] };
  }

  /** -1 if the mask fits at (cx, cy), else the next cx worth trying. */
  function collide(sheet, GW, GH, mask, cx, cy) {
    for (const { k, runs } of mask.rows) {
      const y = cy + k;
      if (y < 0 || y >= GH) continue;
      const pre = sheet.pre[y];
      for (const [a, b] of runs) {
        const lo = Math.max(0, cx + a), hi = Math.min(GW - 1, cx + b);
        if (lo > hi || pre[hi + 1] - pre[lo] === 0) continue;
        const occ = sheet.occ[y];
        let c = hi;
        while (!occ[c]) c--;
        return c - a + 1;
      }
    }
    return -1;
  }

  function stamp(sheet, GW, GH, mask, cx, cy) {
    for (const { k, runs } of mask.rows) {
      const y = cy + k;
      if (y < 0 || y >= GH) continue;
      const occ = sheet.occ[y];
      for (const [a, b] of runs) for (let c = Math.max(0, cx + a); c <= Math.min(GW - 1, cx + b); c++) occ[c] = 1;
      const pre = sheet.pre[y];
      for (let c = 0; c < GW; c++) pre[c + 1] = pre[c] + occ[c];
    }
  }

  /** Lowest-then-leftmost spot over all masks, or null. */
  function bestSpot(sheet, GW, GH, UW, UH, r, masks) {
    let best = null;
    for (const mask of masks) {
      const maxCx = Math.floor((UW - mask.W) / r + 1e-9), maxCy = Math.floor((UH - mask.H) / r + 1e-9);
      if (maxCx < 0 || maxCy < 0) continue;
      for (let cy = 0; cy <= maxCy; cy++) {
        const bottom = cy * r + mask.H;
        if (best && bottom > best.bottom + 1e-9) break;
        let cx = 0, found = -1;
        while (cx <= maxCx) {
          const next = collide(sheet, GW, GH, mask, cx, cy);
          if (next < 0) { found = cx; break; }
          cx = Math.max(cx + 1, next);
        }
        if (found >= 0) {
          if (!best || bottom < best.bottom - 1e-9 || found < best.cx) best = { mask, cx: found, cy, bottom };
          break;
        }
      }
    }
    return best;
  }

  /**
   * parts: [{ polys, w, h }] (part coordinates). Returns
   * { sheets: [[{ index, angle, x, y, w, h }]], oversize: [index] }.
   */
  function nest(parts, sheetW, sheetH, { margin = 6, gap = 3, resolution = 1, angles = [0, 90, 180, 270] } = {}) {
    const r = resolution, d = gap / 2;
    const UW = sheetW - 2 * margin, UH = sheetH - 2 * margin;
    const GW = Math.max(1, Math.ceil(UW / r - 1e-9)), GH = Math.max(1, Math.ceil(UH / r - 1e-9));
    const order = parts.map((p, index) => index)
      .sort((a, b) => parts[b].w * parts[b].h - parts[a].w * parts[a].h || Math.max(parts[b].w, parts[b].h) - Math.max(parts[a].w, parts[a].h) || a - b);
    const sheets = [], oversize = [];
    for (const index of order) {
      const p = parts[index];
      const fits = angles.filter((a) => {
        const swap = a === 90 || a === 270;
        return (swap ? p.h : p.w) <= UW + 1e-9 && (swap ? p.w : p.h) <= UH + 1e-9;
      });
      if (!fits.length) { oversize.push(index); continue; }
      const masks = fits.map((a) => makeMask(p, a, r, d));
      let spot = null, sheet = null;
      for (const s of sheets) {
        spot = bestSpot(s, GW, GH, UW, UH, r, masks);
        if (spot) { sheet = s; break; }
      }
      if (!spot) {
        sheet = newSheet(GW, GH);
        spot = bestSpot(sheet, GW, GH, UW, UH, r, masks);
        if (!spot) { oversize.push(index); continue; }
        sheets.push(sheet);
      }
      stamp(sheet, GW, GH, spot.mask, spot.cx, spot.cy);
      sheet.items.push({ index, angle: spot.mask.angle, x: margin + spot.cx * r, y: margin + spot.cy * r, w: spot.mask.W, h: spot.mask.H });
    }
    return { sheets: sheets.map((s) => s.items), oversize };
  }

  return { nest, makeMask };
}

/** Plain data the core needs (also what a worker receives). */
export const nestInput = (parts) => parts.map((p) => ({ polys: p.polys, w: p.w, h: p.h }));

/** Turn core output (indices) back into sheets of placements like packParts. */
export function hydrate(raw, parts, sheetW, sheetH) {
  return {
    sheets: raw.sheets.map((items) => ({
      w: sheetW, h: sheetH,
      placements: items.map((it) => ({ part: parts[it.index], angle: it.angle, rot: it.angle === 90 || it.angle === 270, x: it.x, y: it.y, w: it.w, h: it.h })),
    })),
    oversize: raw.oversize.map((i) => parts[i]),
  };
}

let core = null;

/** True-shape nest in this thread. Same result shape as packParts. */
export function nestTrueShape(parts, sheetW, sheetH, opts = {}) {
  core ||= trueShapeCore();
  return hydrate(core.nest(nestInput(parts), sheetW, sheetH, opts), parts, sheetW, sheetH);
}

/**
 * Source of a Web Worker that runs the core. Built from the function's own
 * text, so it also works in the single-file build where there is no separate
 * worker file to load. Message in: { id, jobs: [{ parts, w, h, opts }] };
 * message out: { id, results: [core output per job] }.
 */
export function workerSource() {
  return `const core = (${trueShapeCore.toString()})();
onmessage = (e) => {
  const { id, jobs } = e.data;
  postMessage({ id, results: jobs.map((j) => core.nest(j.parts, j.w, j.h, j.opts || {})) });
};
`;
}
