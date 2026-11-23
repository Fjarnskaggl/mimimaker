// Effect modules: what kind of light sits at each LED position, how much
// current it draws (conservatively), and where it can sensibly go.
//
//   steady  one pre-wired micro LED (the default, and every older kit)
//   candle  a flicker LED: full current at its peak, dimmer on average
//   fairy   a fairy-light string on thin copper wire, fed through one hole
//   strip   a piece of 5 V LED strip, cut at its cut marks
//   fan, turntable, vibe, sound  moving and sound parts on the same circuit
//           (no LED: see motion.js for their holes, cut parts and steps)
//
// Lengths of strings and strips are real product lengths in mm (not scaled).

import { ledSpec } from './circuit.js';

export const EFFECTS = {
  steady: { name: 'Steady LED', blurb: 'One pre-wired micro LED.' },
  candle: {
    name: 'Candle flicker', blurb: 'A flicker LED for candles, fires and lanterns.',
    // flicker LEDs are lit at full current for part of the time; 0.6 of the
    // peak on average is a cautious figure for battery life
    duty: 0.6,
  },
  fairy: {
    name: 'Fairy-light string', blurb: 'Tiny bulbs on thin copper wire, fed through one hole.',
    mAPerBulb: 4, // micro fairy bulbs usually draw 1–3 mA; 4 mA is on the safe side
    defaults: { bulbs: 10, lengthMm: 500 },
  },
  strip: {
    name: 'LED strip', blurb: 'A piece of 5 V LED strip, cut at its marks (USB power).',
    mAPerLed: 20, // worst case per LED on a 5 V strip at full brightness
    ledsPerCut: 3, // cut marks every 3 LEDs on many 5 V strips
    defaults: { lengthMm: 100, ledsPerM: 60 },
  },
  // devices: current is a conservative running figure in mA (see motion.js for the parts)
  fan: {
    name: 'Ceiling fan (motor)', blurb: 'A geared 3 V micro motor above the ceiling turns cut fan blades.',
    device: true, mA: 80, defaults: { sizeMm: 60 }, // 45 mA no-load, more with blades
  },
  turntable: {
    name: 'Turntable (motor)', blurb: 'A geared 3 V micro motor under the floor turns a cut platform.',
    device: true, mA: 80, defaults: { sizeMm: 50 },
  },
  vibe: { name: 'Vibration (motor)', blurb: 'A 10 mm vibration disc that makes a piece tremble.', device: true, mA: 60 },
  sound: {
    name: 'Sound loop', blurb: 'A sound board, amp and 28 mm speaker behind a grille, looping one sound.',
    device: true, mA: 150, duty: 0.4, // estimate: amp peaks at moderate volume, quieter on average
  },
};

export const effectOf = (led) => (EFFECTS[led?.effect] ? led.effect : 'steady');

/** Electrical load of one light, in the form planCircuit takes. */
export function effectLoad(led) {
  const color = led.color || 'warm';
  const base = ledSpec(color);
  const fx = EFFECTS[effectOf(led)];
  if (fx.device) return { color: null, mA: fx.mA, duty: fx.duty ?? 1, bulbs: 0, needs5V: false, device: true, motor: effectOf(led) !== 'sound', vf: 0 };
  switch (effectOf(led)) {
    case 'candle':
      return { color, mA: base.mA, duty: EFFECTS.candle.duty, bulbs: 1, needs5V: false };
    case 'fairy': {
      const bulbs = Math.max(1, Math.round(led.bulbs ?? EFFECTS.fairy.defaults.bulbs));
      const lengthMm = led.lengthMm ?? EFFECTS.fairy.defaults.lengthMm;
      return { color, mA: bulbs * EFFECTS.fairy.mAPerBulb, duty: 1, bulbs, needs5V: false, lengthMm };
    }
    case 'strip': {
      const bulbs = stripLeds(led);
      const { lengthMm, ledsPerM } = stripSpec(led);
      return { color, mA: bulbs * EFFECTS.strip.mAPerLed, duty: 1, bulbs, needs5V: true, lengthMm, ledsPerM };
    }
    default:
      return { color, mA: base.mA, duty: clamp01(led.duty ?? 1), bulbs: 1, needs5V: false };
  }
}

const stripSpec = (led) => ({
  lengthMm: Math.max(0, led.lengthMm ?? EFFECTS.strip.defaults.lengthMm),
  ledsPerM: Math.max(1, led.ledsPerM ?? EFFECTS.strip.defaults.ledsPerM),
});
const stripLeds = (led) => { const { lengthMm, ledsPerM } = stripSpec(led); return Math.max(1, Math.floor((lengthMm / 1000) * ledsPerM + 1e-9)); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Placement rules for one light.
 * @param place { face, mount, start, span } — start: mm along the run where the
 *   light sits; span: mm available along that face
 * @param title label used in messages, e.g. "L2 (Shelf strip)"
 */
export function effectWarnings(led, place, title) {
  const out = [];
  const effect = effectOf(led);
  if (effect === 'fan' && place.face !== 'top') {
    out.push({ level: 'warn', msg: `${title} is a ceiling fan — put it on the ceiling.` });
  }
  if (effect === 'turntable' && place.face !== 'bottom') {
    out.push({ level: 'warn', msg: `${title} is a turntable — put it on the floor.` });
  }
  if (effect === 'candle' && place.mount === 'ceiling') {
    out.push({ level: 'info', msg: `${title} is a flicker candle on the ceiling — candles look right standing up: on a sconce, a table or the floor.` });
  }
  if (effect === 'strip') {
    const { lengthMm, ledsPerM } = stripSpec(led);
    const end = place.start + lengthMm;
    if (end > place.span + 0.5) {
      out.push({ level: 'warn', msg: `${title}: the ${fmt(lengthMm)} mm strip runs ${fmt(end - place.span)} mm past the end of the wall — shorten it or move it.` });
    }
    const cut = (EFFECTS.strip.ledsPerCut * 1000) / ledsPerM;
    const k = lengthMm / cut;
    if (Math.abs(k - Math.round(k)) > 0.02) {
      const down = Math.max(1, Math.floor(k)) * cut;
      out.push({ level: 'info', msg: `${title}: LED strip can only be cut at its marks (every ${fmt(cut)} mm on a ${ledsPerM} LED/m strip) — use ${fmt(down)} mm.` });
    }
  }
  if (effect === 'fairy') {
    const len = led.lengthMm ?? EFFECTS.fairy.defaults.lengthMm;
    if (len > 3 * place.span) {
      out.push({ level: 'info', msg: `${title}: a ${fmt(len)} mm fairy string is long for this spot — coil or zig-zag the spare, or hide it in a jar.` });
    }
  }
  return out;
}

const fmt = (v) => String(Math.round(v * 10) / 10);
