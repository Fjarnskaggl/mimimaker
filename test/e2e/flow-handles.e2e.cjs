// User journey: move and turn pieces with the 3D handles and on the floor
// plan, with snapping, guides, Alt, Snap Off and undo, checking the screen
// answers at every step. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

const STAGE = '.stage';
const item = (page, i) => page.evaluate((k) => ({ ...window.mimimaker.kit.items[k] }), i);
/** Client centre of a handle's knob. */
async function handle(page, name) {
  await page.locator(`.t6-gizmo [data-handle="${name}"]`).waitFor({ state: 'attached', timeout: 10000 });
  return page.evaluate((n) => {
    const h = document.querySelector(`.t6-gizmo [data-handle="${n}"]`);
    const r = (h.querySelector('.knob') || h).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name);
}
/** Screen pixels per cm along a handle's axis. */
const axisPx = (page, name) => page.evaluate((n) => JSON.parse(document.querySelector(`.t6-gizmo [data-handle="${n}"]`).dataset.pxPerCm), name);
const guidesOnScreen = (page) => page.locator('.t6-gizmo .gizmo-guide').count();
const positionField = (page, label) => page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Position' }) })
  .locator('label', { hasText: label }).locator('input, select').first();
async function openPosition(page) {
  const sec = page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Position' }) });
  if (!(await sec.evaluate((d) => d.open))) await sec.locator('summary').click();
}
/** Press on `from`, move by (dx, dy); returns a function that releases. */
async function press(page, from, dx, dy, { alt = false, steps = 8 } = {}) {
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  return async () => { await page.mouse.up(); if (alt) await page.keyboard.up('Alt'); };
}

for (const webgl of [false, true]) {
  const label = webgl ? 'Realistic 3D' : 'the sketch 3D view';
  const within = webgl ? 8000 : 3000;

  test(`flow: move a piece with each handle in ${label}, with snapping, guides, Alt and one undo per drag`, async () => {
    const page = await F.openApp(browser, URL, { webgl });
    await F.settled(page, STAGE, { timeout: webgl ? 15000 : 5000 });

    // click the nightstand: its handles show at once
    const p = await F.pickPoint(page, 2);
    assert.ok(p, 'the nightstand is visible');
    await F.expectRedraw(page, STAGE, () => page.mouse.click(p.x, p.y), `clicking the nightstand in ${label}`, { within });
    for (const h of ['x', 'y', 'xy', 'rot']) assert.ok(await page.locator(`.t6-gizmo [data-handle="${h}"]`).isVisible(), `the ${h} handle is on screen`);
    await openPosition(page);

    // x arrow toward the bookshelf: a guide while it lines up, flush on release, y untouched
    const n = await item(page, 2);
    const shelfRight = (await item(page, 0)).x + 80; // the bookshelf is 80 cm wide
    const k = await axisPx(page, 'x');
    const want = shelfRight + 1.4 - n.x;
    const start = await F.settled(page, STAGE);
    const release = await press(page, await handle(page, 'x'), want * k[0], want * k[1]);
    await page.waitForFunction(() => document.querySelectorAll('.t6-gizmo .gizmo-guide').length > 0, null, { timeout: within });
    assert.ok(F.pixelDiff(await F.settled(page, STAGE), start) > 40, 'the piece moves on screen during the drag');
    const live = await item(page, 2);
    assert.equal(Number(await positionField(page, 'From left').inputValue()), live.x, 'the From left field follows the drag');
    await release();
    const moved = await item(page, 2);
    assert.equal(moved.x, shelfRight, 'snapped flush with the bookshelf');
    assert.equal(moved.y, n.y, 'the x arrow leaves y alone');
    assert.equal(await guidesOnScreen(page), 0, 'guides go on release');
    // one undo takes the whole drag back, on screen too; redo again
    // (undo and redo drop the selection today, so pick the piece again after)
    await F.expectRedraw(page, STAGE, () => page.click('#btn-undo'), `undo in ${label}`, { within });
    assert.equal((await item(page, 2)).x, n.x, 'one undo per drag');
    await F.expectRedraw(page, STAGE, () => page.click('#btn-redo'), `redo in ${label}`, { within });
    assert.equal((await item(page, 2)).x, shelfRight);
    if (!(await page.locator('.t6-gizmo [data-handle]').count())) {
      await F.expectRedraw(page, STAGE, () => page.click('[data-select-item="2"]'), `picking the nightstand again in ${label}`, { within });
      await openPosition(page);
    }

    // y arrow: toward the front only, on the grid
    const ky = await axisPx(page, 'y');
    await F.expectRedraw(page, STAGE, async () => { const r = await press(page, await handle(page, 'y'), 22 * ky[0], 22 * ky[1]); await r(); }, `dragging the y arrow in ${label}`, { within });
    const fwd = await item(page, 2);
    assert.equal(fwd.x, shelfRight, 'the y arrow leaves x alone');
    assert.ok(fwd.y > n.y, 'moved toward the front');

    // the floor plane with Alt: free movement, off the grid
    const kx = await axisPx(page, 'x');
    await F.expectRedraw(page, STAGE, async () => {
      const r = await press(page, await handle(page, 'xy'), 7.3 * kx[0] + 6.1 * ky[0], 7.3 * kx[1] + 6.1 * ky[1], { alt: true });
      await r();
    }, `dragging the floor plane with Alt in ${label}`, { within });
    const free = await item(page, 2);
    assert.ok(free.x % 5 !== 0 || free.y % 5 !== 0, `Alt moves off the grid (${free.x}, ${free.y})`);

    // the ring: a quarter turn, shown at once, one undo
    const r0 = (await item(page, 2)).rot || 0;
    const ring = await page.evaluate(() => JSON.parse(document.querySelector('.t6-gizmo [data-handle="rot"]').dataset.ring));
    const from = await handle(page, 'rot');
    const a0 = Math.atan2(from.y - ring.cy, from.x - ring.cx);
    await F.expectRedraw(page, STAGE, async () => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) {
        const a = a0 + (i / 10) * (Math.PI / 2) * 1.1;
        await page.mouse.move(ring.cx + Math.cos(a) * ring.rx, ring.cy + Math.sin(a) * ring.ry);
      }
      await page.mouse.up();
    }, `turning the ring in ${label}`, { within });
    const r1 = (await item(page, 2)).rot;
    assert.ok(r1 !== r0 && r1 % 90 === 0, `a whole quarter turn (${r0} → ${r1})`);
    assert.equal(await positionField(page, 'Turn').inputValue(), String(r1), 'the Turn field shows it');
    await F.expectRedraw(page, STAGE, () => page.click('#btn-undo'), `undoing the turn in ${label}`, { within });
    assert.equal((await item(page, 2)).rot || 0, r0, 'one undo per turn');

    // the camera stayed put through all of it
    assert.equal(await page.locator('input[aria-label=Rotate]').inputValue(), '-32', 'handle drags never orbit');

    F.assertClean(page);
    await page.context().close();
  });

  test(`flow: move a picture along its wall and up it with the handles in ${label}`, async () => {
    const page = await F.openApp(browser, URL, { webgl });
    await F.settled(page, STAGE, { timeout: webgl ? 15000 : 5000 });
    await F.expectRedraw(page, STAGE, () => page.click('[data-select-item="5"]'), `picking the picture frame in ${label}`, { within });
    for (const h of ['pos', 'up', 'plane']) assert.ok(await page.locator(`.t6-gizmo [data-handle="${h}"]`).isVisible(), `the ${h} handle is on screen`);
    const fr = await item(page, 5);
    const kp = await axisPx(page, 'pos');
    await F.expectRedraw(page, STAGE, async () => { const r = await press(page, await handle(page, 'pos'), -23 * kp[0], -23 * kp[1]); await r(); }, `sliding the frame along its wall in ${label}`, { within });
    const slid = await item(page, 5);
    assert.ok(slid.pos < fr.pos, 'moved along the wall');
    assert.equal(slid.elev, fr.elev, 'height untouched');
    const ku = await axisPx(page, 'up');
    await F.expectRedraw(page, STAGE, async () => { const r = await press(page, await handle(page, 'up'), 18 * ku[0], 18 * ku[1]); await r(); }, `raising the frame in ${label}`, { within });
    const up = await item(page, 5);
    assert.notEqual(up.elev, fr.elev, 'moved up the wall');
    assert.equal(up.pos, slid.pos, 'along-wall untouched');
    await page.click('#btn-undo');
    assert.equal((await item(page, 5)).elev, fr.elev, 'one undo per drag');
    assert.equal((await item(page, 5)).pos, slid.pos);
    F.assertClean(page);
    await page.context().close();
  });
}

