// Browser tests for the T5 lighting UI. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 5205;
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

test('LED map tab shows the circuit summary', async () => {
  const page = await open();
  await page.click('[data-tab=ledmap]');
  const card = page.locator('.t5-circuit');
  await card.waitFor({ timeout: 3000 });
  const text = await card.innerText();
  assert.match(text, /2×AA/);
  assert.match(text, /40 mA/);
  assert.match(text, /about 32 hours/);
  assert.match(text, /estimate/i);
  assert.equal(await card.getAttribute('data-status'), 'ok');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('choosing a coin cell updates the kit and flags the overload', async () => {
  const page = await open();
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.section')) d.open = true; });
  await page.selectOption('select[data-t5=supply]', 'cr2032');
  const k = await page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit.lighting.power)));
  assert.equal(k.supply, 'cr2032');
  assert.equal(k.kind, 'battery');
  await page.click('[data-tab=ledmap]');
  const card = page.locator('.t5-circuit');
  assert.equal(await card.getAttribute('data-status'), 'warn');
  assert.match(await card.innerText(), /CR2032/);
  assert.deepEqual(page.errors, []);
  await page.close();
});
