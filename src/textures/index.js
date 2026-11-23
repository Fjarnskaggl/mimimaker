// Procedural print-then-cut textures: wood planks, tiles, brick, wallpaper
// and book spines, plus raw material finishes (chipboard, basswood, card,
// felt, clear sheet) for parts that aren't printed. Pure functions (no DOM): shapes are in millimetres on the
// printed sheet, pattern sizes are real-world centimetres divided by the kit
// scale (1:N), and a seed makes every texture reproducible.
//
// textureSVG() gives a standalone SVG for print sheets (T3) and for the 3D
// viewer to rasterise, so what you see in 3D is what prints.

/** Small fast seeded PRNG (mulberry32). */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- generators
// Each gets ({ width, height, mm, r, p }) and returns shapes after the background.

function woodPlanks({ width, height, mm, r, p }) {
  const pitch = mm(p.plankWidth), L = mm(p.boardLength), gap = p.gap;
  const shapes = [];
  let off = r() * L;
  for (let y = 0; y < height; y += pitch) {
    // shift each row's joints 30–70 % of a board so neighbours never line up
    off = (off + L * (0.3 + 0.4 * r())) % L;
    for (let x = -off; x < width; x += L) {
      const fill = pick(r, p.colors);
      shapes.push({ type: 'rect', x, y, w: L - gap, h: pitch - gap, fill });
      if (p.grain) {
        for (let g = 0; g < 3; g++) {
          const gy = y + (pitch - gap) * (0.2 + 0.6 * r());
          const x0 = x + (L - gap) * 0.1 * r(), x1 = x + (L - gap) * (0.6 + 0.4 * r());
          const bow = (r() - 0.5) * (pitch - gap) * 0.3;
          shapes.push({ type: 'path', d: `M${f(x0)} ${f(gy)}Q${f((x0 + x1) / 2)} ${f(gy + bow)} ${f(x1)} ${f(gy)}`, stroke: shade(fill, 0.82), width: Math.max(0.08, pitch * 0.02) });
        }
      }
    }
  }
  return shapes;
}

function tiles({ width, height, mm, r, p }) {
  const pitch = mm(p.tileSize), g = p.grout;
  const shapes = [];
  for (let j = 0; j * pitch < height; j++) {
    for (let i = 0; i * pitch < width; i++) {
      const alt = p.checker && (i + j) % 2;
      shapes.push({ type: 'rect', x: i * pitch + g / 2, y: j * pitch + g / 2, w: pitch - g, h: pitch - g, fill: alt ? p.colors[1] : p.colors[0], opacity: p.checker ? 1 : 0.9 + 0.1 * r() });
    }
  }
  return shapes;
}

function brick({ width, height, mm, r, p }) {
  const courseH = mm(p.brickHeight + p.mortar), len = mm(p.brickLength + p.mortar);
  const bh = mm(p.brickHeight), bl = mm(p.brickLength);
  const bricks = p.colors.slice(0, -1);
  const shapes = [];
  for (let c = 0; c * courseH < height; c++) {
    const offset = c % 2 ? len / 2 : 0;
    for (let k = 0; k * len - offset < width; k++) {
      shapes.push({ type: 'rect', x: k * len - offset, y: c * courseH, w: bl, h: bh, fill: pick(r, bricks) });
    }
  }
  return shapes;
}

function stripes({ width, height, mm, p }) {
  const sw = mm(p.stripeWidth);
  const shapes = [];
  for (let x = sw; x < width; x += 2 * sw) shapes.push({ type: 'rect', x, y: 0, w: sw, h: height, fill: p.colors[1] });
  return shapes;
}

function sprig({ width, height, mm, r, p }) {
  const pitch = mm(p.repeat), s = pitch * 0.32;
  const shapes = [];
  for (let j = 0; j * pitch < height + pitch; j++) {
    for (let i = 0; i * pitch < width + pitch; i++) {
      // half-drop repeat with a little jitter, so it reads as hand-printed
      const x = i * pitch + (r() - 0.5) * pitch * 0.15;
      const y = j * pitch + (i % 2 ? pitch / 2 : 0) + (r() - 0.5) * pitch * 0.15;
      const angle = (r() - 0.5) * 50;
      if (x > width + s || y > height + s) continue;
      shapes.push({ type: 'use', motif: true, symbol: 'sprig', x, y, angle, size: s });
    }
  }
  return shapes;
}

