import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES } from '../src/pieces/index.js';
import { validatePiece } from '../src/pieces/schema.js';
import { CATALOG, THEMES } from '../src/catalog.js';
import { pieceInfo, partCount, searchPieces, allTags, DIFFICULTY } from '../src/pieces/meta.js';

test('every piece carries library metadata: tags and a difficulty', () => {
  for (const p of PIECES) {
    assert.ok(Array.isArray(p.tags) && p.tags.length >= 1, `${p.id} has tags`);
    assert.ok([1, 2, 3].includes(p.difficulty), `${p.id} has a difficulty`);
    assert.deepEqual(CATALOG[p.id].tags, p.tags);
    assert.equal(CATALOG[p.id].difficulty, p.difficulty);
  }
  assert.deepEqual(DIFFICULTY, { 1: 'Easy', 2: 'Medium', 3: 'Tricky' });
});

test('tags are lower-case words without repeats', () => {
  const base = PIECES.find((p) => p.id === 'table');
  const bad = (tags) => validatePiece({ ...structuredClone(base), tags });
  assert.ok(bad(['Table']).some((m) => /tags\[0\]: lower-case/.test(m)));
  assert.ok(bad(['two words']).some((m) => /tags\[0\]: lower-case/.test(m)));
  assert.ok(bad(['table', 'table']).some((m) => /tags\[1\]: duplicate "table"/.test(m)));
  assert.deepEqual(bad(['table', 'dining-room']), []);
});

test('part counts come from the real compiler, per material kind', () => {
  assert.deepEqual(partCount('bookshelf'), { board: 8, card: 4, fabric: 0 });
  assert.deepEqual(partCount('cabinet'), { board: 6, card: 1, fabric: 0 });
  assert.deepEqual(partCount('sofa'), { board: 19, card: 4, fabric: 1 });
  assert.deepEqual(partCount('rug'), { board: 1, card: 1, fabric: 1 });
  // parameters change the count: more shelves, more parts
  assert.equal(partCount('bookshelf', { shelves: 5 }).board, 10);
  assert.throws(() => partCount('nope'), /Unknown piece "nope"/);
});

test('pieceInfo summarises a piece for the library card', () => {
  assert.deepEqual(pieceInfo('bookshelf'), {
    id: 'bookshelf', label: 'Bookshelf', theme: 'Basics', placement: 'floor', mat: 'board',
    tags: CATALOG.bookshelf.tags, difficulty: CATALOG.bookshelf.difficulty,
    difficultyLabel: DIFFICULTY[CATALOG.bookshelf.difficulty],
    parts: 8,
  });
  assert.equal(pieceInfo('frame').parts, 1, 'parts counted in the piece\'s preferred material');
  assert.equal(pieceInfo('books').parts, 3);
});

test('searchPieces matches label, id and tags, and filters by theme, tag and difficulty', () => {
  const ids = (r) => r.map((p) => p.id);
  assert.deepEqual(ids(searchPieces('drawers')), ['cabinet', 'nightstand', 'dresser']);
  assert.deepEqual(ids(searchPieces('SHELF')), ['bookshelf', 'wallshelf', 'displayshelf']);
  assert.ok(ids(searchPieces('')).length === PIECES.length, 'empty query lists everything');
  assert.deepEqual(ids(searchPieces('', { theme: 'Bathroom' })), ['bathtub', 'vanity', 'toilet']);
  for (const p of searchPieces('', { difficulty: 1 })) assert.equal(p.difficulty, 1);
  for (const p of searchPieces('', { tag: 'seating' })) assert.ok(p.tags.includes('seating'));
  assert.ok(ids(searchPieces('', { tag: 'seating' })).includes('sofa'));
  assert.deepEqual(ids(searchPieces('sofa chair')), [], 'every word must match');
  assert.deepEqual(ids(searchPieces('bed sleep')), ['bed']);
});

test('allTags lists each tag once, sorted, with counts', () => {
  const tags = allTags();
  assert.deepEqual(tags.map((t) => t.tag), [...new Set(PIECES.flatMap((p) => p.tags))].sort());
  const storage = tags.find((t) => t.tag === 'storage');
  assert.equal(storage.count, PIECES.filter((p) => p.tags.includes('storage')).length);
  assert.ok(THEMES.length === 8);
});
