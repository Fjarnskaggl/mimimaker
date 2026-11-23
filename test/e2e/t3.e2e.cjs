// T3 (make & export) browser tests. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

// Set SHOT_DIR to save screenshots of the T3 UI for review.
const shot = (page, name) => process.env.SHOT_DIR && page.screenshot({ path: path.join(process.env.SHOT_DIR, `t3-${name}.png`) });

let server, browser, URL;

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  page.errors = errors;
  return page;
}

async function chooseMachine(page, name) {
  const details = page.locator('details.section', { has: page.locator('summary', { hasText: 'Kit & machine' }) });
  if (!(await details.evaluate((d) => d.open))) await details.locator('summary').click();
  const select = details.locator('label', { hasText: 'Cutting machine' }).locator('select');
  await select.selectOption({ label: name });
}

test('machine profiles: a laser gets SVG + DXF per sheet with kerf and laser hints', async () => {
  const page = await open();
  await chooseMachine(page, 'Laser cutter (generic)');
  await page.click('[data-tab=sheets]');
  const card = page.locator('.sheet-card').first();
  assert.deepEqual(await card.locator('header button').allTextContents(), ['SVG', 'DXF']);
  assert.match(await card.locator('.cut-time').textContent(), /kerf 0\.1 mm/);
  await shot(page, 'make-laser');
  const [dl] = await Promise.all([page.waitForEvent('download'), card.locator('header button', { hasText: 'DXF' }).click()]);
  assert.match(dl.suggestedFilename(), /^laser-.*\.dxf$/);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(text, /AC1009/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('machine profiles: Cricut keeps its single Design Space SVG', async () => {
  const page = await open();
  await chooseMachine(page, 'Cricut Maker / Maker 3');
  await page.click('[data-tab=sheets]');
  const card = page.locator('.sheet-card').first();
  assert.deepEqual(await card.locator('header button').allTextContents(), ['SVG']);
  assert.match(await card.locator('.cut-time').textContent(), /Design Space/);
  await page.close();
});

test('machine profiles: the kit zip carries the chosen machine’s files', async () => {
  const page = await open();
  await chooseMachine(page, 'Silhouette Cameo 4 / 5');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-zip')]);
  const names = [...fs.readFileSync(await dl.path()).toString('latin1').matchAll(/cut-files\/[\w.-]+\.(svg|dxf)/g)].map((m) => m[0]);
  assert.ok(names.some((n) => n.endsWith('.dxf')), 'DXF for Silhouette Studio Basic');
  assert.ok(names.some((n) => n.endsWith('.svg')));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('true-shape nesting runs in a worker and swaps in fewer sheets', async () => {
  const page = await open();
  await chooseMachine(page, 'Cricut Joy Xtra');
  await page.click('[data-tab=sheets]');
  const note = page.locator('.nest-note');
  await note.waitFor({ timeout: 10000 });
  assert.match(await note.textContent(), /saved 1 sheet/);
  assert.equal(await page.locator('.sheet-card').count(), 8);
  assert.match(await page.locator('#summary').textContent(), /8 sheets/);
  assert.ok(await page.evaluate(() => window.mimimaker.nestWorkerUsed === true), 'ran in a Web Worker');
  await shot(page, 'nested');
  assert.deepEqual(page.errors, []);
  await page.close();
});
