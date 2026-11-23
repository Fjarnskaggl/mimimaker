// T4 build companion UI: a phone-friendly, one-step-at-a-time build mode on
// the Build step, with a part checklist, glue timers, an exploded view per
// step, a bill of materials and progress saved in the browser. The printable
// guide stays one tap away.
//
//   buildCompanion(pageEl, kit, compiled)
// pageEl is the Build step's `.page` (its `.guide-tools` header and
// `.guide-frame` iframe are made by app.js). All logic lives in
// src/build/progress.js; this file only renders.

import { buildSteps, stepJointKinds } from '../build/steps.js';
import {
  progressKey, emptyProgress, loadProgress, saveProgress,
  toggleStep, togglePart, goTo, summary, startTimer, timerLeft, formatClock,
} from '../build/progress.js';
import { billOfMaterials } from '../build/bom.js';
import { explodedViewSVG } from '../build/exploded.js';
import { jointGraph } from '../build/joints.js';
import { formatMinutes } from '../make.js';

const MODE_KEY = 'mimimaker.build.mode';
const STYLE_ID = 't4-style';

const CSS = `
.t4-mode { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius-pill); overflow: hidden; }
.t4-mode button { border: 0; border-radius: 0; min-height: 44px; padding: 0 var(--space-4); background: var(--surface); }
.t4-mode button[aria-pressed=true] { background: var(--mat); color: var(--on-mat); }
.t4-build { max-width: 720px; margin: var(--space-4) auto; display: grid; gap: var(--space-4); }
.t4-build[hidden] { display: none; }
.t4-head { display: grid; gap: var(--space-2); }
.t4-summary { color: var(--ink-muted); font-size: 14px; margin: 0; }
.t4-bar { height: 8px; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.t4-bar span { display: block; height: 100%; background: var(--mat); transition: width .2s; }
.t4-step { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: var(--space-5); display: grid; gap: var(--space-3); box-shadow: var(--shadow-raise); }
.t4-step.is-done { border-color: var(--mat); }
.t4-count { font: 600 13px var(--font-sans); color: var(--ink-muted); margin: 0; }
.t4-title { font: 700 22px/1.2 var(--font-display); margin: 0; overflow-wrap: anywhere; }
.t4-done-badge { display: inline-block; margin-left: var(--space-2); padding: 2px 8px; border-radius: var(--radius-pill); background: var(--mat-soft); color: var(--mat); font: 600 12px var(--font-sans); vertical-align: middle; }
.t4-meta { color: var(--ink-muted); font-size: 14px; margin: 0; overflow-wrap: anywhere; }
.t4-text { margin: 0; padding-left: 1.3em; display: grid; gap: var(--space-2); font-size: 16px; line-height: 1.5; }
.t4-parts { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
.t4-parts label { display: flex; align-items: center; gap: var(--space-3); min-height: 44px; padding: 0 var(--space-3); border-radius: var(--radius-md); background: var(--surface-sunken); cursor: pointer; }
.t4-parts input { width: 22px; height: 22px; accent-color: var(--mat); flex: none; }
.t4-parts .num { font: 600 14px var(--font-mono); min-width: 3ch; }
.t4-parts input:checked + .num + span { text-decoration: line-through; color: var(--ink-muted); }
.t4-timer { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: var(--radius-md); background: var(--glow-soft); }
.t4-timer button { min-height: 44px; }
.t4-timer .clock { font: 600 18px var(--font-mono); }
.t4-nav { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-2); }
.t4-nav button { min-height: 48px; }
.t4-foot { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; justify-content: space-between; }
.t4-foot select { min-height: 44px; max-width: 100%; }
.t4-exploded { margin: 0; border-radius: var(--radius-md); background: var(--surface-sunken); padding: var(--space-3); }
.t4-exploded svg { display: block; width: 100%; height: auto; max-height: 360px; }
.t4-exploded figcaption { font-size: 12px; color: var(--ink-muted); margin-top: var(--space-1); }
.t4-bom { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 0 var(--space-4); }
.t4-bom summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font-weight: 600; overflow-wrap: anywhere; }
.t4-bom[open] { padding-bottom: var(--space-4); }
.t4-bom h4 { margin: var(--space-3) 0 var(--space-1); font-size: 13px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: .04em; }
.t4-bom ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
.t4-bom li { display: grid; grid-template-columns: 3ch minmax(0, 1fr) auto; gap: var(--space-2); font-size: 14px; }
.t4-bom li small { grid-column: 2; color: var(--ink-muted); }
.t4-bom .cost { font-family: var(--font-mono); white-space: nowrap; }
.t4-bom p { font-size: 14px; margin: var(--space-2) 0 0; }
.t4-bom .note { color: var(--ink-muted); font-size: 12px; }
@media (max-width: 520px) {
  .t4-step { padding: var(--space-4); }
  .t4-title { font-size: 20px; }
  .t4-nav { grid-template-columns: 1fr 1fr; }
  .t4-nav .t4-done { grid-column: 1 / -1; grid-row: 1; }
}
`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

