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

// ------------------------------------------------------------ remix credits
// A kit opened from the gallery or from someone's share link carries
// `kit.origin`: where it came from. It travels with the design (saved in the
// browser, in kit.json and in share links), so a remix of a remix still
// credits the kit it started from. Starting a new room drops it.

export const LICENCES = {
  'CC-BY-4.0': { name: 'CC BY 4.0 (credit the author)', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'CC-BY-SA-4.0': { name: 'CC BY-SA 4.0 (credit, share remixes alike)', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  'CC-BY-NC-4.0': { name: 'CC BY-NC 4.0 (credit, no selling)', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  CC0: { name: 'CC0 (public domain)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
};
export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HANDLE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,37}[A-Za-z0-9])?$/;

/** The kit's origin as { id?, title, author?, licence? }, or null. Untrusted input is cleaned. */
export function kitOrigin(kit) {
  const o = kit?.origin;
  if (!o || typeof o !== 'object' || typeof o.title !== 'string' || !o.title.trim()) return null;
  const out = {};
  if (typeof o.id === 'string' && ID_RE.test(o.id) && o.id.length <= 60) out.id = o.id;
  out.title = o.title.trim().slice(0, 80);
  if (typeof o.author === 'string' && HANDLE_RE.test(o.author)) out.author = o.author;
  if (Object.hasOwn(LICENCES, o.licence)) out.licence = o.licence;
  return out;
}

/** A copy of the kit that records `meta` (a gallery entry's meta) as its origin. */
export function withOrigin(kit, meta) {
  const out = structuredClone(kit);
  out.origin = kitOrigin({ origin: meta });
  if (!out.origin) delete out.origin;
  return out;
}

/** "Remix of <title> by <author> · <licence>", or '' when there is no origin. */
export function creditText(origin) {
  const o = kitOrigin({ origin });
  if (!o) return '';
  return `Remix of ${o.title}${o.author ? ` by ${o.author}` : ''}${o.licence ? ` · ${LICENCES[o.licence].name}` : ''}`;
}
