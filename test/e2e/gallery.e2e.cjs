// Browser test for the community gallery (T7): build it, open a card's
// "Open in mimimaker" link and check the studio loads that kit.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '../..');
const PORT = 5198;
const BASE = `http://localhost:${PORT}/`;
const OUT = path.join(ROOT, 'dist/e2e-gallery');
let server, browser;

before(async () => {
  const { buildGallery, readKits } = await import('../../gallery/build.js');
  const { html, renders } = await buildGallery(readKits(path.join(ROOT, 'kits')).map((x) => x.entry), { appUrl: '../../' });
  fs.mkdirSync(path.join(OUT, 'renders'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  for (const [p, svg] of Object.entries(renders)) fs.writeFileSync(path.join(OUT, p), svg);
  server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); fs.rmSync(OUT, { recursive: true, force: true }); });

test('gallery: cards render and "Open in mimimaker" opens that kit in the studio', async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}dist/e2e-gallery/index.html`);
  const cards = page.locator('.card');
  assert.equal(await cards.count(), 8);
  // every render image actually loaded
  const broken = await page.$$eval('.card img', (imgs) => imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
  assert.deepEqual(broken, []);
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
  const xs = await page.$$eval('.card', (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().x))).size);
  assert.equal(xs, 1);
});
