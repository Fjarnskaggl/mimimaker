// T3 print-then-cut export (#4, format in #53): textured parts packed into
// Cricut Design Space's 6.75 × 9.25 in print area, as SVG (upload, Flatten)
// and as a PDF. Written before the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { setTextureChoice, resolveLook } from '../src/textures/look.js';
import { placementTransform } from '../src/nest.js';
import { partArea, rectPoly } from '../src/geometry.js';
import { MM } from '../src/export/pdf.js';
import {
  PRINT_AREA, PRINT_BLEED, parsePath, pathD, clipToRect, printableParts, splitPart,
  printSheets, printSheetSVG, printCutPDF, kitPrintCutFiles,
} from '../src/export/printcut.js';

const setup = (mut = (k) => k) => {
  const kit = mut(defaultKit());
  return { kit, compiled: compileKit(kit) };
};
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('the print area is Design Space’s 6.75 × 9.25 in with a 1 mm bleed', () => {
  assert.ok(near(PRINT_AREA.w, 171.45) && near(PRINT_AREA.h, 234.95));
  assert.equal(PRINT_BLEED, 1);
});

test('textured parts are the ones whose material has a look', () => {
  const { kit, compiled } = setup();
  const look = resolveLook(kit);
  const got = printableParts(compiled, kit);
  const want = compiled.parts.filter((p) => look[p.material]);
  assert.ok(want.length >= 2, 'default kit has wallpaper and floor');
  assert.deepEqual(got.map((x) => x.part.id), want.map((p) => p.id));
  for (const x of got) assert.equal(x.look.id, look[x.part.material].id);

  const plain = setup((k) => setTextureChoice(setTextureChoice(k, 'paper', 'none'), 'card65', 'none'));
  assert.deepEqual(printableParts(plain.compiled, plain.kit), []);
  assert.deepEqual(printSheets(plain.compiled, plain.kit).sheets, []);
});

test('path helpers: absolute M L H V Q C Z, H/V become L', () => {
  const cmds = parsePath('M1 2H5V7L0 0Q1 1 2 2C3 3 4 4 5 5Z');
  assert.deepEqual(cmds.map((c) => c.op), ['M', 'L', 'L', 'L', 'Q', 'C', 'Z']);
  assert.deepEqual(cmds[1].pts, [[5, 2]]);
  assert.deepEqual(cmds[2].pts, [[5, 7]]);
  assert.equal(pathD(cmds), 'M1 2L5 2L5 7L0 0Q1 1 2 2C3 3 4 4 5 5Z');
  assert.deepEqual(parsePath('M-1.5 0.25L1e-3 -2'), [{ op: 'M', pts: [[-1.5, 0.25]] }, { op: 'L', pts: [[0.001, -2]] }]);
});

test('clipToRect keeps the part of a loop inside a rectangle', () => {
  const sq = rectPoly(0, 0, 10, 10);
  const left = clipToRect(sq, 0, 0, 4, 10);
  assert.ok(near(Math.abs(partArea([left])), 40));
  assert.equal(clipToRect(sq, 20, 20, 5, 5).length, 0);
});

test('oversized parts are split into panels that fit, without losing area', () => {
  const part = { id: 3, name: 'Back wallpaper', group: 'Wallpaper', material: 'paper', w: 300, h: 200, polys: [rectPoly(0, 0, 300, 200), rectPoly(140, 50, 30, 40)], scores: [] };
  const panels = splitPart(part, PRINT_AREA.w - 2 * PRINT_BLEED, PRINT_AREA.h - 2 * PRINT_BLEED);
  assert.ok(panels.length >= 2);
  const W = PRINT_AREA.w - 2 * PRINT_BLEED, H = PRINT_AREA.h - 2 * PRINT_BLEED;
  for (const p of panels) {
    assert.ok((p.w <= W + 1e-9 && p.h <= H + 1e-9) || (p.h <= W + 1e-9 && p.w <= H + 1e-9), `panel ${p.id} fits`);
    assert.match(String(p.id), /^3[a-z]$/);
    assert.ok(p.printSource && p.printSource.w === 300 && p.printSource.h === 200, 'remembers the whole part for seamless texture');
  }
  const total = panels.reduce((s, p) => s + partArea(p.polys), 0);
  assert.ok(near(total, partArea(part.polys), 1e-6), `area kept: ${total}`);
  assert.deepEqual(splitPart({ ...part, w: 50, h: 50, polys: [rectPoly(0, 0, 50, 50)] }, W, H).map((p) => p.id), [3], 'small parts stay whole');
});

