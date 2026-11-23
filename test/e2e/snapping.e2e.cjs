// Moving pieces with snapping: the floor plan and the 3D move handles share
// one engine (src/plan.js): grid, walls, other pieces' edges and centres,
// with guides while dragging. Alt turns snapping off.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `snapping-${name}.png`) });
}

async function open({ webgl = false } = {}) {
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
  return page;
}

const item = (page, i) => page.evaluate((k) => ({ ...window.mimimaker.kit.items[k] }), i);
/** Client point of a plan point in cm. */
const planPoint = (page, x, y) => page.evaluate(([px, py]) => {
  const svg = document.querySelector('.plan-canvas svg');
  const pt = svg.createSVGPoint();
  pt.x = px; pt.y = py;
  const p = pt.matrixTransform(svg.getScreenCTM());
  return { x: p.x, y: p.y };
}, [x, y]);
const guides = (page) => page.locator('.plan-canvas .plan-guide').count();

// starter room: bookshelf (0) at x 15, armchair (1), nightstand (2) at x 245 y 10, floor lamp (3), rug (4)
test('plan: a dragged piece snaps flush to another piece, with a guide while dragging', async () => {
  const page = await open();
  await page.click('[data-view=plan]');
  const shelf = await page.evaluate(() => { const f = document.querySelector('.plan-canvas [data-index="0"] rect').getBBox(); return { x1: f.x + f.width }; });
  const n = await item(page, 2);
  // grab the nightstand 5 cm in from its corner, aim its left edge 1.5 cm right of the shelf
  const from = await planPoint(page, n.x + 5, n.y + 5);
  const to = await planPoint(page, shelf.x1 + 1.5 + 5, n.y + 5 + 31);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  assert.ok(await guides(page) > 0, 'a guide shows while it lines up');
  await shot(page, 'plan-guide');
  await page.mouse.up();
  const after1 = await item(page, 2);
  assert.equal(after1.x, shelf.x1, 'flush against the bookshelf');
  assert.equal(after1.y % 5, 0, 'grid in the other direction');
  assert.equal(await guides(page), 0, 'guides go when you let go');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('plan: Alt drags freely, and the inspector follows the drag', async () => {
  const page = await open();
  await page.click('[data-view=plan]');
  await page.click('.plan-canvas [data-index="2"]');
  await page.locator('#sidebar summary', { hasText: 'Position' }).click();
  const n = await item(page, 2);
  const from = await planPoint(page, n.x + 5, n.y + 5);
  const mid = await planPoint(page, n.x + 5 - 33.3, n.y + 5 + 21.7);
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 6 });
  await page.waitForTimeout(50);
  const live = await page.evaluate(() => Number([...document.querySelectorAll('#sidebar .field')].find((f) => /From left/.test(f.textContent)).querySelector('input').value));
  const moving = await item(page, 2);
  assert.ok(Math.abs(live - moving.x) < 0.01, `the From left field reads ${live} mid-drag (piece at ${moving.x})`);
  assert.equal(await guides(page), 0, 'no guides with Alt');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const done = await item(page, 2);
  assert.ok(done.x % 5 !== 0 || done.y % 5 !== 0, `off the grid with Alt (${done.x}, ${done.y})`);
  await page.close();
});

test('plan: a wall piece snaps to the window’s edge along the wall', async () => {
  const page = await open();
  await page.click('[data-view=plan]');
  // the frame (5) hangs on the back wall at 262; the window spans 135–215 there
  const fr = await item(page, 5);
  const w = await page.evaluate(() => { const r = document.querySelector('.plan-canvas [data-index="5"] rect').getBBox(); return r.width; });
  const from = await planPoint(page, fr.pos, 2);
  const to = await planPoint(page, 215 + w / 2 + 1.2, 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  assert.ok(await guides(page) > 0, 'a guide at the window edge');
  await page.mouse.up();
  const after1 = await item(page, 5);
  assert.ok(Math.abs(after1.pos - (215 + w / 2)) < 1e-6, `left edge on the window's right edge (pos ${after1.pos})`);
  await page.close();
});
