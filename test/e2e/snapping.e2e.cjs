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

test('plan: Snap Off moves freely, past other pieces too, and the sidebar keeps its scroll', async () => {
  const page = await open();
  await page.setViewportSize({ width: 1200, height: 420 }); // a short window, so the inspector scrolls
  await page.click('[data-view=plan]');
  await page.selectOption('.snap select', '0');
  await page.click('.plan-canvas [data-index="2"]');
  await page.locator('#sidebar summary', { hasText: 'Position' }).click();
  const scrolled = await page.evaluate(() => { const sb = document.querySelector('#sidebar'); sb.scrollTop = sb.scrollHeight; return sb.scrollTop; });
  assert.ok(scrolled > 0, 'the sidebar can scroll');
  const shelf = await page.evaluate(() => { const f = document.querySelector('.plan-canvas [data-index="0"] rect').getBBox(); return { x1: f.x + f.width }; });
  const n = await item(page, 2);
  const from = await planPoint(page, n.x + 5, n.y + 5);
  const to = await planPoint(page, shelf.x1 + 1.5 + 5, n.y + 5 + 31.3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.waitForTimeout(50);
  assert.equal(await guides(page), 0, 'no guides with snapping off');
  const top = await page.evaluate(() => document.querySelector('#sidebar').scrollTop);
  assert.ok(top > 0, `the sidebar stays scrolled mid-drag (scrollTop ${top})`);
  await page.mouse.up();
  const done = await item(page, 2);
  assert.ok(Math.abs(done.x - (shelf.x1 + 1.5)) < 1, `not pulled onto the bookshelf (x ${done.x})`);
  assert.deepEqual(page.errors, []);

// ------------------------------------------------------------ 3D move handles
/** Client centre of a gizmo handle. */
const handle = async (page, name) => {
  const el = page.locator(`.t6-gizmo [data-handle="${name}"]`);
  await el.waitFor({ state: 'attached', timeout: 10000 });
  return page.evaluate((n) => {
    const h = document.querySelector(`.t6-gizmo [data-handle="${n}"]`);
    const r = (h.querySelector('.knob') || h).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name);
};
/** Screen direction (px per cm) of a handle's axis, from the gizmo's own data. */
const axisPx = (page, name) => page.evaluate((n) => JSON.parse(document.querySelector(`.t6-gizmo [data-handle="${n}"]`).dataset.pxPerCm));
async function dragBy(page, from, dx, dy, { alt = false, steps = 8 } = {}) {
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  return async () => { await page.mouse.up(); if (alt) await page.keyboard.up('Alt'); };
}

for (const webgl of [false, true]) {
  const which = webgl ? 'Realistic 3D' : 'sketch view';
  test(`3D handles (${which}): a selected piece shows move arrows, a floor plane and a rotate ring`, async () => {
    const page = await open({ webgl });
    if (webgl) await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
    assert.equal(await page.locator('.t6-gizmo [data-handle]').count(), 0, 'nothing selected, no handles');
    await page.click('[data-select-item="2"]');
    for (const h of ['x', 'y', 'xy', 'rot']) assert.ok(await handle(page, h), `handle ${h}`);
    await shot(page, `gizmo-${webgl ? 'webgl' : 'svg'}`);
    await page.click('[data-action=back]');
    assert.equal(await page.locator('.t6-gizmo [data-handle]').count(), 0, 'handles go with the selection');
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test(`3D handles (${which}): dragging the x arrow moves along x only, snapping flush to the bookshelf with a guide`, async () => {
    const page = await open({ webgl });
    if (webgl) await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
    await page.click('[data-select-item="2"]');
    const n = await item(page, 2);
    const shelfRight = await page.evaluate(() => { const it = window.mimimaker.kit.items[0]; return it.x + 80; }); // bookshelf: 80 cm wide
    const k = await axisPx(page, 'x');
    const want = shelfRight + 1.4 - n.x; // cm to the left edge 1.4 cm past the shelf
    const end = await dragBy(page, await handle(page, 'x'), want * k[0], want * k[1]);
    await page.waitForFunction(() => document.querySelectorAll('.t6-gizmo .gizmo-guide').length > 0, null, { timeout: 10000 });
    await shot(page, `gizmo-guide-${webgl ? 'webgl' : 'svg'}`);
    await end();
    const done = await item(page, 2);
    assert.equal(done.x, shelfRight, 'flush with the shelf');
    assert.equal(done.y, n.y, 'y untouched by the x arrow');
    assert.equal(await page.locator('.t6-gizmo .gizmo-guide').count(), 0, 'guides go on release');
    assert.deepEqual(page.errors, []);
    await page.close();
  });
}

test('3D handles: the floor plane moves in both directions on the grid; Alt moves freely', async () => {
  const page = await open();
  await page.click('[data-select-item="1"]'); // armchair, in the open
  const a = await item(page, 1);
  const kx = await axisPx(page, 'x'), ky = await axisPx(page, 'y');
  // 12.3 cm right and 8.6 cm toward the front
  const dx = 12.3 * kx[0] + 8.6 * ky[0], dy = 12.3 * kx[1] + 8.6 * ky[1];
  let end = await dragBy(page, await handle(page, 'xy'), dx, dy);
  await end();
  const b = await item(page, 1);
  assert.equal(b.x % 5, 0, `x on the grid (${b.x})`);
  assert.equal(b.y % 5, 0, `y on the grid (${b.y})`);
  assert.ok(b.x > a.x && b.y > a.y, 'moved right and forward');
  end = await dragBy(page, await handle(page, 'xy'), dx, dy, { alt: true });
  await end();
  const c = await item(page, 1);
  assert.ok(c.x % 5 !== 0 || c.y % 5 !== 0, `off the grid with Alt (${c.x}, ${c.y})`);
  await page.close();
});

test('3D handles: the rotate ring turns a piece in quarter turns, one undo step', async () => {
  const page = await open();
  await page.click('[data-select-item="1"]');
  const r0 = (await item(page, 1)).rot || 0;
  const ring = await page.evaluate(() => JSON.parse(document.querySelector('.t6-gizmo [data-handle="rot"]').dataset.ring)); // {cx, cy, rx, ry}
  // drag the knob a quarter of the way round the ring
  const from = await handle(page, 'rot');
  const a0 = Math.atan2(from.y - ring.cy, from.x - ring.cx);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const a = a0 + (i / 10) * (Math.PI / 2) * 1.1;
    await page.mouse.move(ring.cx + Math.cos(a) * ring.rx, ring.cy + Math.sin(a) * ring.ry);
  }
  await page.mouse.up();
  const r1 = (await item(page, 1)).rot;
  assert.notEqual(r1, r0, 'turned');
  assert.equal(r1 % 90, 0, 'a whole quarter turn');
  await page.keyboard.press('Control+z');
  assert.equal((await item(page, 1)).rot || 0, r0, 'one undo puts it back');
  await page.close();
});

test('3D handles: a wall piece moves along its wall and up it, snapping to the window edge', async () => {
  const page = await open();
  await page.click('[data-select-item="5"]'); // the frame on the back wall
  for (const h of ['pos', 'up', 'plane']) assert.ok(await handle(page, h), `handle ${h}`);
  const fr = await item(page, 5);
  const w = await page.evaluate(() => { const r = document.querySelector('.t6-gizmo').dataset.size; return JSON.parse(r)[0]; });
  const k = await axisPx(page, 'pos');
  const want = 215 + w / 2 + 1.2 - fr.pos;
  const end = await dragBy(page, await handle(page, 'pos'), want * k[0], want * k[1]);
  await end();
  const done = await item(page, 5);
  assert.ok(Math.abs(done.pos - (215 + w / 2)) < 1e-6, `left edge on the window's right edge (${done.pos})`);
  assert.equal(done.elev, fr.elev, 'height untouched');
  const ku = await axisPx(page, 'up');
  const end2 = await dragBy(page, await handle(page, 'up'), 17.2 * ku[0], 17.2 * ku[1]);
  await end2();
  const up = await item(page, 5);
  assert.notEqual(up.elev, fr.elev, 'moved up');
  assert.equal(up.pos, done.pos, 'along-wall untouched');
  await page.close();
});

test('3D handles: dragging never orbits the camera, and the Light step shows no handles', async () => {
  const page = await open();
  await page.click('[data-select-item="1"]');
  const yaw0 = await page.locator('input[aria-label=Rotate]').inputValue();
  const end = await dragBy(page, await handle(page, 'x'), 40, 0);
  await end();
  assert.equal(await page.locator('input[aria-label=Rotate]').inputValue(), yaw0, 'the camera stayed put');
  await page.click('[data-step=light]');
  assert.equal(await page.locator('.t6-gizmo [data-handle]').count(), 0);
  await page.close();
});
