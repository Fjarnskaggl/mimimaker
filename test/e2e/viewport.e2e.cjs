// Viewport responsiveness: the 3D view must reflect a change the moment it
// happens, not on the next orbit or re-render. These tests read the view
// straight after an action, without touching the camera.
//
// Where cdnjs can't be reached, set MIMI_THREE_JS to three@0.128.0's
// build/three.min.js (see docs/threads/README.md).
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
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `viewport-${name}.png`) });
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
  if (webgl) await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
  return page;
}

/** Item indexes outlined in the SVG preview right now. */
const outlined = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('.stage path.sel')].map((p) => Number(p.dataset.item)))]);
// What the WebGL viewer last drew with. shown() doesn't render: a night frame
// with shadows can take a second on CI's software GL, so never poll sample().
const shown = (page) => page.evaluate(() => document.querySelector('.stage').t6viewer.shown());
const glSelected = async (page) => (await shown(page)).selected;

test('selection is live in the SVG preview: picking from the list outlines the piece at once', async () => {
  const page = await open();
  assert.deepEqual(await outlined(page), []);
  await page.click('[data-select-item="2"]');
  assert.deepEqual(await outlined(page), [2], 'outlined without orbiting first');
  await shot(page, 'list-select');
  await page.click('[data-action=back]');
  assert.deepEqual(await outlined(page), [], 'Done clears the outline');
  await page.click('[data-select-item="1"]');
  assert.deepEqual(await outlined(page), [1]);
  await page.locator('.stage').hover({ position: { x: 5, y: 5 } }); // move focus off the field
  await page.keyboard.press('Escape');
  assert.deepEqual(await outlined(page), [], 'Escape clears the outline');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('selection is live in the SVG preview: clicking another piece moves the outline', async () => {
  const page = await open();
  for (const i of [0, 3]) {
    const p = await page.evaluate((k) => document.querySelector('.stage').t6pickPoint(k), i);
    assert.ok(p, `piece ${i} is visible`);
    await page.mouse.click(p.x, p.y);
    assert.deepEqual(await outlined(page), [i]);
  }
  await page.click('#rail-room');
  assert.deepEqual(await outlined(page), [], 'Room settings clears the outline');
  await page.close();
});

test('selection is live in Realistic 3D: the list, Done and Escape update the viewer at once', async () => {
  const page = await open({ webgl: true });
  assert.equal(await glSelected(page), null);
  await page.click('[data-select-item="2"]');
  assert.equal(await glSelected(page), 2, 'tinted without orbiting first');
  await shot(page, 'webgl-list-select');
  await page.click('[data-action=back]');
  assert.equal(await glSelected(page), null, 'Done clears the tint');
  await page.click('[data-select-item="1"]');
  await page.keyboard.press('Escape');
  assert.equal(await glSelected(page), null, 'Escape clears the tint');
  assert.deepEqual(page.errors, []);
  await page.close();
});

/** Item indexes drawn with the hover outline in the SVG preview. */
const hovered = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('.stage path.hover')].map((p) => Number(p.dataset.item)))]);
const pointFor = (page, i) => page.evaluate((k) => document.querySelector('.stage').t6pickPoint(k), i);

