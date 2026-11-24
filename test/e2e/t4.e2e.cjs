// T4 build companion: step-by-step build mode on the Build step.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const { startServer } = require('./helpers.cjs');

let URL, server, browser;
before(async () => {
  server = await startServer();
  URL = server.url;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

// Wide screens open the Build step on the printable guide; `steps: true`
// switches to step-by-step first. Phones open on step-by-step by default.
async function openBuild(context, { steps = true } = {}) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit, null, { timeout: 8000 });
  await page.click('[data-step=build]');
  await page.waitForSelector('.t4-mode');
  if (steps && !(await page.locator('.t4-build').isVisible())) await page.click('.t4-mode [data-mode=steps]');
  if (steps) await page.waitForSelector('.t4-build');
  return page;
}

test('build mode: one step at a time, ticking parts completes a step, progress survives a reload', async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await openBuild(context);
  const counter = page.locator('.t4-count');
  assert.match(await counter.innerText(), /^Step 1 of (\d+)$/);
  const total = Number((await counter.innerText()).match(/of (\d+)/)[1]);
  assert.ok(total > 10);
  assert.equal(await page.locator('.t4-title').innerText(), 'Build the room box');
  assert.equal(await page.locator('.t4-build .t4-step').count(), 1, 'only one step shown');

  // tick every part of step 1 → it is done
  const boxes = page.locator('.t4-parts input[type=checkbox]');
  assert.ok((await boxes.count()) >= 4);
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  assert.match(await page.locator('.t4-step').getAttribute('class'), /is-done/);
  assert.match(await page.locator('.t4-summary').innerText(), new RegExp(`1 of ${total} steps done`));

  await page.click('.t4-next');
  assert.equal(await counter.innerText(), `Step 2 of ${total}`);

  // reload: same step, same ticks
  await page.reload();
  await page.waitForFunction(() => window.mimimaker?.kit);
  await page.click('[data-step=build]');
  await page.waitForSelector('.t4-build');
  assert.equal(await page.locator('.t4-count').innerText(), `Step 2 of ${total}`);
  await page.click('.t4-prev');
  assert.match(await page.locator('.t4-step').getAttribute('class'), /is-done/);
  assert.equal(await page.locator('.t4-parts input:checked').count(), await page.locator('.t4-parts input').count());

  // "Done — next" on a step with no parts ticked also completes it
  await page.click('.t4-next');
  await page.click('.t4-done');
  assert.equal(await counter.innerText(), `Step 3 of ${total}`);
  assert.match(await page.locator('.t4-summary').innerText(), new RegExp(`2 of ${total} steps done`));

  // start over clears it
  page.once('dialog', (d) => d.accept());
  await page.click('.t4-reset');
  assert.equal(await counter.innerText(), `Step 1 of ${total}`);
  assert.match(await page.locator('.t4-summary').innerText(), new RegExp(`0 of ${total} steps done`));
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('build mode: glue timer counts down', async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.addInitScript(() => { window.__t4Speed = 600; }); // glue clock runs 600× fast: 30 min in 3 s
  const page = await openBuild(context);
  assert.match(await page.locator('.t4-timer').innerText(), /30 min/);
  await page.click('.t4-timer button');
  await page.waitForFunction(() => /\d+:\d\d left/.test(document.querySelector('.t4-timer').innerText));
  await page.waitForFunction(() => /Glue set/.test(document.querySelector('.t4-timer').innerText), null, { timeout: 8000 });
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('build mode: wide screens open on the printable guide; the choice is remembered', async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await openBuild(context, { steps: false });
  assert.equal(await page.locator('.guide-frame').isVisible(), true, 'guide first on a wide screen');
  assert.equal(await page.locator('.t4-build').isVisible(), false);
  await page.click('.t4-mode [data-mode=steps]');
  assert.equal(await page.locator('.t4-build').isVisible(), true);
  assert.equal(await page.locator('.guide-frame').isVisible(), false);
  await page.reload();
  await page.waitForFunction(() => window.mimimaker?.kit);
  await page.click('[data-step=build]');
  await page.waitForSelector('.t4-mode');
  assert.equal(await page.locator('.t4-build').isVisible(), true, 'step-by-step remembered');
  await page.click('.t4-mode [data-mode=guide]');
  assert.equal(await page.locator('.guide-frame').isVisible(), true);
  assert.equal(await page.locator('.t4-build').isVisible(), false);
  await context.close();
});

test('build mode fits a phone: big tap targets, no sideways scrolling', async () => {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await openBuild(context, { steps: false });
  assert.equal(await page.locator('.t4-build').isVisible(), true, 'phones open on step-by-step');
  assert.equal(await page.locator('.guide-frame').isVisible(), false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `page is ${overflow}px too wide`);
  for (const sel of ['.t4-next', '.t4-prev', '.t4-done', '.t4-parts label']) {
    const box = await page.locator(sel).first().boundingBox();
    assert.ok(box.height >= 44, `${sel} is ${box.height}px tall`);
  }
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/t4-build-phone.png` });
  await context.close();
});

test('build mode: bill of materials with cost, difficulty and time', async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await openBuild(context);
  const bom = page.locator('.t4-bom');
  const summary = await bom.locator('summary').innerText();
  assert.match(summary, /\$\d+\.\d\d–\d+\.\d\d/, 'estimated cost');
  assert.match(summary, /Beginner|Intermediate|Advanced/);
  assert.match(summary, /\d+ h|\d+ min/);
  await bom.locator('summary').click();
  const text = await bom.innerText();
  assert.match(text, /Chipboard 2\.0 mm sheet/);
  assert.match(text, /PVA/);
  assert.match(text, /micro LED/);
  // stays open while moving between steps
  await page.click('.t4-next');
  assert.equal(await bom.evaluate((d) => d.open), true);
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('build mode: each step shows its exploded view', async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await openBuild(context);
  const fig = page.locator('.t4-step .t4-exploded svg');
  assert.equal(await fig.count(), 1);
  assert.match(await fig.getAttribute('aria-label'), /^Exploded view of step 1: Build the room box/);
  const box = await fig.boundingBox();
  assert.ok(box.width > 150 && box.height > 100, 'big enough to read');
  await page.click('.t4-next');
  assert.match(await page.locator('.t4-step .t4-exploded svg').getAttribute('aria-label'), /^Exploded view of step 2:/);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/t4-exploded.png`, fullPage: true });
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('renaming the room mid-build keeps the ticked steps', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openBuild(context);
  const boxes = page.locator('.t4-parts input[type=checkbox]');
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  assert.match(await page.locator('.t4-summary').innerText(), /^1 of \d+ steps done/m);
  await page.focus('#kit-name');
  await page.keyboard.press('End');
  await page.keyboard.type(' for Gran');
  await page.waitForSelector('.t4-build');
  assert.match(await page.locator('.t4-summary').innerText(), /1 of \d+ steps done/, 'ticks survive the rename');
  await page.reload();
  await page.click('[data-step=build]');
  if (!(await page.locator('.t4-build').isVisible())) await page.click('.t4-mode [data-mode=steps]');
  assert.match(await page.locator('.t4-summary').innerText(), /1 of \d+ steps done/, 'and a reload');
  // a new room from Start doesn't inherit them, even with the same steps
  await page.evaluate(() => { document.querySelector('#btn-new').click(); document.querySelector('#start-blank').click(); });
  await page.evaluate(() => { document.querySelector('#btn-new').click(); document.querySelector('#start .rt-card[data-room]').click(); });
  await page.click('[data-step=build]');
  if (!(await page.locator('.t4-build').isVisible())) await page.click('.t4-mode [data-mode=steps]');
  assert.match(await page.locator('.t4-summary').innerText(), /0 of \d+ steps done/, 'a new room starts fresh');
  await context.close();
});
