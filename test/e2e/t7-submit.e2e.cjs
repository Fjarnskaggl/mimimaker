// Browser tests for the T7 submit flow: File → Submit to the gallery builds a
// kits/<id>.kit.json and explains how to open a pull request with it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

const ROOT = path.join(__dirname, '../..');
let server, browser, URL, kitchenHash, share;

// Set SHOT_DIR to save screenshots of the submit dialog for review.
async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `t7-submit-${name}.png`) });
}

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
  share = await import('../../src/share.js');
  const { buildGallery } = await import('../../gallery/build.js');
  const entry = JSON.parse(fs.readFileSync(path.join(ROOT, 'kits/kitchen.kit.json'), 'utf8'));
  kitchenHash = (await buildGallery([entry])).html.match(/href="\.\.\/(#kit=[A-Za-z0-9_-]+)"/)[1];
});
after(async () => { await browser?.close(); server?.close(); });

async function openSubmit(hash = '', viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL + hash);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  await page.click('#btn-file');
  await page.click('#btn-submit');
  await page.locator('#submit').waitFor({ state: 'visible', timeout: 5000 });
  return { ctx, page };
}

test('submit: a remix downloads a valid kit file, credited, with the pull-request steps', async () => {
  const { ctx, page } = await openSubmit(kitchenHash);
  const dlg = page.locator('#submit');
  assert.match(await dlg.locator('.submit-remix').innerText(), /Remix of Cottage Kitchen by mimimaker/);
  assert.equal(await dlg.locator('select[name=licence] option').count(), 4); // CC0 source allows any
  await dlg.locator('input[name=title]').fill('My Cottage Kitchen');
  await dlg.locator('input[name=author]').fill('maker_2');
  await dlg.locator('textarea[name=description]').fill('Green cabinets and a bigger table.');
  await dlg.locator('input[name=tags]').fill('kitchen, green');
  assert.match(await dlg.locator('.submit-file').innerText(), /my-cottage-kitchen\.kit\.json/);
  await shot(page, 'dialog');
  const [dl] = await Promise.all([page.waitForEvent('download'), dlg.locator('#submit-download').click()]);
  assert.equal(dl.suggestedFilename(), 'my-cottage-kitchen.kit.json');
  const entry = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.deepEqual(share.validateEntry(entry), []);
  assert.deepEqual(entry.meta.remixedFrom, { id: 'kitchen' });
  assert.equal(entry.meta.author, 'maker_2');
  assert.deepEqual(entry.meta.tags, ['kitchen', 'green']);
  const upload = dlg.locator(`a[href="${share.SUBMIT_UPLOAD_URL}"]`);
  assert.equal(await upload.count(), 1);
  assert.match(await dlg.locator('.submit-steps').innerText(), /pull request/i);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('submit: problems are listed and the download waits until they are fixed', async () => {
  const { ctx, page } = await openSubmit();
  const dlg = page.locator('#submit');
  await dlg.locator('input[name=title]').fill('Den');
  await dlg.locator('input[name=author]').fill('');
  assert.ok(await dlg.locator('#submit-download').isDisabled());
  assert.match(await dlg.locator('.submit-problems').innerText(), /handle/);
  await dlg.locator('input[name=author]').fill('me');
  assert.ok(!(await dlg.locator('#submit-download').isDisabled()));
  assert.equal(await dlg.locator('.submit-problems li').count(), 0);
  await ctx.close();
});

test('submit: the dialog fits a phone screen', async () => {
  const { ctx, page } = await openSubmit('', { width: 375, height: 800 });
  const box = await page.locator('#submit').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, JSON.stringify(box));
  await shot(page, 'phone');
  await ctx.close();
});
