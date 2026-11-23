// Community kits: the kits/*.kit.json format, and checks run on every
// submission (by the tests in CI, so a pull request shows what's wrong).
//
//   {
//     "format": "mimimaker-kit", "formatVersion": 1,
//     "meta": {
//       "id": "reading-nook",            // lower-case slug, = file name
//       "title": "Cozy Reading Nook",
//       "author": "mimimaker",           // a handle, not a real name or email
//       "licence": "CC-BY-4.0",          // a key of LICENCES
//       "remixedFrom": null,             // or { "id", "title"?, "author"? }
//       "description": "…", "tags": ["nook"]
//     },
//     "kit": { … }                       // exactly what a share link carries
//   }

import { compileKit } from '../src/kit.js';
import { LICENCES, ID_RE, HANDLE_RE } from '../src/share.js';

export const FORMAT = 'mimimaker-kit';
export const FORMAT_VERSION = 1;

// One licence list for the gallery and the app's remix credits.
export { LICENCES };

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

/**
 * Check a whole collection: [{ file, entry }]. Adds per-file prefixes and
 * cross-kit checks (unique ids, file name = id, remix links resolve, no cycles).
 */
export function validateCollection(list) {
  const errs = [];
  const byId = new Map();
  for (const { file, entry } of list) {
    for (const e of validateEntry(entry)) errs.push(`${file}: ${e}`);
    const id = entry?.meta?.id;
    if (!str(id)) continue;
    if (file && file !== `${id}.kit.json`) errs.push(`${file}: file name must be ${id}.kit.json`);
    if (byId.has(id)) errs.push(`${file}: duplicate id "${id}" (also in ${byId.get(id).file})`);
    else byId.set(id, { file, entry });
  }
  for (const [id, { file, entry }] of byId) {
    const from = entry.meta.remixedFrom?.id;
    if (from && from !== id && !byId.has(from)) errs.push(`${file}: remixedFrom "${from}" is not in kits/`);
    // follow the remix chain; coming back to the start is a cycle
    const seen = new Set([id]);
    for (let cur = from; cur && byId.has(cur); cur = byId.get(cur).entry.meta.remixedFrom?.id) {
      if (seen.has(cur)) { errs.push(`${file}: remix cycle through "${cur}"`); break; }
      seen.add(cur);
    }
  }
  return errs;
}
