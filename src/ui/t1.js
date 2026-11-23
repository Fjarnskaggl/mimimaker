// T1 UI: the "Add a piece" library — theme chips, search across all themes,
// a difficulty filter, and a difficulty / part-count line on every card.
// The search box is never re-created while typing, so it keeps focus; only
// the chips and the grid below it are redrawn.

import { THEMES } from '../catalog.js';
import { pieceInfo, searchPieces, DIFFICULTY } from '../pieces/meta.js';

const state = { query: '', difficulty: 0 };

const CSS = `
.t1-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
.t1-controls input, .t1-controls select { min-width: 0; font-size: 12.5px; }
.t1-meta { display: block; font-size: 10.5px; color: var(--muted); }
.t1-diff { font-weight: 600; }
.t1-diff-1 { color: #3f8a4f; }
.t1-diff-2 { color: #b5832a; }
.t1-diff-3 { color: var(--accent); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .t1-diff-1 { color: #82c991; }
  :root:not([data-theme="light"]) .t1-diff-2 { color: #e2b660; }
}
:root[data-theme="dark"] .t1-diff-1 { color: #82c991; }
:root[data-theme="dark"] .t1-diff-2 { color: #e2b660; }
.library .chips[hidden] { display: none; }
.t1-empty { font-size: 12px; color: var(--muted); margin: 2px 0; grid-column: 1 / -1; }
`;

function ensureStyles() {
  if (document.getElementById('t1-styles')) return;
  const s = document.createElement('style');
  s.id = 't1-styles';
  s.textContent = CSS;
  document.head.append(s);
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}

function pieceCard(def, { addPiece, thumb }) {
  const info = pieceInfo(def.id);
  const tags = info.tags.length ? ` — ${info.tags.join(', ')}` : '';
  return el('button', {
    type: 'button', class: 'piece', 'data-piece': def.id, 'data-difficulty': String(info.difficulty || ''),
    title: `Add ${info.label}${tags}`, onclick: () => addPiece(def.id),
  },
  el('span', { class: 'thumb', html: thumb(def.id) }),
  el('span', {}, info.label),
  el('span', { class: 't1-meta' },
    info.difficultyLabel ? el('span', { class: `t1-diff t1-diff-${info.difficulty}` }, info.difficultyLabel) : null,
    info.difficultyLabel ? ' · ' : null,
    `${info.parts} ${info.parts === 1 ? 'part' : 'parts'}`));
}

/**
 * The piece library panel.
 *   view      app view state; `view.theme` is read and updated
 *   addPiece  (id) => void, adds a piece to the kit
 *   thumb     (id) => SVG markup for the piece's thumbnail
 */
export function pieceLibrary({ view, addPiece, thumb }) {
  ensureStyles();
  const chips = el('div', { class: 'chips', role: 'tablist', 'aria-label': 'Piece themes' });
  const grid = el('div', { class: 'piece-grid' });

  const update = () => {
    const searching = state.query.trim() !== '';
    chips.hidden = searching;
    chips.replaceChildren(...THEMES.map((th) => el('button', {
      type: 'button', role: 'tab', class: 'chip', 'aria-selected': String(view.theme === th),
      onclick: () => { view.theme = th; update(); },
    }, th)));
    const difficulty = state.difficulty || undefined;
    const found = searching ? searchPieces(state.query, { difficulty }) : searchPieces('', { theme: view.theme, difficulty });
    grid.replaceChildren(...(found.length
      ? found.map((def) => pieceCard(def, { addPiece, thumb }))
      : [el('p', { class: 't1-empty' }, searching ? `No pieces match “${state.query.trim()}”.` : 'No pieces at this difficulty in this theme.')]));
  };

  const search = el('input', {
    id: 't1-piece-search', type: 'search', placeholder: 'Search pieces (sofa, storage, wall…)',
    'aria-label': 'Search pieces', autocomplete: 'off', value: state.query,
    oninput: (e) => { state.query = e.target.value; update(); },
  });
  const diff = el('select', {
    id: 't1-difficulty', 'aria-label': 'Difficulty',
    onchange: (e) => { state.difficulty = Number(e.target.value); update(); },
  }, el('option', { value: '0' }, 'Any level'), ...Object.entries(DIFFICULTY).map(([v, label]) => el('option', { value: v }, label)));
  diff.value = String(state.difficulty);

  update();
  return el('div', { class: 'library' },
    el('strong', { class: 'library-title' }, 'Add a piece'),
    el('div', { class: 't1-controls' }, search, diff),
    chips,
    grid);
}
