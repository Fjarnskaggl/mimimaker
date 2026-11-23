// LED wires inside a shell (#16): a light's wire runs square from the LED to
// the back wall's inner face (y = Di) and out through a small hole the shell
// cuts there. lighting/shell.js plans the rest of the route outside.

import { ellipsePoly } from '../geometry.js';

/** Radius of a wire hole (mm): a micro LED's two wires pass a 3 mm hole. */
export const WIRE_R = 1.5;

export const wireHole = (x, z) => ellipsePoly(x, z, WIRE_R, WIRE_R, 16);

/**
 * A light whose wire follows `via` (points after the LED) and leaves through
 * the back wall where the last point meets it. Returns the light and pushes
 * its exit hole onto `backHoles`.
 */
export function wiredLight({ p, name, where, color = 'warm', via, backHoles, ...rest }) {
  const path = [p, ...via];
  const [x, , z] = path.at(-1);
  backHoles.push(wireHole(x, z));
  return { p, color, name, where, ...rest, wire: { path, exit: [x, z] } };
}
