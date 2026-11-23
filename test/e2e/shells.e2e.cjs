// Browser tests for the book-nook shell panel (src/ui/t2.js).
// Run with: npm run test:e2e   (SHOT_DIR=… also saves screenshots)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

let URL, server, browser;

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  page.errors = errors;
  return page;
}
const kit = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit)));
const panel = (page) => page.locator('[data-panel=shell]');

test('shell panel: pick an alley, size it to a shelf gap, tune it, and turn it off', async () => {
  const page = await open();
  assert.equal((await kit(page)).shell ?? null, null, 'starts as a plain room box');

  await panel(page).locator('select[data-shell=type]').selectOption('alley');
  let k = await kit(page);
  assert.equal(k.shell.type, 'alley');
  assert.ok(k.shell.gap.w > 0 && k.shell.gap.h > 0 && k.shell.gap.d > 0);
  // the room follows the shell interior, so the plan and LEDs agree with it
  const t = k.materials.find((m) => m.id === k.room.material).thickness;
  const wantWidth = ((k.shell.gap.w - k.shell.clearance - 2 * t) * k.scale) / 10;
  assert.ok(Math.abs(k.room.width - wantWidth) < 1e-6, `room width ${k.room.width} vs ${wantWidth}`);

  // the shell's own controls appear and edit the kit
  const gapW = panel(page).locator('input[data-shell-gap=w]');
  await gapW.fill('120');
  k = await kit(page);
  assert.equal(k.shell.gap.w, 120);
  assert.ok(k.room.width > wantWidth, 'wider gap, wider room');
  await panel(page).locator('input[data-shell-param=layers]').fill('3');
  assert.equal((await kit(page)).shell.params.layers, 3);
  // relief material: any card or board in the kit
  await panel(page).locator('select[data-shell-param=reliefMaterial]').selectOption('card110');
  assert.equal((await kit(page)).shell.params.reliefMaterial, 'card110');

  // the preview and the parts list show the facades
  await page.waitForFunction(() => document.querySelectorAll('#view svg path').length > 20);
  await page.click('[data-tab=sheets]');
  await page.waitForSelector('#view svg');
  assert.ok(!(await page.locator('#warnings .warn.error').count()), await page.locator('#warnings').innerText());

  if (process.env.SHOT_DIR) {
    await page.click('[data-tab=preview]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'shell-alley.png') });
  }

  await panel(page).locator('select[data-shell=type]').selectOption('');
  assert.equal((await kit(page)).shell, null);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('shell panel: a nook keeps furniture and survives undo', async () => {
  const page = await open();
  const before = await kit(page);
  await panel(page).locator('select[data-shell=type]').selectOption('nook');
  const k = await kit(page);
  assert.equal(k.shell.type, 'nook');
  assert.equal(k.items.length, before.items.length, 'furniture kept');
  assert.equal(await panel(page).locator('[data-shell-param]').count(), 0, 'a plain nook has no extra controls');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => !window.mimimaker.kit.shell);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('room box section: a shell locks the size fields, an alley also the overlays', async () => {
  const page = await open();
  const room = page.locator('details.section', { has: page.locator('summary', { hasText: 'Room box' }) });
  const field = (label) => room.locator('label', { hasText: label }).locator('input');
  const state = async () => ({
    width: await field('Width').isDisabled(),
    height: await field('Height').isDisabled(),
    ceiling: await field('Ceiling').isDisabled(),
    wallpaper: await field('Wallpaper').isDisabled(),
    floor: await field('Floor covering').isDisabled(),
    note: await room.locator('[data-room-lock]').count(),
  });
  assert.deepEqual(await state(), { width: false, height: false, ceiling: false, wallpaper: false, floor: false, note: 0 });

  await panel(page).locator('select[data-shell=type]').selectOption('nook');
  assert.deepEqual(await state(), { width: true, height: true, ceiling: true, wallpaper: false, floor: false, note: 1 });
  assert.match(await room.locator('[data-room-lock]').innerText(), /Sized by the shell — change the shelf gap/);

  await panel(page).locator('select[data-shell=type]').selectOption('alley');
  assert.deepEqual(await state(), { width: true, height: true, ceiling: true, wallpaper: true, floor: true, note: 1 });
  // shown as off (they are), without forgetting the room's own setting
  assert.equal(await field('Wallpaper').isChecked(), false);
  assert.equal(await field('Floor covering').isChecked(), false);
  assert.equal((await kit(page)).room.wallpaper.enabled, true, 'room setting kept for when the shell goes');
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'shell-room-locks.png') });

  await panel(page).locator('select[data-shell=type]').selectOption('');
  assert.deepEqual(await state(), { width: false, height: false, ceiling: false, wallpaper: false, floor: false, note: 0 });
  assert.equal(await field('Wallpaper').isChecked(), true, 'wallpaper back on with the room');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('shell panel: a bookshop corner builds with its own controls and no errors', async () => {
  const page = await open();
  await panel(page).locator('select[data-shell=type]').selectOption('bookshop');
  const k = await kit(page);
  assert.equal(k.shell.type, 'bookshop');
  assert.equal(await panel(page).locator('input[data-shell-param=shelves]').count(), 1);
  await panel(page).locator('input[data-shell-param=shelves]').fill('5');
  assert.equal((await kit(page)).shell.params.shelves, 5);
  await page.waitForFunction(() => document.querySelectorAll('#view svg path, #view canvas').length > 10);
  assert.equal(await page.locator('#warnings .warn.error').count(), 0, await page.locator('#warnings').innerText());
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'shell-bookshop.png') });
  assert.deepEqual(page.errors, []);
  await page.close();
});
