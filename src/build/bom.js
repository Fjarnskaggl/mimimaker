// Bill of materials: what to buy for a kit, a rough cost, how hard it is and
// how long it takes. Everything is derived from the compiled kit and its
// build steps, so it always matches the cut files and the guide.
//
// billOfMaterials(kit, compiled, steps?) → {
//   sheets:   [{ id, qty, name, note, cost: { low, high } }]   one line per material
//   supplies: [{ id, qty, name, note, cost }]                   glue, acetate, vellum
//   lights:   T5's shoppingList items (LEDs, power), unchanged
//   total: { low, high }, note,
//   difficulty: { level, score, reasons[] },
//   time: { cutMin, assemblyMin, glueMin, totalMin },   glueMin: waiting that can't overlap other work
// }
// Prices are loose US-dollar ranges, like the lighting shopping list's.

import { estimateCutMinutes, formatMinutes } from '../make.js';
import { shoppingList } from '../lighting/shopping.js';
import { buildSteps } from './steps.js';

export const BOM_NOTE = 'Prices are rough estimates in US dollars from typical craft and online shops, for whole sheets and packs — check your local shop. Times are for a first build; cutting runs on the machine while you start gluing.';
export const DIFFICULTY = ['Beginner', 'Intermediate', 'Advanced'];

/** Price of one sheet, by material id, else by kind. */
const SHEET_PRICES = {
  chip2: [1, 2.5], chip15: [0.8, 2], bass16: [2, 4], bass08: [1.5, 3],
  card110: [0.3, 0.8], card65: [0.15, 0.5], paper: [0.3, 1], acetate: [0.5, 1.5], felt: [0.3, 1],
};
const KIND_PRICES = { board: [1, 3], card: [0.2, 0.8], fabric: [0.3, 1] };
const SUPPLY_PRICES = { pva: [2, 5], stick: [1, 3], clear: [3, 6], acetate: [0.5, 1.5], vellum: [0.5, 1.5] };

/** Minutes of hands-on work per step: a base, plus each part and joint. */
const MIN_PER_STEP = { build: 4, place: 3, info: 10 };
const MIN_PER_PART = 1;
const MIN_PER_JOINT = 0.5;
const MIN_PER_LED = 5;

const line = (id, qty, name, note, [low, high]) => ({ id, qty, name, note, cost: { low: low * qty, high: high * qty } });

export function billOfMaterials(kit, compiled, steps = buildSteps(kit, compiled)) {
  const { sheets, usedMats, parts, groups } = compiled;
  const kindOf = new Map(usedMats.map((m) => [m.id, m.kind]));

  // ------------------------------------------------------------ sheets
  const sheetLines = usedMats.map((m) => {
    const qty = sheets.filter((s) => s.material.id === m.id).length;
    const [w, h] = m.sheet;
    return line(m.id, qty, `${m.name} sheet`, `${w} × ${h} mm`, SHEET_PRICES[m.id] || KIND_PRICES[m.kind] || KIND_PRICES.card);
  }).filter((l) => l.qty > 0);

  // ---------------------------------------------------------- supplies
  const supplies = [];
  const used = (kind) => parts.some((p) => kindOf.get(p.material) === kind);
  const has = (title) => groups.some((g) => g.title === title && g.parts.length);
  const text = groups.flatMap((g) => g.steps).join(' ');
  if (used('board')) supplies.push(line('pva', 1, 'PVA wood glue (or tacky glue)', 'for finger joints and slots', SUPPLY_PRICES.pva));
  if (used('card') || used('fabric') || has('Wallpaper') || has('Flooring')) {
    supplies.push(line('stick', 1, 'Glue stick or spray adhesive', 'for wallpaper, flooring and card', SUPPLY_PRICES.stick));
  }
  const acetateCut = usedMats.some((m) => m.id === 'acetate' || /acetate/i.test(m.name));
  if (acetateCut) supplies.push(line('clear', 1, 'Clear-drying glue', 'for acetate panes; keep it off the openings', SUPPLY_PRICES.clear));
  const windows = parts.some((p) => p.group === 'Window & door trim' && /window/i.test(p.name));
  if (windows && !acetateCut) supplies.push(line('acetate', 1, 'Clear acetate sheet (optional)', 'window glass behind the frames', SUPPLY_PRICES.acetate));
  if (/vellum|tracing paper/i.test(text)) supplies.push(line('vellum', 1, 'Vellum or tracing paper', 'diffuses the light behind lit windows', SUPPLY_PRICES.vellum));

  // ------------------------------------------------------------ lights
  const lights = shoppingList(compiled.lighting)?.items || [];
  // a shell's suggested LED spots, until T5 plans their wiring (#16)
  const spots = compiled.lighting?.enabled ? 0 : compiled.shell?.lights?.length || 0;
  if (spots) lights.push(line('shell-leds', spots, 'Pre-wired 3 V micro LED, warm white', "one for each lit spot the shell suggests; add a battery box with switch", [0.3, 1]));

  const all = [...sheetLines, ...supplies, ...lights];
  const total = all.reduce((t, i) => ({ low: t.low + i.cost.low, high: t.high + i.cost.high }), { low: 0, high: 0 });

  // -------------------------------------------------------------- time
  // planned LEDs, or the shell's suggested spots (both are on the bill above)
  const leds = (compiled.lighting?.enabled ? compiled.lighting.leds?.length || 0 : 0) + spots;
  const cutMin = sheets.reduce((s, sh) => s + estimateCutMinutes(sh), 0);
  let assemblyMin = 0, glueMin = 0;
  steps.forEach((st, i) => {
    assemblyMin += (MIN_PER_STEP[st.kind] ?? MIN_PER_STEP.build) + MIN_PER_PART * st.parts.length + MIN_PER_JOINT * st.joints.length;
    if (st.kind === 'info' && st.group === 'Lighting') assemblyMin += MIN_PER_LED * leds;
    // waiting only counts when the next step builds on this one; otherwise
    // the glue sets while you start the next piece
    const next = steps[i + 1];
    if (st.kind !== 'info' && (!next || next.group === st.group || next.kind === 'place')) glueMin += st.cureMin || 0;
  });
  assemblyMin += MIN_PER_LED * spots; // no wiring step for shell spots yet
  const time = { cutMin, assemblyMin, glueMin, totalMin: cutMin + assemblyMin + glueMin };

  return { sheets: sheetLines, supplies, lights, total, note: BOM_NOTE, difficulty: difficulty(compiled, steps, leds), time };
}

