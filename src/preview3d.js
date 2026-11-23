// Lightweight orthographic 3D preview rendered as SVG (painter's algorithm).

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(Math.min(255, c * k)));
  return `rgb(${ch.join(',')})`;
}

/**
 * @param {Array} faces  {layer, polys: [[x,y,z]…][], n, color, opacity, cull}
 * @param {object} view  {yaw, pitch} in degrees
 */
export function renderScene(faces, { yaw = -32, pitch = 26 } = {}) {
  const ya = (yaw * Math.PI) / 180, pa = (pitch * Math.PI) / 180;
  const cam = [Math.sin(ya) * Math.cos(pa), -Math.cos(ya) * Math.cos(pa), Math.sin(pa)];
  const fwd = cam.map((v) => -v);
  const right = normalize(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  const light = normalize([-0.4, -0.8, 1]);
  const proj = (p) => [dot(p, right), -dot(p, up)];

  const drawn = [];
  for (const face of faces) {
    const facing = dot(face.n, cam);
    let opacity = face.opacity;
    let ghost = false;
    if (face.layer < 2 && !face.glow && facing < -1e-6) { ghost = true; opacity = face.layer === 0 ? 0.12 : 0.06; }
    if (face.cull && facing <= 1e-6) continue;
    const c = face.polys[0].reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / face.polys[0].length);
    const k = 0.72 + 0.38 * Math.abs(dot(face.n, light));
    drawn.push({ face, depth: dot(c, fwd), opacity, ghost, fill: shade(face.color, k), poly2: face.polys.map((poly) => poly.map(proj)) });
  }
  drawn.sort((a, b) => (a.face.layer - b.face.layer) || (a.face.layer === 2 ? b.depth - a.depth : 0));
  // ghosted walls (between camera and the room) go last so they never hide anything
  drawn.sort((a, b) => Number(a.ghost) - Number(b.ghost));
  // lights glow through everything, so they're always visible
  drawn.sort((a, b) => Number(!!a.face.glow) - Number(!!b.face.glow));

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of drawn) for (const poly of d.poly2) for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (!drawn.length) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
  const pad = Math.max(x1 - x0, y1 - y0) * 0.06;
  const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map((v) => v.toFixed(2)).join(' ');
  const paths = drawn.map((d) => {
    const dStr = d.poly2.map((poly) => 'M' + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z').join('');
    if (d.face.glow) return `<path d="${dStr}" fill="${d.face.color}" fill-opacity="${d.opacity}"/>`;
    return `<path d="${dStr}" fill="${d.fill}" fill-opacity="${d.opacity}" fill-rule="evenodd" stroke="rgba(40,30,20,${d.ghost ? 0.25 : 0.55})" stroke-width="0.25" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="scene-svg" role="img" aria-label="3D preview of the assembled kit">${paths.join('')}</svg>`;
}
