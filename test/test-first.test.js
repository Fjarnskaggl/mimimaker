// Tests for the "tests before code" CI check (scripts/check-test-first.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verdict, classify, checkTestFirst } from '../scripts/check-test-first.js';

test('classify splits changed files into source and tests', () => {
  assert.deepEqual(classify(['src/a.js', 'test/a.test.js', 'README.md', 'test/e2e/x.e2e.cjs', 'styles.css', 'index.html']), {
    source: ['src/a.js', 'styles.css', 'index.html'], unitTests: ['test/a.test.js'], e2eTests: ['test/e2e/x.e2e.cjs'],
  });
});

test('verdict: source changes need tests', () => {
  assert.equal(verdict({ source: ['src/a.js'], tests: [] }).ok, false);
  assert.match(verdict({ source: ['src/a.js'], tests: [] }).reason, /no tests/i);
});

test('verdict: docs-only changes pass without tests', () => {
  assert.equal(verdict({ source: [], tests: [] }).ok, true);
});

test('verdict: tests must fail on main and pass on the branch', () => {
  assert.equal(verdict({ source: ['src/a.js'], tests: ['test/a.test.js'], failsOnBase: true, passesOnHead: true }).ok, true);
  const already = verdict({ source: ['src/a.js'], tests: ['test/a.test.js'], failsOnBase: false, passesOnHead: true });
  assert.equal(already.ok, false);
  assert.match(already.reason, /already pass/i);
  const broken = verdict({ source: ['src/a.js'], tests: ['test/a.test.js'], failsOnBase: true, passesOnHead: false });
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /fail on this branch/i);
});

// ------------------------------------------------- end to end in a temp repo
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'tf-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'test'));
  writeFileSync(join(dir, 'src/add.js'), 'export const add = (a, b) => a + b;\n');
  writeFileSync(join(dir, 'test/add.test.js'), "import { test } from 'node:test'; import assert from 'node:assert'; import { add } from '../src/add.js';\ntest('add', () => assert.equal(add(1, 2), 3));\n");
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  git('add', '-A'); git('commit', '-qm', 'base');
  git('checkout', '-qb', 'feature');
  return { dir, git, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const commitAll = (r, msg) => { r.git('add', '-A'); r.git('commit', '-qm', msg); };

test('checkTestFirst passes a feature whose new test fails on main', () => {
  const r = repo();
  writeFileSync(join(r.dir, 'test/mul.test.js'), "import { test } from 'node:test'; import assert from 'node:assert'; import { mul } from '../src/mul.js';\ntest('mul', () => assert.equal(mul(2, 3), 6));\n");
  writeFileSync(join(r.dir, 'src/mul.js'), 'export const mul = (a, b) => a * b;\n');
  commitAll(r, 'mul');
  const res = checkTestFirst({ cwd: r.dir, base: 'main' });
  r.done();
  assert.equal(res.ok, true, res.reason);
});

test('checkTestFirst rejects code without tests', () => {
  const r = repo();
  writeFileSync(join(r.dir, 'src/mul.js'), 'export const mul = (a, b) => a * b;\n');
  commitAll(r, 'mul');
  const res = checkTestFirst({ cwd: r.dir, base: 'main' });
  r.done();
  assert.equal(res.ok, false);
});

test('checkTestFirst rejects tests that already pass on main', () => {
  const r = repo();
  writeFileSync(join(r.dir, 'test/add2.test.js'), "import { test } from 'node:test'; import assert from 'node:assert'; import { add } from '../src/add.js';\ntest('add again', () => assert.equal(add(2, 2), 4));\n");
  writeFileSync(join(r.dir, 'src/add.js'), 'export const add = (a, b) => b + a;\n');
  commitAll(r, 'refactor with a test that proves nothing');
  const res = checkTestFirst({ cwd: r.dir, base: 'main' });
  r.done();
  assert.equal(res.ok, false);
  assert.match(res.reason, /already pass/i);
});

test('checkTestFirst allows refactors that say so in a commit', () => {
  const r = repo();
  writeFileSync(join(r.dir, 'src/add.js'), 'export const add = (a, b) => b + a;\n');
  r.git('add', '-A'); r.git('commit', '-qm', 'Reorder operands\n\nNo-behaviour-change: refactor covered by test/add.test.js');
  const res = checkTestFirst({ cwd: r.dir, base: 'main' });
  r.done();
  assert.equal(res.ok, true, res.reason);
  assert.match(res.reason, /refactor/i);
});

test('the check passes on this repository', () => {
  // main itself has nothing to compare against; it must not crash
  const res = checkTestFirst({ cwd: resolve('.'), base: 'HEAD' });
  assert.equal(res.ok, true, res.reason);
});

test('verdict: a refactor note does not excuse tests that already pass on main', () => {
  const res = verdict({ source: ['src/a.js'], tests: ['test/a.test.js'], failsOnBase: false, passesOnHead: true, refactor: true });
  assert.equal(res.ok, false, 'changed tests are still checked');
  assert.match(res.reason, /already pass/i);
  assert.equal(verdict({ source: ['src/a.js'], tests: [], refactor: true }).ok, true, 'a pure refactor with no test changes still passes');
});

test('checkTestFirst still checks changed tests when one commit says No-behaviour-change', () => {
  const r = repo();
  writeFileSync(join(r.dir, 'test/add2.test.js'), "import { test } from 'node:test'; import assert from 'node:assert'; import { add } from '../src/add.js';\ntest('add again', () => assert.equal(add(2, 2), 4));\n");
  writeFileSync(join(r.dir, 'src/add.js'), 'export const add = (a, b) => b + a;\n');
  r.git('add', '-A'); r.git('commit', '-qm', 'Reorder operands\n\nNo-behaviour-change: screenshot only');
  const res = checkTestFirst({ cwd: r.dir, base: 'main' });
  r.done();
  assert.equal(res.ok, false, res.reason);
  assert.match(res.reason, /already pass/i);
});
