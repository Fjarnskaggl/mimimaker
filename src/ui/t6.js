// T6 UI: the "Realistic 3D" toggle and the preview stage that shows either
// the WebGL viewer or the SVG preview. The SVG is always drawn first (it is
// instant), and stays as the fallback when WebGL or the CDN isn't available.

import { renderScene } from '../preview3d.js';
import { loadThree, webglSupported } from '../render/three-loader.js';
import { createViewer } from '../render/webgl.js';
import { resolveLook, faceMaterial, textureChoices, textureChoice, setTextureChoice } from '../textures/look.js';

const PREF_KEY = 'mimimaker.t6.webgl';
const state = { want: readPref(), viewer: null, loading: false, failed: null, last: null, button: null };

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

function disposeViewer() {
  state.viewer?.dispose();
  state.viewer = null;
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
      const v = createViewer(THREE);
      v.canvas.addEventListener('wheel', (e) => {
        const view = state.last?.view;
        if (!view) return;
        e.preventDefault();
        view.zoom = Math.max(0.6, Math.min(4, (view.zoom || 1) * Math.exp(-e.deltaY * 0.0015)));
        redrawLast();
      }, { passive: false });
      state.viewer = v;
    })
    .catch((err) => {
      state.failed = /load/i.test(err?.message || '') ? 'the 3D library couldn’t be downloaded (offline?)' : 'WebGL couldn’t start';
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
  state.last = { stage, faces, view, kit };
  if (kit) syncPicker(kit);
  if (state.want && state.viewer) {
    for (const child of [...stage.children]) if (child !== state.viewer.canvas) child.remove();
    state.viewer.mount(stage);
    const look = kit ? resolveLook(kit) : {};
    state.viewer.update(faces, view, {
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
  stage.innerHTML = renderScene(faces, view);
  stage.dataset.renderer = 'svg';
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
