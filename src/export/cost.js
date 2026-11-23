// Kit material cost: sheets used per material × that material's price per
// sheet. Other modules (the bill of materials, the README) read this shape:
//
//   { currency, total, lines: [{ id, name, sheets, pricePerSheet, cost, unpriced }] }
//
// A started sheet counts as a whole sheet: you buy sheets, not square mm.

import { withMaterialDefaults } from '../materials.js';

export function kitMaterialCost(sheets, { currency = '$' } = {}) {
  const byId = new Map();
  for (const s of sheets) {
    const m = withMaterialDefaults(s.material);
    const line = byId.get(m.id) || { id: m.id, name: m.name, sheets: 0, pricePerSheet: m.price, cost: 0, unpriced: !(m.price > 0) };
    line.sheets += 1;
    line.cost = Math.round(line.sheets * line.pricePerSheet * 100) / 100;
    byId.set(m.id, line);
  }
  const lines = [...byId.values()];
  const total = Math.round(lines.reduce((t, l) => t + l.cost, 0) * 100) / 100;
  return { currency, total, lines };
}
