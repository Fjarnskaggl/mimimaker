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

// The format, makeEntry and validateEntry live in src/share.js so the app's
// submit flow checks a kit exactly as CI does; they are re-exported here.
import { LICENCES, FORMAT, FORMAT_VERSION, makeEntry, validateEntry, sourceLicenceProblem } from '../src/share.js';

export { LICENCES, FORMAT, FORMAT_VERSION, makeEntry, validateEntry };

const str = (v) => typeof v === 'string';


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
    if (from && byId.has(from)) {
      const src = byId.get(from).entry.meta;
      const p = sourceLicenceProblem(src, entry.meta.licence);
      if (p) errs.push(`${file}: ${p}`);
    }
    // follow the remix chain; coming back to the start is a cycle
    const seen = new Set([id]);
    for (let cur = from; cur && byId.has(cur); cur = byId.get(cur).entry.meta.remixedFrom?.id) {
      if (seen.has(cur)) { errs.push(`${file}: remix cycle through "${cur}"`); break; }
      seen.add(cur);
    }
  }
  return errs;
}
