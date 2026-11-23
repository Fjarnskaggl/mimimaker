// Bill of materials: what to buy for a kit, a rough cost, how hard it is and
// how long it takes. Everything is derived from the compiled kit and its
// build steps, so it always matches the cut files and the guide.
//
// billOfMaterials(kit, compiled, steps?) → {
//   sheets:   [{ id, qty, name, note, cost: { low, high, currency }, unpriced }]   one line per material
//   supplies: [{ id, qty, name, note, cost }]                   glue, acetate, vellum
//   lights:   T5's shoppingList items (LEDs, power), unchanged
//   totals: [{ currency, low, high }]   one per currency
//   total:  the total in the kit's currency (the only one unless mixed)
//   currency, note,
//   difficulty: { level, score, reasons[] },
//   time: { cutMin, assemblyMin, glueMin, totalMin },   glueMin: waiting that can't overlap other work
// }
// Sheets cost what the material library says (T3: each material's price per
// sheet, in the kit's currency). Glue and lights are loose US-dollar ranges,
// like the lighting shopping list's, and say so.

import { estimateCutMinutes, formatMinutes } from '../make.js';
import { shoppingList } from '../lighting/shopping.js';
import { buildSteps } from './steps.js';
import { kitMaterialCost } from '../export/cost.js';
import { defaultCurrency, formatMoney } from '../materials.js';

const TIME_NOTE = 'Times are for a first build; cutting runs on the machine while you start gluing.';
export const BOM_NOTE = `Sheet prices come from your material library (edit them on the Make step). Glue and light prices are rough estimates in US dollars from typical craft and online shops — check your local shop. ${TIME_NOTE}`;
const bomNote = (currency) => (currency === '$' ? BOM_NOTE
  : `Sheet prices come from your material library, in ${currency.trim()} (edit them on the Make step). Glue and light prices are rough estimates in US dollars from typical craft and online shops — check your local shop. ${TIME_NOTE}`);

/** The kit's currency symbol: its own, else guessed from the browser's language. */
// Same guess as the Make step's kitCurrency (src/ui/t3.js), but only in a
// browser: Node also has navigator.language, and the bill must not change
// with the machine's locale.
const browserLang = () => (typeof window !== 'undefined' && typeof navigator !== 'undefined' ? navigator.language || '' : '');
export const bomCurrency = (kit) => kit.currency || defaultCurrency(browserLang());
/** '$' means US dollars unless the browser says another dollar (CA, AU, NZ, MX). */
const isUSD = (currency) => currency === '$' && !/[-_](CA|AU|NZ|MX)\b/i.test(browserLang());

/** "$1.50" for an exact cost, "$1.00–2.50" for a range. */
export function costText({ low, high, currency = '$' }) {
  return Math.abs(high - low) < 0.005 ? formatMoney(low, currency) : `${formatMoney(low, currency)}–${(Math.round(high * 100) / 100).toFixed(2)}`;
}
/** The bill's total(s): "$11.45–30.80", or "€8.00 + $5.50–15.00" across currencies. */
export const totalText = (bom) => bom.totals.map(costText).join(' + ')
  + (bom.sheets.some((s) => s.unpriced) ? ' plus unpriced sheets' : '');
export const DIFFICULTY = ['Beginner', 'Intermediate', 'Advanced'];

const SUPPLY_PRICES = { pva: [2, 5], stick: [1, 3], clear: [3, 6], acetate: [0.5, 1.5], vellum: [0.5, 1.5] };

/** Minutes of hands-on work per step: a base, plus each part and joint. */
const MIN_PER_STEP = { build: 4, place: 3, info: 10 };
const MIN_PER_PART = 1;
const MIN_PER_JOINT = 0.5;
const MIN_PER_LED = 5;

const line = (id, qty, name, note, [low, high]) => ({ id, qty, name, note, cost: { low: low * qty, high: high * qty } });

export function billOfMaterials(kit, compiled, steps = buildSteps(kit, compiled), { currency = bomCurrency(kit) } = {}) {
  const { sheets, usedMats, parts, groups } = compiled;
  const kindOf = new Map(usedMats.map((m) => [m.id, m.kind]));

  // ------------------------------------------------------------ sheets
  // from the material library, so Build and Make agree on what the sheets cost
  const lib = kitMaterialCost(sheets, { currency });
  const sheetLines = lib.lines.map((l) => {
    const m = usedMats.find((x) => x.id === l.id);
    const size = m?.sheet ? `${m.sheet[0]} × ${m.sheet[1]} mm` : '';
    return {
      id: l.id, qty: l.sheets, name: `${l.name} sheet`, unpriced: l.unpriced,
      note: [size, l.unpriced ? 'no price set — add one on the Make step' : `${formatMoney(l.pricePerSheet, currency)} each`].filter(Boolean).join(' · '),
      cost: { low: l.cost, high: l.cost, currency },
    };
  });

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
  const lights = (shoppingList(compiled.lighting)?.items || []).map((i) => ({ ...i }));
  // a shell's suggested LED spots, until T5 plans their wiring (#16)
  const spots = compiled.lighting?.enabled ? 0 : compiled.shell?.lights?.length || 0;
  if (spots) lights.push(line('shell-leds', spots, 'Pre-wired 3 V micro LED, warm white', "one for each lit spot the shell suggests; add a battery box with switch", [0.3, 1]));

  // glue and light estimates are US dollars: tagged so they're only added to
  // sheet prices that are US dollars too
  const est = isUSD(currency) ? '$' : 'US$';
  for (const i of [...supplies, ...lights]) i.cost = { ...i.cost, currency: est };
  const all = [...sheetLines, ...supplies, ...lights];
  const byCur = new Map();
  for (const i of all) {
    const cur = i.cost.currency || '$';
    const t = byCur.get(cur) || { currency: cur, low: 0, high: 0 };
    t.low += i.cost.low;
    t.high += i.cost.high;
    byCur.set(cur, t);
  }
  // the kit's own currency first
  const totals = [...byCur.values()].sort((a, b) => (b.currency === currency) - (a.currency === currency));
  const total = totals[0]; // in the kit's currency; see totals when mixed

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

  return { sheets: sheetLines, supplies, lights, totals, total, currency, note: bomNote(currency), difficulty: difficulty(compiled, steps, leds), time };
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

/** Plain-text bill of materials, e.g. for a download or the zip. */
export function bomText(bom) {
  const out = ['Bill of materials', ''];
  const section = (title, list) => {
    if (!list.length) return;
    out.push(title);
    for (const i of list) out.push(`${String(i.qty).padStart(3)} × ${i.name} — ${i.note} (≈ ${costText(i.cost)})`);
    out.push('');
  };
  section('Sheets', bom.sheets);
  section('Glue and supplies', bom.supplies);
  section('Lights', bom.lights);
  out.push(`Estimated total: ${totalText(bom)}`);
  out.push(`Difficulty: ${bom.difficulty.level} (${bom.difficulty.reasons.join(', ')})`);
  out.push(`Build time: about ${formatMinutes(bom.time.totalMin)} — cutting ${formatMinutes(bom.time.cutMin)}, assembly ${formatMinutes(bom.time.assemblyMin)}, glue setting ${formatMinutes(bom.time.glueMin)}`);
  out.push('', bom.note, '');
  return out.join('\n');
}
