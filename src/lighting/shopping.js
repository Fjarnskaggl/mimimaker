// Shopping list for the room's lights: parts, quantities and a rough cost.
// Prices are deliberately loose ranges in US dollars — estimates only.

import { LED_COLORS } from '../lighting.js';
import { SUPPLIES } from './circuit.js';
import { CUTOUTS } from './cutouts.js';

export const PRICE_NOTE = 'Prices are rough estimates in US dollars from typical hobby and online shops — check your local shop. Buy one or two spare LEDs.';

const PRICES = {
  led: [0.3, 1], candle: [0.5, 1.5], fairy: [2, 6], stripReel: [3, 8],
  'box-aa2': [1, 3], 'cells-aa': [0.5, 1.5], 'box-cr2032': [1, 2.5], 'cells-cr2032': [0.5, 1.5],
  'usb-lead': [2, 5], 'usb-socket': [0.5, 2], 'push-switch': [0.3, 1],
};
const STRIP_REEL_MM = 500;

const colorName = (c) => (LED_COLORS[c]?.name || c || 'warm white').toLowerCase();
const range = (key, qty = 1) => ({ low: PRICES[key][0] * qty, high: PRICES[key][1] * qty });

/**
 * @param lighting compiled.lighting (from compileKit)
 * @returns { items: [{ id, qty, name, note, cost: { low, high } }], total, note } or null
 */
export function shoppingList(lighting) {
  if (!lighting?.enabled || !lighting.leds?.length) return null;
  const items = [];
  const add = (id, qty, name, note, priceKey) => items.push({ id, qty, name, note, cost: range(priceKey, qty) });

  // single LEDs, grouped by effect and colour
  const groups = new Map();
  for (const l of lighting.leds) {
    const effect = l.effect || 'steady';
    if (effect !== 'steady' && effect !== 'candle') continue;
    const key = `led-${effect}-${l.color}`;
    const g = groups.get(key) || { effect, color: l.color, qty: 0, lead: 0 };
    g.qty += 1;
    g.lead = Math.max(g.lead, l.leadCm || 0);
    groups.set(key, g);
  }
  for (const [id, g] of groups) {
    const kind = g.effect === 'candle' ? 'flicker (candle) micro LED' : 'micro LED';
    add(id, g.qty, `Pre-wired 3 V ${kind}, ${colorName(g.color)}`, `built-in resistor; leads at least ${g.lead} cm`, g.effect === 'candle' ? 'candle' : 'led');
  }

  // fairy strings, grouped by bulb count
  const fairies = new Map();
  for (const l of lighting.leds.filter((x) => x.effect === 'fairy')) {
    const b = l.load?.bulbs ?? 10;
    const f = fairies.get(b) || { qty: 0, len: 0 };
    f.qty += 1;
    f.len = Math.max(f.len, l.load?.lengthMm ?? 0);
    fairies.set(b, f);
  }
  for (const [b, f] of fairies) {
    add(`fairy-${b}`, f.qty, `Micro fairy-light string, ${b} bulbs`, `copper wire, at least ${Math.round(f.len)} mm long; battery or USB to match your power`, 'fairy');
  }

  // LED strip: total length, bought in 0.5 m reels
  const strips = lighting.leds.filter((x) => x.effect === 'strip');
  if (strips.length) {
    const lens = strips.map((l) => Math.round(l.load?.lengthMm ?? 0));
    const total = lens.reduce((a, b) => a + b, 0);
    const reels = Math.max(1, Math.ceil(total / STRIP_REEL_MM));
    const perM = strips[0].load?.ledsPerM ?? 60;
    add('strip', reels, `5 V LED strip, ${perM} LED/m, ${STRIP_REEL_MM / 1000} m reel`, `cut ${total} mm in total (${lens.join(' + ')} mm) at the cut marks`, 'stripReel');
  }

  // power
  const supply = lighting.power?.supply || 'aa2';
  const flush = lighting.power?.mount === 'flush';
  const boxNote = flush ? 'switch shows through the slot in the wall' : 'glued to the outside of the room';
  if (supply === 'usb') {
    if (flush) {
      add('usb-socket', 1, 'USB-C panel-mount power socket (2-pin)', `fits a ${CUTOUTS.usb.w} × ${CUTOUTS.usb.h} mm slot`, 'usb-socket');
      add('push-switch', 1, '6 mm latching push switch', `fits the ${CUTOUTS.button.d} mm hole`, 'push-switch');
    } else {
      add('usb-lead', 1, SUPPLIES.usb.name, '5 V; any USB phone charger powers it', 'usb-lead');
    }
  } else if (supply === 'cr2032') {
    add('box-cr2032', 1, SUPPLIES.cr2032.name, boxNote, 'box-cr2032');
    add('cells-cr2032', 1, 'CR2032 coin cell', '3 V lithium', 'cells-cr2032');
  } else {
    add('box-aa2', 1, SUPPLIES.aa2.name, boxNote, 'box-aa2');
    add('cells-aa', 2, 'AA alkaline battery', '1.5 V each, 3 V together', 'cells-aa');
  }

  const total = items.reduce((t, i) => ({ low: t.low + i.cost.low, high: t.high + i.cost.high }), { low: 0, high: 0 });
  return { items, total, note: PRICE_NOTE };
}

const money = (v) => v.toFixed(2);

/** Plain-text list, e.g. for shopping-list.txt in the zip. */
export function shoppingListText(list) {
  if (!list) return '';
  const lines = ['Lighting shopping list', ''];
  for (const i of list.items) lines.push(`${String(i.qty).padStart(3)} × ${i.name} — ${i.note} (≈ $${money(i.cost.low)}–${money(i.cost.high)})`);
  lines.push('', `Estimated total: $${money(list.total.low)}–${money(list.total.high)}`, '', list.note, '');
  return lines.join('\n');
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** CSV for spreadsheets, e.g. shopping-list.csv in the zip. */
export function shoppingListCSV(list) {
  if (!list) return '';
  const rows = [['Qty', 'Item', 'Note', 'Est. low', 'Est. high']];
  for (const i of list.items) rows.push([i.qty, i.name, i.note, money(i.cost.low), money(i.cost.high)]);
  rows.push(['', 'Total (estimate)', '', money(list.total.low), money(list.total.high)]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
