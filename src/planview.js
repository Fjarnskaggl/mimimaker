// Top-down floor plan SVG (real-world cm; back wall at the top, open front at
// the bottom). Interactive elements carry data attributes the app uses for
// selection and dragging: data-index (items), data-oi (openings), data-li (LEDs).

import { CATALOG } from './catalog.js';
import { footprint, itemParams } from './plan.js';
import { itemSize } from './catalog.js';

const f = (v) => (Math.round(v * 100) / 100).toString();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Where something on a wall sits on the plan: start/end points of its span. */
export function wallSpan(wall, pos, width, room) {
  const a = pos - width / 2, b = pos + width / 2;
  if (wall === 'back') return { x0: a, y0: 0, x1: b, y1: 0 };
  const y0 = room.depth - b, y1 = room.depth - a;
  return wall === 'left' ? { x0: 0, y0, x1: 0, y1 } : { x0: room.width, y0, x1: room.width, y1 };
}

/** Wall position (cm along the wall) under a plan point. */
export function posOnWall(wall, [x, y], room) {
  return wall === 'back' ? x : room.depth - y;
}

const shortName = (def) => def.label.replace(/ \/.*$/, '');

export function planSVG(kit, { selected = null, clashes = new Set(), guides = [] } = {}) {
  const room = kit.room;
  const W = room.width, D = room.depth;
  const T = Math.max(5, Math.min(W, D) / 40); // drawn wall thickness
  const m = T + Math.max(W, D) * 0.08;
  const fs = Math.max(6, Math.min(W, D) / 26);
  const out = [];
  const isSel = (kind, i) => selected && selected.kind === kind && selected.index === i;

  out.push(`<defs><pattern id="pg-minor" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" class="pg-minor"/></pattern><pattern id="pg-major" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#pg-minor)"/><path d="M50 0H0V50" fill="none" class="pg-major"/></pattern></defs>`);
  out.push(`<rect class="plan-floor" x="0" y="0" width="${f(W)}" height="${f(D)}"/><rect x="0" y="0" width="${f(W)}" height="${f(D)}" fill="url(#pg-major)"/>`);
  out.push(`<path class="plan-wall" d="M${f(-T)} ${f(D)}V${f(-T)}H${f(W + T)}V${f(D)}H${f(W)}V0H0V${f(D)}Z"/>`);

  // openings: gaps in the walls
  (kit.openings || []).forEach((o, i) => {
    const s = wallSpan(o.wall, o.pos, o.width, room);
    const door = o.kind === 'door' || o.kind === 'archdoor';
    let r;
    if (o.wall === 'back') r = [s.x0, -T, s.x1 - s.x0, T];
    else if (o.wall === 'left') r = [-T, s.y0, T, s.y1 - s.y0];
    else r = [W, s.y0, T, s.y1 - s.y0];
    out.push(`<g class="plan-opening${door ? ' door' : ''}${isSel('opening', i) ? ' sel' : ''}" data-oi="${i}"><title>${esc(door ? 'Door' : 'Window')} on the ${o.wall} wall</title><rect x="${f(r[0])}" y="${f(r[1])}" width="${f(r[2])}" height="${f(r[3])}"/>`);
    if (door) {
      const w = o.width;
      const arc = o.wall === 'back' ? `M${f(s.x0)} 0 v${f(w)} A${f(w)} ${f(w)} 0 0 0 ${f(s.x1)} 0`
        : o.wall === 'left' ? `M0 ${f(s.y1)} h${f(w)} A${f(w)} ${f(w)} 0 0 0 0 ${f(s.y0)}`
        : `M${f(W)} ${f(s.y1)} h${f(-w)} A${f(w)} ${f(w)} 0 0 1 ${f(W)} ${f(s.y0)}`;
      out.push(`<path class="swing" d="${arc}"/>`);
    }
    out.push('</g>');
  });

  // floor items: rugs first, then furniture
  const order = kit.items.map((it, i) => i).sort((a, b) => (kit.items[a].type === 'rug' ? -1 : 0) - (kit.items[b].type === 'rug' ? -1 : 0));
  for (const i of order) {
    const it = kit.items[i];
    const def = CATALOG[it.type];
    if (!def) continue;
    const cls = ['plan-item', isSel('item', i) && 'sel', clashes.has(i) && 'clash'].filter(Boolean);
    if (def.placement === 'floor') {
      const fp = footprint(it);
      const w = fp.x1 - fp.x0, d = fp.y1 - fp.y0;
      if (it.type === 'rug') cls.push('rug');
      const rot = (((Number(it.rot) || 0) % 360) + 360) % 360;
      // front edge marker: rot 0 faces the open front (bottom of the plan)
      const front = { 0: [fp.x0, fp.y1, fp.x1, fp.y1], 90: [fp.x1, fp.y0, fp.x1, fp.y1], 180: [fp.x0, fp.y0, fp.x1, fp.y0], 270: [fp.x0, fp.y0, fp.x0, fp.y1] }[rot];
      const shape = it.type === 'rug' && it.params?.shape !== 'rect'
        ? `<ellipse cx="${f(fp.x0 + w / 2)}" cy="${f(fp.y0 + d / 2)}" rx="${f(w / 2)}" ry="${f(d / 2)}"/>`
        : `<rect x="${f(fp.x0)}" y="${f(fp.y0)}" width="${f(w)}" height="${f(d)}" rx="1.5"/>`;
      out.push(`<g class="${cls.join(' ')}" data-index="${i}"><title>${esc(def.label)} · ${f(w)} × ${f(d)} cm</title>${shape}`);
      if (it.type !== 'rug') out.push(`<line class="front" x1="${f(front[0])}" y1="${f(front[1])}" x2="${f(front[2])}" y2="${f(front[3])}"/>`);
      if (Math.min(w, d) > fs * 1.4) out.push(`<text x="${f(fp.x0 + w / 2)}" y="${f(fp.y0 + d / 2)}" font-size="${f(Math.min(fs, w / (shortName(def).length * 0.62)))}">${esc(shortName(def))}</text>`);
      out.push('</g>');
    } else {
      const [w] = itemSize(it.type, itemParams(it));
      const s = wallSpan(it.wall, it.pos ?? 0, w, room);
      const depth = Math.max(4, T * 0.9);
      const r = it.wall === 'back' ? [s.x0, 0, s.x1 - s.x0, depth] : it.wall === 'left' ? [0, s.y0, depth, s.y1 - s.y0] : [W - depth, s.y0, depth, s.y1 - s.y0];
      cls.push('wall-item');
      out.push(`<g class="${cls.join(' ')}" data-index="${i}"><title>${esc(def.label)} on the ${it.wall} wall</title><rect x="${f(r[0])}" y="${f(r[1])}" width="${f(r[2])}" height="${f(r[3])}" rx="1"/></g>`);
    }
  }

  // lights and power
  const L = kit.lighting;
  if (L?.enabled) {
    const p = L.power;
    const ps = wallSpan(p.wall, p.pos ?? 0, 0, room);
    const ox = p.wall === 'back' ? 0 : p.wall === 'left' ? -T * 1.6 : T * 1.6, oy = p.wall === 'back' ? -T * 1.6 : 0;
    if (p.mount !== 'base') out.push(`<g class="plan-power"><title>Power box (outside the ${p.wall} wall)</title><rect x="${f(ps.x0 + ox - T)}" y="${f(ps.y0 + oy - T * 0.6)}" width="${f(2 * T)}" height="${f(1.2 * T)}" rx="1"/></g>`);
    (L.leds || []).forEach((led, i) => {
      let x, y;
      if (led.mount === 'wall') { const s = wallSpan(led.wall, led.pos ?? 0, 0, room); x = s.x0; y = s.y0; } else { x = led.x ?? 0; y = led.y ?? 0; }
      out.push(`<g class="plan-led ${led.mount}${isSel('led', i) ? ' sel' : ''}" data-li="${i}"><title>L${i + 1}${led.name ? ` · ${esc(led.name)}` : ''} (${led.mount})</title><circle class="halo" cx="${f(x)}" cy="${f(y)}" r="${f(fs * 1.1)}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(fs * 0.45)}"/></g>`);
    });
  }

  // snapping guides while dragging: what the piece lined up with
  for (const g of guides) {
    const ext = T * 2;
    let l = null;
    if (g.axis === 'x') l = [g.at, g.from - ext, g.at, g.to + ext];
    else if (g.axis === 'y') l = [g.from - ext, g.at, g.to + ext, g.at];
    else if (g.axis === 'pos') {
      const s = wallSpan(g.wall, g.at, 0, room);
      l = g.wall === 'back' ? [s.x0, -T, s.x0, D * 0.35] : g.wall === 'left' ? [-T, s.y0, W * 0.35, s.y0] : [W + T, s.y0, W * 0.65, s.y0];
    }
    if (l) out.push(`<line class="plan-guide ${g.kind}" pointer-events="none" x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}"/>`);
  }

  out.push(`<text class="plan-label" x="${f(W / 2)}" y="${f(-T - fs * 0.6)}" font-size="${f(fs * 0.8)}">BACK WALL · ${f(W)} cm</text>`);
  out.push(`<text class="plan-label" x="${f(W / 2)}" y="${f(D + fs * 1.4)}" font-size="${f(fs * 0.8)}">OPEN FRONT</text>`);
  return `<svg class="plan-svg" viewBox="${f(-m)} ${f(-m)} ${f(W + 2 * m)} ${f(D + 2 * m)}" role="img" aria-label="Floor plan, back wall at the top">${out.join('')}</svg>`;
}
