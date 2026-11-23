// Viewport responsiveness: the 3D view must reflect a change the moment it
// happens, not on the next orbit or re-render. These tests read the view
// straight after an action, without touching the camera.
//
// Where cdnjs can't be reached, set MIMI_THREE_JS to three@0.128.0's
// build/three.min.js (see docs/threads/README.md).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

let URL, server, browser;
const CDN = /three(\.js\/r128|@0\.128\.0)\/.*three\.min\.js$/;

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `viewport-${name}.png`) });
}

async function open({ webgl = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  if (process.env.MIMI_THREE_JS) {
    const body = fs.readFileSync(process.env.MIMI_THREE_JS);
    await page.route(CDN, (r) => r.fulfill({ body, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  }
  await page.addInitScript((on) => { try { localStorage.setItem('mimimaker.t6.webgl', on ? '1' : '0'); } catch { /* */ } }, webgl);
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  if (webgl) await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
  return page;
}

/** Item indexes outlined in the SVG preview right now. */
const outlined = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('.stage path.sel')].map((p) => Number(p.dataset.item)))]);
/** The piece the WebGL viewer was last drawn with as selected (sample() re-renders but doesn't re-read app state). */
const glSelected = async (page) => (await page.evaluate(() => document.querySelector('.stage').t6viewer.sample())).selected;

test('selection is live in the SVG preview: picking from the list outlines the piece at once', async () => {
  const page = await open();
  assert.deepEqual(await outlined(page), []);
  await page.click('[data-select-item="2"]');
  assert.deepEqual(await outlined(page), [2], 'outlined without orbiting first');
  await shot(page, 'list-select');
  await page.click('[data-action=back]');
  assert.deepEqual(await outlined(page), [], 'Done clears the outline');
  await page.click('[data-select-item="1"]');
  assert.deepEqual(await outlined(page), [1]);
  await page.locator('.stage').hover({ position: { x: 5, y: 5 } }); // move focus off the field
  await page.keyboard.press('Escape');
  assert.deepEqual(await outlined(page), [], 'Escape clears the outline');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('selection is live in the SVG preview: clicking another piece moves the outline', async () => {
  const page = await open();
  for (const i of [0, 3]) {
    const p = await page.evaluate((k) => document.querySelector('.stage').t6pickPoint(k), i);
    assert.ok(p, `piece ${i} is visible`);
    await page.mouse.click(p.x, p.y);
    assert.deepEqual(await outlined(page), [i]);
  }
  await page.click('#rail-room');
  assert.deepEqual(await outlined(page), [], 'Room settings clears the outline');
  await page.close();
});

test('selection is live in Realistic 3D: the list, Done and Escape update the viewer at once', async () => {
  const page = await open({ webgl: true });
  assert.equal(await glSelected(page), null);
  await page.click('[data-select-item="2"]');
  assert.equal(await glSelected(page), 2, 'tinted without orbiting first');
  await shot(page, 'webgl-list-select');
  await page.click('[data-action=back]');
  assert.equal(await glSelected(page), null, 'Done clears the tint');
  await page.click('[data-select-item="1"]');
  await page.keyboard.press('Escape');
  assert.equal(await glSelected(page), null, 'Escape clears the tint');
  assert.deepEqual(page.errors, []);
  await page.close();
});
