// Browser tests for T7 remix credits: a design opened from a gallery link
// shows who made it, keeps that credit when shared on, and drops it when
// the viewer starts a new room.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

const ROOT = path.join(__dirname, '../..');
let server, browser, URL, kitchenHash;

// Set SHOT_DIR to save screenshots of the credit for review.
async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `t7-${name}.png`) });
}

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
  const { buildGallery } = await import('../../gallery/build.js');
  const entry = JSON.parse(fs.readFileSync(path.join(ROOT, 'kits/kitchen.kit.json'), 'utf8'));
  const { html } = await buildGallery([entry]);
  kitchenHash = html.match(/href="\.\.\/(#kit=[A-Za-z0-9_-]+)"/)[1];
});
after(async () => { await browser?.close(); server?.close(); });

async function openShared(ctx, hash, viewport = { width: 1400, height: 900 }) {
  const page = await ctx.newPage({ viewport });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL + hash);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  return page;
}

test('a gallery kit opens with its credit in the room inspector and the toast', async () => {
  const ctx = await browser.newContext();
  const page = await openShared(ctx, kitchenHash);
  const credit = page.locator('#sidebar .remix-credit');
  await credit.waitFor({ timeout: 5000 });
  assert.match(await credit.innerText(), /Remix of Cottage Kitchen by mimimaker/);
  assert.match(await credit.innerText(), /CC0/);
  assert.match(await page.locator('.mm-toast').first().innerText(), /Cottage Kitchen by mimimaker/);
  await shot(page, 'credit');
  // survives a reload (the design is kept in the browser)
  await page.reload();
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  assert.match(await page.locator('#sidebar .remix-credit').innerText(), /Cottage Kitchen/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('sharing a remix passes the credit on', async () => {
  const ctx = await browser.newContext();
  const page = await openShared(ctx, kitchenHash);
  await page.evaluate(() => { window.mimimaker.kit.name = 'My Kitchen'; window.mimimaker.refresh(); });
  await page.click('#btn-share');
  await page.waitForFunction(() => document.querySelector('#share-url').value.includes('#kit='), null, { timeout: 5000 });
  const link = await page.locator('#share-url').inputValue();
  const ctx2 = await browser.newContext();
  const other = await openShared(ctx2, link.slice(link.indexOf('#')));
  assert.equal(await other.evaluate(() => window.mimimaker.kit.name), 'My Kitchen');
  assert.match(await other.locator('#sidebar .remix-credit').innerText(), /Remix of Cottage Kitchen by mimimaker/);
  await ctx2.close();
  await ctx.close();
});

test('starting a new room drops the credit', async () => {
  const ctx = await browser.newContext();
  const page = await openShared(ctx, kitchenHash);
  await page.locator('#sidebar .remix-credit').waitFor({ timeout: 5000 });
  await page.click('#btn-file');
  await page.click('#btn-new');
  await page.click('#start-blank');
  assert.equal(await page.locator('#sidebar .remix-credit').count(), 0);
  assert.equal(await page.evaluate(() => window.mimimaker.kit.origin), undefined);
  await ctx.close();
});

test('phone: the credit wraps inside the inspector', async () => {
  const ctx = await browser.newContext();
  const page = await openShared(ctx, kitchenHash, { width: 375, height: 800 });
  const credit = page.locator('.remix-credit');
  await credit.waitFor({ timeout: 5000 });
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(sw <= cw, `${sw} > ${cw}`);
  await shot(page, 'credit-phone');
  await ctx.close();
});
