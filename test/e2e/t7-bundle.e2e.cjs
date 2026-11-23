// Browser test for the T7 creator bundle: File → Creator bundle asks for a
// handle and licence, then downloads a zip with art, cut files and a licence.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

let server, browser, URL;

// Set SHOT_DIR to save screenshots of the bundle dialog for review.
async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `t7-bundle-${name}.png`) });
}

// File names in a zip, read from its central directory.
function zipNames(buf) {
  const names = [];
  let p = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(p + 10);
  p = buf.readUInt32LE(p + 16);
  for (let i = 0; i < count; i++) {
    const n = buf.readUInt16LE(p + 28), x = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32);
    names.push(buf.slice(p + 46, p + 46 + n).toString('utf8'));
    p += 46 + n + x + c;
  }
  return names;
}

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function openBundle(viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  await page.click('#btn-file');
  await page.click('#btn-bundle');
  await page.locator('#bundle').waitFor({ state: 'visible', timeout: 5000 });
  return { ctx, page };
}

test('creator bundle: needs a handle, then downloads a zip with art, cut files per machine and a licence', async () => {
  const { ctx, page } = await openBundle();
  const dlg = page.locator('#bundle');
  assert.ok(await dlg.locator('#bundle-download').isDisabled());
  assert.match(await dlg.locator('.submit-problems').innerText(), /handle/);
  await dlg.locator('input[name=author]').fill('tiny_rooms');
  await dlg.locator('select[name=licence]').selectOption('CC-BY-4.0');
  assert.ok(!(await dlg.locator('#bundle-download').isDisabled()));
  await page.waitForTimeout(300); // let the button's transition settle for the screenshot
  await shot(page, 'dialog');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), dlg.locator('#bundle-download').click()]);
  assert.match(dl.suggestedFilename(), /-creator-bundle\.zip$/);
  const names = zipNames(fs.readFileSync(await dl.path()));
  for (const want of [/^box-art\/.*-front\.svg$/, /^cut-files\/cricut\//, /^cut-files\/silhouette\//, /^cut-files\/laser\//, /^assembly-guide\.html$/, /^LICENSE\.txt$/, /^README\.txt$/, /\.kit\.json$/]) {
    assert.ok(names.some((n) => want.test(n)), `${want} in ${names.join(', ')}`);
  }
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('creator bundle: the dialog fits a phone screen', async () => {
  const { ctx, page } = await openBundle({ width: 375, height: 800 });
  const box = await page.locator('#bundle').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, JSON.stringify(box));
  await ctx.close();
});
