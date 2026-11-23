// Browser test for the community gallery (T7): build it, open a card's
// "Open in mimimaker" link and check the studio loads that kit.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

const ROOT = path.join(__dirname, '../..');
const OUT = path.join(ROOT, 'dist/e2e-gallery');
let server, browser, BASE, readKits;

// Set SHOT_DIR to save screenshots of the gallery for review.
async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `t7-gallery-${name}.png`), fullPage: true });
}

before(async () => {
  let buildGallery;
  ({ buildGallery, readKits } = await import('../../gallery/build.js'));
  const { html, renders } = await buildGallery(readKits(path.join(ROOT, 'kits')).map((x) => x.entry), { appUrl: '../../' });
  fs.mkdirSync(path.join(OUT, 'renders'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  for (const [p, svg] of Object.entries(renders)) fs.writeFileSync(path.join(OUT, p), svg);
  server = await startServer();
  BASE = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); fs.rmSync(OUT, { recursive: true, force: true }); });

test('gallery: cards render and "Open in mimimaker" opens that kit in the studio', async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}dist/e2e-gallery/index.html`);
  const cards = page.locator('.card');
  assert.equal(await cards.count(), readKits(path.join(ROOT, 'kits')).length);
  // every render image actually loaded
  const broken = await page.$$eval('.card img', (imgs) => imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
  assert.deepEqual(broken, []);
  await shot(page, 'desktop');
  await page.click('#kit-kitchen .open');
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.mimimaker.kit.name), 'Cottage Kitchen');
  assert.deepEqual(errors, []);
});

test('gallery: one column on a phone, no sideways scroll', async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await page.goto(`${BASE}dist/e2e-gallery/index.html`);
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(sw <= cw, `${sw} > ${cw}`);
  await shot(page, 'phone');
  const xs = await page.$$eval('.card', (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().x))).size);
  assert.equal(xs, 1);
});
