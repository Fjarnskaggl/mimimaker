// Share links: the whole kit, compressed into the URL hash (#kit=…).
// No server and no account: whoever opens the link gets their own copy.

import { DEFAULT_MATERIALS } from './materials.js';
import { compileKit } from './kit.js';

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

// ------------------------------------------------------ the kits/ format
// kits/<id>.kit.json wraps a design with metadata. The gallery's CI checks
// and the app's submit flow use the same validateEntry.
export const FORMAT = 'mimimaker-kit';
export const FORMAT_VERSION = 1;

/** Wrap a kit and its metadata as a kits/ entry. */
export function makeEntry(kit, { id, title, author, licence = 'CC-BY-4.0', remixedFrom = null, description = '', tags = [] }) {
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    meta: { id, title, author, licence, remixedFrom, description, tags },
    kit: structuredClone(kit),
  };
}

const str = (v) => typeof v === 'string';

/** Problems with one entry, as readable messages ([] when it's fine). */
export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return ['not a kit file (expected a JSON object)'];
  const errs = [];
  if (entry.format !== FORMAT) errs.push(`format must be "${FORMAT}"`);
  if (entry.formatVersion !== FORMAT_VERSION) errs.push(`formatVersion must be ${FORMAT_VERSION}`);
  const m = entry.meta;
  if (!m || typeof m !== 'object') return [...errs, 'meta is missing'];
  if (!str(m.id) || !ID_RE.test(m.id) || m.id.length > 60) errs.push('meta.id must be a lower-case slug like "my-reading-nook"');
  if (!str(m.title) || !m.title.trim() || m.title.length > 80) errs.push('meta.title must be 1–80 characters');
  if (!str(m.author) || !HANDLE_RE.test(m.author)) errs.push('meta.author must be a handle (letters, digits, _ . -), without "@"');
  if (!Object.hasOwn(LICENCES, m.licence)) errs.push(`meta.licence must be one of ${Object.keys(LICENCES).join(', ')}`);
  if (m.description != null && (!str(m.description) || m.description.length > 500)) errs.push('meta.description must be text up to 500 characters');
  if (m.tags != null && (!Array.isArray(m.tags) || m.tags.length > 8 || !m.tags.every((t) => str(t) && ID_RE.test(t)))) errs.push('meta.tags must be up to 8 lower-case slugs');
  if (m.remixedFrom != null) {
    const r = m.remixedFrom;
    if (typeof r !== 'object' || !str(r.id) || !ID_RE.test(r.id)) errs.push('meta.remixedFrom must be null or { "id": "<kit id>" }');
    else if (r.id === m.id) errs.push('meta.remixedFrom cannot point at the kit itself');
  }
  errs.push(...validateKit(entry.kit));
  return errs;
}

function validateKit(kit) {
  if (!kit || typeof kit !== 'object') return ['kit is missing'];
  const r = kit.room;
  const pos = (v) => Number.isFinite(v) && v > 0;
  if (!r || !pos(r.width) || !pos(r.depth) || !pos(r.height)) return ['kit.room needs a positive width, depth and height'];
  if (!Array.isArray(kit.materials) || !kit.materials.length) return ['kit.materials is missing'];
  if (!Array.isArray(kit.items) || !Array.isArray(kit.openings)) return ['kit.items and kit.openings must be lists'];
  try {
    const c = compileKit(kit);
    if (!c.parts?.length) return ['kit compiles to no parts'];
  } catch (e) {
    return [`kit does not compile: ${e.message}`];
  }
  return [];
}


// ------------------------------------------------------------ submit flow
// The app never uploads anything: it builds the file, and the visitor adds it
// to the repo's kits/ folder by pull request on GitHub.

export const SUBMIT_UPLOAD_URL = 'https://github.com/Fjarnskaggl/mimimaker/upload/main/kits';
export const SUBMIT_GUIDE_URL = 'https://github.com/Fjarnskaggl/mimimaker/blob/main/kits/README.md';

/** A kit id from a title: lower-case words joined by "-", accents dropped, at most 60 characters. */
export function slugify(title) {
  return String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

// What a remix may be licensed under, given its source's licence.
const LICENCE_OPEN = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC0'];
const LICENCE_FOLLOWS = {
  CC0: LICENCE_OPEN,
  'CC-BY-4.0': ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0'],
  'CC-BY-SA-4.0': ['CC-BY-SA-4.0'],
  'CC-BY-NC-4.0': ['CC-BY-NC-4.0'],
};
/** Licence keys a remix of a kit under `sourceLicence` may use (all of them for an original). */
export function licenceChoices(sourceLicence) {
  return [...(LICENCE_FOLLOWS[sourceLicence] || LICENCE_OPEN)];
}
/** A message when `licence` isn't allowed for a remix of `source` ({ title, licence }), else null. */
export function sourceLicenceProblem(source, licence) {
  if (!source || !Object.hasOwn(LICENCES, source.licence) || licenceChoices(source.licence).includes(licence)) return null;
  const names = licenceChoices(source.licence).map((k) => LICENCES[k].name.split(' (')[0]);
  const allowed = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0];
  return `meta.licence: a remix of ${source.title || 'that kit'} (${LICENCES[source.licence].name.split(' (')[0]}) must use ${allowed}`;
}

/** A kits/ entry for the open design from the submit form's fields. */
export function makeSubmission(kit, form) {
  const origin = kitOrigin(kit);
  const design = structuredClone(kit);
  delete design.origin;
  const tags = String(form.tags || '').split(',').map((t) => slugify(t)).filter(Boolean);
  return makeEntry(design, {
    id: form.id || slugify(form.title),
    title: String(form.title || '').trim(),
    author: String(form.author || '').trim().replace(/^@/, ''),
    licence: form.licence,
    remixedFrom: origin?.id ? { id: origin.id } : null,
    description: String(form.description || '').trim(),
    tags,
  });
}

/** Everything wrong with a submission, in words for the form ([] when ready). */
export function submissionProblems(entry, kit) {
  const errs = validateEntry(entry);
  const p = sourceLicenceProblem(kitOrigin(kit), entry?.meta?.licence);
  if (p) errs.push(p);
  return errs;
}

/** A design from an opened file: a kits/ entry becomes its kit, credited to the entry. */
export function unwrapKitFile(json) {
  if (json && json.format === FORMAT && json.kit && typeof json.kit === 'object') return withOrigin(json.kit, json.meta || {});
  return json;
}