// Motifs drawn once in unit coordinates (about −1…1), placed with <use>.
const fuzzPath = 'M-0.8 0.1Q-0.3 -0.5 0.1 0Q0.5 0.5 0.9 -0.1M-0.5 0.6Q0 0.1 0.6 0.5M-0.4 -0.6Q0.1 -0.2 0.5 -0.7';
const SYMBOLS = {
  fuzz: (p) => `<path d="${fuzzPath}" fill="none" stroke="${p.colors[1]}" stroke-width="0.12" stroke-linecap="round"/>`,
  fuzzLight: (p) => `<path d="${fuzzPath}" fill="none" stroke="${p.colors[2]}" stroke-width="0.12" stroke-linecap="round"/>`,
  sprig: (p) => `<path d="M0 0.9Q0.1 0.2 0 -0.5M0 0.3Q0.6 0.2 0.7 -0.2Q0.3 0 0 0.3M0 0Q-0.6 -0.1 -0.6 -0.5Q-0.2 -0.3 0 0" fill="${p.colors[1]}" stroke="${p.colors[1]}" stroke-width="0.08" stroke-linecap="round"/>`
    + `<circle cx="0" cy="-0.65" r="0.2" fill="${p.colors[2]}"/>`,
};

// The same motifs as structured shapes (unit coordinates, absolute M L H V Q C Z
// paths and circles) for renderers that can't draw SVG strings, such as the
// print-then-cut PDF (#53). Keep these in step with SYMBOLS above.
const SYMBOL_SHAPES = {
  fuzz: (p) => [{ type: 'path', d: fuzzPath, stroke: p.colors[1], width: 0.12 }],
  fuzzLight: (p) => [{ type: 'path', d: fuzzPath, stroke: p.colors[2], width: 0.12 }],
  sprig: (p) => [
    { type: 'path', d: 'M0 0.9Q0.1 0.2 0 -0.5M0 0.3Q0.6 0.2 0.7 -0.2Q0.3 0 0 0.3M0 0Q-0.6 -0.1 -0.6 -0.5Q-0.2 -0.3 0 0', fill: p.colors[1], stroke: p.colors[1], width: 0.08 },
    { type: 'circle', cx: 0, cy: -0.65, r: 0.2, fill: p.colors[2] },
  ],
};

/**
 * A motif placed by `use` shapes, as [{ type: 'path', d, fill?, stroke?, width? }
 * | { type: 'circle', cx, cy, r, fill }] in unit coordinates (about −1…1).
 */
export function symbolShapes(name, params) {
  const make = SYMBOL_SHAPES[name];
  if (!make) throw new Error(`Unknown symbol "${name}"`);
  return make(params);
}

function bookSpines({ width, height, mm, r, p }) {
  const shapes = [];
  let x = r() * mm(p.minWidth) * 0.5;
  for (;;) {
    const w = mm(p.minWidth + (p.maxWidth - p.minWidth) * r());
    if (x + w > width) break;
    const h = height * (0.65 + 0.35 * r());
    const fill = pick(r, p.colors.slice(1));
    shapes.push({ type: 'rect', spine: true, x, y: height - h, w, h, fill });
    if (r() < 0.7) { // gilt bands near the top and bottom
      const band = Math.max(0.15, h * 0.03);
      shapes.push({ type: 'rect', x, y: height - h * 0.86, w, h: band, fill: p.band });
      shapes.push({ type: 'rect', x, y: height - h * 0.16, w, h: band, fill: p.band });
    }
    x += w + (r() < 0.15 ? mm(0.3) : 0);
  }
  return shapes;
}

// ----------------------------------------------------- raw material finishes
// How an unprinted part looks: the board or card it is cut from. Sizes are
// real mm on the material (not scaled), and each is drawn to repeat on a
// small tile in the 3D view. colors: [material, darker, lighter].

function chipboard({ width, height, r, p }) {
  const shapes = [];
  const n = Math.round((width * height) / 22);
  for (let i = 0; i < n; i++) {
    const w = 0.25 + r() * (r() < 0.15 ? 1.1 : 0.45), h = w * (0.4 + 0.6 * r());
    shapes.push({ type: 'rect', x: r() * width, y: r() * height, w, h, fill: r() < 0.6 ? p.colors[1] : p.colors[2], opacity: Math.round(50 + 45 * r()) / 100 });
  }
  return shapes;
}

