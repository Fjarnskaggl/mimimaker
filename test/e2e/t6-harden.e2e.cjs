// T6 hardening: three.js only runs if it matches its pinned hash (SRI), and
// the café room stays inside a 60 fps orbit budget.
// Run with: npm run test:e2e
//
// Where cdnjs can't be reached, point MIMI_THREE_JS at three@0.128.0's
// build/three.min.js (see docs/threads/README.md). It is byte-identical to the
// CDN file, so it passes the integrity check too.
//
// MIMI_PERF_STRICT=1 also asserts measured fps >= 60. Leave it off in CI:
// headless runners draw WebGL in software, which says nothing about a laptop.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

let URL, server, browser;
const CDN = /three(\.js\/r128|@0\.128\.0)\/.*three\.min\.js$/;
const CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function threeBody() {
  if (process.env.MIMI_THREE_JS) return fs.readFileSync(process.env.MIMI_THREE_JS);
  const res = await fetch(CDN_URL);
  assert.ok(res.ok, `fetch three.js: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function open({ body = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const served = body ?? (process.env.MIMI_THREE_JS ? fs.readFileSync(process.env.MIMI_THREE_JS) : null);
  if (served) await page.route(CDN, (r) => r.fulfill({ body: served, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  page.errors = errors;
  return page;
}

test('three.js loads with a sha512 integrity hash', async () => {
  const page = await open();
  await page.click('#renderer-toggle');
  await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
  const tag = await page.evaluate(() => {
    const s = [...document.scripts].find((x) => /three\.min\.js$/.test(x.src));
    return s && { integrity: s.integrity, crossOrigin: s.crossOrigin };
  });
  assert.ok(tag, 'the three.js script tag is in the page');
  assert.match(tag.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.equal(tag.crossOrigin, 'anonymous', 'SRI on a cross-origin script needs CORS');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('a tampered three.js is refused and the SVG preview stays', async () => {
  const genuine = await threeBody();
  const tampered = Buffer.concat([genuine, Buffer.from('\n;window.__tampered = true;\n')]);
  const page = await open({ body: tampered });
  await page.click('#renderer-toggle');
  await page.waitForSelector('.stage[data-webgl=unavailable]', { timeout: 15000 });
  assert.equal(await page.locator('.stage').getAttribute('data-renderer'), 'svg');
  assert.equal(await page.locator('.stage svg.scene-svg').count(), 1);
  assert.equal(await page.evaluate(() => window.__tampered ?? false), false, 'the tampered script never ran');
  assert.match(await page.locator('.t6-note').innerText(), /SVG/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

// The budget behind "60 fps orbit on a mid laptop": a frame of the café,
// shadow pass included, stays under these counts. They are deterministic, so
// CI can hold the line even though its software WebGL can't hit 60 fps.
// Measured 2026-11-23: 59 calls, ~8.4k triangles, so there is room to grow.
const BUDGET = { calls: 150, triangles: 50000, shadowLights: 1, pixelRatio: 2 };

test('perf budget: orbiting the café stays inside the 60 fps budget', async () => {
  const page = await open();
  await page.click('#renderer-toggle');
  await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
  await page.locator('.rt-card[aria-label="Start from Little café"]').evaluate((e) => { e.click(); e.click(); });
  await page.waitForFunction(() => document.querySelector('.stage').t6viewer?.sample().textures.includes('brick'), null, { timeout: 10000 });
  const b = await page.evaluate(() => document.querySelector('.stage').t6viewer.bench({ frames: 60 }));
  console.log(`café orbit: ${b.fps.toFixed(1)} fps (${b.msPerFrame.toFixed(2)} ms/frame), ${b.calls} draw calls, ${b.triangles} triangles, ${b.shadowLights} shadow lights, pixel ratio ${b.pixelRatio}`);
  assert.equal(b.frames, 60);
  assert.ok(b.yawSpan >= 300, `orbits most of the way round (${b.yawSpan}°)`);
  assert.ok(b.calls > 0 && b.calls <= BUDGET.calls, `draw calls ${b.calls} <= ${BUDGET.calls}`);
  assert.ok(b.triangles > 0 && b.triangles <= BUDGET.triangles, `triangles ${b.triangles} <= ${BUDGET.triangles}`);
  assert.ok(b.shadowLights <= BUDGET.shadowLights, `shadow-casting lights by day ${b.shadowLights} <= ${BUDGET.shadowLights}`);
  assert.ok(b.pixelRatio <= BUDGET.pixelRatio);
  assert.ok(Number.isFinite(b.fps) && b.fps > 0);
  if (process.env.MIMI_PERF_STRICT) assert.ok(b.fps >= 60, `${b.fps.toFixed(1)} fps`);
  // the bench leaves the view where it found it
  const yaw = Number(await page.locator('input[aria-label=Rotate]').inputValue());
  const after = await page.evaluate(() => document.querySelector('.stage').t6viewer.sample().hash);
  const again = await page.evaluate(() => document.querySelector('.stage').t6viewer.sample().hash);
  assert.equal(after, again);
  assert.equal(Number(await page.locator('input[aria-label=Rotate]').inputValue()), yaw);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('perf budget: night mode adds at most 12 LED lights and keeps shadows to the sun and windows', async () => {
  const page = await open();
  await page.click('#renderer-toggle');
  await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
  await page.click('#night-toggle');
  const b = await page.evaluate(() => document.querySelector('.stage').t6viewer.bench({ frames: 10 }));
  const s = await page.evaluate(() => document.querySelector('.stage').t6viewer.sample());
  assert.ok(s.pointLights <= 12);
  assert.ok(b.shadowLights <= 1 + s.windowLights, `shadow lights at night ${b.shadowLights}`);
  assert.ok(b.calls <= BUDGET.calls * 2, `night draw calls ${b.calls}`);
  assert.deepEqual(page.errors, []);
  await page.close();
});
