// Performance budgets for the journeys people feel: editing with Realistic 3D
// on, orbiting, typing. Wall-clock time is too noisy to gate merges on CI's
// software GL, so each budget counts work instead (shader programs compiled,
// shadow-map passes, kit recompiles). The counts are deterministic.
//
// Where cdnjs can't be reached, set MIMI_THREE_JS to three@0.128.0's
// build/three.min.js (see docs/threads/README.md).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');

let URL, server, browser;
const CDN = /three(\.js\/r128|@0\.128\.0)\/.*three\.min\.js$/;

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open({ webgl = false, room = 'cafe' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  if (process.env.MIMI_THREE_JS) {
    const body = fs.readFileSync(process.env.MIMI_THREE_JS);
    await page.route(CDN, (r) => r.fulfill({ body, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  }
  await page.addInitScript((on) => { try { localStorage.setItem('mimimaker.t6.webgl', on ? '1' : '0'); } catch { /* */ } }, webgl);
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  await page.evaluate((id) => { document.querySelector('#btn-new').click(); document.querySelector(`#start .rt-card[data-room="${id}"]`).click(); }, room);
  if (webgl) await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
  return page;
}

const stats = (page) => page.evaluate(() => document.querySelector('.stage').t6viewer.stats());

/** Drag across the stage to orbit, one synchronous redraw per move. */
const orbit = (page, moves = 8) => page.evaluate((n) => {
  const st = document.querySelector('.stage');
  const r = st.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  st.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerId: 1, buttons: 1 }));
  for (let i = 1; i <= n; i++) st.dispatchEvent(new PointerEvent('pointermove', { clientX: x + i * 6, clientY: y + i * 2, bubbles: true, pointerId: 1, buttons: 1 }));
  st.dispatchEvent(new PointerEvent('pointerup', { clientX: x + n * 6, clientY: y + n * 2, bubbles: true, pointerId: 1 }));
}, moves);

test('perf budget: rebuilding the 3D scene after an edit compiles no new shader programs', async () => {
  const page = await open({ webgl: true });
  const before = await stats(page);
  assert.ok(before.programs.length > 0, 'the scene was drawn with some programs');
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.mimimaker.refresh()); // an edit rebuilds the scene
  const afterEdit = await stats(page);
  assert.ok(afterEdit.builds > before.builds, 'the edits rebuilt the scene');
  const fresh = afterEdit.programs.filter((id) => !before.programs.includes(id));
  assert.deepEqual(fresh, [], 'every program was reused (a recompile costs ~50 ms per edit, more on real GPUs)');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('perf budget: after an edit, switching to night reuses the night programs too', async () => {
  const page = await open({ webgl: true });
  await page.click('#night-toggle');
  await page.click('#night-toggle'); // night seen once, back to day
  const before = await stats(page);
  await page.evaluate(() => window.mimimaker.refresh()); // an edit by day
  await page.click('#night-toggle');
  const after = await stats(page);
  // a kind of material never drawn before (the selection ring, warmed with the
  // rest) may compile once; anything the room already used must not
  const again = after.programs.filter((id) => !before.programs.includes(id)).map((id) => after.programNames[after.programs.indexOf(id)]).filter((n) => before.programNames.includes(n));
  assert.deepEqual(again, [], 'night lighting needed no recompile');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('perf budget: orbiting reuses the shadow maps; a rebuild or the night toggle redraws them', async () => {
  const page = await open({ webgl: true });
  const s0 = await stats(page);
  await orbit(page, 8);
  const s1 = await stats(page);
  assert.ok(s1.frames >= s0.frames + 8, `each move drew a frame (${s1.frames - s0.frames})`);
  assert.equal(s1.shadowPasses - s0.shadowPasses, 0, 'shadows don\'t move with the camera, so no shadow pass while orbiting');
  await page.evaluate(() => window.mimimaker.refresh());
  const s2 = await stats(page);
  assert.equal(s2.shadowPasses - s1.shadowPasses, 1, 'a rebuild draws the shadows once');
  await page.click('#night-toggle');
  const s3 = await stats(page);
  assert.equal(s3.shadowPasses - s2.shadowPasses, 1, 'night (window lights) draws them once');
  await orbit(page, 4);
  assert.equal((await stats(page)).shadowPasses, s3.shadowPasses, 'and orbiting at night reuses them too');
  // dragging a piece with the 3D handles moves its shadow, without a rebuild
  await page.evaluate(() => document.querySelector('.stage').t6viewer.previewItem(0, { offset: [10, 0, 0] }));
  assert.equal((await stats(page)).shadowPasses, s3.shadowPasses + 1, 'a drag preview redraws the shadows');
  await page.evaluate(() => document.querySelector('.stage').t6viewer.previewItem(null));
  assert.equal((await stats(page)).shadowPasses, s3.shadowPasses + 2, 'and so does putting the piece back');
  assert.deepEqual(page.errors, []);
  await page.close();
});
