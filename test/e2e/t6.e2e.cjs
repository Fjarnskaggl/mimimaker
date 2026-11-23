// T6 browser tests: WebGL viewer behind a toggle, with the SVG fallback.
// Run with: npm run test:e2e
//
// three.js loads from a pinned CDN build. Where the CDN can't be reached
// (e.g. a sandbox), point MIMI_THREE_JS at a local copy of the same file
// (three@0.128.0 build/three.min.js) and the tests serve it in its place.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 5198;
const URL = `http://localhost:${PORT}/`;
const CDN = /three(\.js\/r128|@0\.128\.0)\/.*three\.min\.js$/;
let server, browser;

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '../../scripts/serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(URL); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function open({ blockThree = false, noWebGL = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (blockThree) await page.route(CDN, (r) => r.abort());
  else if (process.env.MIMI_THREE_JS) {
    const body = fs.readFileSync(process.env.MIMI_THREE_JS);
    await page.route(CDN, (r) => r.fulfill({ body, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  }
  if (noWebGL) {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/i.test(type) ? null : orig.call(this, type, ...rest);
      };
    });
  }
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  page.errors = errors;
  return page;
}
const renderer = (page) => page.locator('.stage').getAttribute('data-renderer');
const sample = (page) => page.evaluate(() => document.querySelector('.stage').t6viewer.sample());

async function switchOn(page) {
  await page.click('#renderer-toggle');
  await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
}

test('WebGL viewer: off by default, the toggle swaps the SVG for a rendered canvas', async () => {
  const page = await open();
  assert.equal(await renderer(page), 'svg');
  assert.equal(await page.locator('.stage svg.scene-svg').count(), 1);
  await switchOn(page);
  assert.equal(await page.locator('#renderer-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.stage svg.scene-svg').count(), 0, 'SVG replaced');
  const s = await sample(page);
  assert.ok(s.meshes > 20, `meshes: ${s.meshes}`);
  assert.ok(s.lit > 0.1, `the model covers part of the canvas (lit ${s.lit})`);
  assert.ok(s.shadows, 'soft shadows on');
  // and back
  await page.click('#renderer-toggle');
  assert.equal(await renderer(page), 'svg');
  assert.equal(await page.locator('.stage canvas').count(), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('WebGL viewer: dragging orbits the camera and the picture changes', async () => {
  const page = await open();
  await switchOn(page);
  const before = await sample(page);
  const yaw0 = Number(await page.locator('input[aria-label=Rotate]').inputValue());
  const box = await page.locator('.stage canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  const yaw1 = Number(await page.locator('input[aria-label=Rotate]').inputValue());
  assert.ok(yaw1 > yaw0 + 20, `yaw ${yaw0} → ${yaw1}`);
  const after = await sample(page);
  assert.notEqual(after.hash, before.hash, 'image changed');
  // wheel zooms in: the model fills more of the canvas
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  const zoomed = await sample(page);
  assert.ok(zoomed.lit > after.lit, `zoom in: lit ${after.lit} → ${zoomed.lit}`);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('WebGL viewer: night mode darkens the room and adds a point light per LED', async () => {
  const page = await open();
  await switchOn(page);
  const day = await sample(page);
  assert.equal(day.pointLights, 0);
  await page.click('#night-toggle');
  const night = await sample(page);
  const leds = await page.evaluate(() => window.mimimaker.kit.lighting?.leds?.length ?? 0);
  assert.ok(leds > 0, 'default room has LEDs');
  assert.equal(night.pointLights, Math.min(leds, 12));
  assert.ok(night.mean < day.mean * 0.7, `darker: ${day.mean} → ${night.mean}`);
  assert.ok(night.max > 200, 'the bulbs still glow');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('falls back to the SVG preview when three.js cannot load', async () => {
  const page = await open({ blockThree: true });
  await page.click('#renderer-toggle');
  await page.waitForSelector('.stage[data-webgl=unavailable]', { timeout: 15000 });
  assert.equal(await renderer(page), 'svg');
  assert.equal(await page.locator('.stage svg.scene-svg').count(), 1);
  assert.match(await page.locator('.t6-note').innerText(), /SVG/);
  // the SVG night mode still works
  await page.click('#night-toggle');
  assert.ok(await page.locator('.stage svg .halo').count() > 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('falls back to the SVG preview when WebGL is unavailable', async () => {
  const page = await open({ noWebGL: true });
  await page.click('#renderer-toggle');
  await page.waitForSelector('.stage[data-webgl=unavailable]', { timeout: 15000 });
  assert.equal(await renderer(page), 'svg');
  assert.equal(await page.locator('.stage svg.scene-svg').count(), 1);
  assert.equal(await page.locator('.stage canvas').count(), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});
