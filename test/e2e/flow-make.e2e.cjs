// User journey: set up materials, use one in the design, then make the kit:
// sheets, machine, cut files, print-then-cut, hand-cut and the all-machines
// zip. Every step checks the screen answers. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

const meter = (page, label) => page.locator('#make-meter div', { hasText: label }).locator('b').innerText();

test('flow: add a material, price it, build the walls from it, and see the sheets and cost follow', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('[data-step=make]');
  await page.locator('details.more summary', { hasText: 'Materials' }).click();
  const lib = page.locator('.mat-library');
  const rows = lib.locator('.mat-row:not(.mat-head)');
  const n = await rows.count();

  // add one and name it: the row appears and keeps its name
  await F.expectRedraw(page, '.mat-library', () => lib.locator('button', { hasText: 'Add material' }).click(), 'Add material');
  assert.equal(await rows.count(), n + 1);
  const name = rows.last().locator('input[aria-label="Material name"]');
  await name.fill('Walnut veneer');
  await name.press('Enter');
  const id = await rows.last().getAttribute('data-material');
  assert.ok(id, 'the new row names its material');
  assert.equal((await F.kit(page)).materials.find((m) => m.id === id)?.name, 'Walnut veneer');

  // Design: the room's wall material picker offers it; use it for the walls
  await page.click('[data-step=design]');
  const wallSelect = page.locator('#sidebar label', { hasText: 'Structure board' }).locator('select');
  assert.equal(await wallSelect.locator(`option[value="${id}"]`).count(), 1, 'the walls picker offers the new material');
  await wallSelect.selectOption(id);
  const used = await page.evaluate((m) => window.mimimaker.compiled.sheets.some((s) => s.material.id === m), id);
  assert.ok(used, 'some sheets are now cut from it');

  // Make: a sheet card for it, and a price changes the material cost shown
  await page.click('[data-step=make]');
  assert.ok(await page.locator('.sheet-card header strong', { hasText: 'Walnut veneer' }).count() > 0, 'its sheet is on Make');
  const cost = await meter(page, 'Material');
  const libRow = page.locator(`.mat-row[data-material="${id}"]`);
  if (!(await libRow.isVisible())) await page.locator('details.more summary', { hasText: 'Materials' }).click();
  const price = libRow.locator('input[aria-label$="price per sheet"]');
  await F.expectRedraw(page, '#make-meter', async () => { await price.fill('9'); await price.dispatchEvent('change'); }, 'pricing the new material');
  assert.notEqual(await meter(page, 'Material'), cost, 'the cost follows the price');

  // undo all the way back to before the walls changed: the sheet goes away
  await page.click('[data-step=design]');
  for (let i = 0; i < 4 && await page.evaluate((m) => window.mimimaker.compiled.sheets.some((s) => s.material.id === m), id); i++) await page.click('#btn-undo');
  await page.click('[data-step=make]');
  assert.equal(await page.locator('.sheet-card header strong', { hasText: 'Walnut veneer' }).count(), 0, 'undo takes the sheet back off Make');

  await F.shot(page, 'materials');
  F.assertClean(page);
  await page.context().close();
});

test('flow: make the kit for each machine and download every kind of export', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('[data-step=make]');
  assert.ok(await page.locator('.sheet-card').count() > 0, 'sheets are laid out');
  assert.ok(await page.locator('.sheet-card svg').first().isVisible(), 'each sheet has a preview');
  assert.equal(await page.getAttribute('#checks', 'data-state'), 'ok');

  // switch machine: the sheet cards redraw for it
  const machine = page.locator('label', { hasText: 'Cutting machine' }).locator('select');
  await F.expectRedraw(page, '#make-sheets', () => machine.selectOption({ label: 'Laser cutter (generic)' }), 'choosing a laser');
  assert.match(await page.locator('.sheet-card').first().innerText(), /laser|power|speed/i, 'laser settings on the sheet card');
  const laserZip = await F.download(page, () => page.click('#btn-zip'));
  const laserFiles = F.zipNames(laserZip.body);
  assert.ok(laserFiles.some((f) => f.endsWith('.dxf')), 'a laser gets DXF files');
  await machine.selectOption({ index: 0 });

  // the kit zip: cut files, the guide, the design itself
  const zip = await F.download(page, () => page.click('#btn-zip'));
  assert.match(zip.name, /\.zip$/);
  const files = F.zipNames(zip.body);
  for (const want of ['assembly-guide.html', 'kit.json', 'README.txt']) assert.ok(files.includes(want), `zip has ${want}`);
  assert.ok(files.some((f) => f.endsWith('.svg')), 'zip has cut files');
  assert.ok(files.some((f) => f.startsWith('print-then-cut/')), 'zip has the print-then-cut sheets');

  // per-sheet download from a card
  const sheet = await F.download(page, () => page.locator('.sheet-card').first().locator('header button').first().click());
  assert.match(sheet.name, /\.(svg|dxf|zip)$/);
  assert.match(sheet.body.toString('utf8', 0, 200), /<svg|<\?xml|SECTION|PK/);

  // print-then-cut and hand-cut buttons
  const pc = await F.download(page, () => page.locator('.page-head #btn-printcut').click());
  assert.match(pc.name, /-print-then-cut\.zip$/);
  assert.ok(F.zipNames(pc.body).some((f) => f.endsWith('.pdf')), 'print-then-cut has a PDF to print');
  const hc = await F.download(page, () => page.locator('.page-head #btn-handcut').click());
  assert.match(hc.name, /\.pdf$|\.zip$/);
  assert.equal(hc.body.toString('latin1', 0, 4) === '%PDF' || hc.body.toString('latin1', 0, 2) === 'PK', true, 'hand-cut file is a PDF (or a zip of them)');

  // all machines: one zip with every machine's files and a file list
  await page.locator('label', { hasText: 'All machines' }).locator('input[type=checkbox]').check();
  const all = await F.download(page, () => page.click('#btn-zip'));
  const allFiles = F.zipNames(all.body);
  for (const m of ['maker', 'joy', 'cameo', 'laser']) assert.ok(allFiles.some((f) => f.startsWith(`cut-files/${m}/`)), `all-machines zip has ${m}`);

  await F.shot(page, 'make');
  F.assertClean(page);
  await page.context().close();
});