function woodGrain({ width, height, r, p }) {
  const shapes = [];
  // a couple of soft growth bands, then fine wavy grain lines across the width
  for (let k = 0; k < 3; k++) {
    shapes.push({ type: 'rect', x: 0, y: r() * height, w: width, h: height * (0.04 + 0.08 * r()), fill: p.colors[2], opacity: 0.45 });
  }
  const waves = Math.max(1, Math.round(width / 30)); // whole waves, so the tile repeats
  for (let y = r() * 0.8; y < height; y += 0.6 + r() * 1.1) {
    const amp = 0.15 + r() * 0.35, step = width / (waves * 2);
    let d = `M0 ${f(y)}`;
    for (let i = 0; i < waves * 2; i++) d += `Q${f(step * (i + 0.5))} ${f(y + (i % 2 ? -amp : amp) * 2)} ${f(step * (i + 1))} ${f(y)}`;
    shapes.push({ type: 'path', d, stroke: r() < 0.75 ? p.colors[1] : p.colors[2], width: 0.08 + r() * 0.14 });
  }
  return shapes;
}

function cardFibre({ width, height, r, p }) {
  const shapes = [];
  const n = Math.round((width * height) / 30);
  for (let i = 0; i < n; i++) {
    const x = r() * width, y = r() * height, a = r() * Math.PI, l = 0.6 + r() * 1.6;
    const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
    shapes.push({ type: 'path', d: `M${f(x)} ${f(y)}Q${f(x + dx / 2 + dy * 0.2)} ${f(y + dy / 2 - dx * 0.2)} ${f(x + dx)} ${f(y + dy)}`, stroke: r() < 0.5 ? p.colors[1] : p.colors[2], width: 0.07 });
  }
  return shapes;
}

function felt({ width, height, r, p }) {
  const shapes = [];
  const n = Math.round((width * height) / 26);
  for (let i = 0; i < n; i++) {
    shapes.push({ type: 'use', motif: true, symbol: r() < 0.5 ? 'fuzz' : 'fuzzLight', x: r() * width, y: r() * height, angle: Math.round(r() * 360), size: Math.round(12 + r() * 12) / 10 });
  }
  return shapes;
}

function clearSheet({ width, height, r, p }) {
  const shapes = [];
  // faint diagonal sheen streaks, like light on clear plastic
  for (let x = -height + r() * 10; x < width; x += 6 + r() * 14) {
    const w = 0.8 + r() * 3;
    shapes.push({ type: 'path', d: `M${f(x)} ${f(height)}L${f(x + height)} 0L${f(x + height + w)} 0L${f(x + w)} ${f(height)}Z`, fill: p.colors[2], opacity: 0.35 + 0.3 * r() });
  }
  for (let i = 0; i < 6; i++) {
    const x = r() * width, y = r() * height, l = 2 + r() * 6;
    shapes.push({ type: 'path', d: `M${f(x)} ${f(y)}L${f(x + l)} ${f(y - l)}`, stroke: p.colors[1], width: 0.06 });
  }
  return shapes;
}

