// Loads three.js on demand from a pinned CDN build (UMD → window.THREE), so
// the app stays dependency-free and the single-file build keeps working.
// Anything that goes wrong rejects, and the caller falls back to the SVG view.

export const THREE_VERSION = 'r128';
export const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
// Subresource Integrity: the browser refuses the file unless it hashes to this,
// so a compromised or altered CDN copy never runs. Same bytes as npm
// three@0.128.0 build/three.min.js; recompute when THREE_URL changes:
//   openssl dgst -sha512 -binary three.min.js | base64
export const THREE_INTEGRITY = 'sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==';

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

/** Resolve with the THREE namespace, loading the script once. The pinned hash
 * applies to the default URL only; pass `integrity` with any other URL. */
export function loadThree({ url = THREE_URL, integrity = url === THREE_URL ? THREE_INTEGRITY : '', timeout = 20000 } = {}) {
  if (globalThis.THREE?.WebGLRenderer) return Promise.resolve(globalThis.THREE);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.crossOrigin = 'anonymous'; // needed for the integrity check on a CDN script
    if (integrity) s.integrity = integrity;
    const fail = (err) => { clearTimeout(timer); s.remove(); pending = null; reject(err); };
    const timer = setTimeout(() => fail(new Error('three.js took too long to load')), timeout);
    s.onload = () => {
      clearTimeout(timer);
      if (globalThis.THREE?.WebGLRenderer) resolve(globalThis.THREE);
      else fail(new Error('three.js loaded but did not define THREE'));
    };
    s.onerror = () => fail(new Error(`could not load ${url} (offline, or it failed its integrity check)`));
    document.head.appendChild(s);
  });
  return pending;
}
