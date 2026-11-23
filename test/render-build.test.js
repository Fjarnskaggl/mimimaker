// T6 modules (src/ui/t6.js → src/render/*.js → ../preview3d.js) must end up in
// the single-file build that Pages deploys, each exactly once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

test('single-file build bundles nested modules into one valid script', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'mimi-build-')), 'm.html');
  execFileSync(process.execPath, ['scripts/build-single.js', out], { stdio: 'pipe' });
  const html = readFileSync(out, 'utf8');
  for (const m of ['app', 'preview3d', 'ui/t6', 'render/webgl', 'render/scene', 'render/three-loader']) {
    assert.ok(html.includes(`// ---- ${m}.js`), `bundles src/${m}.js`);
  }
  assert.equal((html.match(/\/\/ ---- preview3d\.js/g) || []).length, 1, 'shared module bundled once');
  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(js), 'bundle parses');
  assert.ok(!/^\s*import\s/m.test(js));
});
