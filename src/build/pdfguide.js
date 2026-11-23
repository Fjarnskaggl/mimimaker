// The assembly guide as a PDF (#91), for the creator bundle: the creator's
// handle and licence on the cover (no app branding, no watermark), the bill
// of materials, the parts list, and every build step with its exploded view.
// Built from the same steps, bill and pictures as the HTML guide, with the
// dependency-free writer in src/export/pdf.js.
//
//   guidePDF(kit, compiled, { creator, licence, remix?, paper? }) → Uint8Array

import { PdfCanvas, pdfDocument, MM } from '../export/pdf.js';
import { PAPER } from '../export/handcut.js';
import { renderScene } from '../preview3d.js';
import { ledRows, powerName } from '../ledmap.js';
import { formatMinutes } from '../make.js';
import { buildSteps, stepJointKinds } from './steps.js';
import { jointGraph } from './joints.js';
import { billOfMaterials, costText, totalText } from './bom.js';
import { explodedViewSVG, faceParts } from './exploded.js';

const MARGIN = 15;
const PT = 25.4 / 72; // mm per point
// Helvetica (WinAnsi) has no €, ₹, ₩ or ł: spell them out rather than print "?"
const SPELL = { '€': 'EUR ', '₹': 'Rs ', '₩': 'KRW ', 'ł': 'l', '→': '->', '✓': 'v', '≥': '>= ', '≤': '<= ' };
const clean = (s) => String(s ?? '').replace(/[€₹₩ł→✓≥≤]/g, (c) => SPELL[c]).replace(/ {2,}/g, ' ');

/** Rough Helvetica advance per character, in mm, at `size` points. */
const charW = (size) => size * 0.56 * PT; // a little wide: capitals run past 0.5 em

/** Words wrapped to lines of at most `width` mm. */
export function wrap(str, width, size) {
  const max = Math.max(8, Math.floor(width / charW(size)));
  const out = [];
  for (const para of clean(str).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      let w = word;
      while (w.length > max) { // a single overlong word: break it
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, max));
        w = w.slice(max);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= max) line += ` ${w}`;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

const hex = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(s || '');
  return m ? m[1].split(',').slice(0, 3).map(Number) : hex(s);
};
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Draw one of our own renderScene SVGs into the box (x, y, w, h) mm, keeping its aspect. */
export function drawSVG(c, svg, x, y, w, h) {
  const vb = (svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 10 10').split(/\s+/).map(Number);
  const k = Math.min(w / vb[2], h / vb[3]);
  const ox = x + (w - vb[2] * k) / 2 - vb[0] * k, oy = y + (h - vb[3] * k) / 2 - vb[1] * k;
  for (const tag of svg.match(/<path\b[^>]*>/g) || []) {
    const d = attr(tag, 'd');
    const fill = rgb(attr(tag, 'fill'));
    if (!d || !fill) continue;
    const op = Number(attr(tag, 'fill-opacity') ?? 1);
    // The writer has no transparency. Nearly see-through faces (ghosted walls,
    // light halos) would hide what's behind them, so they're only outlined;
    // the rest are blended over white paper.
    if (/class="halo"/.test(tag)) continue; // night-glow halos need real transparency
    const ghost = op < 0.2;
    const [r, g, b] = fill.map((v) => 1 - op * (1 - v / 255));
    c.save();
    if (!ghost) {
      c.fillColor(r, g, b);
      for (const sub of d.split('M').filter(Boolean)) {
        const pts = sub.replace(/Z/g, '').split('L').map((p) => p.trim().split(/\s+/).map(Number));
        c.polyline(pts.map(([px, py]) => [ox + px * k, oy + py * k]), true);
      }
      c.fill();
    }
    const stroke = rgb(attr(tag, 'stroke'));
    if (stroke) {
      const sop = Number((attr(tag, 'stroke') || '').match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1] ?? 1);
      const [sr, sg, sb] = stroke.map((v) => 1 - sop * (1 - v / 255));
      c.strokeColor(sr, sg, sb).lineWidth(0.12);
      for (const sub of d.split('M').filter(Boolean)) {
        const pts = sub.replace(/Z/g, '').split('L').map((p) => p.trim().split(/\s+/).map(Number));
        c.polyline(pts.map(([px, py]) => [ox + px * k, oy + py * k]), true);
      }
      c.stroke();
    }
    c.restore();
  }
}