/** A score from what makes a kit fiddly, with the reasons in plain words. */
function difficulty(compiled, steps, leds) {
  const reasons = [];
  let score = 0;
  const kinds = new Set(steps.flatMap((s) => s.joints.map((j) => j.kind)));
  const n = compiled.parts.length;
  if (kinds.has('finger')) { score += 1; reasons.push('finger-jointed board'); }
  if (kinds.has('slot')) { score += 1; reasons.push('parts that slot in before a box closes'); }
  if (!kinds.has('finger') && !kinds.has('slot')) reasons.push('fold-up card with glue tabs');
  if (n > 60) { score += 2; reasons.push(`${n} parts`); } else if (n > 30) { score += 1; reasons.push(`${n} parts`); } else reasons.push(n <= 15 ? `only ${n} parts` : `${n} parts`);
  if (leds > 3) { score += 2; reasons.push(`${leds} LEDs to wire`); } else if (leds) { score += 1; reasons.push(`${leds} LED${leds === 1 ? '' : 's'} to wire`); }
  const layered = compiled.shell && steps.some((s) => s.parts.length >= 8 && !s.joints.some((j) => j.kind === 'finger') && s.joints.every((j) => j.kind === 'flat'));
  if (layered) { score += 2; reasons.push('layered relief to stack'); } else if (compiled.shell) { score += 1; reasons.push('a book-nook shell'); }
  const level = DIFFICULTY[score <= 2 ? 0 : score <= 4 ? 1 : 2];
  return { level, score, reasons };
}

const money = (v) => v.toFixed(2);

/** Plain-text bill of materials, e.g. for a download or the zip. */
export function bomText(bom) {
  const out = ['Bill of materials', ''];
  const section = (title, list) => {
    if (!list.length) return;
    out.push(title);
    for (const i of list) out.push(`${String(i.qty).padStart(3)} × ${i.name} — ${i.note} (≈ $${money(i.cost.low)}–${money(i.cost.high)})`);
    out.push('');
  };
  section('Sheets', bom.sheets);
  section('Glue and supplies', bom.supplies);
  section('Lights', bom.lights);
  out.push(`Estimated total: $${money(bom.total.low)}–${money(bom.total.high)}`);
  out.push(`Difficulty: ${bom.difficulty.level} (${bom.difficulty.reasons.join(', ')})`);
  out.push(`Build time: about ${formatMinutes(bom.time.totalMin)} — cutting ${formatMinutes(bom.time.cutMin)}, assembly ${formatMinutes(bom.time.assemblyMin)}, glue setting ${formatMinutes(bom.time.glueMin)}`);
  out.push('', bom.note, '');
  return out.join('\n');
}
