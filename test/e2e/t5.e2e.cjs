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
