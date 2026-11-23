// T6 UI: the "Realistic 3D" toggle and the preview stage that shows either
// the WebGL viewer or the SVG preview. The SVG is always drawn first (it is
// instant), and stays as the fallback when WebGL or the CDN isn't available.

import { renderScene } from '../preview3d.js';
import { loadThree, webglSupported } from '../render/three-loader.js';
import { createViewer } from '../render/webgl.js';
import { resolveLook, faceMaterial } from '../textures/look.js';

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
  });
  state.button = b;
  return b;
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
