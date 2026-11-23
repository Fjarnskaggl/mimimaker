// T6 browser tests: WebGL viewer behind a toggle, with the SVG fallback.
// Run with: npm run test:e2e
//
// three.js loads from a pinned CDN build. Where the CDN can't be reached
// (e.g. a sandbox), point MIMI_THREE_JS at a local copy of the same file
// (three@0.128.0 build/three.min.js) and the tests serve it in its place.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

// Each e2e file runs its own server on a free port (helpers.cjs): files run in parallel.
const { startServer } = require('./helpers.cjs');
let URL, server, browser;
const CDN = /three(\.js\/r128|@0\.128\.0)\/.*three\.min\.js$/;

before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

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

test('WebGL viewer: board panels are solid, with real thickness; overlays stay flat', async () => {
  const page = await open();
  await switchOn(page);
  const s = await sample(page);
  const faces = await page.evaluate(() => window.mimimaker.compiled?.faces3d?.length ?? null);
  assert.ok(s.solids > 10, `solid panels: ${s.solids}`);
  assert.ok(s.flat > 0, `flat overlays: ${s.flat}`);
  assert.equal(s.solids + s.flat, s.meshes);
  if (faces != null) assert.equal(s.meshes, faces);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('WebGL viewer: walls and floor wear the room palette’s textures; the café gets brick', async () => {
  const page = await open();
  await switchOn(page);
  await page.waitForFunction(() => document.querySelector('.stage').t6viewer?.sample().texturesReady, null, { timeout: 10000 });
  const s = await sample(page);
  assert.ok(s.textured >= 4, `textured meshes: ${s.textured}`);
  // the reading nook's palette: sprig wallpaper and plank floor (raw finishes alone don't count)
  for (const id of ['wallpaper-sprig', 'wood-planks']) assert.ok(s.textures.includes(id), `${id} in ${s.textures}`);
  // switch to the café: its walls are brick
  await page.locator('.rt-card[aria-label="Start from Little café"]').evaluate((e) => { e.click(); e.click(); });
  await page.waitForFunction(() => document.querySelector('.stage').t6viewer?.sample().textures.includes('brick'), null, { timeout: 10000 });
  // the SVG preview is untouched by textures
  await page.click('#renderer-toggle');
  assert.equal(await page.locator('.stage svg.scene-svg image, .stage svg.scene-svg pattern').count(), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('WebGL viewer: every mesh but the LED glows wears a texture, in each room type and a shell (raw board, card and felt where nothing prints)', async () => {
  const page = await open();
  await switchOn(page);
  const check = async (what) => {
    await page.waitForFunction(() => document.querySelector('.stage').t6viewer?.sample().texturesReady, null, { timeout: 15000 });
    const s = await sample(page);
    assert.equal(s.untextured, 0, `${what}: ${s.untextured} of ${s.meshes} meshes have no texture`);
    return s;
  };
  const first = await check('reading nook');
  for (const id of ['chipboard', 'wood-grain', 'card-fibre', 'felt']) assert.ok(first.textures.includes(id), `${id} in ${first.textures}`);
  for (const id of ['cafe', 'bakery', 'music-room']) {
    await page.locator(`.rt-card[data-room="${id}"]`).evaluate((e) => { e.click(); e.click(); });
    await page.waitForFunction((rt) => window.mimimaker.kit.roomType === rt, id);
    await check(id);
  }
  await page.locator('[data-panel=shell] select[data-shell=type]').selectOption('twostorey');
  await page.waitForFunction(() => window.mimimaker.kit.shell?.type === 'twostorey');
  await check('two-storey shell');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('texture picker: change the floor, switch a texture off, undo; only shown with Realistic 3D', async () => {
  const page = await open();
  await page.click('[data-step=design]');
  await page.click('[data-view="3d"]');
  assert.equal(await page.locator('#texture-picker').isVisible(), false, 'hidden in the SVG preview');
  await switchOn(page);
  // a "Textures" section in the Design inspector
  await page.waitForSelector('#sidebar #texture-picker', { state: 'visible' });
  assert.match(await page.locator('#texture-picker summary').innerText(), /Textures/);
  const floorMat = await page.evaluate(() => window.mimimaker.kit.room.floor.material);
  const floor = page.locator(`#texture-picker select[data-material="${floorMat}"]`);
  assert.equal(await floor.inputValue(), '', 'follows the room palette');
  const textures = () => page.evaluate(() => document.querySelector('.stage').t6viewer.sample().textures);
  const before = await page.evaluate(() => document.querySelector('.stage').t6viewer.sample().textured);

  await floor.selectOption('tiles');
  await page.waitForFunction(() => document.querySelector('.stage').t6viewer.sample().textures.includes('tiles'));
  assert.deepEqual(await page.evaluate((m) => window.mimimaker.kit.look.textures[m], floorMat), { id: 'tiles' });

  await floor.selectOption('none');
  // no printed pattern: the floor shows its plain cardstock instead
  await page.waitForFunction(() => !document.querySelector('.stage').t6viewer.sample().textures.includes('tiles'));
  assert.equal(await page.evaluate(() => document.querySelector('.stage').t6viewer.sample().textured), before, 'still textured, as plain card');

  // undo goes back to tiles, and the picker follows
  await page.waitForTimeout(500); // let the edit settle into its own undo step
  await page.click('#btn-undo');
  await page.waitForFunction(() => document.querySelector('.stage').t6viewer.sample().textures.includes('tiles'));
  assert.equal(await floor.inputValue(), 'tiles');

  await page.click('#renderer-toggle');
  assert.equal(await page.locator('#texture-picker').isVisible(), false);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('texture picker: its selects fit the screen at phone width', async () => {
  const page = await open();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-step=design]');
  await page.click('[data-view="3d"]');
  await switchOn(page);
  await page.waitForSelector('#texture-picker', { state: 'visible' });
  const selects = await page.locator('#texture-picker select').all();
  assert.ok(selects.length >= 2);
  for (const sel of selects) {
    await sel.scrollIntoViewIfNeeded();
    const b = await sel.boundingBox();
    assert.ok(b.x >= 0 && b.x + b.width <= 390, `select spans ${b.x.toFixed(0)}…${(b.x + b.width).toFixed(0)} of 390 px`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'no sideways scroll');
  assert.deepEqual(page.errors, []);
  await page.close();
});

// Click a piece in 3D: the inspector opens on it, like clicking it on the plan.
async function clickPiece(page, index) {
  const pt = await page.evaluate((i) => document.querySelector('.stage').t6pickPoint(i), index);
  assert.ok(pt, `piece ${index} has a clickable spot`);
  await page.mouse.click(pt.x, pt.y);
}
const inspectorTitle = (page) => page.locator('#sidebar .insp-title').first().innerText();

test('click to select in the SVG preview: the inspector opens on the piece and it is outlined', async () => {
  const page = await open();
  await page.click('[data-step=design]');
  await page.click('[data-view="3d"]');
  assert.equal(await inspectorTitle(page), 'The room');
  await clickPiece(page, 1); // armchair
  assert.equal(await inspectorTitle(page), 'Armchair');
  assert.ok(await page.locator('.stage svg path.sel[data-item="1"]').count() > 0, 'outlined');
  await clickPiece(page, 0);
  assert.equal(await inspectorTitle(page), 'Bookshelf');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('click to select in Realistic 3D; a drag orbits instead of selecting', async () => {
  const page = await open();
  await page.click('[data-step=design]');
  await page.click('[data-view="3d"]');
  await switchOn(page);
  // a drag that starts on a piece orbits and selects nothing
  const pt = await page.evaluate(() => document.querySelector('.stage').t6pickPoint(1));
  const yaw0 = Number(await page.locator('input[aria-label=Rotate]').inputValue());
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(pt.x + 80, pt.y, { steps: 5 });
  await page.mouse.up();
  assert.notEqual(Number(await page.locator('input[aria-label=Rotate]').inputValue()), yaw0, 'orbited');
  assert.equal(await inspectorTitle(page), 'The room', 'nothing selected');
  // a click selects
  await clickPiece(page, 1);
  assert.equal(await inspectorTitle(page), 'Armchair');
  assert.equal(await page.evaluate(() => document.querySelector('.stage').t6viewer.sample().selected), 1, 'highlighted');
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
  // moonlight through the window: one shadow-casting light per window, at night only
  assert.equal(day.windowLights, 0);
  assert.equal(night.windowLights, 1, 'the reading nook has one window');
  assert.equal(night.windowShadows, true);
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
