// Browser tests for T7 share-link improvements: the share box describes the
// design and warns when a link is long enough that some apps cut it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

let server, browser, URL;

// Set SHOT_DIR to save screenshots of the share box for review.
async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.locator('#share-pop').screenshot({ path: path.join(process.env.SHOT_DIR, `t7-share-${name}.png`) });
}

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open(viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  return { ctx, page };
}

async function share(page) {
  await page.click('#btn-share');
  await page.waitForFunction(() => document.querySelector('#share-url').value.includes('#kit='), null, { timeout: 5000 });
  return page.locator('#share-url').inputValue();
}

test('share box: one-line summary, no warning for a normal design, and the link opens', async () => {
  const { ctx, page } = await open();
  await page.evaluate(() => { window.mimimaker.kit.name = 'Tiny Den'; window.mimimaker.refresh(); });
  const link = await share(page);
  assert.match(await page.locator('#share-summary').innerText(), /^Tiny Den · 1:\d+ room kit · \d+ × \d+ × \d+ cm · \d+ pieces?$/);
  assert.equal(await page.locator('#share-pop .share-warn').count(), 0);
  await shot(page, 'normal');
  const other = await ctx.browser().newContext();
  const p2 = await other.newPage();
  await p2.goto(link);
  await p2.waitForFunction(() => window.mimimaker?.kit?.name === 'Tiny Den', null, { timeout: 8000 });
  await other.close();
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('share box: a very long link gets a warning that points to Save as a file', async () => {
  const { ctx, page } = await open();
  await page.evaluate(() => {
    const k = window.mimimaker.kit;
    // lots of distinct pieces make a long link
    for (let i = 0; i < 120; i++) k.items.push({ ...structuredClone(k.items[0]), x: (i * 37) % 300, y: (i * 53) % 200, name: `Piece number ${i} ${Math.random().toString(36).slice(2)}` });
    window.mimimaker.refresh();
  });
  const link = await share(page);
  assert.ok(link.length > 2000, `link is ${link.length}`);
  const warn = page.locator('#share-pop .share-warn');
  assert.equal(await warn.count(), 1);
  assert.match(await warn.innerText(), /long.*Save as a file/s);
  await shot(page, 'long');
  await ctx.close();
});

test('share box fits a phone screen', async () => {
  const { ctx, page } = await open({ width: 375, height: 800 });
  await share(page);
  const box = await page.locator('#share-pop').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, JSON.stringify(box));
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(sw <= cw, `${sw} > ${cw}`);
  await ctx.close();
});
