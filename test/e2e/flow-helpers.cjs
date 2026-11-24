// Helpers for the user-journey flow tests (test/e2e/flow-*.e2e.cjs).
//
// The flows drive the app the way a person does: with the mouse and keyboard
// on what is on screen. After each step they check that the screen itself
// answered, not only that window.mimimaker.kit changed. A bug where a click
// changed the state but the view only redrew after the next orbit would pass a
// state check and still leave someone stuck; a screenshot check catches it.
//
// To stay deterministic (these tests gate merges):
// - every page gets a fresh browser context: no storage carries over;
// - web fonts are stubbed with an empty stylesheet, so layout never depends on
//   the network or on when a font arrives;
// - three.js loads from MIMI_THREE_JS when it is set (CI sets it), so the
//   Realistic 3D view never waits on the CDN;
// - animations are off and the text caret is hidden in screenshots, and every
//   "before" picture is taken only once two pictures in a row agree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const THREE_CDN = /three(\.js\/r128|@0\.128\.0)\/.*three\.min\.js$/;
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const SHOT_STYLE = '.toasts{visibility:hidden!important} *{caret-color:transparent!important}';

/**
 * Open the studio in a fresh context. Returns the page; page.problems() lists
 * every page error, console error and failed request seen so far.
 * opts: { webgl, viewport, url, prefs: { localStorageKey: value } }
 */
async function openApp(browser, url, { webgl = false, viewport = { width: 1400, height: 900 }, prefs = {}, context } = {}) {
  const ctx = context || await browser.newContext({ viewport, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await ctx.newPage();
  await wire(page, { webgl, prefs });
  await page.goto(url);
  await ready(page);
  if (webgl) await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 20000 });
  return page;
}

