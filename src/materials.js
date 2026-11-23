// Material and machine presets. Sheet sizes are in mm (width × height).
//
// kind:  'board'  → rigid; boxes use finger joints (needs Knife Blade)
//        'card'   → thin; boxes become fold-up nets with glue tabs
//        'fabric' → flat pieces only (rugs, cushions)
// tool:  the Cricut blade the material needs.

export const DEFAULT_MATERIALS = [
  { id: 'chip2', name: 'Chipboard 2.0 mm', thickness: 2.0, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#b8956a' },
  { id: 'chip15', name: 'Chipboard 1.5 mm', thickness: 1.5, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#c9a77d' },
  { id: 'bass16', name: 'Basswood 1/16" (1.6 mm)', thickness: 1.6, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#e6d2a6' },
  { id: 'bass08', name: 'Basswood 1/32" (0.8 mm)', thickness: 0.8, kind: 'board', tool: 'knife', sheet: [279, 279], color: '#eedfbf' },
  { id: 'card110', name: 'Heavy cardstock 110 lb', thickness: 0.38, kind: 'card', tool: 'fine', sheet: [305, 305], color: '#f3efe4' },
  { id: 'card65', name: 'Cardstock 65 lb', thickness: 0.25, kind: 'card', tool: 'fine', sheet: [216, 279], color: '#c9d8e2' },
  { id: 'paper', name: 'Patterned paper', thickness: 0.15, kind: 'card', tool: 'fine', sheet: [305, 305], color: '#e8c4bb' },
  { id: 'felt', name: 'Craft felt 1 mm', thickness: 1.0, kind: 'fabric', tool: 'rotary', sheet: [229, 305], color: '#9db592' },
];

export const MACHINES = {
  maker: { name: 'Cricut Maker / Maker 3', cut: [292, 597], tools: ['fine', 'knife', 'rotary'] },
  explore: { name: 'Cricut Explore Air 2 / Explore 3', cut: [292, 597], tools: ['fine'] },
  joyxtra: { name: 'Cricut Joy Xtra', cut: [216, 292], tools: ['fine'] },
  joy: { name: 'Cricut Joy', cut: [108, 292], tools: ['fine'] },
};

export const TOOL_NAMES = { fine: 'Fine-Point Blade', knife: 'Knife Blade', rotary: 'Rotary Blade' };

/** Usable sheet area for a material on a machine (clipped to the cut area). */
export function effectiveSheet(material, machine) {
  const [w, h] = material.sheet;
  const [cw, ch] = machine.cut;
  return [Math.min(w, cw), Math.min(h, ch)];
}

export const SCALES = [6, 12, 24, 48, 87];
