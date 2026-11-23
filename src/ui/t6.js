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
// One row per textured surface (wallpaper, floor): room palette, any surface
// texture, or none. Shown while Realistic 3D is on, since that's where
// textures appear. Changes go through setKit, i.e. the app's normal edit
// path, so they are undoable and travel with share links.
let picker = null;
let pickerListening = false;

/**
 * The texture picker: a "Textures" button for the stage bar that opens a
 * popover with one select per surface. getKit() returns the current kit;
 * setKit(next) applies an edit.
 */
export function texturePicker(getKit, setKit) {
  const el = document.createElement('span');
  el.id = 'texture-picker';
  const btn = document.createElement('button');
  btn.id = 'texture-btn';
  btn.type = 'button';
  btn.className = 'mm-btn';
  btn.textContent = 'Textures';
  btn.style.cssText = 'height:36px;font-size:13px;border-color:var(--line);background:color-mix(in srgb, var(--surface) 92%, transparent)';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  const pop = document.createElement('div');
  pop.id = 'texture-pop';
  pop.className = 'mm-popover';
  pop.setAttribute('role', 'group');
  pop.setAttribute('aria-label', 'Textures');
  pop.style.cssText = 'width:min(320px, calc(100vw - 32px));padding:var(--space-3);gap:var(--space-3)';
  pop.hidden = true;
  const open = (on) => {
    pop.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    if (!on) return;
    // right-align with the button, then keep it inside the screen (16 px margin)
    const r = btn.getBoundingClientRect(), W = window.innerWidth || 0, w = pop.offsetWidth;
    const left = Math.max(16, Math.min(r.right - w, W - 16 - w));
    pop.style.right = 'auto';
    pop.style.left = `${left - r.left}px`;
  };
  btn.addEventListener('click', () => open(pop.hidden));
  el.append(btn, pop);
  picker = { el, pop, open, getKit, setKit, key: '' };
  if (!pickerListening) { // once, for whichever picker is current (the stage is rebuilt per step)
    pickerListening = true;
    document.addEventListener('pointerdown', (e) => { if (picker && !picker.pop.hidden && !picker.el.contains(e.target)) picker.open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picker && !picker.pop.hidden) picker.open(false); });
  }
  syncPicker();
  return el;
}

function syncPicker(kit = picker?.getKit()) {
  if (!picker || !kit) return;
  const { el, pop } = picker;
  el.style.cssText = state.want ? 'position:relative;display:inline-block' : 'display:none';
  const rows = textureChoices(kit);
  const key = JSON.stringify(rows.map((r) => [r.material, r.label, r.paletteName]));
  if (key !== picker.key) {
    picker.key = key;
    pop.replaceChildren(...rows.map((r) => {
      const select = document.createElement('select');
      select.dataset.material = r.material;
      select.style.cssText = 'width:100%;height:var(--control-h-sm, 32px);border:1px solid var(--line-control);border-radius:var(--radius-sm);background:var(--surface);padding:0 var(--space-2);font-size:13px';
      const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
      select.append(opt('', `Room palette (${r.paletteName})`), ...r.options.map((o) => opt(o.id, o.name)), opt('none', 'None (plain colour)'));
      select.addEventListener('change', () => picker.setKit(setTextureChoice(picker.getKit(), r.material, select.value)));
      const label = document.createElement('label');
      label.style.cssText = 'display:grid;gap:4px;font:600 12px/16px var(--font-sans);color:var(--ink-muted)';
      label.append(r.label, select);
      return label;
    }));
    if (!rows.length) pop.append('This room has no wallpaper or flooring to texture.');
  }
  for (const select of pop.querySelectorAll('select')) select.value = textureChoice(kit, select.dataset.material);
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
