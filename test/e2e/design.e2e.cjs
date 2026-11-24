// Browser tests for the mimimaker design system applied to the app:
// four steps (Design · Light · Make · Build), a contextual inspector, the
// Checks pill, the piece drawer, the Start dialog and Mimi's empty states.
// Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

async function open(viewport = { width: 1400, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  return page;
}
const kit = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit)));
const edit = (page, fn) => page.evaluate(`(() => { const k = window.mimimaker.kit; (${fn})(k); window.mimimaker.refresh(); })()`);
async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `ds-${name}.png`) });
}
const visible = (page, sel) => page.locator(sel).first().isVisible();

test('header: four steps in order, Design first', async () => {
  const page = await open();
  const labels = await page.locator('.mm-steps [data-step] .label').allInnerTexts();
  assert.deepEqual(labels, ['Design', 'Light', 'Make', 'Build']);
  assert.deepEqual(await page.locator('.mm-steps [data-step]').evaluateAll((els) => els.map((e) => e.dataset.step)), ['design', 'light', 'make', 'build']);
  assert.equal(await page.getAttribute('[data-step=design]', 'aria-current'), 'step');
  await page.click('[data-step=make]');
  assert.equal(await page.getAttribute('[data-step=make]', 'aria-current'), 'step');
  assert.equal(await page.getAttribute('[data-step=design]', 'aria-current'), null);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('each step shows only its own tools', async () => {
  const page = await open();
  // Design: the stage and the inspector; nothing from Make
  assert.ok(await visible(page, '.stage'));
  assert.ok(await visible(page, '#sidebar'));
  assert.equal(await page.locator('.sheet-card').count(), 0);
  assert.equal(await visible(page, '#btn-zip'), false, 'Download kit lives on Make');
  await shot(page, 'design');

  await page.click('[data-step=light]');
  assert.ok(await visible(page, '.stage.night'), 'Light shows the room with its lights on');
  assert.ok(await visible(page, '.t5-circuit'));
  await shot(page, 'light');

  await page.click('[data-step=make]');
  assert.ok(await page.locator('.sheet-card').count() > 0);
  assert.ok(await visible(page, '#btn-zip'));
  assert.equal(await visible(page, '#sidebar'), false, 'Make uses the whole width');
  assert.equal(await page.locator('.stage').count(), 0);
  await shot(page, 'make');

  await page.click('[data-step=build]');
  assert.ok(await visible(page, 'iframe.guide-frame'));
  assert.equal(await page.locator('.sheet-card').count(), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('each view has at most one primary button', async () => {
  const page = await open();
  for (const step of ['design', 'light', 'make', 'build']) {
    await page.click(`[data-step=${step}]`);
    const n = await page.locator('.mm-btn--primary:visible').count();
    assert.ok(n <= 1, `${step}: ${n} primary buttons`);
  }
  await page.close();
});

test('inspector: shows the room until something is selected, then only that thing', async () => {
  const page = await open();
  const kind = () => page.locator('#sidebar .insp-kind').innerText();
  assert.match(await kind(), /room/i);
  assert.ok(await page.locator('#sidebar details.section summary', { hasText: 'Room box' }).count() === 1);

  await page.click('[data-view=plan]');
  await page.click('.plan-item[data-index="0"]');
  assert.match(await kind(), /piece/i);
  assert.match(await page.locator('#sidebar .insp-title').innerText(), /bookshelf/i);
  assert.equal(await page.locator('#sidebar summary', { hasText: 'Room box' }).count(), 0, 'room settings are put away');

  const field = page.locator('#sidebar label', { hasText: 'Height' }).first().locator('input');
  await field.fill('150');
  const k = await kit(page);
  assert.equal(k.items[0].params.h, 150);

  await page.keyboard.press('Escape');
  assert.match(await kind(), /room/i);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('inspector: the room lists its pieces, and clicking one selects it', async () => {
  const page = await open();
  await page.locator('#sidebar [data-select-item="1"]').click();
  assert.match(await page.locator('#sidebar .insp-kind').innerText(), /piece/i);
  assert.match(await page.locator('#sidebar .insp-title').innerText(), /armchair/i);
  await page.click('#sidebar [data-action=back]');
  assert.match(await page.locator('#sidebar .insp-kind').innerText(), /room/i);
  await page.close();
});

test('checks: problems live behind one pill, not banners above the stage', async () => {
  const page = await open();
  assert.equal(await page.getAttribute('#checks', 'data-state'), 'ok');
  assert.match(await page.innerText('#checks'), /All good/);

  await edit(page, (k) => { k.fingerWidth = 1; });
  assert.equal(await page.getAttribute('#checks', 'data-state'), 'warning');
  assert.match(await page.innerText('#checks'), /\d+ to check/);
  assert.equal(await page.locator('.warn:visible').count(), 0, 'no banners until the pill is opened');

  await edit(page, (k) => { k.room.width = 2000; });
  assert.equal(await page.getAttribute('#checks', 'data-state'), 'danger');
  assert.match(await page.innerText('#checks'), /blocks? cutting/);

  await page.click('#checks');
  assert.ok(await visible(page, '#checks-pop'));
  assert.ok(await page.locator('#checks-pop .warn.error').count() >= 1);
  await shot(page, 'checks');
  await page.keyboard.press('Escape');
  assert.equal(await visible(page, '#checks-pop'), false);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('piece drawer: Add a piece opens the library; the new piece opens in the inspector', async () => {
  const page = await open();
  assert.equal(await visible(page, '#drawer'), false);
  await page.click('#rail-pieces');
  assert.ok(await visible(page, '#drawer'));
  assert.ok(await visible(page, '#t1-piece-search'));
  const before = (await kit(page)).items.length;
  await page.click('.piece[data-piece="table"]');
  const k = await kit(page);
  assert.equal(k.items.length, before + 1);
  assert.match(await page.locator('#sidebar .insp-title').innerText(), /table/i);
  assert.ok(await visible(page, '.mm-toast'), 'a toast confirms the add');
  await shot(page, 'drawer');
  await page.click('#drawer [data-action=close]');
  assert.equal(await visible(page, '#drawer'), false);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('start: File → New opens the room types; picking one replaces the design', async () => {
  const page = await open();
  assert.equal(await visible(page, '#start'), false);
  await page.click('#btn-file');
  await page.click('#btn-new');
  assert.ok(await visible(page, '#start'));
  assert.ok(await page.locator('#start .rt-card').count() >= 8);
  assert.ok(await visible(page, '#start-blank'));
  await shot(page, 'start');
  await page.click('.rt-card[aria-label="Start from Little café"]');
  assert.equal(await visible(page, '#start'), false);
  assert.match((await kit(page)).name, /café/i);
  assert.match(await page.locator('.mm-toast').first().innerText(), /café/i);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('start: Blank room clears the furniture', async () => {
  const page = await open();
  await page.click('#btn-file');
  await page.click('#btn-new');
  await page.click('#start-blank');
  const k = await kit(page);
  assert.equal(k.items.length, 0);
  assert.equal(k.lighting.leds.length, 0);
  assert.equal(await visible(page, '#start'), false);
  await page.close();
});

test('light step: Mimi explains what appears when there are no lights', async () => {
  const page = await open();
  await edit(page, (k) => { k.lighting.enabled = false; k.lighting.leds = []; });
  await page.click('[data-step=light]');
  const empty = page.locator('#sidebar .mm-empty');
  assert.ok(await empty.isVisible());
  assert.ok(await empty.locator('svg.mimi').count() === 1, 'Mimi is drawn');
  assert.match(await empty.innerText(), /No lights yet/);
  await shot(page, 'light-empty');
  await empty.locator('button', { hasText: 'Add a wall light' }).click();
  const k = await kit(page);
  assert.equal(k.lighting.enabled, true);
  assert.equal(k.lighting.leds.length, 1);
  assert.ok(await visible(page, '.t5-circuit'));
  await page.close();
});

test('light step: the wiring view shows the LED map', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  await page.click('[data-view=wiring]');
  assert.ok(await visible(page, '.map-wrap svg'));
  assert.ok(await visible(page, '.led-table'));
  await page.close();
});

test('design tokens: mimimaker type, colours and the Mimi mark', async () => {
  const page = await open();
  const s = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    name: getComputedStyle(document.querySelector('#kit-name')).fontFamily,
    primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    desk: getComputedStyle(document.body).backgroundColor,
    mark: !!document.querySelector('.brand svg.mimi-mark'),
  }));
  assert.match(s.body, /Figtree/);
  assert.match(s.name, /Bricolage Grotesque/);
  assert.equal(s.primary.toLowerCase(), '#2a1d10', 'Card and chipboard: an ink main button');
  assert.equal(s.desk, 'rgb(194, 154, 102)', 'the kraft desk');
  assert.ok(s.mark, 'the header shows the Mimi mark');
  await page.close();
});

test('phone: steps fit, the inspector follows the stage, nothing scrolls sideways', async () => {
  const page = await open({ width: 390, height: 844 });
  const stage = await page.locator('.stage').boundingBox();
  const insp = await page.locator('#sidebar').boundingBox();
  assert.ok(insp.y >= stage.y + stage.height - 1, 'inspector sits below the stage');
  for (const step of ['design', 'light', 'make', 'build']) {
    await page.click(`[data-step=${step}]`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${step}: ${overflow}px too wide`);
  }
  await shot(page, 'phone');
  await page.close();
});

test('locked room sizes from a shell show in full', async () => {
  const page = await open();
  await page.locator('[data-panel=shell] select[data-shell=type]').selectOption('nook');
  const room = page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Room box' }) });
  for (const label of ['Width', 'Depth', 'Height']) {
    const fits = await room.locator('label', { hasText: label }).first().locator('input').evaluate((i) => i.scrollWidth <= i.clientWidth);
    assert.ok(fits, `${label} value is cut off`);
  }
  await page.close();
});

test('a new piece from the drawer lands in a free spot', async () => {
  const page = await open();
  await page.click('#rail-pieces');
  await page.click('.piece[data-piece="table"]');
  assert.equal(await page.locator('#sidebar .mm-notice--danger').count(), 0, 'no overlap notice');
  await page.close();
});
