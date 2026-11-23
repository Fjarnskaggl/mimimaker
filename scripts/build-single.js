// Bundle the app into one self-contained HTML file (no imports, inline CSS/JS),
// e.g. for hosting as a single page or a claude.ai artifact.
//
//   node scripts/build-single.js [out.html] [--fragment]
//
// --fragment omits <!doctype>/<html>/<head>/<body> (for hosts that add them).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// import { a, b as c } from './x.js'   |   import * as ns from '../dir/y.js'
const IMPORT_RE = /^import\s*(\{[^}]*\}|\*\s+as\s+[\w$]+)\s*from\s*'(\.{1,2}\/[\w./-]+)\.js';\s*$/gm;

// --- tiny scanner for `export const A = …, B = …;` (names after the first)
function skipString(src, i, q) {
  for (i += 1; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === q) return i + 1;
  }
  return i;
}
function skipTemplate(src, i) {
  for (i += 1; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === '`') return i + 1;
    else if (src[i] === '$' && src[i + 1] === '{') i = skipExpr(src, i + 2) - 1;
  }
  return i;
}
function skipExpr(src, i) { // returns the index after the matching '}'
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i, c); continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
    i++;
  }
  return i;
}
/** Names declared after the first in a `const`/`let` statement starting at i. */
export function extraDeclarators(src, i) {
  const names = [];
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
    if (c === '"' || c === "'") { i = skipString(src, i, c); continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === ';') break;
    else if (depth === 0 && c === '\n' && /^\s*(export|import|const|let|var|function|class|async)\b/.test(src.slice(i + 1, i + 40))) break;
    else if (depth === 0 && c === ',') {
      const m = /^\s*([\w$]+)\s*=(?!=)/.exec(src.slice(i + 1, i + 200));
      if (m) names.push(m[1]);
    }
    i++;
  }
  return names;
}

/**
 * Bundle an ES-module graph (relative imports only) into one script.
 * Module keys are paths relative to the entry's folder without ".js"
 * (e.g. "geometry", "pieces/load"); each module is evaluated once.
 */
export function bundle(entry) {
  const root = dirname(resolve(entry));
  const keyOf = (abs) => relative(root, abs).split('\\').join('/').replace(/\.js$/, '');
  const order = [];
  const seen = new Set();
  const visit = (abs) => {
    const key = keyOf(abs);
    if (seen.has(key)) return;
    seen.add(key);
    const src = readFileSync(abs, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) visit(resolve(dirname(abs), `${m[2]}.js`));
    order.push({ key, abs, src });
  };
  visit(resolve(entry));

  const transform = ({ key, abs, src }) => {
    const exports = [];
    let body = src.replace(IMPORT_RE, (_, clause, spec) => {
      const dep = JSON.stringify(keyOf(resolve(dirname(abs), `${spec}.js`)));
      if (clause.startsWith('*')) return `const ${clause.replace(/^\*\s+as\s+/, '').trim()} = __m[${dep}];`;
      const binds = clause.slice(1, -1).split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': '));
      return `const { ${binds.join(', ')} } = __m[${dep}];`;
    });
    body = body.replace(/^export\s+(async\s+function|function|const|let|class)\s+([\w$]+)/gm, (match, kw, id, offset, whole) => {
      exports.push(id);
      if (kw === 'const' || kw === 'let') exports.push(...extraDeclarators(whole, offset + match.length));
      return `${kw} ${id}`;
    });
    if (/^\s*(import|export)\s/m.test(body)) {
      throw new Error(`Unsupported import/export syntax in ${relative(root, abs)} (use named exports and relative imports)`);
    }
    return `// ---- ${key}.js\n__m[${JSON.stringify(key)}] = (() => {\n${body}\nreturn { ${exports.join(', ')} };\n})();\n`;
  };
  const js = `(() => {\n'use strict';\nconst __m = {};\n${order.map(transform).join('\n')}\n})();`;
  return { js, modules: order.map((m) => m.key) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
const root = resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(args.find((a) => !a.startsWith('--')) || join(root, 'dist/mimimaker.html'));
const { js, modules } = bundle(join(root, 'src/app.js'));
const order = modules;

const css = readFileSync(join(root, 'styles.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const bodyInner = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[^>]*src="src\/app\.js"[^>]*><\/script>/, '');

const page = `${title}
<style>
${css}
</style>
${bodyInner.trim()}
<script>
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;
const doc = fragment ? page : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M4 14 16 5l12 9v13H4z' fill='%23c0603a'/%3E%3Crect x='13' y='18' width='6' height='9' fill='%23fff8ef'/%3E%3C/svg%3E">
</head>
<body>
${page}</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, doc);
console.log(`wrote ${out} (${(doc.length / 1024).toFixed(0)} KB, ${order.length} modules)`);
}
