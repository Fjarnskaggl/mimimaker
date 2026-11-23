// T3 in-repo PDF writer and hand-cut templates. Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { placementTransform } from '../src/nest.js';
import { rectPoly } from '../src/geometry.js';
import { PdfCanvas, pdfDocument, MM } from '../src/export/pdf.js';
import { PAPER, tileGrid, handCutPages, handCutPDF, contentBox } from '../src/export/handcut.js';

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

/** Minimal structural PDF check: header, objects at their xref offsets, trailer. */
function parsePDF(bytes) {
  const s = latin1(bytes);
  assert.ok(s.startsWith('%PDF-1.'), 'header');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'EOF marker');
  const startxref = Number(s.match(/startxref\s+(\d+)\s+%%EOF\s*$/)[1]);
  assert.ok(s.slice(startxref).startsWith('xref'), 'startxref points at xref');
  const [, first, count] = s.slice(startxref).match(/^xref\s+(\d+)\s+(\d+)/);
  const rows = s.slice(startxref).split(/\r?\n/).slice(2, 2 + Number(count));
  rows.slice(1).forEach((row, i) => {
    const off = Number(row.slice(0, 10));
    assert.ok(s.slice(off).startsWith(`${Number(first) + i + 1} 0 obj`), `object ${i + 1} at offset ${off}`);
  });
  const streams = [...s.matchAll(/<<\s*\/Length (\d+)\s*>>\s*stream\n([\s\S]*?)\nendstream/g)];
  for (const [, len, body] of streams) assert.equal(Buffer.byteLength(body, 'latin1'), Number(len), 'stream length');
  const pages = [...s.matchAll(/\/Type \/Page\b[^s]/g)].length;
  const declared = Number(s.match(/\/Type \/Pages[\s\S]*?\/Count (\d+)/)[1]);
  assert.equal(pages, declared, 'page count');
  const boxes = [...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  return { text: s, pages, boxes, streams: streams.map((m) => m[2]) };
}

// --------------------------------------------------------------- PDF writer
test('pdfDocument writes a valid multi-page PDF with correct xref offsets', () => {
  const a = new PdfCanvas(210, 297);
  a.moveTo(10, 10); a.lineTo(100, 10); a.stroke();
  a.text(20, 30, 12, 'Hello (world) \\ – × é');
  const b = new PdfCanvas(100, 50);
  b.rect(0, 0, 100, 50); b.stroke();
  const pdf = parsePDF(pdfDocument([a.page(), b.page()]));
  assert.equal(pdf.pages, 2);
  assert.deepEqual(pdf.boxes[0].map((v) => Math.round(v * 100) / 100), [595.28, 841.89]);
  assert.match(pdf.text, /\/BaseFont \/Helvetica/);
  assert.match(pdf.streams[0], /\(Hello \\\(world\\\) \\\\ - x \xe9\) Tj/, 'escaped Latin-1 text');
});

test('PdfCanvas works in mm from the top-left corner', () => {
  const c = new PdfCanvas(210, 297);
  c.moveTo(10, 20); c.lineTo(30, 20); c.stroke();
  const [x, y] = c.page().content.match(/([\d.]+) ([\d.]+) m/).slice(1).map(Number);
  assert.ok(Math.abs(x - 10 * MM) < 0.01);
  assert.ok(Math.abs(y - (297 - 20) * MM) < 0.01, 'y flipped');
});

// ------------------------------------------------------------------ tiling
test('tileGrid covers the sheet with overlapping printable-size tiles', () => {
  for (const paper of Object.keys(PAPER)) for (const [W, H] of [[279, 279], [305, 305], [150, 100], [597, 292]]) {
    const margin = 10, overlap = 10;
    const g = tileGrid(W, H, paper, { margin, overlap });
    const [pw, ph] = PAPER[paper].map((v) => v - 2 * margin);
    assert.equal(g.tiles.length, g.cols * g.rows);
    for (const t of g.tiles) {
      assert.ok(t.w <= pw + 1e-9 && t.h <= ph + 1e-9, 'tile fits the printable area');
    }
    // every point of the sheet is on some tile; neighbours overlap by exactly `overlap`
    for (let x = 0; x <= W; x += W / 37) for (let y = 0; y <= H; y += H / 41) {
      assert.ok(g.tiles.some((t) => x >= t.x - 1e-9 && x <= t.x + t.w + 1e-9 && y >= t.y - 1e-9 && y <= t.y + t.h + 1e-9), `${paper} ${W}×${H}: ${x},${y} uncovered`);
    }
    for (const t of g.tiles) {
      const right = g.tiles.find((u) => u.row === t.row && u.col === t.col + 1);
      if (right) assert.ok(Math.abs(t.x + t.w - right.x - overlap) < 1e-9, 'horizontal overlap');
      const below = g.tiles.find((u) => u.col === t.col && u.row === t.row + 1);
      if (below) assert.ok(Math.abs(t.y + t.h - below.y - overlap) < 1e-9, 'vertical overlap');
    }
    if (W <= pw && H <= ph) assert.equal(g.tiles.length, 1, 'fits on one page');
  }
  const g = tileGrid(279, 279, 'a4', { margin: 10, overlap: 10 });
  assert.deepEqual([g.cols, g.rows], [2, 2]);
});