/** Routes and listeners for a page; safe to call on any page in a flow context. */
async function wire(page, { webgl = false, prefs = {} } = {}) {
  const problems = [];
  page.problems = () => problems.slice();
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('dialog', (d) => { problems.push(`unexpected dialog: ${d.message()}`); d.dismiss().catch(() => {}); });
  await page.route(FONTS, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (process.env.MIMI_THREE_JS) {
    const body = fs.readFileSync(process.env.MIMI_THREE_JS);
    await page.route(THREE_CDN, (r) => r.fulfill({ body, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  }
  const store = { 'mimimaker.t6.webgl': webgl ? '1' : '0', ...prefs };
  // Only seed preferences the first time this origin loads, so a reload keeps
  // whatever the person changed.
  await page.addInitScript((s) => {
    try {
      if (sessionStorage.getItem('flow.seeded')) return;
      sessionStorage.setItem('flow.seeded', '1');
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch { /* */ }
  }, store);
}

/** Wait for the app to be up. */
async function ready(page) {
  await page.waitForFunction(() => window.mimimaker?.kit && document.querySelector('#view')?.children.length, null, { timeout: 15000 });
  await frames(page, 2);
}

/** Wait for n animation frames. */
const frames = (page, n = 2) => page.evaluate((k) => new Promise((res) => {
  const step = (i) => (i <= 0 ? res() : requestAnimationFrame(() => step(i - 1)));
  step(k);
}), n);

const target = (page, where) => (typeof where === 'string' ? page.locator(where).first() : where);
const shoot = (page, where) => target(page, where).screenshot({ animations: 'disabled', caret: 'hide', style: SHOT_STYLE, timeout: 15000 });

/** Decode a Playwright PNG (8-bit RGB/RGBA, not interlaced) to { width, height, channels, data }. */
function decodePng(buf) {
  let p = 8, width = 0, height = 0, channels = 4;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(p + 8); height = buf.readUInt32BE(p + 12);
      const [depth, color, , , interlace] = buf.subarray(p + 16, p + 21);
      assert.ok(depth === 8 && (color === 2 || color === 6) && !interlace, 'an 8-bit RGB(A) PNG');
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels, data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[dst + x - channels] : 0, b = y ? data[dst - stride + x] : 0, c = x >= channels && y ? data[dst - stride + x - channels] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      data[dst + x] = v & 255;
    }
  }
  return { width, height, channels, data };
}

/**
 * How many pixels differ visibly between two screenshots (colour distance over
 * a small threshold). Anti-aliasing can wobble a few pixels between identical
 * frames on a busy machine, so callers compare against PIXEL_NOISE, never 0.
 */
function pixelDiff(a, b) {
  if (a.equals(b)) return 0;
  const A = decodePng(a), B = decodePng(b);
  if (A.width !== B.width || A.height !== B.height) return Infinity;
  let n = 0;
  for (let i = 0, j = 0; i < A.data.length; i += A.channels, j += B.channels) {
    if (Math.abs(A.data[i] - B.data[j]) + Math.abs(A.data[i + 1] - B.data[j + 1]) + Math.abs(A.data[i + 2] - B.data[j + 2]) > 24) n++;
  }
  return n;
}
/** At most this many pixels may differ between two pictures of the same thing. */
const PIXEL_NOISE = 12;
/** A visible response changes more than this many pixels. */
const PIXEL_CHANGE = 40;
const looksSame = (a, b) => pixelDiff(a, b) <= PIXEL_NOISE;

/** A picture of `where` once it has stopped changing (two shots in a row agree). */
async function settled(page, where, { timeout = 5000 } = {}) {
  const end = Date.now() + timeout;
  let last = await shoot(page, where);
  for (;;) {
    await frames(page, 2);
    const next = await shoot(page, where);
    if (looksSame(next, last)) return next;
    // a view that never stops changing would make every redraw check pass
    if (Date.now() > end) assert.fail(`${typeof where === 'string' ? where : 'the view'} kept changing for ${timeout} ms without any input`);
    last = next;
  }
}

/**
 * Do `action` and assert that `where` visibly changes on its own, without any
 * further input, within `within` ms. Returns the new picture.
 */
async function expectRedraw(page, where, action, what, { within = 3000, before } = {}) {
  const was = before || await settled(page, where);
  await action();
  const end = Date.now() + within;
  for (;;) {
    await frames(page, 1);
    const now = await shoot(page, where);
    if (pixelDiff(now, was) > PIXEL_CHANGE) return settled(page, where);
    if (Date.now() > end) assert.fail(`the screen did not change after: ${what}`);
  }
}

/** Do `action` and assert that `where` looks the same afterwards. */
async function expectSteady(page, where, action, what) {
  const was = await settled(page, where);
  await action();
  const now = await settled(page, where);
  const n = pixelDiff(now, was);
  assert.ok(n <= PIXEL_NOISE, `the screen changed after: ${what} (${n} pixels)`);
  return now;
}

/** Assert no errors so far, then forget them. */
function assertClean(page, when = '') {
  const p = page.problems();
  assert.deepEqual(p, [], `problems${when ? ` ${when}` : ''}:\n${p.join('\n')}`);
}

/** A screenshot for reviewers when SHOT_DIR is set. */
async function shot(page, name) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `flow-${name}.png`) });
}

const kit = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.mimimaker.kit)));
const inspectorKind = (page) => page.locator('#sidebar .insp-kind').first().innerText();
const inspectorTitle = (page) => page.locator('#sidebar .insp-title').first().innerText();

/** A point where piece `i` is the front-most thing in the room view, or null. */
const pickPoint = (page, i) => page.evaluate((k) => document.querySelector('.stage').t6pickPoint(k), i);

/** Run a download-triggering action; returns { name, body }. */
async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), action()]);
  const file = await dl.path();
  return { name: dl.suggestedFilename(), body: fs.readFileSync(file) };
}

/** File names inside a zip (reads the central directory). */
function zipNames(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'a zip file');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < n; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'zip central directory entry');
    const len = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + len));
    p += 46 + len + extra + comment;
  }
  return names;
}

module.exports = {
  openApp, wire, ready, frames, settled, pixelDiff, looksSame, expectRedraw, expectSteady, assertClean, shot,
  kit, inspectorKind, inspectorTitle, pickPoint, download, zipNames,
};