const store = () => { try { return window.localStorage; } catch { return null; } };
/** The view picked last time, else step-by-step on phones and the printable guide on wider screens. */
function readMode() {
  let saved = null;
  try { saved = store()?.getItem(MODE_KEY); } catch { /* private mode */ }
  if (saved === 'guide' || saved === 'steps') return saved;
  return window.matchMedia?.('(max-width: 760px)').matches ? 'steps' : 'guide';
}
const writeMode = (m) => { try { store()?.setItem(MODE_KEY, m); } catch { /* private mode */ } };
/** Glue clock; tests speed it up with window.__t4Speed. */
const clock = () => Date.now() * (Number(window.__t4Speed) || 1);

const money = (c) => `$${c.low.toFixed(2)}–${c.high.toFixed(2)}`;

/** The step's exploded view (trusted SVG from our own renderer). */
function exploded(svg) {
  if (!svg) return null;
  const fig = el('figure', { class: 't4-exploded' });
  fig.innerHTML = svg;
  fig.append(el('figcaption', {}, 'Exploded view: the parts for this step, pulled apart where they go.'));
  return fig;
}

/** "What you'll need": sheets, supplies, lights, cost, difficulty and time. */
function bomDetails(kit, compiled, steps) {
  let bom;
  try { bom = billOfMaterials(kit, compiled, steps); } catch (err) { console.error('bill of materials', err); return null; }
  const list = (title, items) => (items.length ? [el('h4', {}, title), el('ul', {}, items.map((i) => el('li', {},
    el('span', {}, `${i.qty}×`), el('span', {}, i.name), el('span', { class: 'cost' }, money(i.cost)), el('small', {}, i.note))))] : []);
  const t = bom.time;
  return el('details', { class: 't4-bom' },
    el('summary', {}, `What you'll need · about ${money(bom.total)} · ${bom.difficulty.level} · about ${formatMinutes(t.totalMin)}`),
    ...list('Sheets', bom.sheets),
    ...list('Glue and supplies', bom.supplies),
    ...list('Lights', bom.lights),
    el('p', {}, el('strong', {}, `${bom.difficulty.level}: `), bom.difficulty.reasons.join(', '), '.'),
    el('p', {}, `About ${formatMinutes(t.totalMin)} in all: cutting ${formatMinutes(t.cutMin)}, assembly ${formatMinutes(t.assemblyMin)}, waiting for glue ${formatMinutes(t.glueMin)}.`),
    el('p', { class: 'note' }, bom.note));
}

