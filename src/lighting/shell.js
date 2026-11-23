// LEDs that a shell places itself (#16): the alley's cavity and backdrop
// lights. The shell gives each one a wire path inside it (along the cavity
// floor, square runs) ending at a hole it already cuts in its back wall; this
// turns that into an LED-map entry with the outside route to the power box
// and the minimum lead length.
//
// Map coordinates are the back wall's net coordinates (see lighting.js), so
// a shell point (x, y, z) is seen through the back wall at (x, z).

import { effectOf, effectLoad } from './effects.js';

const len3 = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]), 0);
const len2 = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const leadCm = (mm) => Math.ceil((mm / 10 + 3) / 5) * 5;

/** Shell lights the planner can wire: those with a path to a back-wall hole. */
export const wiredLights = (lights) => (lights || []).filter((l) => l.wire?.path?.length > 1 && l.wire.exit);

/**
 * @param light a shell light ({ p, color, name, where, wire: { path, exit } })
 * @param index its position among the kit's LEDs (for the label)
 * @param power the planned power box ({ face, p })
 * @param route (a, b) => { points, crossesOpening }: lighting.js routeWire, bound to the room
 * @param t wall thickness
 */
export function planShellLed(light, index, { power, route, t }) {
  const exit = light.wire.exit;
  const inside = light.wire.path.map(([x, , z]) => [x, z])
    .filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-9);
  const out = route({ face: 'back', p: exit }, power);
  const spec = { color: light.color || 'warm' };
  const length = len3(light.wire.path) + t + len2(out.points);
  return {
    label: `L${index + 1}`, name: light.name || '', mount: 'shell', where: light.where || '',
    face: 'back', u: exit[0], v: exit[1], p: inside[0], inside, color: spec.color,
    route: out.points, crossesOpening: out.crossesOpening, length, leadCm: leadCm(length),
    effect: effectOf(spec), load: effectLoad(spec),
  };
}
