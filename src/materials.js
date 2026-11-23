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
  { id: 'felt', name: 'Craft felt 1 mm', thickness: 1.0, kind: 'fabric', tool: 'rotary', sheet: [229, 305], color: '#9db592', cricut: 'Felt', passes: 1, speed: 35 },
];

const TOOL_DEFAULTS = {
  knife: { cricut: 'Chipboard – 1.5 mm', passes: 12, speed: 12 },
  fine: { cricut: 'Medium Cardstock – 80 lb', passes: 1, speed: 50 },
  rotary: { cricut: 'Felt', passes: 1, speed: 35 },
};

/** Fill in cut settings missing from materials saved by older versions. */
export function withMaterialDefaults(m) {
  const preset = DEFAULT_MATERIALS.find((d) => d.id === m.id) || {};
  const tool = TOOL_DEFAULTS[m.tool] || TOOL_DEFAULTS.fine;
  return {
    ...m,
    cricut: m.cricut || preset.cricut || tool.cricut,
    passes: m.passes || preset.passes || tool.passes,
    speed: m.speed || preset.speed || tool.speed,
  };
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

export const TOOL_NAMES = { fine: 'Fine-Point Blade', knife: 'Knife Blade', rotary: 'Rotary Blade' };

/** Usable sheet area for a material on a machine (clipped to the cut area). */
export function effectiveSheet(material, machine) {
  const [w, h] = material.sheet;
  const [cw, ch] = machine.cut;
  return [Math.min(w, cw), Math.min(h, ch)];
}

export const SCALES = [6, 12, 24, 48, 87];
