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
    body = body.replace(/^export\s+(async\s+function|function|const|let|class)\s+([\w$]+)/gm, (_, kw, id) => {
      exports.push(id);
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