/** A flowing layout: text and blocks that start a new page when they don't fit. */
class Flow {
  constructor(W, H, footer) {
    this.W = W; this.H = H; this.footer = footer;
    this.pages = [];
    this.newPage();
  }
  get width() { return this.W - 2 * MARGIN; }
  newPage() {
    if (this.c) this.finish();
    this.c = new PdfCanvas(this.W, this.H);
    this.y = MARGIN;
  }
  finish() {
    const n = this.pages.length + 1;
    const room = Math.floor((this.width * 0.6) / charW(8));
    const name = this.footer.length + 10 > room ? `${this.footer.slice(0, Math.max(4, room - 13))}...` : this.footer;
    this.c.fillColor(0.45, 0.42, 0.4).text(this.W - MARGIN, this.H - 8, 8, `${name} · page ${n}`, { align: 'right' });
    this.pages.push(this.c.page());
    this.c = null;
  }
  room(h) { if (this.y + h > this.H - MARGIN - 6) this.newPage(); }
  /** Wrapped text; returns the height used. */
  text(str, { size = 9.5, x = MARGIN, width = this.width, color = [0.17, 0.14, 0.13], gap = 1.4, bold = false } = {}) {
    const lh = size * PT * 1.35;
    const lines = wrap(str, width, size);
    for (const line of lines) {
      this.room(lh);
      this.y += lh;
      if (bold) {
        // fill + thin stroke in the same colour: bold without a second font, and the text isn't doubled
        this.c.save().fillColor(...color).strokeColor(...color).lineWidth(size * 0.012);
        this.c.ops.push('2 Tr');
        this.c.text(x, this.y - lh * 0.25, size, line);
        this.c.ops.push('0 Tr');
        this.c.restore();
      } else this.c.fillColor(...color).text(x, this.y - lh * 0.25, size, line);
    }
    this.y += gap;
    return lines.length * lh + gap;
  }
  heading(str, size = 14) {
    this.room(size * PT * 1.35 + 12);
    this.y += 4;
    this.text(str, { size, bold: true, gap: 1 });
    this.c.strokeColor(0.9, 0.87, 0.83).lineWidth(0.4).moveTo(MARGIN, this.y).lineTo(this.W - MARGIN, this.y).stroke();
    this.y += 3;
  }
  /** Rows of columns at x offsets (mm from the margin); the first row is a header. */
  table(rows, cols, { size = 8.5 } = {}) {
    const lh = size * PT * 1.45;
    rows.forEach((row, i) => {
      const cells = row.map((cell, k) => wrap(cell, (cols[k + 1] ?? this.width) - cols[k] - 2, size));
      const h = Math.max(...cells.map((l) => l.length)) * lh + 1;
      this.room(h);
      const color = i === 0 ? [0.48, 0.42, 0.38] : [0.17, 0.14, 0.13];
      cells.forEach((lines, k) => lines.forEach((line, j) => {
        this.c.fillColor(...color).text(MARGIN + cols[k], this.y + (j + 1) * lh - lh * 0.25, size, line);
      }));
      this.y += h;
      this.c.strokeColor(0.9, 0.87, 0.83).lineWidth(0.2).moveTo(MARGIN, this.y).lineTo(this.W - MARGIN, this.y).stroke();
    });
    this.y += 3;
  }
}

