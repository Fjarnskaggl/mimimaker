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

test('flow: wiring toggles undo themselves, agree with Undo, and survive a reload', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('[data-step=light]');
  await openAll(page);
  const power = async () => { const p = (await F.kit(page)).lighting.power; return [p.pos, p.elev]; };
  const shown = () => page.evaluate(() => ['Along wall', 'Height'].map((t) => [...document.querySelectorAll('#sidebar label.field')].find((l) => l.textContent.startsWith(t))?.querySelector('input').value));
  const start = await power();
  const cover = page.locator('input[data-t5=cover]');

  // tick the cover: the box moves into it, and a toast says so
  await F.expectRedraw(page, STAGE, () => cover.check(), 'turning the cable cover on');
  const moved = await power();
  assert.notDeepEqual(moved, start, 'the box moves inside the cover');
  assert.match(await page.locator('.toasts').innerText(), /Moved the power box to/);
  assert.ok(!(await page.evaluate(() => window.mimimaker.compiled.warnings.some((w) => /cable cover/.test(w.msg)))), 'no cover warning once moved');

  // untick: the box goes back, and the fields show it
  await openAll(page);
  await F.expectRedraw(page, STAGE, () => page.locator('input[data-t5=cover]').uncheck(), 'turning the cable cover off');
  assert.deepEqual(await power(), start, 'unticking puts the box back');
  assert.deepEqual(await shown(), start.map(String), 'the Power fields show it back too');
  assert.match(await page.locator('.toasts').innerText(), /back to/);

  // Undo agrees with the checkbox: undo re-ticks it with the box moved, undo again is the start
  await page.click('#btn-undo');
  assert.equal((await F.kit(page)).lighting.cover?.enabled, true, 'undo brings the cover back');
  assert.deepEqual(await power(), moved);
  await openAll(page);
  assert.equal(await page.locator('input[data-t5=cover]').isChecked(), true, 'and the box is ticked');
  await page.click('#btn-undo');
  assert.equal((await F.kit(page)).lighting.cover, undefined);
  assert.deepEqual(await power(), start);

  // Ctrl+Z works while a select still has focus, the same as the Undo button
  await openAll(page);
  await page.selectOption('select[data-t5=supply]', 'cr2032');
  assert.equal((await F.kit(page)).lighting.power.supply, 'cr2032');
  await page.focus('select[data-t5=supply]');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.mimimaker.kit.lighting.power.supply !== 'cr2032', null, { timeout: 3000 });

  // the cover stays on after a reload
  await openAll(page);
  await page.locator('input[data-t5=cover]').check();
  await page.reload();
  await F.ready(page);
  assert.equal((await F.kit(page)).lighting.cover?.enabled, true, 'reload keeps the cover');
  await page.click('[data-step=light]');
  await openAll(page);
  assert.equal(await page.locator('input[data-t5=cover]').isChecked(), true);
  assert.ok(await page.evaluate(() => window.mimimaker.compiled.parts.some((p) => p.name === 'Cable cover panel')), 'and its parts are cut');

  // in a hidden base the Height field goes: the base sits on the floor
  await page.selectOption('select[data-t5=mount]', 'base');
  await openAll(page);
  assert.deepEqual((await shown())[1], undefined, 'no Height field for a hidden base');
  await page.selectOption('select[data-t5=mount]', 'outside');
  await openAll(page);
  assert.ok((await shown())[1] != null, 'Height is back for a box on the wall');

  // lights off: the inspector and the wiring view both say so and turn them back on
  await page.locator('#sidebar label.check', { hasText: 'Lights on' }).locator('input').uncheck();
  await page.click('[data-view=wiring]');
  assert.match(await page.locator('.wiring').innerText(), /Lights are off/, 'the wiring view says the lights are off, not that there are none');
  await page.click('.wiring [data-action=lights-on]');
  assert.equal((await F.kit(page)).lighting.enabled, true);
  assert.ok(await page.locator('.map-wrap svg').isVisible(), 'the LED map is back');
  await page.locator('#sidebar label.check', { hasText: 'Lights on' }).locator('input').uncheck();
  await page.click('#sidebar [data-action=lights-on]');
  assert.equal((await F.kit(page)).lighting.enabled, true, 'the inspector button turns them on too');

  await F.shot(page, 'wiring-toggles');
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
