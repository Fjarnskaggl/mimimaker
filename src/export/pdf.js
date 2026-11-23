// A tiny PDF writer: vector paths, rectangles, clipping, dashes and
// Helvetica text. No compression, no images, no dependencies, so it runs
// anywhere (browser, worker, Node) and its output is easy to test.
//
// PdfCanvas works in millimetres from the page's top-left corner (y down),
// like the SVG cut files; it converts to PDF points (y up) as it writes.

export const MM = 72 / 25.4; // points per millimetre

const num = (v) => {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
};

// Helvetica's built-in encoding is WinAnsi: keep Latin-1, map common
// typographic characters to ASCII, replace anything else.
const SUBST = { '–': '-', '—': '-', '−': '-', '×': 'x', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '·': '\xb7', '°': '\xb0' };
export function pdfString(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = SUBST[ch] ?? ch;
    for (const d of c) {
      const code = d.codePointAt(0);
      const safe = code >= 32 && code <= 255 && code !== 127 ? d : '?';
      out += safe === '(' || safe === ')' || safe === '\\' ? `\\${safe}` : safe;
    }
  }
  return `(${out})`;
}

export class PdfCanvas {
  constructor(widthMm, heightMm) {
    this.w = widthMm;
    this.h = heightMm;
    this.ops = [];
  }
  X(x) { return num(x * MM); }
  Y(y) { return num((this.h - y) * MM); }
  save() { this.ops.push('q'); return this; }
  restore() { this.ops.push('Q'); return this; }
  lineWidth(mm) { this.ops.push(`${num(mm * MM)} w`); return this; }
  strokeColor(r, g, b) { this.ops.push(`${num(r)} ${num(g)} ${num(b)} RG`); return this; }
  fillColor(r, g, b) { this.ops.push(`${num(r)} ${num(g)} ${num(b)} rg`); return this; }
  /** Dash pattern in mm; [] for solid. */
  dash(pattern = []) { this.ops.push(`[${pattern.map((v) => num(v * MM)).join(' ')}] 0 d`); return this; }
  moveTo(x, y) { this.ops.push(`${this.X(x)} ${this.Y(y)} m`); return this; }
  lineTo(x, y) { this.ops.push(`${this.X(x)} ${this.Y(y)} l`); return this; }
  closePath() { this.ops.push('h'); return this; }
  stroke() { this.ops.push('S'); return this; }
  fill() { this.ops.push('f*'); return this; }
  rect(x, y, w, h) { this.ops.push(`${this.X(x)} ${this.Y(y + h)} ${num(w * MM)} ${num(h * MM)} re`); return this; }
  /** Restrict later drawing (until restore) to a rectangle. */
  clipRect(x, y, w, h) { this.ops.push(`${this.X(x)} ${this.Y(y + h)} ${num(w * MM)} ${num(h * MM)} re W n`); return this; }
  polyline(points, closed = false) {
    points.forEach(([x, y], i) => (i ? this.lineTo(x, y) : this.moveTo(x, y)));
    if (closed) this.closePath();
    return this;
  }
  /** Text with its baseline at (x, y) mm; size in points; align left/center/right. */
  text(x, y, size, str, { align = 'left' } = {}) {
    const width = String(str).length * size * 0.5 / MM; // rough Helvetica advance, in mm
    const dx = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
    this.ops.push(`BT /F1 ${num(size)} Tf ${this.X(x + dx)} ${this.Y(y)} Td ${pdfString(str)} Tj ET`);
    return this;
  }
  page() {
    return { width: this.w, height: this.h, content: this.ops.join('\n') };
  }
}

/** Assemble pages ({ width, height in mm, content }) into PDF bytes. */
export function pdfDocument(pages, { title = '' } = {}) {
  const objs = []; // object bodies, numbered from 1
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const info = add(`<< /Producer (mimimaker) /Title ${pdfString(title)} >>`);
  const kids = [];
  for (const p of pages) {
    const content = add(`<< /Length ${p.content.length} >>\nstream\n${p.content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(p.width * MM)} ${num(p.height * MM)}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
