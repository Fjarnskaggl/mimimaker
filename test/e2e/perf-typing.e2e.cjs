// Typing the room's name must not rebuild the kit: the name changes no part,
// so a keystroke that recompiled (and, with Realistic 3D on, rebuilt the 3D
// scene) cost 15–100 ms each. The budget counts compiles, which is
// deterministic. The name still saves, undoes as one step, and shows in the
// Build guide.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

let URL, server, browser;
before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

test('perf budget: typing the room name recompiles nothing, and the name still saves, undoes and shows in the guide', async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.compiled);
  const old = await page.inputValue('#kit-name');
  const compiles = () => page.evaluate(() => window.mimimaker.stats.compiles);
  const c0 = await compiles();
  await page.fill('#kit-name', '');
  await page.type('#kit-name', 'Tiny tea room');
  assert.equal(await compiles(), c0, 'no recompile while typing the name');
  assert.equal(await page.evaluate(() => window.mimimaker.kit.name), 'Tiny tea room');
  // saved: a reload brings the name back
  await page.waitForTimeout(500); // past the undo-grouping pause
  await page.reload();
  await page.waitForFunction(() => window.mimimaker?.compiled);
  assert.equal(await page.inputValue('#kit-name'), 'Tiny tea room', 'the name was saved');
  // the Build guide follows the name as it's typed
  await page.click('.mm-steps [data-step=build]');
  await page.focus('#kit-name');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  assert.ok(await page.evaluate(() => document.querySelector('.guide-frame').srcdoc.includes('Tiny tea room!')), 'guide shows the new name');
  await page.keyboard.press('Backspace');
  await page.click('.mm-steps [data-step=design]');
  // a fresh session: typing is one undo step
  await page.fill('#kit-name', '');
  await page.type('#kit-name', 'Corner café');
  await page.waitForTimeout(500);
  await page.click('#btn-undo');
  assert.equal(await page.inputValue('#kit-name'), 'Tiny tea room', 'one undo brings the earlier name back');
  assert.notEqual(old, 'Tiny tea room');
  assert.deepEqual(errors, []);
  await page.close();
});
