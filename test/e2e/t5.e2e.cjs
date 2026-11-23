// Browser tests for the T5 lighting UI. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const path = require('node:path');

// Set SHOT_DIR to save screenshots of the circuit card for review.
async function shot(page, name, selector = '.t5-circuit') {
  if (process.env.SHOT_DIR) await page.locator(selector).first().screenshot({ path: path.join(process.env.SHOT_DIR, `t5-${name}.png`) });
}

let server, browser, URL;

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  await page.evaluate(() => {
    const k = window.mimimaker.kit;
    k.lighting.enabled = true;
    k.lighting.power = { ...k.lighting.power, kind: 'battery', supply: 'aa2' };
    k.lighting.leds = [0, 1].map((i) => ({ mount: 'wall', wall: 'back', pos: 40 + i * 60, elev: 150, color: 'warm' }));
    window.mimimaker.refresh();
  });
  return page;
}

test('the Light step shows the circuit summary', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  const card = page.locator('.t5-circuit');
  await card.waitFor({ timeout: 3000 });
  const text = await card.innerText();
  assert.match(text, /2×AA/);
  assert.match(text, /40 mA/);
  assert.match(text, /about 32 hours/);
  assert.match(text, /estimate/i);
  assert.equal(await card.getAttribute('data-status'), 'ok');
  await shot(page, 'circuit-2xaa');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('choosing a coin cell updates the kit and flags the overload', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  await page.selectOption('select[data-t5=supply]', 'cr2032');
  const k = await page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit.lighting.power)));
  assert.equal(k.supply, 'cr2032');
  assert.equal(k.kind, 'battery');
  await page.click('[data-step=light]');
  const card = page.locator('.t5-circuit');
  assert.equal(await card.getAttribute('data-status'), 'warn');
  assert.match(await card.innerText(), /CR2032/);
  await shot(page, 'circuit-cr2032');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('a light\'s effect can be picked in its inspector, and strips flag battery power', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  await page.click('[data-select-led="0"]');
  await page.selectOption('select[data-t5=effect]', 'strip');
  let led = await page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit.lighting.leds[0])));
  assert.equal(led.effect, 'strip');
  assert.equal(led.lengthMm, 100);
  await page.fill('input[data-t5=lengthMm]', '50');
  led = await page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit.lighting.leds[0])));
  assert.equal(led.lengthMm, 50);
  await shot(page, 'effect-strip', '#sidebar');
  // back to the circuit: a strip on 2×AA is an error that says to use USB
  await page.click('.insp-head [data-action=back]');
  const card = page.locator('.t5-circuit');
  assert.equal(await card.getAttribute('data-status'), 'error');
  assert.match(await card.innerText(), /USB/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the power box can be mounted flush behind its wall', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  await page.selectOption('select[data-t5=mount]', 'flush');
  const power = await page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit.lighting.power)));
  assert.equal(power.mount, 'flush');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('a hidden base shows its switch fields and adds the base parts', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  assert.equal(await page.locator('select[data-t5=switch-at]').count(), 0, 'no switch fields before the base');
  await page.selectOption('select[data-t5=mount]', 'base');
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  await page.locator('select[data-t5=switch-at]').waitFor({ timeout: 3000 });
  await page.selectOption('select[data-t5=switch-at]', 'left');
  await page.selectOption('select[data-t5=switch-kind]', 'push');
  const res = await page.evaluate(() => ({
    power: JSON.parse(JSON.stringify(window.mimimaker.kit.lighting.power)),
    groups: window.mimimaker.compiled.groups.map((g) => g.title),
    face: window.mimimaker.compiled.lighting.power.base?.switch.face,
  }));
  assert.equal(res.power.mount, 'base');
  assert.equal(res.power.switchAt, 'left');
  assert.equal(res.power.switch, 'push');
  assert.ok(res.groups.includes('Hidden base'));
  assert.equal(res.face, 'left');
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 't5-hidden-base.png') });
  assert.deepEqual(page.errors, []);
  await page.close();
});

const fs = require('node:fs');

test('the kit zip carries shopping-list.csv when there are lights', async () => {
  const page = await open();
  await page.click('[data-step=make]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-zip')]);
  const zip = fs.readFileSync(await dl.path()).toString('latin1');
  assert.ok(zip.includes('shopping-list.csv'), 'file in the zip');
  assert.ok(zip.includes('Pre-wired 3 V micro LED'), 'stored CSV text');
  await page.evaluate(() => { window.mimimaker.kit.lighting.enabled = false; window.mimimaker.refresh(); });
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-zip')]);
  assert.ok(!fs.readFileSync(await dl2.path()).toString('latin1').includes('shopping-list.csv'), 'no lights, no list');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the Power section has a Shopping list download', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-t5=shopping]')]);
  assert.equal(dl.suggestedFilename(), 'shopping-list.csv');
  assert.match(fs.readFileSync(await dl.path(), 'utf8'), /^Qty,Item/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('Hide wires behind a cover adds the frame and cover panel to the kit', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  await page.check('input[data-t5=cover]');
  assert.equal(await page.evaluate(() => window.mimimaker.kit.lighting.cover?.enabled), true);
  await page.click('[data-step=make]');
  const zipNames = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-zip')]);
    return fs.readFileSync(await dl.path()).toString('latin1');
  };
  assert.ok((await zipNames()).includes('Cable cover panel'), 'the guide lists the cover panel');
  await page.click('[data-step=light]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  await page.uncheck('input[data-t5=cover]');
  assert.equal(await page.evaluate(() => window.mimimaker.kit.lighting.cover?.enabled ?? false), false);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('turning the cover on moves a low power box so it opens without a warning', async () => {
  const page = await open();
  await page.evaluate(() => { const k = window.mimimaker.kit; k.lighting.power = { ...k.lighting.power, wall: 'back', pos: 20, elev: 5 }; window.mimimaker.refresh(); });
  await page.click('[data-step=light]');
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  await page.check('input[data-t5=cover]');
  const p = await page.evaluate(() => ({ ...window.mimimaker.kit.lighting.power }));
  assert.ok(p.pos > 20 && p.elev > 5, `moved to ${p.pos}, ${p.elev}`);
  assert.equal(await page.locator('#warnings', { hasText: 'cable cover' }).count(), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});
