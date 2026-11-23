// Circuit model for the room's lights: every LED is wired in parallel
// across one supply (2×AA box, CR2032 coin cell or a USB lead).
//
// All numbers are deliberately conservative ESTIMATES, not measurements:
// each LED is assumed to draw its worst-case 20 mA, battery capacities are
// below the usual datasheet figures and derated further at higher drain.
// Real LEDs with built-in resistors often draw less, so real batteries
// usually last longer than shown here.

/** Supplies. capacityMAh is a conservative usable figure, before derating. */
export const SUPPLIES = {
  aa2: {
    id: 'aa2', name: '2×AA battery box with switch', short: '2×AA battery box', volts: 3,
    capacityMAh: 2000, recommendedMA: 250, maxMA: 500,
    // [up to this peak mA, fraction of capacity you actually get]
    derate: [[25, 0.8], [100, 0.65], [250, 0.5], [Infinity, 0.35]],
  },
  cr2032: {
    id: 'cr2032', name: 'CR2032 coin-cell holder with switch', short: 'CR2032 coin cell', volts: 3,
    capacityMAh: 220, recommendedMA: 20, maxMA: 45,
    derate: [[2, 0.9], [10, 0.55], [20, 0.35], [Infinity, 0.25]],
  },
  usb: {
    id: 'usb', name: 'USB lead with inline switch', short: 'USB lead', volts: 5,
    capacityMAh: null, recommendedMA: 400, maxMA: 500, derate: [],
  },
};

const BIGGER = { cr2032: 'a 2×AA battery box', aa2: 'a USB lead', usb: 'two USB leads, each powering half the lights' };

/** Worst-case current and typical forward voltage for each LED colour. */
const SPECS = {
  warm: { vf: 3.0, mA: 20 },
  cool: { vf: 3.0, mA: 20 },
  pink: { vf: 3.0, mA: 20 },
  green: { vf: 3.0, mA: 20 },
  amber: { vf: 2.0, mA: 20 },
};
export const ledSpec = (color) => ({ ...(SPECS[color] || SPECS.warm) });

/** Which supply a kit's power settings mean (older kits only have `kind`). */
export function supplyFor(power) {
  if (power?.supply && SUPPLIES[power.supply]) return power.supply;
  return power?.kind === 'usb' ? 'usb' : 'aa2';
}

/**
 * Estimated hours of light. `mA` is the average draw; `peakMA` (default mA)
 * picks the derating, so flickering lights aren't credited with a gentle load.
 */
export function batteryLifeHours(supplyId, mA, peakMA = mA) {
  const s = SUPPLIES[supplyId];
  if (!s?.capacityMAh || !(mA > 0)) return null;
  const [, k] = s.derate.find(([lim]) => peakMA <= lim);
  return (s.capacityMAh * k) / mA;
}

/** Rounded-down, plain-language battery life. */
export function formatLife(hours) {
  if (hours == null) return 'runs while plugged in';
  if (hours < 1) return 'under 1 hour';
  if (hours < 48) { const h = Math.floor(hours); return `about ${h} hour${h === 1 ? '' : 's'}`; }
  return `about ${Math.floor(hours / 24)} days`;
}

export const ESTIMATE_NOTE = 'Estimates only: assumes 20 mA per LED (worst case for pre-wired micro LEDs) and less battery capacity than the packet says. Real numbers vary with brand, temperature and battery age.';

/**
 * @param leds [{ color, duty?, mA?, bulbs?, needs5V? }] — one entry per light (see
 *   effects.js effectLoad); mA is its peak current, duty (0–1) its average share
 * @param supplyId key of SUPPLIES
 */
export function planCircuit(leds, supplyId) {
  const supply = SUPPLIES[supplyId] || SUPPLIES.aa2;
  const specs = leds.map((l) => {
    const base = ledSpec(l.color);
    return { vf: base.vf, mA: l.mA ?? base.mA, duty: Math.min(1, Math.max(0, l.duty ?? 1)), bulbs: l.bulbs ?? 1, needs5V: !!l.needs5V };
  });
  const totalMA = specs.reduce((s, l) => s + l.mA, 0);
  const averageMA = specs.reduce((s, l) => s + l.mA * l.duty, 0);
  const n = leds.length;
  const bulbs = specs.reduce((s, l) => s + l.bulbs, 0);
  const warnings = [];
  let status = 'ok';
  const what = bulbs === n ? `${n} LED${n === 1 ? '' : 's'}` : `${n} light${n === 1 ? '' : 's'} (${bulbs} LEDs)`;
  const draw = `${what} can draw up to ${totalMA} mA`;
  if (supply.id !== 'usb' && specs.some((l) => l.needs5V)) {
    status = 'error';
    warnings.push({ level: 'error', msg: `LED strips need 5 V — a ${supply.short} can't light them. Switch the power to a USB lead.` });
  }
  if (totalMA > supply.maxMA) {
    status = 'error';
    warnings.push({ level: 'error', msg: `${draw} — more than a ${supply.short} can supply (${supply.maxMA} mA). Use ${BIGGER[supply.id]}, or fewer lights.` });
  } else if (totalMA > supply.recommendedMA) {
    if (status === 'ok') status = 'warn';
    warnings.push({ level: 'warn', msg: `${draw}, more than the ${supply.recommendedMA} mA a ${supply.short} handles comfortably — the lights will be dim and the battery won't last. ${cap(BIGGER[supply.id])} is safer.` });
  }
  if (n && supply.id === 'usb') {
    warnings.push({ level: 'info', msg: 'USB gives 5 V: use LEDs sold for USB / 5 V (or a USB lead with a 3 V regulator). Plain 3 V LEDs burn out on 5 V.' });
  }
  if (n && supply.volts < 3.5 && specs.some((l) => l.vf >= 2.8)) {
    warnings.push({ level: 'info', msg: `White, pink and green LEDs need nearly the full 3 V, so they dim as the ${supply.id === 'cr2032' ? 'coin cell runs' : 'batteries run'} down.` });
  }
  const lifeHours = batteryLifeHours(supply.id, averageMA, totalMA);
  return {
    wiring: 'parallel', supply, count: n, bulbs, totalMA, averageMA,
    budget: { recommendedMA: supply.recommendedMA, maxMA: supply.maxMA },
    load: totalMA / supply.maxMA, status, lifeHours,
    lifeText: n ? formatLife(lifeHours) : '',
    warnings, estimateNote: ESTIMATE_NOTE,
  };
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
