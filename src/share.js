// Share links: the whole kit, compressed into the URL hash (#kit=…).
// No server and no account: whoever opens the link gets their own copy.

const PREFIX = 'kit=';

const toB64Url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (str) => {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Encode a kit as a compact URL-safe string ("z" = deflate, "j" = plain JSON). */
export async function encodeKit(kit) {
  const json = new TextEncoder().encode(JSON.stringify(kit));
  if (typeof CompressionStream === 'function') {
    try { return 'z' + toB64Url(await pipe(json, new CompressionStream('deflate-raw'))); } catch { /* fall through */ }
  }
  return 'j' + toB64Url(json);
}

export async function decodeKit(str) {
  const kind = str[0];
  let bytes = fromB64Url(str.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'j') throw new Error('Unrecognised share link');
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function shareHash(kit) {
  return `#${PREFIX}${await encodeKit(kit)}`;
}

/** The encoded kit from a location hash, or null. */
export function kitFromHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  return h.startsWith(PREFIX) ? h.slice(PREFIX.length) : null;
}
