// Tests for the single-file bundler (scripts/build-single.js), issue #12.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { bundle } from '../scripts/build-single.js';

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  for (const [path, src] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), src);
  }
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
// The bundle runs in its own VM context; copy results out as plain data so
// they compare with this realm's arrays and objects.
const runBundle = (js) => {
  const ctx = { result: undefined, count: 0 };
  vm.runInNewContext(js, ctx);
  return { count: ctx.count, result: JSON.parse(JSON.stringify(ctx.result)) };
};

test('follows imports into subfolders and back up', () => {
  const p = project({
    'app.js': "import { load } from './pieces/load.js';\nresult = load();\n",
    'geometry.js': "export const area = (w, h) => w * h;\n",
    'pieces/load.js': "import { area } from '../geometry.js';\nimport { NAMES } from './names.js';\nexport function load() { return NAMES.map((n) => n + ':' + area(2, 3)); }\n",
    'pieces/names.js': "export const NAMES = ['sofa', 'bed'];\n",
  });
  const { js, modules } = bundle(join(p.dir, 'app.js'));
  p.done();
  assert.deepEqual(modules.sort(), ['app', 'geometry', 'pieces/load', 'pieces/names']);
  assert.deepEqual(runBundle(js).result, ['sofa:6', 'bed:6']);
});

test('a module reached by two different paths is evaluated once', () => {
  const p = project({
    'app.js': "import { n } from './geometry.js';\nimport { m } from './pieces/load.js';\nresult = [n(), m()];\n",
    'geometry.js': "count += 1;\nlet calls = 0;\nexport const n = () => ++calls;\n",
    'pieces/load.js': "import { n } from '../geometry.js';\nexport const m = () => n();\n",
  });
  const ctx = runBundle(bundle(join(p.dir, 'app.js')).js);
  p.done();
  assert.equal(ctx.count, 1);
  assert.deepEqual(ctx.result, [1, 2], 'shared state');
});

test('namespace and renamed imports work', () => {
  const p = project({
    'app.js': "import * as g from './geo/index.js';\nimport { area as a } from './geo/index.js';\nresult = [g.area(2, 2), a(3, 3), Object.keys(g).sort()];\n",
    'geo/index.js': "export function area(w, h) { return w * h; }\nexport const PI = 3;\n",
  });
  const ctx = runBundle(bundle(join(p.dir, 'app.js')).js);
  p.done();
  assert.deepEqual(ctx.result, [4, 9, ['PI', 'area']]);
});

test('unsupported module syntax fails with the file name', () => {
  const p = project({
    'app.js': "import { x } from './re.js';\nresult = x;\n",
    're.js': "export * from './other.js';\n",
    'other.js': "export const x = 1;\n",
  });
  assert.throws(() => bundle(join(p.dir, 'app.js')), /re\.js/);
  p.done();
});

test('the real app still bundles', () => {
  const { js, modules } = bundle(resolve('src/app.js'));
  assert.ok(modules.length >= 21);
  assert.ok(modules.includes('app') && modules.includes('kit') && modules.includes('geometry'));
  assert.doesNotMatch(js, /^\s*(import|export)\s/m);
});
