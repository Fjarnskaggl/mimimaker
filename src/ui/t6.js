// T6 UI: the "Realistic 3D" toggle and the preview stage that shows either
// the WebGL viewer or the SVG preview. The SVG is always drawn first (it is
// instant), and stays as the fallback when WebGL or the CDN isn't available.

import { renderScene } from '../preview3d.js';
import { loadThree, webglSupported } from '../render/three-loader.js';
import { createViewer } from '../render/webgl.js';
import { resolveLook, faceMaterial, textureChoices, textureChoice, setTextureChoice } from '../textures/look.js';

const PREF_KEY = 'mimimaker.t6.webgl';
// zoom is the viewer's own (wheel), kept here so every redraw uses it: the app
// may pass a fresh copy of its view each time (the Light step does)
const state = { want: readPref(), viewer: null, loading: false, failed: null, last: null, button: null, zoom: 1 };

function readPref() {
  try { return localStorage.getItem(PREF_KEY) === '1'; } catch { return false; }
}
function writePref(on) {
  try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

/** Button that switches the preview between the SVG and the WebGL viewer. */
export function rendererToggle(redraw) {
  const b = document.createElement('button');
  b.id = 'renderer-toggle';
  b.type = 'button';
  b.className = 'renderer-toggle';
  b.title = 'Realistic 3D with shadows (WebGL). Falls back to the sketch view if your browser can’t.';
  b.textContent = 'Realistic 3D';
  b.setAttribute('aria-pressed', String(state.want));
  b.addEventListener('click', () => {
    state.want = !state.want;
    state.failed = null;
    writePref(state.want);
    b.setAttribute('aria-pressed', String(state.want));
    redraw();
    syncPicker();
  });
  state.button = b;
  return b;
}

// ------------------------------------------------------------ texture picker
// A "Textures" section for the Design inspector: one select per textured
// surface (wallpaper, floor) offering the room palette, any surface texture,
// or none. Shown while Realistic 3D is on, since that's where textures
// appear. Edits go through setKit, i.e. the app's normal edit path, so they
// are undoable and travel with share links.
let picker = null;

/**
 * @param {object} o
 * @param {Function} o.section      the inspector's section(title, body) helper
 * @param {Function} o.selectField  the inspector's selectField(label, value, options, onChange)
 * @param {Function} o.getKit       returns the current kit
 * @param {Function} o.setKit       applies an edited kit
 */
export function texturePicker({ section, selectField, getKit, setKit }) {
  const body = document.createElement('div');
  body.className = 't6-textures';
  body.style.cssText = 'display:grid;gap:var(--space-3, 12px)';
  const el = section('Textures', [body]);
  el.id = 'texture-picker';
  picker = { el, body, selectField, getKit, setKit, key: '' };
  syncPicker();
  return el;
}

function syncPicker(kit = picker?.getKit()) {
  if (!picker || !kit) return;
  const { el, body } = picker;
  el.style.display = state.want ? '' : 'none';
  const rows = textureChoices(kit);
  const key = JSON.stringify(rows.map((r) => [r.material, r.label, r.paletteName]));
  if (key !== picker.key) {
    picker.key = key;
    body.replaceChildren(...rows.map((r) => {
      const options = [['', `Room palette (${r.paletteName})`], ...r.options.map((o) => [o.id, o.name]), ['none', 'None (plain colour)']];
      const field = picker.selectField(r.label, textureChoice(kit, r.material), options,
        (value) => picker.setKit(setTextureChoice(picker.getKit(), r.material, value)));
      field.querySelector('select').dataset.material = r.material;
      return field;
    }));
    if (!rows.length) body.append('This room has no wallpaper or flooring to texture.');
  }
  for (const select of body.querySelectorAll('select')) select.value = textureChoice(kit, select.dataset.material);
}

// ------------------------------------------------------------ click to select
const CLICK_SLOP = 5; // px a press may move and still count as a click, not an orbit

/**
 * What a click at a client point would pick, in whichever renderer is
 * showing: the index of the piece (kind "item") or light (kind "led") that is
 * front-most there, or null.
 */
function pickAt(stage, x, y, kind = 'item') {
  if (stage.dataset.renderer === 'webgl' && state.viewer) return state.viewer.pick(x, y, kind);
  const attr = kind === 'led' ? 'led' : 'item';
  const hit = document.elementFromPoint(x, y)?.closest?.(`[data-${attr}]`);
  return hit && stage.contains(hit) ? Number(hit.dataset[attr]) : null;
}

/**
 * Click a piece (or a light) in the 3D view to select it. opts.picks()
 * says what this view picks right now: "item", "led", or null for nothing.
 * onPick(index, kind) should select it the same way the plan does, and
 * redraw the stage to show it; onPick(null, kind) means a click on empty
 * space. Drags still orbit: only a press that barely moves counts as a click.
 */
export function attachPicking(stage, onPick, { picks = () => 'item' } = {}) {
  let down = null;
  stage.addEventListener('pointerdown', (e) => { down = picks() ? { x: e.clientX, y: e.clientY } : null; });
  stage.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    const kind = picks();
    if (moved > CLICK_SLOP || !kind) return;
    onPick(pickAt(stage, e.clientX, e.clientY, kind), kind); // null: empty space
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  // hover: show which piece a click would pick (checked once per frame)
  let pending = null, frame = 0;
  const clearHover = () => { cancelAnimationFrame(frame); pending = null; setHover(stage, null); };
  stage.addEventListener('pointermove', (e) => {
    if (e.buttons || !picks()) { clearHover(); return; } // orbiting, or nothing to pick
    if (pending) { pending.x = e.clientX; pending.y = e.clientY; return; }
    pending = { x: e.clientX, y: e.clientY };
    frame = requestAnimationFrame(() => {
      const { x, y } = pending;
      pending = null;
      const kind = picks();
      setHover(stage, kind ? pickAt(stage, x, y, kind) : null, kind);
    });
  });
  stage.addEventListener('pointerleave', clearHover);
  // tests and tours: a point where the piece is the front-most thing
  // (a number is a piece; {kind: 'led', index} a light)
  stage.t6pickPoint = (target) => {
    const { kind, index } = typeof target === 'object' ? target : { kind: 'item', index: target };
    if (stage.dataset.renderer === 'webgl' && state.viewer) return state.viewer.pointFor(index, kind);
    for (const path of stage.querySelectorAll(`[data-${kind === 'led' ? 'led' : 'item'}="${index}"]`)) {
      const r = path.getBoundingClientRect();
      const p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (pickAt(stage, p.x, p.y, kind) === index) return p;
    }
    return null;
  };
}

/** Mark the piece under the pointer in whichever renderer is showing (null: none). */
function setHover(stage, index, kind = 'item') {
  index = index ?? null;
  stage.classList.toggle('t6-over-piece', index != null); // pointer cursor: a click would pick something
  if (kind !== 'item') index = null; // lights only get the cursor
  stage.t6hover = index;
  if (stage.dataset.renderer === 'webgl' && state.viewer) { state.viewer.hover(index); return; }
  paintSvgHover(stage);
}
function paintSvgHover(stage) {
  const index = stage.t6hover ?? null;
  for (const el of stage.querySelectorAll('path.hover')) if (Number(el.dataset.item) !== index) el.classList.remove('hover');
  if (index != null) for (const el of stage.querySelectorAll(`path[data-item="${index}"]`)) el.classList.add('hover');
}

function disposeViewer() {
  state.viewer?.dispose();
  state.viewer = null;
}

/** Wheel zoom on a stage, for both renderers (once per stage), redrawn once per frame. */
const ZOOM_MIN = 0.6, ZOOM_MAX = 4;
function attachZoom(stage) {
  if (stage.t6zoomWired) return;
  stage.t6zoomWired = true;
  let frame = 0;
  stage.addEventListener('wheel', (e) => {
    if (state.last?.stage !== stage || e.metaKey) return; // ⌘-wheel stays the browser's
    // wheels report pixels, lines (Firefox mice) or pages
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (globalThis.innerHeight || 800) : 1);
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom * Math.exp(-px * 0.0015)));
    if (next === state.zoom) return; // at a limit: let the page scroll
    e.preventDefault();
    state.zoom = next;
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        setHover(stage, null); // the zoom moved the pieces under the pointer
        redrawLast();
      });
    }
  }, { passive: false });
}

