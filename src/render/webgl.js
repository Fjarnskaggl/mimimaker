// WebGL viewer (three.js r128): real depth buffer, soft sun shadows, and a
// night mode lit by point lights at the LEDs. Rendering is on demand (no
// animation loop), so an idle preview costs nothing.

import { cameraDirection, cameraPose, sceneBounds, ledLights, faceToPlanar, layerOffset } from './scene.js';

const FOV = 35;
const SUN_DIR = [-0.15, -1, 1.4]; // key light from the open front, like a display lamp
const DAY = { hemi: 0.7, sun: 0.65, sky: 0xfff6ea, ground: 0x9a8878, sunColor: 0xfff1dc };
const NIGHT = { hemi: 0.1, sun: 0.06, sky: 0x8090c0, ground: 0x202028, sunColor: 0x9fb0e0 };

/** Triangulated BufferGeometry for one compiler face (outline + holes). */
function faceGeometry(THREE, face) {
  const p = faceToPlanar(face);
  const lift = layerOffset(face.layer);
  const pts2 = [p.contour, ...p.holes];
  const tris = THREE.ShapeUtils.triangulateShape(
    p.contour.map(([u, v]) => new THREE.Vector2(u, v)),
    p.holes.map((h) => h.map(([u, v]) => new THREE.Vector2(u, v))),
  );
  const flat = pts2.flat();
  const pos = [], nor = [];
  for (const tri of tris) {
    const [a, b, c] = tri.map((i) => flat[i]);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const order = area >= 0 ? [a, b, c] : [a, c, b]; // CCW in (U, V) faces +n
    for (const [u, v] of order) {
      const q = p.to3d(u, v);
      pos.push(q[0] + p.normal[0] * lift, q[1] + p.normal[1] * lift, q[2] + p.normal[2] * lift);
      nor.push(...p.normal);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export function createViewer(THREE) {
  const canvas = document.createElement('canvas');
  canvas.className = 't6-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;display:block';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1000);
  camera.up.set(0, 0, 1);
  const hemi = new THREE.HemisphereLight(DAY.sky, DAY.ground, DAY.hemi);
  hemi.position.set(0, 0, 1);
  const sun = new THREE.DirectionalLight(DAY.sunColor, DAY.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.4;
  scene.add(hemi, sun, sun.target);

  const model = new THREE.Group();
  const leds = new THREE.Group();
  scene.add(model, leds);

  let faces = null, bounds = sceneBounds([]), view = {}, entries = [], ledData = [];
  let size = [0, 0];

  function clear() {
    for (const e of entries) { e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
    model.clear();
    leds.clear();
    entries = [];
  }

  function build(next) {
    clear();
    faces = next;
    bounds = sceneBounds(faces);
    for (const face of faces) {
      if (!face.polys.length || face.polys[0].length < 3) continue;
      const glow = face.glow;
      const material = glow
        ? new THREE.MeshBasicMaterial({ color: face.color, transparent: face.opacity < 1, opacity: face.opacity, depthWrite: face.opacity >= 1 })
        : new THREE.MeshStandardMaterial({ color: face.color, roughness: 0.88, metalness: 0, side: face.cull ? THREE.FrontSide : THREE.DoubleSide });
      const mesh = new THREE.Mesh(faceGeometry(THREE, face), material);
      mesh.castShadow = !glow;
      mesh.receiveShadow = !glow;
      model.add(mesh);
      entries.push({ face, mesh });
    }
    ledData = ledLights(faces);
    // several LEDs share the room: keep the total roughly constant so it doesn't blow out
    const strength = Math.max(0.6, Math.min(1.6, 2.2 / Math.sqrt(ledData.length || 1)));
    for (const L of ledData) {
      const light = new THREE.PointLight(L.color, strength, bounds.radius * 1.6, 2);
      light.position.set(...L.position);
      leds.add(light);
    }
    // sun shadow camera hugs the model
    const r = bounds.radius;
    const sd = SUN_DIR.map((v) => v / Math.hypot(...SUN_DIR));
    sun.position.set(...bounds.center.map((c, i) => c + sd[i] * r * 2));
    sun.target.position.set(...bounds.center);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: r * 0.2, far: r * 4 });
    sun.shadow.camera.updateProjectionMatrix();
  }

  function applyView() {
    const night = !!view.night;
    const L = night ? NIGHT : DAY;
    hemi.color.set(L.sky); hemi.groundColor.set(L.ground); hemi.intensity = L.hemi;
    sun.color.set(L.sunColor); sun.intensity = L.sun;
    leds.visible = night;
    // walls seen from outside are ghosted, as in the SVG preview, so they never hide the room
    const cam = cameraDirection(view);
    for (const { face, mesh } of entries) {
      const m = mesh.material;
      if (face.glow) {
        m.blending = night && face.opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.opacity = night && face.opacity < 1 ? 0.6 : face.opacity;
        continue;
      }
      const facing = face.n[0] * cam[0] + face.n[1] * cam[1] + face.n[2] * cam[2];
      const ghost = face.layer < 2 && facing < -1e-6;
      const opacity = ghost ? (face.layer === 0 ? 0.12 : 0.06) : face.opacity;
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity >= 1;
      mesh.visible = opacity > 0;
      m.needsUpdate = true;
    }
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 600;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 400;
    if (w !== size[0] || h !== size[1]) { renderer.setSize(w, h, false); size = [w, h]; }
    const pose = cameraPose(bounds, view, { fov: FOV, aspect: w / h });
    camera.aspect = w / h;
    camera.near = pose.near; camera.far = pose.far;
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
  }

  function render() {
    applyView();
    renderer.render(scene, camera);
  }

  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (faces) render(); }) : null;

  return {
    canvas,
    /** Show `faces` from `view` ({yaw, pitch, zoom, night}); rebuilds only when faces change. */
    update(nextFaces, nextView) {
      if (nextFaces !== faces) build(nextFaces);
      view = { ...nextView };
      render();
    },
    mount(parent) {
      if (canvas.parentElement !== parent) parent.appendChild(canvas);
      resize?.disconnect();
      resize?.observe(parent);
    },
    /** Render now and read back the pixels — for tests and thumbnails. */
    sample() {
      render();
      const gl = renderer.getContext();
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0, sum = 0, max = 0, hash = 2166136261;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        lit++;
        sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
        max = Math.max(max, px[i], px[i + 1], px[i + 2]);
        if ((i >> 2) % 7 === 0) hash = Math.imul(hash ^ (px[i] ^ (px[i + 1] << 8) ^ (px[i + 2] << 16)), 16777619) >>> 0;
      }
      return {
        lit: lit / (W * H), mean: lit ? sum / lit : 0, max, hash,
        meshes: entries.length, pointLights: leds.visible ? leds.children.length : 0,
        shadows: renderer.shadowMap.enabled && sun.castShadow,
      };
    },
    dispose() {
      resize?.disconnect();
      clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
