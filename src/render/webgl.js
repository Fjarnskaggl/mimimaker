// WebGL viewer (three.js r128): real depth buffer, soft sun shadows, and a
// night mode lit by point lights at the LEDs. Rendering is on demand (no
// animation loop), so an idle preview costs nothing.

import { cameraDirection, cameraPose, sceneBounds, ledLights, layerOffset, faceThickness, extrudeFace, windowLights } from './scene.js';
import { textureSVG } from '../textures/index.js';
import { textureFrame } from '../textures/look.js';

const FOV = 35;
const SUN_DIR = [-0.15, -1, 1.4]; // key light from the open front, like a display lamp
const DAY = { hemi: 0.7, sun: 0.65, sky: 0xfff6ea, ground: 0x9a8878, sunColor: 0xfff1dc };
const NIGHT = { hemi: 0.1, sun: 0.06, sky: 0x8090c0, ground: 0x202028, sunColor: 0x9fb0e0 };
const MOON = { light: 0xa9c4ff, glow: 0x7f97c8 }; // window light at night
const SELECT_TINT = 0x0f3a44; // emissive tint on the selected piece
const HOVER_TINT = 0x07222a; // fainter tint on the piece under the pointer

/**
 * BufferGeometry for one compiler face: board panels become solids with real
 * thickness (outline and holes extruded behind the face); overlays stay flat,
 * lifted a hair off their wall.
 */
function faceGeometry(THREE, face, texSize = 0) {
  const triangulate = (contour, holes) => THREE.ShapeUtils.triangulateShape(
    contour.map(([u, v]) => new THREE.Vector2(u, v)),
    holes.map((h) => h.map(([u, v]) => new THREE.Vector2(u, v))),
  );
  const { positions, normals } = extrudeFace(face, faceThickness(face), triangulate, { lift: layerOffset(face.layer) });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (texSize > 0) {
    // sheet mm along the face's texture axes; canvas y runs down, texture v up
    const { uv } = textureFrame(face);
    const uvs = [];
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y] = uv([positions[i], positions[i + 1], positions[i + 2]]);
      uvs.push(x / texSize, 1 - y / texSize);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  return g;
}

