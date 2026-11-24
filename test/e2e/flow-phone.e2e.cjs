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

// Real finger drags on the 3D move handles (Fjarn, on a phone: "the little
// circle with the bars don't seem to do anything"). CDP touch events go
// through the browser's gesture handling, so a handle that lets the page pan
// or pinch instead gets a pointercancel and the drag is lost.
for (const webgl of [false, true]) {
  const label = webgl ? 'Realistic 3D' : 'the sketch view';
  test(`flow (phone): drag the 3D handles with a finger in ${label}: arrows, plane and ring all move the piece`, async () => {
    const context = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce' });
    const page = await F.openApp(browser, URL, { context, webgl });
    if (webgl) await F.settled(page, STAGE, { timeout: 15000 });
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const fingerDrag = async (from, dx, dy) => {
      await touch('touchStart', from.x, from.y);
      for (let i = 1; i <= 10; i++) await touch('touchMove', from.x + (dx * i) / 10, from.y + (dy * i) / 10);
      await touch('touchEnd');
      await F.frames(page);
    };
    const handle = async (name) => {
      await page.locator(`.t6-gizmo [data-handle="${name}"]`).waitFor({ state: 'attached', timeout: 10000 });
      return page.evaluate((n) => { const h = document.querySelector(`.t6-gizmo [data-handle="${n}"]`); const r = (h.querySelector('.knob') || h).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, name);
    };
    const hitSize = (name) => page.evaluate((n) => { const r = document.querySelector(`.t6-gizmo [data-handle="${n}"] .hit-knob`).getBoundingClientRect(); return Math.min(r.width, r.height); }, name);

    // tap the armchair: its handles come up
    await page.click('[data-select-item="1"]');
    await page.locator(STAGE).scrollIntoViewIfNeeded();
    const scroll0 = await page.evaluate(() => window.scrollY);
    for (const n of ['x', 'y', 'xy', 'rot']) assert.ok(await hitSize(n) >= 40, `the ${n} handle is at least finger-sized (44 px target)`);

    // x arrow: a finger drag moves it along x only
    const a0 = (await F.kit(page)).items[1];
    const k = await page.evaluate(() => JSON.parse(document.querySelector('.t6-gizmo [data-handle="x"]').dataset.pxPerCm));
    await fingerDrag(await handle('x'), -k[0] * 25, -k[1] * 25);
    const a1 = (await F.kit(page)).items[1];
    assert.ok(Math.abs(a1.x - (a0.x - 25)) <= 5, `the x arrow moved it by finger (x ${a0.x} → ${a1.x})`);
    assert.equal(a1.y, a0.y, 'only along x');
    assert.equal(await page.evaluate(() => window.scrollY), scroll0, 'the page did not scroll instead');

    // the plane: moves it on the floor
    await fingerDrag(await handle('xy'), 0, 30);
    const a2 = (await F.kit(page)).items[1];
    assert.ok(a2.x !== a1.x || a2.y !== a1.y, 'the plane moved it by finger');

    // the ring: a quarter turn by finger
    const ring = await page.evaluate(() => JSON.parse(document.querySelector('.t6-gizmo [data-handle="rot"]').dataset.ring));
    const from = await handle('rot');
    const t0 = Math.atan2(from.y - ring.cy, from.x - ring.cx);
    await touch('touchStart', from.x, from.y);
    for (let i = 1; i <= 10; i++) { const t = t0 + (i / 10) * (Math.PI / 2) * 1.1; await touch('touchMove', ring.cx + Math.cos(t) * ring.rx, ring.cy + Math.sin(t) * ring.ry); }
    await touch('touchEnd');
    await F.frames(page);
    assert.notEqual((await F.kit(page)).items[1].rot || 0, a2.rot || 0, 'the ring turned it by finger');
    F.assertClean(page);
    await page.context().close();
  });
}
