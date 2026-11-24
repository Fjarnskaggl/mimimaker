// Bought round stock that pieces stand on or thread onto: dowels, wire and
// brass tube, cut to length. Pieces declare them as `rod` components (see
// src/pieces/README.md); compileKit draws them and lists them in
// compiled.hardware, and the bill of materials prices them. Never cut.

/** Bought round stock for rods (see pieces/README.md): what to buy, and its colour in 3D. */
export const HARDWARE = {
  dowel: { name: 'wooden dowel', alt: 'or a bamboo skewer', color: '#c9a36b' },
  wire: { name: 'craft wire', alt: 'or a straightened paperclip', color: '#a7a9ac' },
  tube: { name: 'brass tube', alt: 'or a drinking straw; LED wires can run inside', color: '#c8a24a' },
};
export const HARDWARE_COLORS = Object.fromEntries(Object.entries(HARDWARE).map(([k, v]) => [k, v.color]));
const mmText = (d) => String(Math.round(d * 10) / 10);
/** "a 2 mm brass tube (or a drinking straw; …)" */
export const hardwareName = (stock, d) => {
  const h = HARDWARE[stock] || HARDWARE.dowel;
  return `a ${mmText(d)} mm ${h.name} (${h.alt})`;
};
