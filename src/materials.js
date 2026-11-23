// Material and machine presets. Sheet sizes are in mm (width × height).
//
// kind:  'board'  → rigid; boxes use finger joints (needs Knife Blade)
//        'card'   → thin; boxes become fold-up nets with glue tabs
//        'fabric' → flat pieces only (rugs, cushions)
// tool:  the Cricut blade the material needs.

// cricut: the closest Design Space material setting. passes / speed (mm/s)
// feed the cut-time estimate; they are rough averages, not machine specs.
export const DEFAULT_MATERIALS = [
  { id: 'chip2', name: 'Chipboard 2.0 mm', thickness: 2.0, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#b8956a', cricut: 'Heavy Chipboard – 2.0 mm', passes: 16, speed: 12 },
  { id: 'chip15', name: 'Chipboard 1.5 mm', thickness: 1.5, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#c9a77d', cricut: 'Chipboard – 1.5 mm', passes: 13, speed: 12 },
  { id: 'bass16', name: 'Basswood 1/16" (1.6 mm)', thickness: 1.6, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#e6d2a6', cricut: 'Basswood – 1/16"', passes: 11, speed: 12 },
  { id: 'bass08', name: 'Basswood 1/32" (0.8 mm)', thickness: 0.8, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#eedfbf', cricut: 'Basswood – 1/32"', passes: 6, speed: 12 },
  { id: 'card110', name: 'Heavy cardstock 110 lb', thickness: 0.38, kind: 'card', tool: 'fine', sheet: [305, 305], color: '#f3efe4', cricut: 'Heavy Cardstock – 100 lb', passes: 1, speed: 50 },
  { id: 'card65', name: 'Cardstock 65 lb', thickness: 0.25, kind: 'card', tool: 'fine', sheet: [216, 279], color: '#c9d8e2', cricut: 'Medium Cardstock – 80 lb', passes: 1, speed: 50 },
  { id: 'paper', name: 'Patterned paper', thickness: 0.15, kind: 'card', tool: 'fine', sheet: [305, 305], color: '#e8c4bb', cricut: 'Patterned Paper', passes: 1, speed: 60 },
  { id: 'acetate', name: 'Clear acetate 0.25 mm', thickness: 0.25, kind: 'card', tool: 'fine', sheet: [216, 279], color: '#dff3f7', cricut: 'Acetate', passes: 1, speed: 40 },
  { id: 'felt', name: 'Craft felt 1 mm', thickness: 1.0, kind: 'fabric', tool: 'rotary', sheet: [229, 305], color: '#9db592', cricut: 'Felt', passes: 1, speed: 35 },
];

// price: what one sheet costs, in the kit's currency (rough craft-store
// prices; users edit them). silhouette / laser: that machine family's
// settings (Silhouette speed is Studio's 1–30 dial; laser power is %, speed
// mm/s, kerf optional and otherwise the machine's), rough starting points to
// test on a scrap. Kept apart
// from DEFAULT_MATERIALS so saved kits and room-type snapshots don't change;
// withMaterialDefaults() fills them in.
const PRESET_EXTRAS = {
  chip2: { price: 1.5, silhouette: { blade: 'Kraft Blade', passes: 8, speed: 3 }, laser: { power: 70, speed: 12, passes: 2 } },
  chip15: { price: 1.25, silhouette: { blade: 'Kraft Blade', passes: 6, speed: 3 }, laser: { power: 65, speed: 15, passes: 1 } },
  bass16: { price: 2.5, silhouette: { blade: 'Kraft Blade', passes: 6, speed: 3 }, laser: { power: 60, speed: 15, passes: 1 } },
  bass08: { price: 2, silhouette: { blade: 'Kraft Blade', passes: 4, speed: 3 }, laser: { power: 45, speed: 20, passes: 1 } },
  card110: { price: 0.5, silhouette: { blade: 'AutoBlade', passes: 2, speed: 5 }, laser: { power: 25, speed: 40, passes: 1 } },
  card65: { price: 0.25, silhouette: { blade: 'AutoBlade', passes: 1, speed: 5 }, laser: { power: 20, speed: 45, passes: 1 } },
  paper: { price: 0.75, silhouette: { blade: 'AutoBlade', passes: 1, speed: 6 }, laser: { power: 15, speed: 50, passes: 1 } },
  acetate: { price: 1, silhouette: { blade: 'AutoBlade', passes: 2, speed: 3 }, laser: { power: 15, speed: 40, passes: 1 } },
  felt: { price: 0.5, silhouette: { blade: 'Rotary Blade', passes: 1, speed: 3 }, laser: { power: 30, speed: 35, passes: 1 } },
};

const TOOL_DEFAULTS = {
  knife: { cricut: 'Chipboard – 1.5 mm', passes: 12, speed: 12, price: 1.5, silhouette: { blade: 'Kraft Blade', passes: 6, speed: 3 }, laser: { power: 60, speed: 15, passes: 1 } },
  fine: { cricut: 'Medium Cardstock – 80 lb', passes: 1, speed: 50, price: 0.5, silhouette: { blade: 'AutoBlade', passes: 1, speed: 5 }, laser: { power: 20, speed: 45, passes: 1 } },
  rotary: { cricut: 'Felt', passes: 1, speed: 35, price: 0.5, silhouette: { blade: 'Rotary Blade', passes: 1, speed: 3 }, laser: { power: 30, speed: 35, passes: 1 } },
};

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Fill in cut settings and price missing from materials saved by older versions. */
export function withMaterialDefaults(m) {
  const preset = { ...DEFAULT_MATERIALS.find((d) => d.id === m.id), ...PRESET_EXTRAS[m.id] };
  const tool = TOOL_DEFAULTS[m.tool] || TOOL_DEFAULTS.fine;
  return {
    ...m,
    cricut: m.cricut || preset.cricut || tool.cricut,
    passes: m.passes || preset.passes || tool.passes,
    speed: m.speed || preset.speed || tool.speed,
    price: num(m.price) && m.price >= 0 ? m.price : (preset.price ?? tool.price),
    silhouette: { ...tool.silhouette, ...preset.silhouette, ...(m.silhouette || {}) },
    laser: { ...tool.laser, ...preset.laser, ...(m.laser || {}) },
  };
}

// -------------------------------------------------------- material library
const uniqueId = (list, base) => {
  const ids = new Set(list.map((m) => m.id));
  let i = 1;
  while (ids.has(`${base}${i}`)) i++;
  return `${base}${i}`;
};
const uniqueName = (list, base) => {
  const names = new Set(list.map((m) => m.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
};

/** A fresh custom material (thin card) with an id and name not in `list`. */
export function newMaterial(list) {
  return withMaterialDefaults({
    id: uniqueId(list, 'custom'), name: uniqueName(list, 'New material'),
    thickness: 0.3, kind: 'card', tool: 'fine', sheet: [305, 305], color: '#d9cfc1',
  });
}

/** A deep copy of `m` under a new id and name, uncalibrated. */
export function duplicateMaterial(m, list) {
  const copy = structuredClone(m);
  delete copy.calibrated;
  return { ...copy, id: uniqueId(list, `${m.id}-copy`), name: uniqueName(list, `${m.name} copy`) };
}

const MATERIAL_KEY = /^(material|\w+Material)$/;

/**
 * True when a material field anywhere in the kit (`material`, `trimMaterial`,
 * `glazingMaterial`, …) names `id`. Pass `compiled` to also count materials
 * the compiler picked from code defaults (a greenhouse's acetate, a window
 * seat's felt cushion).
 */
export function materialInUse(kit, id, compiled = null) {
  if (compiled?.sheets?.some((s) => s.material?.id === id)) return true;
  if (compiled?.usedMats?.some((m) => m?.id === id)) return true;
  const seen = (v) => {
    if (Array.isArray(v)) return v.some(seen);
    if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => (MATERIAL_KEY.test(k) ? x === id : seen(x)));
    return false;
  };
  return Object.entries(kit).some(([k, v]) => k !== 'materials' && seen(v));
}

/** Cut settings for a blade, to reset a material when its blade changes. */
export function toolSettings(tool) {
  const t = TOOL_DEFAULTS[tool] || TOOL_DEFAULTS.fine;
  return { cricut: t.cricut, passes: t.passes, speed: t.speed, silhouette: { ...t.silhouette }, laser: { ...t.laser } };
}

/**
 * The settings `machine` should use for `m`:
 *   cricut     → { setting, passes, speed }
 *   silhouette → { blade, passes, speed }   (speed is Studio's 1–30 dial)
 *   laser      → { power, speed, passes, kerf }   (power %, speed mm/s)
 */
export function machineSettings(m, machine) {
  const d = withMaterialDefaults(m);
  const family = machine?.family || 'cricut';
  if (family === 'laser') {
    return { family, ...d.laser, kerf: num(m.laser?.kerf) ? m.laser.kerf : (machine.kerf ?? d.laser.kerf) };
  }
  if (family === 'silhouette') return { family, ...d.silhouette };
  return { family, setting: d.cricut, passes: d.passes, speed: d.speed };
}

// ------------------------------------------------------------------- money
// Eurozone regions (plus a few that use the euro without being members).
const EURO_REGIONS = new Set('AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES AD MC SM VA ME XK'.split(' '));
const REGION_SYMBOLS = { GB: '£', UK: '£', JP: '¥', IN: '₹', KR: '₩', CH: 'CHF ', SE: 'kr ', NO: 'kr ', DK: 'kr ', PL: 'zł ', BR: 'R$', CA: '$', AU: '$', NZ: '$', MX: '$', US: '$' };

/** A currency symbol guessed from a language tag's region ('$' when unsure). */
export function defaultCurrency(lang = '') {
  const region = (lang.split(/[-_]/).slice(1).find((p) => /^[A-Za-z]{2}$/.test(p)) || '').toUpperCase();
  if (EURO_REGIONS.has(region)) return '€';
  return REGION_SYMBOLS[region] || '$';
}

export function formatMoney(amount, currency = '$') {
  return `${currency}${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

// family decides which files a machine gets (see src/export/machines.js):
//   cricut     → Design Space SVG
//   silhouette → SVG (Studio Designer edition) + DXF (Studio Basic edition)
//   laser      → kerf-compensated laser SVG + DXF; cuts every material
export const MACHINES = {
  maker: { name: 'Cricut Maker / Maker 3', family: 'cricut', cut: [292, 597], tools: ['fine', 'knife', 'rotary'] },
  explore: { name: 'Cricut Explore Air 2 / Explore 3', family: 'cricut', cut: [292, 597], tools: ['fine'] },
  joyxtra: { name: 'Cricut Joy Xtra', family: 'cricut', cut: [216, 292], tools: ['fine'] },
  joy: { name: 'Cricut Joy', family: 'cricut', cut: [108, 292], tools: ['fine'] },
  cameo: { name: 'Silhouette Cameo 4 / 5', family: 'silhouette', cut: [305, 305], tools: ['fine', 'knife', 'rotary'] },
  portrait: { name: 'Silhouette Portrait 3 / 4', family: 'silhouette', cut: [203, 305], tools: ['fine'] },
  laser: { name: 'Laser cutter (generic)', family: 'laser', cut: [400, 400], tools: ['fine', 'knife', 'rotary'], kerf: 0.1 },
};

const MIN_BED = 50, MAX_BED = 3000, MAX_KERF = 1;
const okSide = (v) => typeof v === 'number' && Number.isFinite(v) && v >= MIN_BED && v <= MAX_BED;

/**
 * The machine profile `id` (default: the kit's machine) with the kit's own
 * edits applied: kit.machineOverrides[id] = { cut: [w, h], kerf }. Values
 * out of range fall back to the preset, side by side.
 */
export function machineFor(kit, id = kit?.machine) {
  const key = MACHINES[id] ? id : 'maker';
  const base = MACHINES[key];
  const o = kit?.machineOverrides?.[key];
  if (!o || typeof o !== 'object') return base;
  const out = { ...base };
  if (Array.isArray(o.cut)) {
    const cut = [0, 1].map((i) => (okSide(o.cut[i]) ? o.cut[i] : base.cut[i]));
    if (cut[0] !== base.cut[0] || cut[1] !== base.cut[1]) out.cut = cut;
  }
  if (base.family === 'laser' && typeof o.kerf === 'number' && o.kerf >= 0 && o.kerf <= MAX_KERF) out.kerf = o.kerf;
  return out.cut === base.cut && out.kerf === base.kerf ? base : out;
}

export const BED_LIMITS = { min: MIN_BED, max: MAX_BED, maxKerf: MAX_KERF };

export const TOOL_NAMES = { fine: 'Fine-Point Blade', knife: 'Knife Blade', rotary: 'Rotary Blade' };

/** Usable sheet area for a material on a machine (clipped to the cut area). */
export function effectiveSheet(material, machine) {
  const [w, h] = material.sheet;
  const [cw, ch] = machine.cut;
  return [Math.min(w, cw), Math.min(h, ch)];
}

export const SCALES = [6, 12, 24, 48, 87];
