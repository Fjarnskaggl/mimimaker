// Moving and sound parts that sit on the light circuit with no controller:
// a ceiling fan or a turntable on a geared micro motor, a vibration disc,
// and a sound board that loops one sound while the power is on.
//
// Real part sizes in mm (not scaled), from Adafruit's product pages:
//   geared "pager" motor, 3 V, 245 rpm, 45 mA no-load / 380 mA stall (3871)
//   vibration disc Ø10 × 2.7 mm, 60 mA at 3 V (1201)
//   Audio FX Mini 38 × 23 mm (2342) + PAM8302 mono amp (2130) + Ø28 mm speaker (1890)

import { ellipsePoly, rectPoly } from '../geometry.js';

export const MOTION = {
  shaftHole: 5, // mm: the motor's output shaft turns freely in it
  shaft: 3, // mm: the geared motor's output shaft (drawn in 3D)
  hubHole: 1.5, // mm: pierced in the rotor's hub, widened to grip the shaft
  hubR: 5, // mm, the rotor's hub
  mountPlate: 20, // mm square plate the motor is glued to, outside the ceiling / under the floor
  speaker: { d: 28, holeR: 1.4, pitch: 4.2 },
};

/** Geared motors drive a fan or turntable through a shaft hole; sound gets a grille. */
export const MOTOR_EFFECTS = new Set(['fan', 'turntable']);

/**
 * Cut-out(s) for an effect at (u, v) on a panel. `r` is the plain wire-hole radius.
 */
export function effectHoles(effect, u, v, r) {
  if (MOTOR_EFFECTS.has(effect)) return [ellipsePoly(u, v, MOTION.shaftHole / 2, MOTION.shaftHole / 2, 20)];
  if (effect === 'sound') {
    const { holeR, pitch } = MOTION.speaker;
    const holes = [ellipsePoly(u, v, holeR, holeR, 12)];
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      holes.push(ellipsePoly(u + pitch * Math.cos(a), v + pitch * Math.sin(a), holeR, holeR, 12));
      holes.push(ellipsePoly(u + 2 * pitch * Math.cos(a), v + 2 * pitch * Math.sin(a), holeR, holeR, 12));
    }
    return holes;
  }
  return [ellipsePoly(u, v, r, r, 20)];
}

/** Four-blade fan rotor of diameter `size`, centred on (cx, cy): outline + hub hole. */
export function fanRotor(cx, cy, size) {
  const R = size / 2, rh = Math.min(MOTION.hubR, R * 0.4);
  const half = Math.PI / 7; // half the angle each blade covers
  const pts = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const d = Math.abs(((a + Math.PI / 4) % (Math.PI / 2)) - Math.PI / 4); // angle from the nearest blade's centre line
    const r = d < half ? rh + (R - rh) * Math.sqrt(Math.cos((d / half) * (Math.PI / 2))) : rh;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return [pts, ellipsePoly(cx, cy, MOTION.hubHole / 2, MOTION.hubHole / 2, 12)];
}

/** Round turntable platform of diameter `size`: outline + hub hole. */
export function turntableDisc(cx, cy, size) {
  return [ellipsePoly(cx, cy, size / 2, size / 2, 64), ellipsePoly(cx, cy, MOTION.hubHole / 2, MOTION.hubHole / 2, 12)];
}

const mountPlate = () => {
  const s = MOTION.mountPlate;
  return [rectPoly(0, 0, s, s), ellipsePoly(s / 2, s / 2, MOTION.shaftHole / 2, MOTION.shaftHole / 2, 20)];
};

/**
 * Cut parts and steps for the planned lights' motion and sound effects.
 * @param leds planned LED entries ({ label, effect, size?, face })
 * @returns { parts: [{ name, role, polys }], steps: [string] }
 */
export function planMotion(leds) {
  const parts = [], steps = [];
  const motors = leds.filter((l) => MOTOR_EFFECTS.has(l.effect));
  for (const l of motors) {
    if (l.effect === 'fan') {
      parts.push({ name: `${l.label} fan blades`, role: 'effect', polys: fanRotor(0, 0, l.size) });
    } else {
      parts.push({ name: `${l.label} turntable`, role: 'effect', polys: turntableDisc(0, 0, l.size) });
    }
    // on the outside of the ceiling or floor, centred on the shaft hole
    const m = MOTION.mountPlate / 2;
    parts.push({ name: `${l.label} motor mount`, role: 'mount', polys: mountPlate(), place: { face: l.face, u: l.u - m, v: l.v - m, layer: 0 }, shaft: { u: l.u, v: l.v, into: l.effect === 'fan' ? 4 : 1 } });
  }
  const fans = motors.some((l) => l.effect === 'fan'), turns = motors.some((l) => l.effect === 'turntable');
  if (motors.length) {
    steps.push(
      `Motors (${motors.map((l) => l.label).join(', ')}): glue each motor to its motor mount with the shaft through the hole, then glue the mount ${[fans ? `on top of the ceiling${turns ? ' (fan)' : ''}` : '', turns ? `under the floor${fans ? ' (turntable)' : ''}` : ''].filter(Boolean).join(' or ')}, over the 5 mm shaft hole, so the shaft pokes into the room.${turns ? ' With a hidden base, a turntable motor sits inside the base.' : ''}`,
      `Pierce the hub hole of each ${[fans ? 'fan rotor' : '', turns ? 'turntable' : ''].filter(Boolean).join(' or ')}, push it onto the shaft from inside the room and fix it with a drop of glue; it should spin clear of the ${fans && turns ? 'ceiling or floor' : fans ? 'ceiling' : 'floor'}.${fans ? ' Twist a slight pitch into each fan blade.' : ''}`,
      'A motor has no + and −: if it spins the wrong way, swap its two wires. Motors draw a short surge when they start, so test them with fresh batteries.',
    );
  }
  if (leds.some((l) => l.effect === 'vibe')) {
    steps.push('Vibration disc: peel its backing and stick it under the piece that should tremble (a pot lid, a shelf of jars), with its wires through the hole.');
  }
  if (leds.some((l) => l.effect === 'sound')) {
    steps.push(
      'Sound: copy your sound to the Audio FX Mini as T00HOLDL.ogg (or .wav) and wire its trigger T00 to GND, so it loops whenever the power is on.',
      'Wire the board\'s audio out to the amp\'s input and the amp to the speaker. Glue the speaker behind the round grille, facing into the room; the board and amp go in the hidden base or behind the cable cover.',
    );
  }
  return { parts, steps };
}
