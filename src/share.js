// Share links: the whole kit, compressed into the URL hash (#kit=…).
// No server and no account: whoever opens the link gets their own copy.

import { DEFAULT_MATERIALS } from './materials.js';

const PREFIX = 'kit=';

// Shorter links: a material that matches a built-in preset travels as just
// its id ("chip2"); one that changes a few fields (a room palette's colour, a
// calibrated thickness) travels as { "@": id, ...changed fields }. Decoding
// expands both. That is roughly a third of a typical link. Links made before
// this still decode, since their materials are full objects.
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const PRESETS = new Map(DEFAULT_MATERIALS.map((m) => [m.id, m]));
function compactMaterial(m) {
  const p = m && typeof m === 'object' && !('@' in m) ? PRESETS.get(m.id) : null;
  if (!p || !Object.keys(p).every((k) => k in m)) return m;
  const diff = Object.keys(m).filter((k) => canon(m[k]) !== canon(p[k]));
  return diff.length ? { '@': m.id, ...Object.fromEntries(diff.map((k) => [k, m[k]])) } : m.id;
}
function expandMaterial(m) {
  if (typeof m === 'string') return PRESETS.has(m) ? structuredClone(PRESETS.get(m)) : null;
  if (m && typeof m === 'object' && typeof m['@'] === 'string' && PRESETS.has(m['@'])) {
    const { '@': id, ...rest } = m;
    return { ...structuredClone(PRESETS.get(id)), ...rest };
  }
  return m;
}
function compact(kit) {
  if (!Array.isArray(kit?.materials)) return kit;
  return { ...kit, materials: kit.materials.map(compactMaterial) };
}
function expand(kit) {
  if (Array.isArray(kit?.materials)) kit.materials = kit.materials.map(expandMaterial).filter(Boolean);
  return kit;
}

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
  const json = new TextEncoder().encode(JSON.stringify(compact(kit)));
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
  return expand(JSON.parse(new TextDecoder().decode(bytes)));
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

// ------------------------------------------------------- link size & preview
/** Links longer than this get a warning: some chat, mail and SMS apps cut them. */
export const LONG_LINK = 2000;

/** A warning for a long share link, or null. */
export function linkSizeNote(length) {
  if (length <= LONG_LINK) return null;
  return `This link is long (${length.toLocaleString('en-US')} characters), so some apps may cut it off. If it won't open, send the design as a file instead: File → Save as a file.`;
}

/** One line describing the design, for the share box and messages. */
export function shareSummary(kit) {
  const r = kit.room || {};
  const n = Array.isArray(kit.items) ? kit.items.length : 0;
  const cm = (v) => Math.round(Number(v) || 0);
  return `${kit.name || 'Untitled room'} · 1:${kit.scale} room kit · ${cm(r.width)} × ${cm(r.depth)} × ${cm(r.height)} cm · ${n} piece${n === 1 ? '' : 's'}`;
}
