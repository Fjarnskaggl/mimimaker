// User journey: light a room from nothing, change the lights, pick the power,
// hide it in a base, read the wiring and get the shopping list. Every step
// checks that the screen answers at once. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

const STAGE = '.stage';
/** Close the inspector's current item (Done), if one is open. */
const done = async (page) => { const b = page.locator('#sidebar [data-action=back]'); if (await b.count()) await b.click(); };
const openAll = (page) => page.evaluate(() => { for (const d of document.querySelectorAll('#sidebar details.section')) d.open = true; });

test('flow: light a blank room, edit and remove lights, and see them in the room, plan and wiring', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('#btn-file');
  await page.click('#btn-new');
  await page.click('#start-blank');
  await page.click('[data-step=light]');

  // the empty state explains what to do and its button works
  const empty = page.locator('#sidebar .mm-empty');
  assert.ok(await empty.isVisible(), 'Mimi explains there are no lights yet');
  await F.expectRedraw(page, STAGE, () => empty.locator('button', { hasText: 'Add a wall light' }).click(), 'Add a wall light');
  assert.ok(await page.locator('.t5-circuit').isVisible(), 'the circuit card appears');
  assert.ok(await page.locator(`${STAGE} svg .halo`).count() > 0, 'the light glows in the room');

  // more lights from the Lights section
  await done(page);
  await openAll(page);
  const lights = page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Lights' }) });
  await F.expectRedraw(page, STAGE, () => lights.locator('button', { hasText: /^Ceiling$/ }).click(), 'adding a ceiling light');
  assert.equal((await F.kit(page)).lighting.leds.length, 2);
  assert.ok((await F.kit(page)).room.ceiling, 'a ceiling light gives the room a ceiling');

  // pick a light from the list: the inspector shows it; changing its colour shows in the room
  await done(page);
  await page.click('[data-select-led="0"]');
  assert.match(await F.inspectorKind(page), /light/i);
  const colour = page.locator('#sidebar label', { hasText: /colou?r/i }).locator('select').first();
  await F.expectRedraw(page, STAGE, () => colour.selectOption({ label: 'Pink' }), 'changing the light colour');
  assert.equal((await F.kit(page)).lighting.leds[0].color, 'pink');
  await page.locator('#sidebar select[data-t5=effect]').selectOption({ index: 1 });
  assert.ok((await F.kit(page)).lighting.leds[0].effect, 'the effect is kept');
  assert.equal(await F.inspectorKind(page).then((t) => /light/i.test(t)), true, 'still on the light after choosing an effect');

  // the plan shows both lights and highlights the picked one
  await page.click('[data-view=plan]');
  assert.equal(await page.locator('.plan-led').count(), 2);
  assert.equal(await page.locator('.plan-led.sel[data-li="0"]').count(), 1, 'the picked light is highlighted on the plan');
  await F.expectRedraw(page, '.plan-canvas', () => page.click('.plan-led[data-li="1"]', { timeout: 3000 }), 'clicking the other light on the plan');
  assert.equal(await page.locator('.plan-led.sel[data-li="1"]').count(), 1);
  assert.match(await F.inspectorKind(page), /light/i);

  // the wiring view lists both lights
  await page.click('[data-view=wiring]');
  assert.ok(await page.locator('.map-wrap svg').isVisible(), 'the LED map is drawn');
  assert.equal(await page.locator('.led-table tbody tr').count(), 2, 'one row per light');

  // remove one: the room drops it
  await page.click('[data-view="3d"]');
  await done(page);
  await page.click('[data-select-led="1"]');
  await F.expectRedraw(page, STAGE, () => page.locator('#sidebar button', { hasText: 'Remove' }).click(), 'removing a light');
  assert.equal((await F.kit(page)).lighting.leds.length, 1);
  assert.equal(await page.locator('[data-select-led]').count(), 1, 'the list follows');

  await F.shot(page, 'light');
  F.assertClean(page);
  await page.context().close();
});

test('flow: power the lights, hide the battery in a base, and get the base parts and shopping list', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('[data-step=light]');
  await openAll(page);
  const card = '.t5-circuit';

  // a different battery: the circuit card rewrites itself
  const before = await page.locator(card).innerText();
  await F.expectRedraw(page, card, () => page.selectOption('select[data-t5=supply]', 'aaa2'), 'choosing 2×AAA');
  assert.notEqual(await page.locator(card).innerText(), before);

  // hidden base: its switch fields appear and the room shows a base
  const parts = (await page.evaluate(() => window.mimimaker.compiled.parts.length));
  await F.expectRedraw(page, STAGE, () => page.selectOption('select[data-t5=mount]', 'base'), 'hiding the power in a base');
  await openAll(page);
  await page.locator('select[data-t5=switch-at]').waitFor({ timeout: 3000 });
  // (the switch hole is a faint outline in the night view, so check the field and the parts)
  await page.selectOption('select[data-t5=switch-at]', 'left');
  assert.equal(await page.locator('select[data-t5=switch-at]').inputValue(), 'left');
  assert.equal(await page.evaluate(() => window.mimimaker.compiled.lighting.power.base?.switch.face), 'left');
  const after = await page.evaluate(() => ({ parts: window.mimimaker.compiled.parts.length, groups: window.mimimaker.compiled.groups.map((g) => g.title) }));
  assert.ok(after.parts > parts, 'the base adds parts');
  assert.ok(after.groups.includes('Hidden base'));
  assert.equal(await page.getAttribute('#checks', 'data-state'), 'ok', 'no warnings from the base');

  // Make shows the base parts on the sheets
  await page.click('[data-step=make]');
  const parts2 = Number(await page.locator('#make-meter div', { hasText: 'Parts' }).locator('b').innerText());
  assert.equal(parts2, after.parts, 'the Make meter counts the base parts');

  // the shopping list downloads with the battery and LEDs on it
  await page.click('[data-step=light]');
  await openAll(page);
  const csv = await F.download(page, () => page.click('button[data-t5=shopping]'));
  assert.match(csv.name, /\.csv$/);
  assert.match(csv.body.toString(), /AAA/);
  assert.match(csv.body.toString(), /LED/i);

  await F.shot(page, 'power');
  F.assertClean(page);
  await page.context().close();
});

test('flow: in Realistic 3D, adding and recolouring a light shows at once', async () => {
  const page = await F.openApp(browser, URL, { webgl: true });
  await page.click('[data-step=light]');
  await page.waitForSelector(`${STAGE}[data-renderer=webgl] canvas`, { timeout: 20000 });
  await openAll(page);
  const lights = page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Lights' }) });
  await F.expectRedraw(page, STAGE, () => lights.locator('button', { hasText: /^Floor$/ }).click(), 'adding a floor light in Realistic 3D', { within: 8000 });
  await done(page);
  await page.click('[data-select-led="0"]');
  const colour = page.locator('#sidebar label', { hasText: /colou?r/i }).locator('select').first();
  await F.expectRedraw(page, STAGE, () => colour.selectOption({ label: 'Green' }), 'recolouring a light in Realistic 3D', { within: 8000 });
  F.assertClean(page);
  await page.context().close();
});