/** Back to the fitted view, e.g. when another kit opens. */
export function resetZoom() {
  state.zoom = 1;
}

function redrawLast() {
  const l = state.last;
  if (l && l.stage.isConnected) drawStage(l.stage, l.faces, l.view, l.kit);
}

function startViewer() {
  if (state.loading) return;
  if (!webglSupported()) {
    state.failed = 'WebGL is turned off or not supported in this browser';
    return;
  }
  state.loading = true;
  loadThree()
    .then((THREE) => {
      if (!state.want) return;
      state.viewer = createViewer(THREE);
    })
    .catch((err) => {
      state.failed = /load/i.test(err?.message || '') ? 'the 3D library couldn’t be downloaded (offline?) or didn’t match its checksum' : 'WebGL couldn’t start';
      console.warn('mimimaker: realistic 3D unavailable —', err);
    })
    .finally(() => { state.loading = false; redrawLast(); });
}

/**
 * Draw the preview into `stage`. Sets stage.dataset.renderer to "webgl" or
 * "svg"; while the viewer is wanted but not running, stage.dataset.webgl is
 * "loading" or "unavailable".
 */
export function drawStage(stage, faces, view, kit = null) {
  // new pieces or a new stage: whatever was hovered may now be another piece
  if (state.last && (state.last.faces !== faces || state.last.stage !== stage)) {
    stage.t6hover = null;
    stage.classList.remove('t6-over-piece');
    state.viewer?.hover(null);
  }
  state.last = { stage, faces, view, kit };
  attachZoom(stage);
  stage.dataset.zoom = String(state.zoom);
  if (kit) syncPicker(kit);
  if (state.want && state.viewer) {
    for (const child of [...stage.children]) if (child !== state.viewer.canvas) child.remove();
    state.viewer.mount(stage);
    const look = kit ? resolveLook(kit) : {};
    state.viewer.update(faces, { ...view, zoom: state.zoom }, {
      textureOf: (face) => look[faceMaterial(face, kit)] || null,
      lookKey: JSON.stringify([look, kit?.scale]),
      scale: kit?.scale,
    });
    stage.dataset.renderer = 'webgl';
    stage.dataset.webgl = 'on';
    stage.t6viewer = state.viewer;
    return;
  }
  if (!state.want) disposeViewer();
  stage.t6viewer = null;
  stage.innerHTML = renderScene(faces, {
    ...view, zoom: state.zoom,
    selected: view.sel?.kind === 'item' ? view.sel.index : null,
    selectedLed: view.sel?.kind === 'led' ? view.sel.index : null,
  });
  stage.dataset.renderer = 'svg';
  paintSvgHover(stage); // the redraw replaced the hovered paths
  if (!state.want) { delete stage.dataset.webgl; return; }
  if (!state.failed) startViewer();
  if (state.failed) {
    stage.dataset.webgl = 'unavailable';
    const note = document.createElement('p');
    note.className = 't6-note stage-hint';
    note.textContent = `Realistic 3D isn’t available: ${state.failed}. Showing the SVG preview.`;
    stage.appendChild(note);
  } else {
    stage.dataset.webgl = 'loading';
  }
}
