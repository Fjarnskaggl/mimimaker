// User journey: a book nook shell, then a fresh start. Picking a room type on
// Start replaces the whole scene, shell included; a shell that wires its own
// LEDs doesn't offer a Power box wall it would ignore.
// Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

test('flow: starting from a room type with a book nook shell on gives that room, not the shell', async () => {
  const page = await F.openApp(browser, URL);
  await page.selectOption('select[data-shell=type]', 'nook');
  await page.waitForFunction(() => window.mimimaker.kit.shell?.type === 'nook');
  await page.click('#btn-file');
  await page.click('#btn-new');
  await page.click('.rt-card[data-room=kitchen]');
  await page.waitForFunction(() => window.mimimaker.kit.roomType === 'kitchen');
  const k = await F.kit(page);
  assert.ok(!k.shell, 'no shell left over');
  assert.equal(await page.inputValue('select[data-shell=type]'), '', 'the Shape picker says None');
  assert.equal(await page.locator('[data-room-lock]').count(), 0, 'the room size is not locked to a shell');
  // undo brings the nook back, the same as before Start
  await page.click('#btn-undo');
  await page.waitForFunction(() => window.mimimaker.kit.shell?.type === 'nook');
  F.assertClean(page);
  await page.context().close();
});

test('flow: a shell that wires its own LEDs keeps the power box on its back wall, and says so', async () => {
  const page = await F.openApp(browser, URL);
  const power = (await F.kit(page)).lighting.power;
  await page.selectOption('select[data-shell=type]', 'alley');
  await page.click('[data-step=light]');
  const sec = page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Power' }) });
  await sec.locator('summary').click();
  const wall = sec.locator('label', { hasText: 'Power box' }).locator('select');
  assert.equal(await wall.inputValue(), 'back');
  assert.ok(await wall.isDisabled(), 'the wall picker would do nothing, so it is locked');
  // the shell off again: the power box is back where it was
  await page.click('[data-step=design]');
  await page.selectOption('select[data-shell=type]', '');
  await page.waitForFunction(() => !window.mimimaker.kit.shell);
  const after = (await F.kit(page)).lighting.power;
  for (const k of ['wall', 'pos', 'elev']) assert.equal(after[k], power[k], `power box ${k}`);
  F.assertClean(page);
  await page.context().close();
});
