// Loads three.js on demand from a pinned CDN build (UMD → window.THREE), so
// the app stays dependency-free and the single-file build keeps working.
// Anything that goes wrong rejects, and the caller falls back to the SVG view.

export const THREE_VERSION = 'r128';
export const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

let pending = null;

/** Can this browser give us a WebGL context at all? */
export function webglSupported(doc = globalThis.document) {
  try {
    const c = doc.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Resolve with the THREE namespace, loading the script once. */
export function loadThree({ url = THREE_URL, timeout = 20000 } = {}) {
  if (globalThis.THREE?.WebGLRenderer) return Promise.resolve(globalThis.THREE);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.crossOrigin = 'anonymous';
    const fail = (err) => { clearTimeout(timer); s.remove(); pending = null; reject(err); };
    const timer = setTimeout(() => fail(new Error('three.js took too long to load')), timeout);
    s.onload = () => {
      clearTimeout(timer);
      if (globalThis.THREE?.WebGLRenderer) resolve(globalThis.THREE);
      else fail(new Error('three.js loaded but did not define THREE'));
    };
    s.onerror = () => fail(new Error(`could not load ${url}`));
    document.head.appendChild(s);
  });
  return pending;
}
