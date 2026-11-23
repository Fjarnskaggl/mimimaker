// SVG wiring map of the room's outside surfaces, seen from behind.

import { netFaces, netPoint, LED_COLORS, WIRE_COLORS, POWER_KINDS } from './lighting.js';

const f = (v) => (Math.round(v * 100) / 100).toString();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param compiled result of compileKit
 * @param opts { standalone } — standalone adds xmlns + explicit colours for files/guide
 */
export function ledMapSVG(compiled, { standalone = false } = {}) {
  const { dims, lighting, openings, ceiling } = compiled;
  const faces = netFaces(dims, ceiling);
  const { W } = dims;
  // seen from behind: mirror x around the back wall
  const P = ([x, y]) => [W - x, -y];
  const xs = faces.flatMap((q) => [W - q.x0, W - q.x1]);
  const ys = faces.flatMap((q) => [-q.y0, -q.y1]);
  const pad = Math.max(dims.W, dims.H) * 0.08;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const fs = Math.max(3, Math.max(dims.W, dims.H) / 32);

  const col = standalone
    ? { face: '#f6efe6', edge: '#8a7765', text: '#4a3d33', muted: '#9a8a7c', hole: '#ffffff' }
    : { face: 'var(--map-face)', edge: 'var(--map-edge)', text: 'var(--ink)', muted: 'var(--muted)', hole: 'var(--bg)' };

  const out = [];
  for (const q of faces) {
    const [ax, ay] = P([q.x0, q.y0]), [bx, by] = P([q.x1, q.y1]);
    const rx = Math.min(ax, bx), ry = Math.min(ay, by);
    out.push(`<rect x="${f(rx)}" y="${f(ry)}" width="${f(Math.abs(bx - ax))}" height="${f(Math.abs(by - ay))}" fill="${col.face}" stroke="${col.edge}" stroke-width="${f(fs * 0.08)}"/>`);
    out.push(`<text x="${f(rx + fs * 0.5)}" y="${f(ry + fs * 1.2)}" font-size="${f(fs * 0.8)}" fill="${col.muted}" font-weight="600">${esc(q.name)}</text>`);
  }
  // openings (cut through, so shown as holes)
  for (const o of openings) {
    const d = 'M' + o.poly.map(([u, v]) => P(netPoint(o.wall, u, v, dims)).map(f).join(' ')).join('L') + 'Z';
    out.push(`<path d="${d}" fill="${col.hole}" stroke="${col.edge}" stroke-width="${f(fs * 0.06)}" stroke-dasharray="${f(fs * 0.3)} ${f(fs * 0.2)}"/>`);
  }
  if (!lighting?.enabled) return wrap();

  // wires
  lighting.leds.forEach((led, i) => {
    const c = WIRE_COLORS[i % WIRE_COLORS.length];
    const pts = led.route.map((p) => P(p).map(f).join(' ')).join(' ');
    out.push(`<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${f(fs * 0.22)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>`);
  });
  // power box
  const [px, py] = P(lighting.power.p);
  const bw = fs * 4.2, bh = fs * 2.4;
  out.push(`<rect x="${f(px - bw / 2)}" y="${f(py - bh / 2)}" width="${f(bw)}" height="${f(bh)}" rx="${f(fs * 0.3)}" fill="#33302c" stroke="#000" stroke-width="${f(fs * 0.05)}"/>`);
  out.push(`<text x="${f(px)}" y="${f(py)}" font-size="${f(fs * 0.75)}" fill="#fff" text-anchor="middle" dominant-baseline="central" font-weight="700">${lighting.power.kind === 'usb' ? 'USB' : 'BATTERY'}</text>`);
  // LEDs
  lighting.leds.forEach((led, i) => {
    const [x, y] = P(led.p);
    const c = WIRE_COLORS[i % WIRE_COLORS.length];
    const glow = LED_COLORS[led.color]?.hex || LED_COLORS.warm.hex;
    out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(fs * 0.9)}" fill="${glow}" stroke="${c}" stroke-width="${f(fs * 0.22)}"/>`);
    out.push(`<text x="${f(x)}" y="${f(y - fs * 1.4)}" font-size="${f(fs * 0.85)}" fill="${col.text}" text-anchor="middle" font-weight="700">${led.label}</text>`);
  });
  return wrap();

  function wrap() {
    return `<svg ${standalone ? 'xmlns="http://www.w3.org/2000/svg" ' : ''}class="ledmap-svg" viewBox="${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)}" role="img" aria-label="LED wiring map, seen from behind the room" font-family="system-ui, sans-serif">${out.join('')}</svg>`;
  }
}

/** Rows for the LED table. */
export function ledRows(compiled) {
  const { lighting } = compiled;
  if (!lighting?.enabled) return [];
  const where = { back: 'Back wall', left: 'Left wall', right: 'Right wall', top: 'Ceiling', bottom: 'Floor' };
  return lighting.leds.map((l, i) => ({
    label: l.label, name: l.name, where: where[l.face], color: LED_COLORS[l.color]?.name || l.color,
    wireColor: WIRE_COLORS[i % WIRE_COLORS.length], runCm: l.length / 10, leadCm: l.leadCm,
  }));
}

export const powerName = (lighting) => POWER_KINDS[lighting?.power?.kind] || POWER_KINDS.battery;
