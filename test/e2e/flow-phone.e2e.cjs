// User journey on a phone: tap to pick pieces in the room and on the plan,
// drag with a finger, and reach every step without sideways scrolling.
// Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

const STAGE = '.stage';
const phone = async () => {
  const context = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce', acceptDownloads: true });
  return F.openApp(browser, URL, { context });
};
const noSideways = async (page, where) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 0, `${where}: the page is ${over}px too wide`);
};

test('flow (phone): tap a piece, see it picked, nudge it on the plan with a finger, and visit every step', async () => {
  const page = await phone();

  // tap a piece in the room: picked at once and the inspector below says so
  const p = await F.pickPoint(page, 1);
  assert.ok(p, 'the armchair is on screen');
  await F.expectRedraw(page, STAGE, () => page.touchscreen.tap(p.x, p.y), 'tapping the armchair');
  assert.match(await F.inspectorTitle(page), /armchair/i);
  await noSideways(page, 'design');

  // the plan: tap to pick, then drag with a finger
  await page.click('[data-view=plan]');
  const item = page.locator('.plan-item[data-index="2"]');
  await item.scrollIntoViewIfNeeded();
  const box = await item.boundingBox();
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await F.expectRedraw(page, '.plan-canvas', () => page.touchscreen.tap(mid.x, mid.y), 'tapping a piece on the plan');
  assert.equal(await page.locator('.plan-item.sel[data-index="2"]').count(), 1);
  const x0 = (await F.kit(page)).items[2].x;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const dir = mid.x > 200 ? -1 : 1;
  await F.expectRedraw(page, '.plan-canvas', async () => {
    await touch('touchStart', mid.x, mid.y);
    for (let i = 1; i <= 8; i++) await touch('touchMove', mid.x + dir * i * 6, mid.y);
    await touch('touchEnd');
  }, 'dragging a piece with a finger');
  assert.notEqual((await F.kit(page)).items[2].x, x0, 'the finger moved it');
  await noSideways(page, 'plan');

  for (const step of ['light', 'make', 'build', 'design']) {
    await page.click(`[data-step=${step}]`);
    await F.frames(page);
    await noSideways(page, step);
  }
  F.assertClean(page);
  await page.context().close();
});
