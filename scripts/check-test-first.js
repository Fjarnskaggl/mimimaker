#!/usr/bin/env node
// "Tests before code" check for pull requests.
//
// A branch that changes app source must also change tests, and those tests
// must FAIL against the base branch's code and PASS against the branch's
// code. That is evidence the tests describe new behaviour rather than being
// written afterwards to match it.
//
// Pure refactors that change no tests can opt out by putting
// "No-behaviour-change: <why>" in a commit message; the full test suite still
// runs in CI. A branch that does change tests is always checked, note or not.
//
//   node scripts/check-test-first.js [base]   (default base: origin/main)

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = [/^src\//, /^index\.html$/, /^styles\.css$/, /^scripts\/(?!check-test-first)/];
const UNIT = /^test\/[^/]+\.test\.(js|mjs|cjs)$/;
const E2E = /^test\/e2e\/.+\.(js|mjs|cjs)$/;
const REFACTOR = /No-behaviou?r-change:/i;

export function classify(files) {
  return {
    source: files.filter((f) => SOURCE.some((re) => re.test(f))),
    unitTests: files.filter((f) => UNIT.test(f)),
    e2eTests: files.filter((f) => E2E.test(f)),
  };
}

export function verdict({ source, tests, failsOnBase, passesOnHead, refactor = false }) {
  if (!source.length) return { ok: true, reason: 'No app source changed.' };
  if (refactor && !tests.length) return { ok: true, reason: 'Declared refactor (No-behaviour-change); existing tests must still pass.' };
  if (!tests.length) return { ok: false, reason: `Source changed (${source.join(', ')}) but no tests were added or changed. Write a failing test first.` };
  if (!failsOnBase) return { ok: false, reason: `The changed tests already pass on the base branch, so they don't show the new behaviour: ${tests.join(', ')}. Add a test that fails without your change.` };
  if (!passesOnHead) return { ok: false, reason: `The changed tests fail on this branch: ${tests.join(', ')}.` };
  return { ok: true, reason: `Tests fail on the base branch and pass here: ${tests.join(', ')}.` };
}

// NODE_TEST_CONTEXT is set when this runs under `node --test`; a child that
// inherits it reports to the parent instead of exiting with its own status.
const cleanEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
const run = (cwd, files) => spawnSync(process.execPath, ['--test', ...files], { cwd, env: cleanEnv(), stdio: 'pipe', encoding: 'utf8', timeout: 10 * 60 * 1000 });

export function checkTestFirst({ cwd = process.cwd(), base = 'origin/main' } = {}) {
  const git = (...a) => execFileSync('git', a, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
  const mergeBase = git('merge-base', base, 'HEAD');
  const changed = git('diff', '--name-only', '--diff-filter=ACMR', mergeBase, 'HEAD').split('\n').filter(Boolean);
  const { source, unitTests, e2eTests } = classify(changed);
  const tests = [...unitTests, ...e2eTests];
  const refactor = REFACTOR.test(git('log', '--format=%B', `${mergeBase}..HEAD`));
  if (!source.length || !tests.length) return verdict({ source, tests, refactor });

  // Run the branch's tests against the base branch's code.
  const tmp = mkdtempSync(join(tmpdir(), 'test-first-'));
  let failsOnBase;
  try {
    git('worktree', 'add', '--detach', '--quiet', tmp, mergeBase);
    for (const f of tests) {
      mkdirSync(dirname(join(tmp, f)), { recursive: true });
      writeFileSync(join(tmp, f), execFileSync('git', ['show', `HEAD:${f}`], { cwd, encoding: 'utf8' }));
    }
    failsOnBase = run(tmp, tests).status !== 0;
  } finally {
    try { git('worktree', 'remove', '--force', tmp); } catch { rmSync(tmp, { recursive: true, force: true }); }
  }
  const passesOnHead = run(cwd, tests).status === 0;
  return verdict({ source, tests, failsOnBase, passesOnHead, refactor });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = checkTestFirst({ base: process.argv[2] || 'origin/main' });
  console.log(`${res.ok ? 'PASS' : 'FAIL'}: ${res.reason}`);
  process.exit(res.ok ? 0 : 1);
}