export function createViewer(THREE) {
  const canvas = document.createElement('canvas');
  canvas.className = 't6-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block'; // cursor: styles.css
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
  const windows = new THREE.Group(); // moonlight through each window, at night
  scene.add(model, leds, windows);

  let faces = null, bounds = sceneBounds([]), view = {}, entries = [], ledData = [];
  let lookKey = '';
  let selectedItem = null;
  let hoverItem = null;
  const raycaster = new THREE.Raycaster();
  const textures = new Map(); // spec key -> { id, texture, ready }; kept across rebuilds
  let used = new Set(), texturesMade = 0, repaint = 0;
  // texture images land one by one: repaint once per frame, not once per image
  const repaintSoon = () => {
    if (repaint) return;
    const raf = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 16));
    repaint = raf(() => { repaint = 0; if (faces) render(); });
  };

  // One texture image per spec, big enough to cover any face without repeating,
  // rasterised from the same SVG that would be printed.
  function textureFor(spec, scale, sizeMm, fallback) {
    const key = JSON.stringify([spec.id, spec.params, spec.seed, scale, sizeMm]);
    used.add(key);
    if (textures.has(key)) return textures.get(key);
    texturesMade++;
    const px = Math.min(2048, Math.max(512, Math.round(sizeMm * 8)));
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = px;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 0, px, px);
    const texture = new THREE.CanvasTexture(cnv);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const entry = { id: spec.id, texture, ready: false };
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, px, px);
      texture.needsUpdate = true;
      entry.ready = true;
      repaintSoon();
    };
    img.onerror = () => { entry.ready = true; entry.failed = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(textureSVG(spec.id, { width: sizeMm, height: sizeMm, scale, seed: spec.seed, params: spec.params }));
    textures.set(key, entry);
    return entry;
  }
  let size = [0, 0];

  function clear(keepTextures = false) {
    for (const e of entries) { e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
    if (!keepTextures) {
      for (const t of textures.values()) t.texture.dispose();
      textures.clear();
    }
    model.clear();
    leds.clear();
    for (const o of windows.children) { o.geometry?.dispose(); o.material?.dispose(); o.shadow?.map?.dispose(); }
    windows.clear();
    entries = [];
  }

  function build(next, opts) {
    clear(true); // texture images carry over: re-rasterising them is the slow part of a rebuild
    used = new Set();
    faces = next;
    bounds = sceneBounds(faces);
    const texSize = Math.ceil(Math.max(...bounds.max.map((v, i) => v - bounds.min[i]), 10));
    for (const face of faces) {
      if (!face.polys.length || face.polys[0].length < 3) continue;
      const glow = face.glow;
      const spec = !glow && opts.textureOf ? opts.textureOf(face) : null;
      // raw material finishes repeat on a small tile; printed patterns span the scene
      const size = spec?.tile > 0 ? spec.tile : texSize;
      const tex = spec ? textureFor(spec, opts.scale || 12, size, face.color) : null;
      const material = glow
        ? new THREE.MeshBasicMaterial({ color: face.color, transparent: face.opacity < 1, opacity: face.opacity, depthWrite: face.opacity >= 1 })
        : new THREE.MeshStandardMaterial({
          color: tex ? 0xffffff : face.color, map: tex ? tex.texture : null, roughness: 0.88, metalness: 0,
          side: face.cull || faceThickness(face) > 0 ? THREE.FrontSide : THREE.DoubleSide,
        });
      const mesh = new THREE.Mesh(faceGeometry(THREE, face, tex ? size : 0), material);
      mesh.castShadow = !glow;
      mesh.receiveShadow = !glow;
      model.add(mesh);
      entries.push({ face, mesh, solid: faceThickness(face) > 0, texture: tex });
    }
    for (const [key, t] of textures) if (!used.has(key)) { t.texture.dispose(); textures.delete(key); }
    ledData = ledLights(faces);
    // several LEDs share the room: keep the total roughly constant so it doesn't blow out
    const strength = Math.max(0.6, Math.min(1.6, 2.2 / Math.sqrt(ledData.length || 1)));
    for (const L of ledData) {
      const light = new THREE.PointLight(L.color, strength, bounds.radius * 1.6, 2);
      light.position.set(...L.position);
      leds.add(light);
    }
    // moonlight: a soft spot from outside and above each window, so the wall
    // casts the window's shape into the room, plus a glow behind the opening
    for (const W of windowLights(faces)) {
      const n = W.normal, size = Math.max(W.width, W.height);
      const from = W.center.map((c, i) => c - n[i] * size * 2.2 + (i === 2 ? size * 1.2 : 0));
      const to = W.center.map((c, i) => c + n[i] * size * 2 - (i === 2 ? size * 1.4 : 0));
      const spot = new THREE.SpotLight(MOON.light, 1.5, size * 14, Math.PI / 5, 0.6, 1);
      spot.position.set(...from);
      spot.target.position.set(...to);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0005;
      Object.assign(spot.shadow.camera, { near: size * 0.5, far: size * 14 });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(W.width * 1.3, W.height * 1.3), new THREE.MeshBasicMaterial({ color: MOON.glow }));
      glow.position.set(...W.center.map((c, i) => c - n[i] * 4)); // just behind the board
      glow.up.set(0, 0, 1);
      glow.lookAt(...W.center);
      glow.userData.wallNormal = n;
      windows.add(spot, spot.target, glow);
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
    windows.visible = night;
    const camDir = cameraDirection(view);
    for (const o of windows.children) {
      const n = o.userData.wallNormal; // hide a window's glow when its wall is ghosted
      if (n) o.visible = n[0] * camDir[0] + n[1] * camDir[1] + n[2] * camDir[2] >= -1e-6;
    }
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
      // the selected piece glows softly so you can see what the inspector shows
      if (m.emissive) {
        const tint = face.item == null ? 0 : face.item === selectedItem ? SELECT_TINT : face.item === hoverItem ? HOVER_TINT : 0;
        m.emissive.setHex(tint);
      }
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
    /**
     * Show `faces` from `view` ({yaw, pitch, zoom, night}). opts.textureOf(face)
     * returns a texture spec or null; opts.lookKey changes when the look does.
     * Rebuilds only when the faces or the look change.
     */
    update(nextFaces, nextView, opts = {}) {
      const key = opts.lookKey || '';
      if (nextFaces !== faces || key !== lookKey) { lookKey = key; build(nextFaces, opts); }
      view = { ...nextView };
      selectedItem = view.sel?.kind === 'item' ? view.sel.index : null;
      render();
    },
    /** Tint the piece under the pointer (item index, or null for none) and redraw if it changed. */
    hover(item) {
      item = item ?? null;
      if (item === hoverItem) return;
      hoverItem = item;
      if (faces) render();
    },
    mount(parent) {
      if (canvas.parentElement !== parent) parent.appendChild(canvas);
      resize?.disconnect();
      resize?.observe(parent);
    },
    /**
     * The piece under a screen point (client px): its item index, or null when
     * the first thing hit is the room shell, an overlay or nothing. Ghosted
     * walls are see-through, so they don't block a pick.
     */
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const solid = entries.filter((e) => e.mesh.visible && !e.face.glow && e.mesh.material.opacity >= 1).map((e) => e.mesh);
      const hit = raycaster.intersectObjects(solid, false)[0];
      if (!hit) return null;
      return entries.find((e) => e.mesh === hit.object)?.face.item ?? null;
    },
    /** A client point where `item` is the front-most thing (for tests and tours), or null. */
    pointFor(item) {
      const r = canvas.getBoundingClientRect();
      const v = new THREE.Vector3();
      for (const { face, mesh } of entries) {
        if (face.item !== item || !mesh.visible) continue;
        const pts = face.polys[0];
        const c = pts.reduce((s, p) => s.map((x, i) => x + p[i] / pts.length), [0, 0, 0]);
        v.set(...c).project(camera);
        const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
        if (this.pick(x, y) === item) return { x, y };
      }
      return null;
    },
    /** What the viewer last drew with, without rendering (cheap, for tests). */
    shown() {
      return { selected: selectedItem, hovered: hoverItem, zoom: view.zoom || 1 };
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
        textured: entries.filter((e) => e.texture).length,
        untextured: entries.filter((e) => !e.texture && !e.face.glow).length,
        texturesMade,
        textures: [...new Set(entries.filter((e) => e.texture).map((e) => e.texture.id))].sort(),
        texturesReady: [...textures.values()].every((t) => t.ready),
        meshes: entries.length, solids: entries.filter((e) => e.solid).length, flat: entries.filter((e) => !e.solid).length, pointLights: leds.visible ? leds.children.length : 0,
        shadows: renderer.shadowMap.enabled && sun.castShadow,
        selected: selectedItem,
        hovered: hoverItem,
        zoom: view.zoom || 1,
        windowLights: windows.visible ? windows.children.filter((o) => o.isSpotLight).length : 0,
        windowShadows: windows.children.filter((o) => o.isSpotLight).every((o) => o.castShadow),
      };
    },
    /**
     * Orbit once round the room, rendering `frames` frames back to back, and
     * report the cost of a frame: fps, draw calls and triangles (shadow passes
     * included) and how many lights cast shadows. Leaves the view as it was.
     */
    bench({ frames = 60 } = {}) {
      frames = Math.max(1, Math.floor(frames) || 1);
      const saved = view;
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      let calls = 0, triangles = 0, shadowLights = 0;
      const yaw0 = Number(saved.yaw) || 0;
      render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // warm up and sync
      // three resets info after the shadow pass, so reset by hand to count both
      const autoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      let ms;
      try {
        const t0 = performance.now();
        for (let i = 0; i < frames; i++) {
          view = { ...saved, yaw: yaw0 + (360 * i) / frames };
          renderer.info.reset();
          render();
          calls = Math.max(calls, renderer.info.render.calls);
          triangles = Math.max(triangles, renderer.info.render.triangles);
          let lights = 0;
          scene.traverseVisible((o) => { if (o.isLight && o.castShadow) lights++; });
          shadowLights = Math.max(shadowLights, lights);
        }
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // wait for the GPU
        ms = (performance.now() - t0) / frames;
      } finally {
        renderer.info.autoReset = autoReset;
        view = saved;
        render();
      }
      return {
        frames, msPerFrame: ms, fps: 1000 / ms, calls, triangles, shadowLights,
        pixelRatio: renderer.getPixelRatio(), yawSpan: (360 * (frames - 1)) / frames,
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
