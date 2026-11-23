// Browser tests for T1's piece library: search, difficulty, part counts.
// Run with: npm run test:e2e   (SHOT_DIR=… also saves screenshots of the library)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const { startServer } = require('./helpers.cjs');
let URL, server, browser;

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open(viewport = { width: 1400, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  await page.click('#rail-pieces'); // the library lives in the piece drawer
  page.errors = errors;
  return page;
}
/** Save a screenshot of the library panel when SHOT_DIR is set (for PR review). */
async function shot(page, name) {
  if (!process.env.SHOT_DIR) return;
  require('node:fs').mkdirSync(process.env.SHOT_DIR, { recursive: true });
  await page.locator('.library').screenshot({ path: path.join(process.env.SHOT_DIR, name) });
}
const shown = (page) => page.$$eval('.piece-grid .piece', (els) => els.map((e) => e.dataset.piece));

test('library cards show difficulty and part count', async () => {
  const page = await open();
  assert.deepEqual(await shown(page), ['bookshelf', 'cabinet', 'table', 'chair', 'bench', 'desk']);
  const meta = await page.textContent('.piece[data-piece="bookshelf"] .t1-meta');
  assert.match(meta, /Medium/);
  assert.match(meta, /8 parts/);
  assert.match(await page.textContent('.piece[data-piece="table"] .t1-meta'), /Easy.*3 parts/);
  assert.match(await page.getAttribute('.piece[data-piece="bookshelf"]', 'title'), /storage, books/);
  await shot(page, 't1-piece-library.png');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('search finds pieces across themes while you type, and clearing it restores the theme', async () => {
  const page = await open();
  await page.click('#t1-piece-search');
  await page.keyboard.type('drawers', { delay: 20 });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 't1-piece-search', 'focus stays in the search box');
  assert.deepEqual(await shown(page), ['cabinet', 'nightstand', 'dresser']);
  assert.equal(await page.isVisible('.library .chips'), false, 'theme chips step aside while searching');

  await page.fill('#t1-piece-search', 'zzz');
  assert.match(await page.textContent('.t1-empty'), /No pieces match “zzz”/);

  await page.fill('#t1-piece-search', '');
  assert.equal(await page.isVisible('.library .chips'), true);
  assert.deepEqual(await shown(page), ['bookshelf', 'cabinet', 'table', 'chair', 'bench', 'desk']);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('difficulty filter narrows the pieces and survives switching theme', async () => {
  const page = await open();
  await page.fill('#t1-piece-search', 'storage');
  await page.selectOption('#t1-difficulty', '2');
  await shot(page, 't1-piece-search.png');
  await page.fill('#t1-piece-search', '');
  await page.selectOption('#t1-difficulty', '1');
  const easy = await page.$$eval('.piece-grid .piece', (els) => els.map((e) => e.dataset.difficulty));
  assert.ok(easy.length > 0 && easy.every((d) => d === '1'), `all easy: ${easy}`);
  assert.equal((await shown(page)).includes('bookshelf'), false);
  await page.click('.chip:has-text("Kitchen")');
  const kitchen = await page.$$eval('.piece-grid .piece', (els) => els.map((e) => e.dataset.difficulty));
  assert.ok(kitchen.length > 0 && kitchen.every((d) => d === '1'), 'still filtered after a theme change');
  assert.equal(await page.inputValue('#t1-difficulty'), '1');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('clicking a search result adds that piece to the kit', async () => {
  const page = await open();
  const before = await page.evaluate(() => window.mimimaker.kit.items.length);
  await page.fill('#t1-piece-search', 'chest');
  assert.deepEqual(await shown(page), ['dresser']);
  await page.click('.piece[data-piece="dresser"]');
  const items = await page.evaluate(() => window.mimimaker.kit.items.map((i) => i.type));
  assert.equal(items.length, before + 1);
  assert.equal(items.at(-1), 'dresser');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the library fits a phone screen', async () => {
  const page = await open({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `no horizontal scroll (${overflow}px)`);
  const box = await page.locator('#t1-piece-search').boundingBox();
  assert.ok(box && box.width > 150, 'search box is usable');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('part counts stay on one line, in the design system\'s muted ink', async () => {
  const page = await open();
  await page.fill('#t1-piece-search', 'storage'); // many cards with long names in the narrow drawer
  const counts = await page.$$eval('.piece .t1-parts', (els) => els.map((e) => ({ text: e.textContent, lines: e.getClientRects().length })));
  assert.ok(counts.length > 5, 'every card shows its part count');
  for (const c of counts) {
    assert.match(c.text, /^\d+ parts?$/);
    assert.equal(c.lines, 1, `"${c.text}" is not split across lines`);
  }
  const [meta, token] = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--ink-muted)';
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(document.querySelector('.piece .t1-meta')).color, want];
  });
  assert.equal(meta, token);
  assert.deepEqual(page.errors, []);
  await page.close();
});
