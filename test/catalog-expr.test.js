import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileExpr, evalExpr, fillTemplate, templateExprs, ExprError } from '../src/pieces/expr.js';

test('expressions follow JavaScript precedence and float order', () => {
  const env = { w: 83.3, d: 31.7, t: 1.5, k: 4, style: 'doors' };
  const cases = {
    'd - t': env.d - env.t,
    '(w - w * 0.56) / 2': (env.w - env.w * 0.56) / 2,
    '-w * 2 + d': -env.w * 2 + env.d,
    'k % 3': 1,
    '1 - 0.08 * (k % 3)': 1 - 0.08 * (env.k % 3),
    'min(w * 0.08, d * 0.3)': Math.min(env.w * 0.08, env.d * 0.3),
    'max(2, round(w / 7))': 12,
    'clamp(k, 0, 3)': 3,
    "style == 'doors' ? 1 : 2": 1,
    "style != 'doors' || k > 3": true,
    '!(k >= 4) && 1': false,
    '2 * PI': 2 * Math.PI,
    '.5 + 1.': 1.5,
    7: 7,
  };
  for (const [src, want] of Object.entries(cases)) {
    assert.equal(evalExpr(src === '7' ? 7 : src, env), want, src);
  }
});

test('compileExpr reports the names and functions an expression uses', () => {
  const { names, calls } = compileExpr('min(arm, w / 3) + t * PI');
  assert.deepEqual([...names].sort(), ['arm', 't', 'w']);
  assert.deepEqual([...calls], ['min']);
});

test('bad expressions are rejected, never evaluated', () => {
  for (const src of ['w +', '(w', 'w w', 'alert(1)', 'w.constructor', 'w[0]', '"dq"', 'w = 2', '1 ; 2', '', 'constructor(1)', 'toString()', '__proto__(1)']) {
    assert.throws(() => compileExpr(src), ExprError, src);
  }
  assert.throws(() => evalExpr('nope + 1', { w: 1 }), /not defined/);
  assert.throws(() => evalExpr('constructor', {}), /not defined/);
  assert.throws(() => compileExpr({ a: 1 }), ExprError);
});

test('template strings interpolate expressions', () => {
  assert.equal(fillTemplate('Book {k + 1}', { k: 2 }), 'Book 3');
  assert.equal(fillTemplate('Shelf', {}), 'Shelf');
  assert.deepEqual(templateExprs('Rung {k + 1} of {n}'), ['k + 1', 'n']);
});

test('trigonometry for round things (clock ticks, dials)', () => {
  assert.equal(evalExpr('sin(PI / 2)', {}), 1);
  assert.equal(evalExpr('cos(0)', {}), 1);
  assert.ok(Math.abs(evalExpr('cos(PI / 3)', {}) - 0.5) < 1e-12);
});