test('flow: on the floor plan, snap to pieces and the grid with guides, Snap Off and Alt move freely, wall pieces keep their grip', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('[data-view=plan]');
  const plan = '.plan-canvas';
  const guides = () => page.locator(`${plan} .plan-guide`).count();
  const planPoint = (x, y) => page.evaluate(([px, py]) => {
    const svg = document.querySelector('.plan-canvas svg');
    const pt = svg.createSVGPoint(); pt.x = px; pt.y = py;
    const q = pt.matrixTransform(svg.getScreenCTM());
    return { x: q.x, y: q.y };
  }, [x, y]);
  const drag = async (from, to, { alt = false, during } = {}) => {
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    if (during) await during();
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };

  // the nightstand toward the bookshelf: a guide on screen while it lines up, flush on release
  const shelfRight = (await item(page, 0)).x + 80;
  const n = await item(page, 2);
  const start = await F.settled(page, plan);
  await drag(await planPoint(n.x + 5, n.y + 5), await planPoint(shelfRight + 1.5 + 5, n.y + 5 + 31), {
    during: async () => {
      assert.ok(await guides() > 0, 'a guide shows while it lines up');
      assert.ok(F.pixelDiff(await F.settled(page, plan), start) > 40, 'the piece moves on screen during the drag');
    },
  });
  const snapped = await item(page, 2);
  assert.equal(snapped.x, shelfRight, 'flush against the bookshelf');
  assert.equal(snapped.y % 5, 0, 'on the grid the other way');
  assert.equal(await guides(), 0, 'guides go on release');
  await page.click('#btn-undo');
  assert.deepEqual([(await item(page, 2)).x, (await item(page, 2)).y], [n.x, n.y], 'one undo per drag');

  // a coarser grid: lands on 10 cm
  await page.selectOption('.snap select', '10');
  await drag(await planPoint(n.x + 5, n.y + 5), await planPoint(n.x + 5 - 33, n.y + 5 + 47));
  const ten = await item(page, 2);
  assert.ok(ten.x % 10 === 0 || ten.y % 10 === 0, `on the 10 cm grid (${ten.x}, ${ten.y})`);

  // Snap Off: lands exactly where it is dropped, no guides
  await page.selectOption('.snap select', '0');
  const t0 = await item(page, 2);
  await drag(await planPoint(t0.x + 5, t0.y + 5), await planPoint(t0.x + 5 - 12.3, t0.y + 5 + 8.7), {
    during: async () => assert.equal(await guides(), 0, 'no guides with Snap Off'),
  });
  const off = await item(page, 2);
  assert.ok(Math.abs(off.x - (t0.x - 12.3)) < 0.6 && Math.abs(off.y - (t0.y + 8.7)) < 0.6, `free with Snap Off (${off.x}, ${off.y})`);

  // Alt with snapping on is free too
  await page.selectOption('.snap select', '5');
  const a0 = await item(page, 2);
  await drag(await planPoint(a0.x + 5, a0.y + 5), await planPoint(a0.x + 5 + 6.2, a0.y + 5 + 3.9), { alt: true });
  const alt = await item(page, 2);
  assert.ok(alt.x % 5 !== 0 || alt.y % 5 !== 0, `Alt moves off the grid (${alt.x}, ${alt.y})`);

  // a wall piece grabbed off-centre moves by the drag, without jumping to its centre
  const fr = await item(page, 5);
  const w = await page.evaluate(() => document.querySelector('.plan-canvas [data-index="5"] rect').getBBox().width);
  const grab = fr.pos - w / 3;
  const from = await planPoint(grab, 2);
  await page.keyboard.down('Alt'); // no window-edge snapping, so the numbers are exact
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const nudge = await planPoint(grab + 0.5, 2);
  await page.mouse.move(nudge.x, nudge.y, { steps: 2 });
  assert.ok(Math.abs((await item(page, 5)).pos - fr.pos) < 2, `no jump when grabbed off-centre (${fr.pos} → ${(await item(page, 5)).pos})`);
  const to = await planPoint(grab - 20, 2);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const slid = await item(page, 5);
  assert.ok(Math.abs(slid.pos - (fr.pos - 20)) < 1, `moved by the drag (${fr.pos} → ${slid.pos})`);
  F.assertClean(page);
  await page.context().close();
});
