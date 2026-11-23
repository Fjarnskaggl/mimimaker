// Static community gallery, generated at build time from kits/*.kit.json.
//
//   node gallery/build.js [outDir]        (default: dist/gallery)
//
// Writes outDir/index.html and outDir/renders/<id>.svg. Each card links to
// the app with the kit in a share link (#kit=…), so "Open in mimimaker" needs
// no server: the visitor gets their own copy.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileKit } from '../src/kit.js';
import { renderScene } from '../src/preview3d.js';
import { encodeKit, withOrigin } from '../src/share.js';
import { LICENCES, validateCollection } from './kits.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Read every kits/*.kit.json as [{ file, entry }]. */
export function readKits(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.kit.json')).sort()
    .map((file) => ({ file, entry: JSON.parse(readFileSync(join(dir, file), 'utf8')) }));
}

function card(entry, byId, link) {
  const { meta, kit } = entry;
  const lic = LICENCES[meta.licence];
  const r = kit.room;
  const from = meta.remixedFrom && byId.get(meta.remixedFrom.id);
  const remix = from
    ? `<p class="remix">Remix of <a href="#kit-${esc(from.meta.id)}">${esc(from.meta.title)}</a> by ${esc(from.meta.author)}</p>`
    : '';
  return `<article class="card" id="kit-${esc(meta.id)}">
  <img src="renders/${esc(meta.id)}.svg" alt="3D render of ${esc(meta.title)}" loading="lazy" width="320" height="240">
  <div class="body">
    <h2>${esc(meta.title)}</h2>
    <p class="by">by ${esc(meta.author)} · <a href="${esc(lic.url)}" rel="license">${esc(lic.name)}</a></p>
    ${remix}
    ${meta.description ? `<p class="desc">${esc(meta.description)}</p>` : ''}
    <p class="facts">${r.width} × ${r.depth} × ${r.height} cm room · 1:${esc(kit.scale)} · ${kit.items.length} pieces</p>
    <a class="open" href="${esc(link)}">Open in mimimaker</a>
  </div>
</article>`;
}

/**
 * Build the gallery from kit entries. Throws if the collection is invalid.
 * @returns {{ html: string, renders: Record<string,string> }} renders keyed by relative path
 */
export async function buildGallery(entries, { appUrl = '../' } = {}) {
  const errs = validateCollection(entries.map((entry) => ({ file: entry?.meta?.id ? `${entry.meta.id}.kit.json` : '?', entry })));
  if (errs.length) throw new Error(`Invalid kits:\n${errs.join('\n')}`);
  const byId = new Map(entries.map((e) => [e.meta.id, e]));
  const sorted = [...entries].sort((a, b) => a.meta.title.localeCompare(b.meta.title));
  const renders = {};
  const cards = [];
  for (const entry of sorted) {
    renders[`renders/${entry.meta.id}.svg`] = renderScene(compileKit(entry.kit).faces3d, { yaw: -30, pitch: 24 });
    cards.push(card(entry, byId, `${appUrl}#kit=${await encodeKit(withOrigin(entry.kit, entry.meta))}`));
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mimimaker gallery</title>
<style>
:root { --bg: #faf7f2; --fg: #2b2520; --muted: #6d6258; --card: #fff; --line: #e4dcd1; --accent: #b4532a; --on-accent: #fff; --render: #f1ebe2; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1a17; --fg: #eee6dc; --muted: #a89c8f; --card: #27231f; --line: #3a342e; --accent: #e88a5c; --on-accent: #1d1a17; --render: #ece5da; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
header, main { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
header { padding-top: 28px; }
h1 { margin: 0 0 4px; font-size: 1.6rem; }
header p { margin: 0 0 20px; color: var(--muted); }
a { color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; padding-bottom: 40px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.card img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: contain; background: var(--render); }
.body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.body p { margin: 0; }
h2 { margin: 0; font-size: 1.05rem; }
.by, .facts, .remix { color: var(--muted); font-size: 0.85rem; }
.desc { font-size: 0.9rem; }
.open { margin-top: auto; align-self: flex-start; padding: 6px 12px; border-radius: 6px; background: var(--accent); color: var(--on-accent); text-decoration: none; font-weight: 600; }
.card:target { outline: 2px solid var(--accent); }
</style>
</head>
<body>
<header>
  <h1>mimimaker gallery</h1>
  <p>Room kits shared by the community. Open one to get your own copy to edit and cut, free and with no account. <a href="${esc(appUrl)}">Back to mimimaker</a></p>
</header>
<main class="grid">
${cards.join('\n')}
</main>
</body>
</html>
`;
  return { html, renders };
}

// CLI
// Compare real file paths: argv[1] may be relative, symlinked or contain
// characters that a file:// URL percent-encodes.
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const out = resolve(process.argv[2] || join(root, 'dist/gallery'));
  const list = readKits(join(root, 'kits'));
  const errs = validateCollection(list);
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  const { html, renders } = await buildGallery(list.map((x) => x.entry));
  mkdirSync(join(out, 'renders'), { recursive: true });
  writeFileSync(join(out, 'index.html'), html);
  for (const [p, svg] of Object.entries(renders)) writeFileSync(join(out, p), svg);
  console.log(`Gallery: ${list.length} kits → ${out}`);
}