// ------------------------------------------------------------------ registry
export const TEXTURES = [
  { id: 'wood-planks', name: 'Wood planks', kind: 'floor', gen: woodPlanks,
    params: { plankWidth: 12, boardLength: 120, gap: 0.15, grain: true, colors: ['#a5764a', '#b6875a', '#93653d', '#aa7b4c'] } },
  { id: 'tiles', name: 'Tiles', kind: 'floor', gen: tiles,
    params: { tileSize: 15, grout: 0.3, checker: false, colors: ['#efe9dd', '#3b4a52', '#c4bcae'] } },
  { id: 'brick', name: 'Brick', kind: 'wall', gen: brick,
    params: { brickLength: 21.5, brickHeight: 6.5, mortar: 1, colors: ['#a4553d', '#94493a', '#b4654a', '#8a4636', '#d8cfc0'] } },
  { id: 'wallpaper-stripes', name: 'Striped wallpaper', kind: 'wall', gen: stripes,
    params: { stripeWidth: 4, colors: ['#efe3cf', '#d8b9a0'] } },
  { id: 'wallpaper-sprig', name: 'Sprig wallpaper', kind: 'wall', gen: sprig,
    params: { repeat: 10, colors: ['#f1e8d6', '#7d9a6b', '#d9826b'] } },
  { id: 'book-spines', name: 'Book spines', kind: 'decor', gen: bookSpines,
    params: { minWidth: 2, maxWidth: 5, band: '#d9c48a', colors: ['#3a2a20', '#7a2e2e', '#2f4a6b', '#3d5e3a', '#8a6a3a', '#5a3d5e', '#c9b48a', '#2a2a2a'] } },
  // raw material finishes (kind 'material'): what unprinted parts look like in 3D
  { id: 'chipboard', name: 'Chipboard', kind: 'material', gen: chipboard, tile: 40,
    params: { colors: ['#b8956a', '#8f6f48', '#d4b68c'] } },
  { id: 'wood-grain', name: 'Basswood grain', kind: 'material', gen: woodGrain, tile: 60,
    params: { colors: ['#e6d2a6', '#c9ae7c', '#f1e2c0'] } },
  { id: 'card-fibre', name: 'Cardstock', kind: 'material', gen: cardFibre, tile: 40,
    params: { colors: ['#f3efe4', '#ddd6c6', '#fbf9f3'] } },
  { id: 'felt', name: 'Felt', kind: 'material', gen: felt, tile: 30,
    params: { colors: ['#9db592', '#879f7c', '#b4c9aa'] } },
  { id: 'clear-sheet', name: 'Clear sheet', kind: 'material', gen: clearSheet, tile: 60,
    params: { colors: ['#dff3f7', '#b9d6dc', '#ffffff'] } },
];
const byId = new Map(TEXTURES.map((t) => [t.id, t]));

/**
 * Shapes for a texture over a width × height mm box.
 * @returns {{width, height, shapes: Array}} first shape is the full background
 */
export function textureShapes(id, { width, height, scale = 12, seed = 1, params = {} } = {}) {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown texture "${id}"`);
  const p = { ...t.params, ...params };
  const mm = (cm) => (cm * 10) / scale;
  const bgColor = id === 'wood-planks' ? shade(p.colors[0], 0.55) : p.colors[id === 'tiles' || id === 'brick' ? p.colors.length - 1 : 0];
  const shapes = t.gen({ width, height, mm, r: rng(seed * 2654435761 + 1), p })
    .filter((s) => s.type !== 'rect' || (s.x < width && s.y < height && s.x + s.w > 0 && s.y + s.h > 0));
  return { width, height, params: p, shapes: [{ type: 'rect', background: true, x: 0, y: 0, w: width, h: height, fill: bgColor }, ...shapes] };
}

const f = (n) => String(+n.toFixed(3));

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Standalone SVG (mm units), clipped to its box. */
export function textureSVG(id, opts = {}) {
  const { width, height, scale = 12, seed = 1, params = {} } = opts;
  const { shapes, params: p } = textureShapes(id, { width, height, scale, seed, params });
  const cid = `tx-${id}-${hash(JSON.stringify([width, height, scale, seed, params]))}`;
  const used = [...new Set(shapes.filter((s) => s.type === 'use').map((s) => s.symbol))];
  const symbols = used.map((name) => `<g id="${cid}-${name}">${SYMBOLS[name](p)}</g>`).join('');
  const body = shapes.map((s) => {
    if (s.type === 'rect') return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" fill="${s.fill}"${s.opacity != null && s.opacity < 1 ? ` fill-opacity="${f(s.opacity)}"` : ''}/>`;
    if (s.type === 'use') return `<use href="#${cid}-${s.symbol}" transform="translate(${f(s.x)} ${f(s.y)}) rotate(${f(s.angle)}) scale(${f(s.size)})"/>`;
    const op = s.opacity != null && s.opacity < 1 ? ` opacity="${f(s.opacity)}"` : '';
    return `<path d="${s.d}" fill="${s.fill || 'none'}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${f(s.width)}" stroke-linecap="round"` : ''}${op}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}mm" height="${f(height)}mm" viewBox="0 0 ${f(width)} ${f(height)}">`
    + `<defs>${symbols}<clipPath id="${cid}"><rect x="0" y="0" width="${f(width)}" height="${f(height)}"/></clipPath></defs>`
    + `<g clip-path="url(#${cid})">${body}</g></svg>`;
}
