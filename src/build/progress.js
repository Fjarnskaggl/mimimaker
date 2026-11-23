// Build-mode progress: which steps are done, which parts are ticked off,
// which step is open, and glue timers. Pure functions over a plain object,
// saved to the browser's localStorage (or any getItem/setItem store).
//
// progress: {
//   current: step number on screen,
//   done:    [step numbers],
//   parts:   { [step]: [part ids ticked] },
//   timers:  { [step]: { at: ms since epoch, sec: glue time in seconds } },
// }

export const emptyProgress = () => ({ current: 1, done: [], parts: {}, timers: {} });

/** FNV-1a hash → short base-36 string. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Storage key: changes whenever the steps or their parts change, so stale ticks never carry over. */
export function progressKey(kit, steps) {
  const sig = [kit.name || '', ...steps.map((s) => `${s.title}:${s.parts.join(',')}`)].join('|');
  return `mimimaker.build.${hash(sig)}`;
}

const clampStep = (steps, n) => Math.min(Math.max(1, Math.round(Number(n) || 1)), Math.max(1, steps.length));
const sorted = (list) => [...new Set(list)].sort((a, b) => a - b);
const firstOpen = (steps, done) => steps.find((s) => !done.includes(s.n))?.n;

export function goTo(p, steps, n) {
  return { ...p, current: clampStep(steps, n) };
}

/** Mark a step done (and move to the first step still open) or reopen it. */
export function toggleStep(p, steps, n) {
  if (p.done.includes(n)) return { ...p, done: p.done.filter((d) => d !== n), current: n };
  const done = sorted([...p.done, n]);
  return { ...p, done, current: firstOpen(steps, done) ?? n };
}

/** Tick a part off a step's checklist; the step is done once every part is ticked. */
export function togglePart(p, steps, n, id) {
  const step = steps.find((s) => s.n === n);
  if (!step || !step.parts.includes(id)) return p;
  const have = p.parts[n] || [];
  const ticked = have.includes(id) ? have.filter((x) => x !== id) : sorted([...have, id]);
  const parts = { ...p.parts };
  if (ticked.length) parts[n] = ticked; else delete parts[n];
  const all = step.parts.every((x) => ticked.includes(x));
  const done = all ? sorted([...p.done, n]) : p.done.filter((d) => d !== n);
  return { ...p, parts, done };
}

export function summary(p, steps) {
  const done = steps.filter((s) => p.done.includes(s.n)).length;
  const total = steps.length;
  return {
    done, total,
    percent: total ? Math.round((100 * done) / total) : 100,
    minutesLeft: steps.filter((s) => !p.done.includes(s.n)).reduce((a, s) => a + s.cureMin, 0),
    finished: done === total,
  };
}

/** Start (or restart) the glue timer for a step. Steps with no glue time return `p` unchanged. */
export function startTimer(p, steps, n, now = Date.now()) {
  const step = steps.find((s) => s.n === n);
  if (!step || step.kind === 'info' || !step.cureMin) return p;
  return { ...p, timers: { ...p.timers, [n]: { at: now, sec: step.cureMin * 60 } } };
}

/** Seconds left on a step's glue timer, or null when none is running. */
export function timerLeft(p, n, now = Date.now()) {
  const t = p.timers?.[n];
  if (!t) return null;
  return Math.max(0, t.sec - Math.floor((now - t.at) / 1000));
}

export function formatClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Read saved progress, dropping anything that no longer matches the steps. */
export function loadProgress(storage, key, steps) {
  let raw;
  try { raw = JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return emptyProgress(); }
  if (!raw || typeof raw !== 'object') return emptyProgress();
  const byN = new Map(steps.map((s) => [s.n, s]));
  const p = emptyProgress();
  p.current = clampStep(steps, raw.current);
  p.done = sorted((Array.isArray(raw.done) ? raw.done : []).filter((n) => byN.has(n)));
  for (const [k, ids] of Object.entries(raw.parts || {})) {
    const step = byN.get(Number(k));
    const keep = step && Array.isArray(ids) ? sorted(ids.filter((id) => step.parts.includes(id))) : [];
    if (keep.length) p.parts[step.n] = keep;
  }
  for (const [k, t] of Object.entries(raw.timers || {})) {
    if (byN.has(Number(k)) && Number.isFinite(t?.at) && Number.isFinite(t?.sec)) p.timers[Number(k)] = { at: t.at, sec: t.sec };
  }
  return p;
}

/** Save progress; a blocked or full storage is ignored (progress just isn't kept). */
export function saveProgress(storage, key, p) {
  try { storage?.setItem(key, JSON.stringify(p)); } catch { /* private mode, quota, … */ }
}