export function guidePDF(kit, compiled, { creator = '', licence = '', remix = '', paper = 'a4' } = {}) {
  const [W, H] = PAPER[paper] || PAPER.a4;
  const { dims, parts, sheets, usedMats } = compiled;
  const title = clean(kit.name || 'My room');
  const steps = buildSteps(kit, compiled);
  const graph = jointGraph(kit, compiled);
  let owners = null;
  const view = (n) => {
    try { owners ||= faceParts(kit, compiled); return explodedViewSVG(kit, compiled, steps, n, { graph, owners }); } catch (e) { console.warn('exploded view skipped:', e); return null; }
  };
  let bom = null;
  try { bom = billOfMaterials(kit, compiled, steps); } catch (e) { console.warn('bill of materials skipped:', e); }

  const f = new Flow(W, H, title);

  // ---------------------------------------------------------------- cover
  f.y = MARGIN + 6;
  f.text(title, { size: 24, bold: true, gap: 2 });
  if (creator) f.text(`Designed by ${creator}${licence ? ` · ${licence}` : ''}`, { size: 12, gap: 1 });
  else if (licence) f.text(licence, { size: 12, gap: 1 });
  if (remix) f.text(`Remix of ${remix}`, { size: 10, color: [0.48, 0.42, 0.38] });
  f.text(`1:${kit.scale} miniature room kit · finished size ${dims.W.toFixed(0)} × ${dims.D.toFixed(0)} × ${dims.H.toFixed(0)} mm · ${parts.length} parts on ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`, { size: 10, color: [0.48, 0.42, 0.38] });
  if (bom) f.text(`${bom.difficulty.level} · about ${formatMinutes(bom.time.totalMin)} to make · about ${totalText(bom)}`, { size: 10, color: [0.48, 0.42, 0.38], gap: 4 });
  const heroH = Math.min(130, H - f.y - 90);
  drawSVG(f.c, renderScene(compiled.faces3d), MARGIN, f.y, f.width, heroH);
  f.y += heroH + 6;
  f.table([['Material', 'Thick', 'Sheets'], ...usedMats.map((m) => {
    const n = sheets.filter((s) => s.material.id === m.id).length;
    return [m.name, `${m.thickness} mm`, `${n} × ${m.sheet[0]}×${m.sheet[1]} mm`];
  })], [0, 95, 125]);

  // ------------------------------------------------------- what you need
  if (bom) {
    f.newPage();
    f.heading('Bill of materials');
    const row = (i) => [String(i.qty), i.name, i.note, costText(i.cost)];
    f.table([['Qty', 'Item', 'Note', 'Est. cost'], ...bom.sheets.map(row), ...bom.supplies.map(row), ...bom.lights.map(row),
      ['', 'Estimated total', '', totalText(bom)]], [0, 10, 78, 145]);
    f.text(`${bom.difficulty.level}: ${bom.difficulty.reasons.join(', ')}.`, { bold: true });
    f.text(`About ${formatMinutes(bom.time.totalMin)} in all: cutting ${formatMinutes(bom.time.cutMin)}, assembly ${formatMinutes(bom.time.assemblyMin)}, waiting for glue ${formatMinutes(bom.time.glueMin)}.`);
    f.text(bom.note, { size: 8, color: [0.48, 0.42, 0.38] });
  }

  // --------------------------------------------------------- parts list
  f.heading('Parts');
  f.table([['#', 'Part', 'Group', 'Material'], ...parts.map((p) => [`#${p.id}`, p.name, p.group, usedMats.find((m) => m.id === p.material)?.name || ''])], [0, 12, 82, 130]);

  // ----------------------------------------------------------- assembly
  f.newPage();
  f.heading('Assembly');
  const matOf = new Map(compiled.groups.map((g) => [g.title, g.material]));
  for (const st of steps) {
    const svg = st.kind === 'info' ? null : view(st.n);
    const meta = [
      matOf.get(st.group),
      st.parts.length ? `part${st.parts.length === 1 ? '' : 's'} ${st.parts.map((p) => `#${p}`).join(', ')}` : '',
      stepJointKinds(st).join(', '),
      st.kind !== 'info' && st.cureMin ? `let the glue set ${st.cureMin} min` : '',
    ].filter(Boolean).join(' · ');
    const pic = svg ? { w: 62, h: 46 } : null;
    const textW = pic ? f.width - pic.w - 4 : f.width;
    // keep a step's heading, its picture and its first lines together
    f.room(Math.max(pic ? pic.h : 0, 22) + 4);
    const top = f.y;
    f.c.fillColor(0.75, 0.38, 0.23).rect(MARGIN, f.y + 0.6, 6, 6).fill();
    f.c.fillColor(1, 1, 1).text(MARGIN + 3, f.y + 5, 9, String(st.n), { align: 'center' });
    f.text(st.title, { size: 11.5, x: MARGIN + 8, width: textW - 8, bold: true, gap: 0.6 });
    if (meta) f.text(meta, { size: 8, x: MARGIN + 8, width: textW - 8, color: [0.48, 0.42, 0.38], gap: 1 });
    if (pic && f.y >= top) drawSVG(f.c, svg, MARGIN + textW + 4, top, pic.w, pic.h);
    st.text.forEach((t, i) => f.text(`${i + 1}. ${t}`, { size: 9.5, x: MARGIN + 8, width: textW - 8, gap: 0.8 }));
    if (pic && f.y < top + pic.h && f.y >= top) f.y = top + pic.h;
    f.y += 4;
  }

  // ------------------------------------------------------------ lighting
  const rows = ledRows(compiled);
  if (rows.length) {
    f.heading('Lighting');
    f.text(`${rows.length} LED${rows.length === 1 ? '' : 's'} powered by a ${powerName(compiled.lighting).toLowerCase()}. The wire holes are already cut.`);
    f.table([['LED', 'Name', 'Mounted on', 'Colour', 'Lead needed'], ...rows.map((r) => [r.label, r.name || '-', r.where || '', r.color, `≥ ${r.leadCm} cm`])], [0, 14, 62, 110, 145]);
  }

  f.finish();
  return pdfDocument(f.pages, { title: clean(`${title}${creator ? ` by ${creator}` : ''} – assembly guide`) });
}