test('print sheets: every textured part once, inside the print area with bleed, no overlaps', () => {
  for (const scale of [24, 12]) {
    const { kit, compiled } = setup((k) => ({ ...k, scale }));
    const { sheets } = printSheets(compiled, kit);
    const want = printableParts(compiled, kit).map((x) => x.part.id);
    const placed = sheets.flatMap((s) => s.placements.map((pl) => String(pl.part.id).replace(/[a-z]$/, '')));
    assert.deepEqual([...new Set(placed)].sort(), want.map(String).sort(), `scale 1:${scale}`);
    for (const s of sheets) {
      assert.ok(near(s.w, PRINT_AREA.w) && near(s.h, PRINT_AREA.h));
      assert.ok(s.material && s.index >= 1 && s.index <= s.count);
      assert.ok(s.placements.every((pl) => pl.part.material === s.material.id), 'one material per sheet');
      const boxes = s.placements.map((pl) => ({ x0: pl.x - PRINT_BLEED, y0: pl.y - PRINT_BLEED, x1: pl.x + pl.w + PRINT_BLEED, y1: pl.y + pl.h + PRINT_BLEED }));
      for (const b of boxes) assert.ok(b.x0 >= -1e-9 && b.y0 >= -1e-9 && b.x1 <= s.w + 1e-9 && b.y1 <= s.h + 1e-9, 'bleed inside the print area');
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, 'bleeds do not overlap');
      }
    }
  }
});

test('print sheet SVG: one flattenable group per part, texture clipped to the cut outline', () => {
  const { kit, compiled } = setup();
  const { sheets } = printSheets(compiled, kit);
  const look = resolveLook(kit);
  const paper = sheets.find((s) => s.material.id === 'paper');
  const svg = printSheetSVG(paper, { scale: kit.scale, title: 'Test' });
  assert.match(svg, /width="171\.45mm" height="234\.95mm" viewBox="0 0 171\.45 234\.95"/);
  for (const pl of paper.placements) {
    assert.ok(svg.includes(`id="print-${pl.part.id}"`), `group for #${pl.part.id}`);
    assert.match(svg, new RegExp(`<clipPath id="clip-${pl.part.id}"[^>]*><path clip-rule="evenodd"`));
  }
  assert.doesNotMatch(svg, /<use\b/, 'motifs expanded (Design Space ignores <use>)');
  const [bg, leaf, dot] = look.paper.params.colors;
  assert.ok(svg.includes(`fill="${bg}"`) && svg.includes(`fill="${leaf}"`) && svg.includes(`fill="${dot}"`), 'sprig colours printed');
  // the clip outline is the part's cut line where it sits on the sheet
  const pl = paper.placements[0];
  const [x, y] = placementTransform(pl)(pl.part.polys[0][0]);
  const clip = svg.match(new RegExp(`<clipPath id="clip-${pl.part.id}"[^>]*><path clip-rule="evenodd" d="M([-\\d.]+) ([-\\d.]+)`));
  assert.ok(near(Number(clip[1]), x, 1e-3) && near(Number(clip[2]), y, 1e-3));
});

test('print-then-cut PDF: a how-to page, then one print-area page per sheet with clipped textures', () => {
  const { kit, compiled } = setup();
  const { sheets } = printSheets(compiled, kit);
  const s = latin1(printCutPDF(sheets, { scale: kit.scale, title: kit.name }));
  assert.ok(s.startsWith('%PDF-1.') && s.trimEnd().endsWith('%%EOF'));
  const boxes = [...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(boxes.length, sheets.length + 1);
  for (const [w, h] of boxes.slice(1)) assert.ok(near(w, 171.45 * MM, 0.01) && near(h, 234.95 * MM, 0.01));
  assert.match(s, /W\* n/, 'clipped to the part outline');
  assert.match(s, / c\n/, 'curves for the sprig motif and wood grain');
  assert.match(s, /Design Space/);
  assert.match(s, /Flatten/);
  for (const [, len, body] of s.matchAll(/<<\s*\/Length (\d+)\s*>>\s*stream\n([\s\S]*?)\nendstream/g)) {
    assert.equal(Buffer.byteLength(body, 'latin1'), Number(len), 'stream length');
  }
});

test('zip files: SVG per print sheet, the PDF and a README, under print-then-cut/', () => {
  const { kit, compiled } = setup();
  const files = kitPrintCutFiles(compiled, kit);
  const { sheets } = printSheets(compiled, kit);
  const names = files.map((f) => f.name);
  assert.equal(names.filter((n) => /^print-then-cut\/print-sheet-[a-z0-9-]+-\d+\.svg$/.test(n)).length, sheets.length);
  assert.ok(names.includes('print-then-cut/print-then-cut.pdf'));
  assert.ok(names.includes('print-then-cut/README.txt'));
  const readme = files.find((f) => f.name.endsWith('README.txt')).data;
  assert.match(readme, /6\.75 × 9\.25 in/);
  assert.match(readme, /Flatten/);

  const plain = setup((k) => setTextureChoice(setTextureChoice(k, 'paper', 'none'), 'card65', 'none'));
  assert.deepEqual(kitPrintCutFiles(plain.compiled, plain.kit), []);
});
