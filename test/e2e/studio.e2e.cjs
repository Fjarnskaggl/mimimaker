// Browser tests for the studio UI. Run with: npm run test:e2e
// Needs Playwright with Chromium installed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 5199;
const URL = `http://localhost:${PORT}/`;
let server, browser;

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '../../scripts/serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(URL); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function open(url = URL) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  page.errors = errors;
  return page;
}
const kit = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit)));

test('floor plan: drag moves an item by the distance dragged, on a 5 cm grid', async () => {
  const page = await open();
  await page.click('[data-tab=plan]');
  const cmPerPx = await page.evaluate(() => 1 / document.querySelector('.plan-canvas svg').getScreenCTM().a);
  for (const [dxPx, dyPx] of [[60, 30], [-40, 50], [10, 0]]) {
    const before = (await kit(page)).items[0];
    const box = await page.locator('.plan-item[data-index="0"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dxPx, box.y + box.height / 2 + dyPx, { steps: 6 });
    await page.mouse.up();
    const after = (await kit(page)).items[0];
    const want = [Math.max(0, before.x + dxPx * cmPerPx), Math.max(0, before.y + dyPx * cmPerPx)];
    assert.ok(Math.abs(after.x - want[0]) <= 3, `x: dragged ${dxPx}px from ${before.x} → expected ≈${want[0].toFixed(1)}, got ${after.x}`);
    assert.ok(Math.abs(after.y - want[1]) <= 3, `y: dragged ${dyPx}px from ${before.y} → expected ≈${want[1].toFixed(1)}, got ${after.y}`);
    assert.equal(after.x % 5, 0, 'snapped');
    assert.equal(after.y % 5, 0, 'snapped');
  }
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('floor plan: sliding a wall piece follows the pointer', async () => {
  const page = await open();
  await page.click('[data-tab=plan]');
  const cmPerPx = await page.evaluate(() => 1 / document.querySelector('.plan-canvas svg').getScreenCTM().a);
  const i = (await kit(page)).items.findIndex((it) => it.wall === 'back');
  const before = (await kit(page)).items[i];
  const box = await page.locator(`.plan-item[data-index="${i}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = (await kit(page)).items[i];
  const want = before.pos - 50 * cmPerPx;
  assert.ok(Math.abs(after.pos - want) <= 3, `expected pos ≈${want.toFixed(1)}, got ${after.pos}`);
  await page.close();
});

test('floor plan: R rotates, Delete removes, and undo/redo restore', async () => {
  const page = await open();
  await page.click('[data-tab=plan]');
  const count = (await kit(page)).items.length;
  await page.click('.plan-item[data-index="1"]');
  await page.keyboard.press('r');
  assert.equal((await kit(page)).items[1].rot, 90);
  await page.keyboard.press('Control+z');
  assert.equal((await kit(page)).items[1].rot || 0, 0, 'undo');
  await page.keyboard.press('Control+Shift+z');
  assert.equal((await kit(page)).items[1].rot, 90, 'redo');
  await page.click('.plan-item[data-index="1"]');
  await page.keyboard.press('Delete');
  assert.equal((await kit(page)).items.length, count - 1);
  await page.click('#btn-undo');
  assert.equal((await kit(page)).items.length, count, 'undo button');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('floor plan: overlapping furniture is flagged', async () => {
  const page = await open();
  await page.click('[data-tab=plan]');
  assert.equal(await page.locator('.plan-item.clash').count(), 0);
  await page.evaluate(() => { const k = window.mimimaker.kit; k.items[1].x = k.items[0].x; k.items[1].y = k.items[0].y; window.mimimaker.refresh(); });
  assert.ok(await page.locator('.plan-item.clash').count() >= 2);
  await page.close();
});

test('3D preview: night mode switches the lights on', async () => {
  const page = await open();
  await page.click('#night-toggle');
  assert.ok(await page.locator('.stage.night').count() === 1);
  assert.ok(await page.locator('.stage svg .halo').count() > 0);
  await page.close();
});

test('make tab: fit test calibrates board thickness and sheets show cut times', async () => {
  const page = await open();
  await page.click('[data-tab=sheets]');
  assert.ok(await page.locator('.cut-time').count() > 0, 'cut time per sheet');
  const card = page.locator('[data-calibrate="chip2"]');
  await card.locator('button.slot').nth(3).click(); // 2.1 mm slot
  const chip2 = (await kit(page)).materials.find((m) => m.id === 'chip2');
  assert.equal(chip2.thickness, 2.1);
  assert.equal(chip2.calibrated, true);
  assert.ok(await card.locator('.calibrated').count() === 1);
  await page.close();
});

test('share link opens the same design in a fresh browser', async () => {
  const page = await open();
  await page.evaluate(() => { window.mimimaker.kit.name = 'Shared Test Room'; window.mimimaker.refresh(); });
  await page.click('#btn-share');
  await page.waitForFunction(() => document.querySelector('#share-url').value.includes('#kit='), null, { timeout: 5000 });
  const link = await page.locator('#share-url').inputValue();
  assert.match(link, /#kit=/);
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto(link);
  await other.waitForFunction(() => window.mimimaker?.kit?.name === 'Shared Test Room', null, { timeout: 8000 });
  assert.equal(await other.evaluate(() => location.hash), '', 'hash cleared after loading');
  await ctx.close();
  await page.close();
});

test('floor plan: furniture under a ceiling light can still be selected', async () => {
  const page = await open();
  await page.evaluate(() => {
    const k = window.mimimaker.kit;
    k.room.ceiling = true;
    k.lighting.enabled = true;
    const it = k.items[0];
    k.lighting.leds.push({ name: 'Over it', mount: 'ceiling', x: (it.x ?? 0) + it.params.w / 2 + 6, y: (it.y ?? 0) + it.params.d / 2, color: 'warm' }); // its glow covers the centre, where clicks land; the bulb is beside it
    window.mimimaker.refresh();
  });
  await page.click('[data-tab=plan]');
  await page.click('.plan-item[data-index="0"]', { timeout: 3000 });
  assert.equal(await page.locator('.plan-item.sel[data-index="0"]').count(), 1);
  await page.close();
});

test('share box stays hidden until Share link is clicked', async () => {
  const page = await open();
  assert.equal(await page.locator('#share-pop').isVisible(), false);
  await page.click('#btn-share');
  assert.equal(await page.locator('#share-pop').isVisible(), true);
  await page.click('#share-close');
  assert.equal(await page.locator('#share-pop').isVisible(), false);
  await page.close();
});

test('no sideways scrolling at phone width on any tab', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  for (const tab of ['preview', 'plan', 'sheets', 'ledmap', 'guide']) {
    await page.click(`[data-tab=${tab}]`);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${tab}: page is ${overflow}px too wide`);
  }
  await page.close();
});

test('disabled fields look disabled', async () => {
  const page = await open();
  const styles = await page.evaluate(() => {
    const field = document.createElement('label');
    field.className = 'field';
    field.innerHTML = '<span class="unit-wrap"><input type="number" value="1"></span><select><option>a</option></select>';
    document.querySelector('#sidebar .section-body').append(field);
    const [input, select] = [field.querySelector('input'), field.querySelector('select')];
    const before = [getComputedStyle(input).opacity, getComputedStyle(input).cursor];
    input.disabled = true; select.disabled = true;
    return { before, input: [getComputedStyle(input).opacity, getComputedStyle(input).cursor], select: getComputedStyle(select).opacity };
  });
  assert.equal(styles.before[0], '1');
  assert.ok(Number(styles.input[0]) < 0.8, `disabled input opacity ${styles.input[0]}`);
  assert.equal(styles.input[1], 'not-allowed');
  assert.ok(Number(styles.select) < 0.8, `disabled select opacity ${styles.select}`);
  await page.close();
});