export function buildCompanion(page, kit, compiled) {
  if (!page) return null;
  if (!document.getElementById(STYLE_ID)) document.head.append(el('style', { id: STYLE_ID }, CSS));
  const steps = buildSteps(kit, compiled);
  if (!steps.length) return null;
  const key = progressKey(kit, steps);
  const partById = new Map(compiled.parts.map((p) => [p.id, p]));
  const matOf = new Map(compiled.groups.map((g) => [g.title, g.material]));
  let p = loadProgress(store(), key, steps);
  const graph = jointGraph(kit, compiled);
  const views = new Map(); // step n → exploded view SVG (drawn on first visit)
  const viewOf = (n) => {
    if (!views.has(n)) { try { views.set(n, explodedViewSVG(kit, compiled, steps, n, { graph })); } catch (err) { console.error('exploded view', err); views.set(n, null); } }
    return views.get(n);
  };
  const bomPanel = bomDetails(kit, compiled, steps);
  let tick = null;

  const frame = page.querySelector('.guide-frame');
  const root = el('section', { class: 't4-build', 'aria-label': 'Build step by step' });
  const modeBtn = (mode, label) => el('button', { type: 'button', 'data-mode': mode, onclick: () => { writeMode(mode); setMode(mode); } }, label);
  const modes = el('div', { class: 't4-mode', role: 'group', 'aria-label': 'Build view' }, modeBtn('steps', 'Step by step'), modeBtn('guide', 'Printable guide'));
  const tools = page.querySelector('.guide-tools');
  if (tools) tools.insertBefore(modes, tools.children[1] || null); else page.prepend(modes);
  (frame || tools)?.before(root);

  function setMode(mode) {
    root.hidden = mode !== 'steps';
    if (frame) frame.hidden = mode === 'steps';
    modes.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }

  function update(next) {
    p = next;
    saveProgress(store(), key, p);
    render();
  }

  function timerRow(step) {
    if (step.kind === 'info' || !step.cureMin) return null;
    const left = timerLeft(p, step.n, clock());
    const start = el('button', { type: 'button', class: 'mm-btn', onclick: () => update(startTimer(p, steps, step.n, clock())) },
      left == null ? `Start ${step.cureMin} min glue timer` : 'Restart timer');
    let status;
    if (left == null) status = el('span', {}, `Let the glue set about ${step.cureMin} min before moving on.`);
    else if (left > 0) status = el('span', {}, el('span', { class: 'clock' }, formatClock(left)), ' left');
    else status = el('strong', {}, 'Glue set ✓ — carry on.');
    return el('div', { class: 't4-timer', 'aria-live': 'polite' }, status, left === 0 ? null : start);
  }

  function render() {
    clearInterval(tick);
    const step = steps.find((s) => s.n === p.current) || steps[0];
    const sum = summary(p, steps);
    const done = p.done.includes(step.n);
    const ticked = p.parts[step.n] || [];
    const meta = [matOf.get(step.group), stepJointKinds(step).join(', ')].filter(Boolean).join(' · ');

    const head = el('div', { class: 't4-head' },
      el('p', { class: 't4-summary' }, sum.finished
        ? `All ${sum.total} steps done — enjoy your room!`
        : `${sum.done} of ${sum.total} steps done · about ${sum.minutesLeft} min of glue time left`),
      el('div', { class: 't4-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(sum.percent) },
        el('span', { style: `width:${sum.percent}%` })));

    const parts = step.parts.length ? el('ul', { class: 't4-parts', 'aria-label': 'Parts for this step' },
      step.parts.map((id) => {
        const part = partById.get(id);
        return el('li', {}, el('label', {},
          el('input', { type: 'checkbox', checked: ticked.includes(id), onchange: () => update(togglePart(p, steps, step.n, id)) }),
          el('span', { class: 'num' }, `#${id}`),
          el('span', {}, part ? part.name : '')));
      })) : null;

    const card = el('article', { class: `t4-step${done ? ' is-done' : ''}`, 'data-step': String(step.n) },
      el('p', { class: 't4-count' }, `Step ${step.n} of ${steps.length}`),
      el('h3', { class: 't4-title' }, step.title),
      done ? el('span', { class: 't4-done-badge' }, 'Done') : null,
      meta ? el('p', { class: 't4-meta' }, meta) : null,
      exploded(viewOf(step.n)),
      parts,
      el('ol', { class: 't4-text' }, step.text.map((t) => el('li', {}, t))),
      timerRow(step),
      el('div', { class: 't4-nav' },
        el('button', { type: 'button', class: 'mm-btn t4-prev', disabled: step.n === 1, onclick: () => update(goTo(p, steps, step.n - 1)) }, '‹ Back'),
        el('button', { type: 'button', class: `mm-btn ${done ? '' : 'mm-btn--primary '}t4-done`, onclick: () => update(toggleStep(p, steps, step.n)) },
          done ? 'Not done yet' : 'Done — next step'),
        el('button', { type: 'button', class: 'mm-btn t4-next', disabled: step.n === steps.length, onclick: () => update(goTo(p, steps, step.n + 1)) }, 'Next ›')));

    const jump = el('select', { 'aria-label': 'Jump to step', onchange: (e) => update(goTo(p, steps, Number(e.target.value))) },
      steps.map((s) => el('option', { value: String(s.n), selected: s.n === step.n }, `${p.done.includes(s.n) ? '✓ ' : ''}${s.n}. ${s.title}`)));
    const reset = el('button', { type: 'button', class: 'mm-btn mm-btn--quiet t4-reset', onclick: () => {
      if (window.confirm('Start this build over? Your ticks and timers will be cleared.')) update(emptyProgress());
    } }, 'Start over');

    root.replaceChildren(head, bomPanel || '', card, el('div', { class: 't4-foot' }, jump, reset));
    // only the timer row redraws while the glue sets, so ticks and focus stay put
    if (timerLeft(p, step.n, clock()) > 0) {
      tick = setInterval(() => {
        const row = root.querySelector('.t4-timer');
        if (!root.isConnected || !row) { clearInterval(tick); return; }
        row.replaceWith(timerRow(step));
        if (timerLeft(p, step.n, clock()) === 0) clearInterval(tick);
      }, 1000 / Math.min(10, Number(window.__t4Speed) || 1));
    }
  }

  setMode(readMode());
  render();
  return root;
}
