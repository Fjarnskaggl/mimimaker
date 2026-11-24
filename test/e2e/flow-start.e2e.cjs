// User journey: a first visit, then starting a new kit from every room type
// and from a blank room. Each room type must load, draw, cut and build
// without errors. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

const STAGE = '.stage';

test('flow: a first visit opens a ready room with nothing broken', async () => {
  const page = await F.openApp(browser, URL);
  assert.ok(await page.locator(STAGE).isVisible(), 'the room is on screen');
  assert.ok(await page.locator(`${STAGE} svg.scene-svg path`).count() > 20, 'and drawn');
  assert.notEqual(await page.locator('#kit-name').inputValue(), '', 'the kit has a name');
  assert.equal(await page.getAttribute('#checks', 'data-state'), 'ok');
  assert.equal(await page.getAttribute('[data-step=design]', 'aria-current'), 'step');
  // every step opens and shows its main content
  for (const [step, sel] of [['light', '.t5-circuit'], ['make', '.sheet-card'], ['build', '.t4-mode'], ['design', STAGE]]) {
    await page.click(`[data-step=${step}]`);
    await page.locator(sel).first().waitFor({ state: 'visible', timeout: 5000 });
  }
  // rename the kit: the name sticks and shows in the Make summary of the guide
  await page.locator('#kit-name').fill('Tiny Tea Room');
  assert.equal((await F.kit(page)).name, 'Tiny Tea Room');
  F.assertClean(page);
  await page.context().close();
});

test('flow: start a new kit from every room type, and from a blank room', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('#btn-file');
  await page.click('#btn-new');
  const cards = await page.locator('#start .rt-card[data-room]').evaluateAll((els) => els.map((e) => ({ id: e.dataset.room, label: e.getAttribute('aria-label') })));
  assert.ok(cards.length >= 8, `${cards.length} room types`);
  await page.click('#start [data-action=close]');

  for (const { id, label } of cards) {
    const name = label.replace(/^Start from /, '');
    await page.click('[data-step=design]');
    await page.click('#btn-file');
    await page.click('#btn-new');
    assert.ok(await page.locator('#start').isVisible(), 'File → New opens the room types');
    await page.locator(`#start .rt-card[data-room="${id}"] .thumb svg`).waitFor({ timeout: 3000 }); // a picture of each
    await F.expectRedraw(page, STAGE, () => page.click(`#start .rt-card[data-room="${id}"]`), `starting from ${name}`);
    assert.equal(await page.locator('#start').isVisible(), false, `${name}: the dialog closes`);
    const k = await F.kit(page);
    assert.equal(k.roomType, id, `${name}: the kit is that room`);
    assert.equal(await page.locator('#kit-name').inputValue(), k.name, `${name}: the header shows its name`);
    assert.equal(await page.locator('#sidebar [data-select-item]').count(), k.items.length, `${name}: the inspector lists its pieces`);
    assert.notEqual(await page.getAttribute('#checks', 'data-state'), 'danger', `${name}: nothing blocks cutting`);
    // a piece of it can be picked
    if (k.items.length) {
      let p = null;
      for (let i = 0; i < k.items.length && !p; i++) p = await F.pickPoint(page, i);
      assert.ok(p, `${name}: some piece is visible to pick`);
    }
    await page.click('[data-step=make]');
    assert.ok(await page.locator('.sheet-card').count() > 0, `${name}: it has sheets to cut`);
    await page.click('[data-step=build]');
    await page.locator('.t4-mode').waitFor({ timeout: 5000 });
    F.assertClean(page, `with ${name}`);
  }

  // blank room: no furniture, an empty list, and undo brings the last room back
  await page.click('[data-step=design]');
  const last = (await F.kit(page)).name;
  await page.click('#btn-file');
  await page.click('#btn-new');
  await F.expectRedraw(page, STAGE, () => page.click('#start-blank'), 'starting a blank room');
  assert.equal((await F.kit(page)).items.length, 0);
  assert.equal(await page.locator('#sidebar [data-select-item]').count(), 0);
  await F.expectRedraw(page, STAGE, () => page.locator('.mm-toast', { hasText: 'Blank room ready' }).locator('button', { hasText: 'Undo' }).click(), 'Undo on the toast');
  assert.equal((await F.kit(page)).name, last, 'the toast’s Undo restores the room');

  // Keep my design closes without changing anything
  await F.expectSteady(page, STAGE, async () => {
    await page.click('#btn-file');
    await page.click('#btn-new');
    await page.locator('#start button', { hasText: 'Keep my design' }).click();
  }, 'Keep my design');
  assert.equal(await page.locator('#start').isVisible(), false);

  F.assertClean(page);
  await page.context().close();
});