test('hover feedback in the SVG preview: a piece lights up and the cursor says it can be clicked', async () => {
  const page = await open();
  const p = await pointFor(page, 2);
  await page.mouse.move(p.x, p.y);
  await page.waitForFunction(() => document.querySelector('.stage path.hover'), null, { timeout: 2000 });
  assert.deepEqual(await hovered(page), [2]);
  assert.equal(await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, p), 'pointer');
  await shot(page, 'hover');
  // off the pieces: no hover, the orbit cursor is back
  const box = await page.locator('.stage').boundingBox();
  await page.mouse.move(box.x + 4, box.y + box.height - 4);
  await page.waitForFunction(() => !document.querySelector('.stage path.hover'), null, { timeout: 2000 });
  // the hover survives a redraw (selecting re-renders the SVG)
  await page.mouse.move(p.x, p.y);
  await page.waitForFunction(() => document.querySelector('.stage path.hover'), null, { timeout: 2000 });
  await page.click('[data-select-item="0"]');
  await page.mouse.move(p.x + 1, p.y);
  await page.waitForFunction(() => document.querySelector('.stage path.hover'), null, { timeout: 2000 });
  assert.deepEqual(await hovered(page), [2]);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('hover feedback in Realistic 3D: the piece under the pointer is tinted, and cleared on leave', async () => {
  const page = await open({ webgl: true });
  const p = await pointFor(page, 2);
  assert.ok(p, 'piece 2 is visible');
  await page.mouse.move(p.x, p.y);
  await page.waitForFunction(() => document.querySelector('.stage').t6viewer.shown().hovered === 2, null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.stage canvas')).cursor), 'pointer');
  await page.mouse.move(2, 2); // leave the stage
  await page.waitForFunction(() => document.querySelector('.stage').t6viewer.shown().hovered === null, null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.stage canvas')).cursor), 'grab');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('keyboard shortcuts work on a piece picked in the 3D view, not only on the plan', async () => {
  const page = await open();
  const items = () => page.evaluate(() => window.mimimaker.kit.items.length);
  const n = await items();
  const p = await pointFor(page, 1);
  await page.mouse.click(p.x, p.y);
  const x0 = await page.evaluate(() => window.mimimaker.kit.items[1].x);
  await page.keyboard.press('Shift+ArrowRight');
  assert.ok(await page.evaluate((x) => window.mimimaker.kit.items[1].x !== x, x0), 'arrow keys nudge it');
  await page.keyboard.press('d');
  assert.equal(await items(), n + 1, 'D duplicates it');
  await page.keyboard.press('Delete');
  assert.equal(await items(), n, 'Delete removes it');
  assert.deepEqual(await outlined(page), [], 'and the outline goes with it');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('clicking empty space in the 3D view clears the selection, as on the plan', async () => {
  const page = await open();
  const p = await pointFor(page, 1);
  await page.mouse.click(p.x, p.y);
  assert.deepEqual(await outlined(page), [1]);
  const box = await page.locator('.stage').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 70); // above the room
  assert.deepEqual(await outlined(page), [], 'outline cleared');
  assert.equal(await page.locator('#sidebar .insp-kind').first().textContent(), 'Room', 'inspector back on the room');
  await page.close();
});

test('Light step: pieces are not pickable in the room view (their inspector lives on Design)', async () => {
  const page = await open();
  await page.click('[data-step=light]');
  const p = await pointFor(page, 0);
  assert.ok(p, 'piece 0 is visible');
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(100);
  assert.deepEqual(await hovered(page), [], 'no hover outline');
  await page.mouse.click(p.x, p.y);
  assert.deepEqual(await outlined(page), [], 'no outline on a piece you can’t edit here');
  assert.equal(await page.locator('#sidebar .insp-kind').first().textContent(), 'Lighting');
  // picking a light from the list stays selected after a click in the room
  await page.click('[data-select-led="0"]');
  await page.mouse.click(p.x, p.y);
  assert.equal(await page.locator('#sidebar .insp-kind').first().textContent(), 'Light', 'the LED stays selected');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the Realistic 3D button looks pressed while it is on', async () => {
  const page = await open();
  const bg = () => page.locator('#renderer-toggle').evaluate((b) => getComputedStyle(b).backgroundColor);
  const off = await bg();
  await page.click('#renderer-toggle');
  assert.equal(await page.locator('#renderer-toggle').getAttribute('aria-pressed'), 'true');
  assert.notEqual(await bg(), off, 'pressed state is visible');
  await page.close();
});

test('Realistic 3D: zoom holds through redraws in the Light step', async () => {
  const page = await open({ webgl: true });
  await page.click('[data-step=light]');
  await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 15000 });
  const box = await page.locator('.stage canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  const zoom = async () => (await shown(page)).zoom;
  await page.waitForFunction(() => document.querySelector('.stage').t6viewer.shown().zoom > 1.2, null, { timeout: 10000 });
  const z = await zoom();
  await page.click('[data-select-led="0"]'); // redraws the room
  assert.equal(await zoom(), z, 'zoom kept after selecting a light');
  await page.locator('input[aria-label=Rotate]').fill('10'); // and after orbiting
  assert.equal(await zoom(), z, 'zoom kept after orbiting');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('3D shortcuts stay out of the way: not from a focused button, not in the Light step', async () => {
  const page = await open();
  const n = await page.evaluate(() => window.mimimaker.kit.items.length);
  await page.click('[data-select-item="1"]');
  await page.focus('#sidebar [data-action=back]'); // a focused button keeps its own keys
  const x0 = await page.evaluate(() => window.mimimaker.kit.items[1].x);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Backspace');
  assert.equal(await page.evaluate(() => window.mimimaker.kit.items.length), n, 'nothing removed from a focused button');
  assert.equal(await page.evaluate(() => window.mimimaker.kit.items[1].x), x0, 'nothing nudged');
  // a piece picked on Design isn't still selected, invisibly, on Light
  const p = await pointFor(page, 1);
  await page.mouse.click(p.x, p.y);
  await page.click('[data-step=light]');
  await page.locator('.stage').hover({ position: { x: 5, y: 5 } });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Delete');
  assert.equal(await page.evaluate(() => window.mimimaker.kit.items.length), n, 'Delete on Light removes nothing');
  await page.close();
});

test('a click in the 3D view off the pieces keeps a window picked from the list', async () => {
  const page = await open();
  assert.ok(await page.locator('[data-select-opening="0"]').count(), 'the starter room has a window');
  await page.locator('[data-select-opening="0"]').evaluate((b) => b.click()); // its section may be folded
  const kind = () => page.locator('#sidebar .insp-kind').first().textContent();
  const before = await kind();
  assert.notEqual(before, 'Room');
  for (const [fx, fy] of [[0.5, 0.09], [0.45, 0.3]]) { // above the room, and on the back wall
    const box = await page.locator('.stage').boundingBox();
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    assert.equal(await kind(), before, 'still on the window');
  }
  await page.close();
});

test('hover clears when the pieces change under it, and the stage keeps its grab cursor', async () => {
  const page = await open();
  const p = await pointFor(page, 2);
  await page.mouse.move(p.x, p.y);
  await page.waitForFunction(() => document.querySelector('.stage path.hover'), null, { timeout: 2000 });
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Delete'); // indexes shift: no other piece may inherit the hover
  assert.deepEqual(await hovered(page), []);
  assert.equal(await page.evaluate(() => document.querySelector('.stage').t6hover ?? null), null);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.stage .scene-svg')).cursor), 'grab');
  await page.close();
});