// ---------------------------------------------------------- hand-cut pages
const compiled = compileKit(defaultKit());

test('hand-cut PDF: one page per tile, A4 or Letter, valid structure', () => {
  for (const paper of ['a4', 'letter']) {
    const pages = handCutPages(compiled.sheets, { paper, title: 'Test kit' });
    const expected = compiled.sheets.reduce((n, s) => { const b = contentBox(s); return n + tileGrid(b.w, b.h, paper).tiles.length; }, 0);
    assert.equal(pages.length, expected, paper);
    const pdf = parsePDF(handCutPDF(compiled.sheets, { paper, title: 'Test kit' }));
    assert.equal(pdf.pages, expected);
    const [pw, ph] = PAPER[paper].map((v) => v * MM);
    for (const [w, h] of pdf.boxes) assert.ok(Math.abs(w - pw) < 0.01 && Math.abs(h - ph) < 0.01);
  }
});

test('each tile page is clipped, labelled, has a scale check and alignment marks', () => {
  const pages = handCutPages(compiled.sheets, { paper: 'a4', title: 'Test kit' });
  for (const p of pages) {
    assert.match(p.content, / re W n/, 'clipped to the tile');
    assert.match(p.content, /\(.*Sheet \d+.*tile [A-Z]\d+ of \d+.*\) Tj/, 'tile label');
    assert.match(p.content, /50 mm/, 'scale bar');
    assert.match(p.content, /print at 100%/i);
  }
  const multi = pages.filter((p) => p.tileCount > 1);
  assert.ok(multi.length > 0);
  for (const p of multi) assert.match(p.content, /\[[\d. ]+\] 0 d/, 'dashed overlap/alignment lines on tiled pages');
});

test('only the area the parts use is printed (no empty sheet margins)', () => {
  for (const s of compiled.sheets) {
    const b = contentBox(s);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= s.w + 1e-9 && b.y + b.h <= s.h + 1e-9);
    for (const pl of s.placements) for (const loop of pl.part.polys) for (const [x, y] of loop.map(placementTransform(pl))) {
      assert.ok(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h, 'every outline inside the printed box');
    }
  }
  // a full 279 mm chipboard sheet fits two A4 pages instead of four
  const big = compiled.sheets.find((s) => s.w === 279 && s.h === 279);
  const b = contentBox(big);
  assert.ok(tileGrid(b.w, b.h, 'a4').tiles.length < tileGrid(big.w, big.h, 'a4').tiles.length);
});

test('part outlines land at the right place on a single-tile page', () => {
  const p = { id: 1, polys: [rectPoly(0, 0, 40, 20)], scores: [], w: 40, h: 20, label: { x: 20, y: 10, size: 3 }, name: 'Box', group: 'G' };
  const sheet = { w: 120, h: 80, material: { name: 'Card' }, index: 1, count: 1, placements: [{ part: p, angle: 0, rot: false, x: 15, y: 25, w: 40, h: 20 }] };
  const [page] = handCutPages([sheet], { paper: 'a4', margin: 10 });
  const T = placementTransform(sheet.placements[0]);
  const [sx, sy] = T(p.polys[0][0]); // sheet mm, y-down
  const b = contentBox(sheet);
  const want = [(10 + sx - b.x) * MM, (297 - (10 + sy - b.y)) * MM].map((v) => v.toFixed(2));
  assert.ok(page.content.includes(`${want[0]} ${want[1]} m`), `expected moveto ${want.join(' ')}`);
});

// ------------------------------------------------------------ app wiring
import { defaultPaper, kitHandCutFiles } from '../src/export/handcut.js';

test('paper follows the locale: Letter in the US/Canada, A4 elsewhere', () => {
  assert.equal(defaultPaper('en-US'), 'letter');
  assert.equal(defaultPaper('en-CA'), 'letter');
  assert.equal(defaultPaper('es-MX'), 'letter');
  assert.equal(defaultPaper('en-GB'), 'a4');
  assert.equal(defaultPaper('sv'), 'a4');
  assert.equal(defaultPaper(undefined), 'a4');
});

test('the kit zip gets hand-cut templates on both A4 and Letter', () => {
  const files = kitHandCutFiles(compiled.sheets, { title: 'Test kit' });
  assert.deepEqual(files.map((f) => f.name), ['hand-cut/hand-cut-templates-a4.pdf', 'hand-cut/hand-cut-templates-letter.pdf']);
  for (const f of files) parsePDF(f.data);
});
