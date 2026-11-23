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
  await page.click('[data-step=make]');
  const select = page.locator('label', { hasText: 'Cutting machine' }).locator('select');
  await select.selectOption({ label: name });
}

test('machine profiles: a laser gets SVG + DXF per sheet with kerf and laser hints', async () => {
  const page = await open();
  await chooseMachine(page, 'Laser cutter (generic)');
  await page.click('[data-step=make]');
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
  await page.click('[data-step=make]');
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
  await page.click('[data-step=make]');
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

test('hand-cut PDF: a secondary button on Make, and both papers in the zip', async () => {
  const page = await open();
  await page.click('[data-step=make]');
  const btn = page.locator('.page-head #btn-handcut');
  assert.match(await btn.textContent(), /Hand-cut PDF/);
  const cls = await btn.getAttribute('class');
  assert.match(cls, /\bmm-btn\b/);
  assert.doesNotMatch(cls, /mm-btn--primary/, 'Download kit stays the only primary');
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  assert.match(dl.suggestedFilename(), /hand-cut-templates-(a4|letter)\.pdf$/);
  assert.equal(fs.readFileSync(await dl.path()).subarray(0, 5).toString('latin1'), '%PDF-');
  const [zip] = await Promise.all([page.waitForEvent('download'), page.click('#btn-zip')]);
  const text = fs.readFileSync(await zip.path()).toString('latin1');
  assert.ok(text.includes('hand-cut/hand-cut-templates-a4.pdf') && text.includes('hand-cut/hand-cut-templates-letter.pdf'));
  await shot(page, 'handcut-button');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('print-then-cut: a Make button downloads the print sheets, and the kit zip carries them', async () => {
  const page = await open();
  await page.click('[data-step=make]');
  const btn = page.locator('.page-head #btn-printcut');
  assert.match(await btn.textContent(), /Print then cut/);
  assert.doesNotMatch(await btn.getAttribute('class'), /mm-btn--primary/);
  assert.equal(await btn.isDisabled(), false, 'the default room has wallpaper and flooring textures');
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  assert.match(dl.suggestedFilename(), /-print-then-cut\.zip$/);
  const text = fs.readFileSync(await dl.path()).toString('latin1');
  assert.ok(/print-then-cut\/print-sheet-[\w-]+-1\.svg/.test(text) && text.includes('print-then-cut/print-then-cut.pdf'));
  const [zip] = await Promise.all([page.waitForEvent('download'), page.click('#btn-zip')]);
  assert.ok(fs.readFileSync(await zip.path()).toString('latin1').includes('print-then-cut/README.txt'));
  await shot(page, 'printcut-button');

  // no textures, nothing to print: the button is disabled
  await page.evaluate(() => {
    const m = window.mimimaker;
    m.kit.look = { textures: { [m.kit.room.wallpaper.material]: null, [m.kit.room.floor.material]: null } };
    m.refresh();
  });
  await page.click('[data-step=make]');
  await page.waitForFunction(() => document.querySelector('#btn-printcut')?.disabled === true);
  assert.deepEqual(page.errors, []);
  await page.close();
});

// ------------------------------------------------------- material library
async function openLibrary(page) {
  await page.click('[data-step=make]');
  await page.locator('details.more summary', { hasText: 'Materials' }).click();
  return page.locator('.mat-library');
}

test('material library: add, duplicate and delete materials', async () => {
  const page = await open();
  const lib = await openLibrary(page);
  const rows = lib.locator('.mat-row:not(.mat-head)');
  const start = await rows.count();
  await lib.locator('button', { hasText: 'Add material' }).click();
  assert.equal(await rows.count(), start + 1);
  assert.equal(await rows.last().locator('input[aria-label="Material name"]').inputValue(), 'New material');
  await rows.first().locator('button[title^="Duplicate"]').click();
  assert.equal(await rows.count(), start + 2);
  assert.match(await rows.nth(1).locator('input[aria-label="Material name"]').inputValue(), /copy$/, 'the copy sits under its original');
  // a material the kit uses can't be deleted; an unused one can
  assert.equal(await rows.first().locator('button[title^="Delete"]').isDisabled(), true);
  await rows.last().locator('button[title^="Delete"]').click();
  assert.equal(await rows.count(), start + 1);
  assert.equal(await page.evaluate(() => window.mimimaker.kit.materials.length), start + 1);
  await shot(page, 'material-library');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('material library: price per sheet drives the kit material cost', async () => {
  const page = await open();
  const lib = await openLibrary(page);
  await lib.locator('input[aria-label="Currency"]').fill('€');
  await lib.locator('input[aria-label="Currency"]').dispatchEvent('change');
  const used = await page.evaluate(() => [...new Set(window.mimimaker.compiled.sheets.map((s) => s.material.id))]);
  const sheets = await page.evaluate(() => window.mimimaker.compiled.sheets.length);
  for (const id of used) {
    const price = lib.locator(`.mat-row[data-material="${id}"] input[aria-label$="price per sheet"]`);
    await price.fill('2');
    await price.dispatchEvent('input');
  }
  const meter = page.locator('#make-meter');
  await page.waitForFunction(() => /€/.test(document.querySelector('#make-meter').textContent));
  assert.match(await meter.textContent(), new RegExp(`€${sheets * 2}\\.00`));
  assert.match(await lib.locator('.mat-cost').textContent(), new RegExp(`Total.*€${sheets * 2}\\.00`));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('material library: per-machine settings show on the sheet cards', async () => {
  const page = await open();
  await chooseMachine(page, 'Laser cutter (generic)');
  const lib = await openLibrary(page);
  const id = await page.evaluate(() => window.mimimaker.compiled.sheets[0].material.id);
  const row = lib.locator(`.mat-row[data-material="${id}"]`);
  await row.locator('button[title^="Machine settings"]').click();
  const panel = lib.locator(`.mat-settings[data-material="${id}"]`);
  await panel.locator('input[aria-label="Laser power (%)"]').fill('37');
  await panel.locator('input[aria-label="Laser power (%)"]').dispatchEvent('input');
  await panel.locator('input[aria-label="Laser kerf (mm)"]').fill('0.18');
  await panel.locator('input[aria-label="Laser kerf (mm)"]').dispatchEvent('input');
  const line = page.locator('.sheet-card .cut-time').first();
  await page.waitForFunction(() => /37% power/.test(document.querySelector('.sheet-card .cut-time').textContent));
  assert.match(await line.textContent(), /kerf 0\.18 mm/);
  await shot(page, 'material-settings');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('material library: Delete turns off once a part uses the material', async () => {
  const page = await open();
  const lib = await openLibrary(page);
  await lib.locator('button', { hasText: 'Add material' }).click();
  const id = await page.evaluate(() => window.mimimaker.kit.materials.at(-1).id);
  const del = lib.locator(`.mat-row[data-material="${id}"] button[title^="Delete"]`);
  assert.equal(await del.isDisabled(), false);
  await page.evaluate((mid) => { const k = window.mimimaker.kit; k.items[0].material = mid; window.mimimaker.refresh(); }, id);
  assert.equal(await del.isDisabled(), true);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('kit zip: "All machines" adds every machine’s cut files and a file list', async () => {
  const page = await open();
  await page.click('[data-step=make]');
  const box = page.locator('label', { hasText: 'All machines' }).locator('input[type=checkbox]');
  await box.check();
  assert.equal(await page.evaluate(() => window.mimimaker.kit.zipAllMachines), true);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-zip')]);
  const text = fs.readFileSync(await dl.path()).toString('latin1');
  for (const id of ['maker', 'joy', 'cameo', 'laser']) assert.ok(text.includes(`cut-files/${id}/`), id);
  assert.match(text, /Files in this zip/);
  await shot(page, 'zip-all-machines');
  assert.deepEqual(page.errors, []);
  await page.close();
});
