// T4: build-mode progress (one step at a time, part checklist, glue timers,
// saved in the browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { buildSteps } from '../src/build/steps.js';
import {
  progressKey, emptyProgress, loadProgress, saveProgress,
  toggleStep, togglePart, goTo, summary, startTimer, timerLeft, formatClock,
} from '../src/build/progress.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};
const setup = () => {
  const kit = defaultKit();
  const steps = buildSteps(kit, compileKit(kit));
  return { kit, steps };
};

test('progress key is stable for the same steps and changes when the steps change', () => {
  const { kit, steps } = setup();
  assert.equal(progressKey(kit, steps), progressKey(kit, buildSteps(kit, compileKit(kit))));
  assert.match(progressKey(kit, steps), /^mimimaker\.build\./);
  const other = defaultKit();
  other.items = other.items.slice(1);
  assert.notEqual(progressKey(kit, steps), progressKey(other, buildSteps(other, compileKit(other))));
});

test('ticking every part of a step completes it; unticking reopens it', () => {
  const { steps } = setup();
  const s = steps.find((x) => x.parts.length > 1);
  let p = emptyProgress();
  for (const id of s.parts) p = togglePart(p, steps, s.n, id);
  assert.ok(p.done.includes(s.n), 'all parts ticked → step done');
  p = togglePart(p, steps, s.n, s.parts[0]);
  assert.ok(!p.done.includes(s.n), 'a part unticked → step open again');
});

test('marking a step done moves on to the next open step', () => {
  const { steps } = setup();
  let p = emptyProgress();
  p = toggleStep(p, steps, 1);
  assert.deepEqual(p.done, [1]);
  assert.equal(p.current, 2);
  p = goTo(p, steps, 5);
  p = toggleStep(p, steps, 5);
  assert.equal(p.current, 2, 'goes back to the first step still open');
  p = toggleStep(p, steps, 5);
  assert.ok(!p.done.includes(5), 'toggling again reopens it');
  assert.equal(goTo(p, steps, 999).current, steps.length, 'clamped');
  assert.equal(goTo(p, steps, 0).current, 1, 'clamped');
});

test('summary counts steps, parts and remaining glue time', () => {
  const { steps } = setup();
  let p = emptyProgress();
  const total = steps.reduce((a, s) => a + s.cureMin, 0);
  assert.deepEqual(summary(p, steps), { done: 0, total: steps.length, percent: 0, minutesLeft: total, finished: false });
  for (const s of steps) p = toggleStep(p, steps, s.n);
  const sum = summary(p, steps);
  assert.equal(sum.percent, 100);
  assert.equal(sum.minutesLeft, 0);
  assert.ok(sum.finished);
});

test('progress round-trips through storage and survives junk', () => {
  const { kit, steps } = setup();
  const store = memoryStorage();
  const key = progressKey(kit, steps);
  let p = toggleStep(emptyProgress(), steps, 1);
  p = togglePart(p, steps, 2, steps[1].parts[0]);
  saveProgress(store, key, p);
  assert.deepEqual(loadProgress(store, key, steps), p);
  store.setItem(key, '{nope');
  assert.deepEqual(loadProgress(store, key, steps), emptyProgress());
  store.setItem(key, JSON.stringify({ done: [1, 999, 'x'], parts: { 2: [steps[1].parts[0], -4] }, current: 999 }));
  const cleaned = loadProgress(store, key, steps);
  assert.deepEqual(cleaned.done, [1], 'unknown steps dropped');
  assert.deepEqual(cleaned.parts, { 2: [steps[1].parts[0]] }, 'unknown parts dropped');
  assert.equal(cleaned.current, steps.length);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadProgress(throwing, key, steps), emptyProgress(), 'blocked storage → fresh start');
  assert.doesNotThrow(() => saveProgress(throwing, key, p));
});

test('glue timer counts down from the step cure time and is saved with the progress', () => {
  const { steps } = setup();
  const room = steps[0];
  const t0 = 1_000_000;
  const p = startTimer(emptyProgress(), steps, room.n, t0);
  assert.equal(timerLeft(p, room.n, t0), room.cureMin * 60);
  assert.equal(timerLeft(p, room.n, t0 + 90_000), room.cureMin * 60 - 90);
  assert.equal(timerLeft(p, room.n, t0 + room.cureMin * 60_000 + 5000), 0, 'never negative');
  assert.equal(timerLeft(p, 2, t0), null, 'no timer running for another step');
  const info = steps.find((s) => s.kind === 'info');
  assert.equal(startTimer(p, steps, info.n, t0), p, 'no glue, no timer');
  assert.equal(formatClock(30 * 60), '30:00');
  assert.equal(formatClock(65), '1:05');
  assert.equal(formatClock(0), '0:00');
});
