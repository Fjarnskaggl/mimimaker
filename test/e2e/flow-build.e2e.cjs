// User journey: open the assembly guide, download it, then build step by step
// with progress that survives a reload. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

test('flow: read and download the guide, then build step by step and come back later', async () => {
  const page = await F.openApp(browser, URL, { viewport: { width: 1200, height: 900 } });
  const name = (await F.kit(page)).name;
  await page.click('[data-step=build]');
  await page.locator('.t4-mode').waitFor();

  // wide screens open on the printable guide, filled in for this kit
  if (!(await page.locator('.guide-frame').isVisible())) await page.click('.t4-mode [data-mode=guide]');
  const guide = page.frameLocator('.guide-frame');
  await guide.locator('body').waitFor();
  assert.match(await guide.locator('body').innerText(), new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the guide names the kit');
  assert.ok(await guide.locator('svg, img').count() > 3, 'the guide has pictures');
  const html = await F.download(page, () => page.locator('.guide-tools button', { hasText: 'Download guide' }).click());
  assert.match(html.name, /-guide\.html$/);
  assert.match(html.body.toString(), /<html/i);

  // step by step
  await page.click('.t4-mode [data-mode=steps]');
  await page.locator('.t4-build').waitFor();
  assert.equal(await page.locator('.guide-frame').isVisible(), false);
  const counter = page.locator('.t4-count');
  const total = Number((await counter.innerText()).match(/of (\d+)/)[1]);
  assert.match(await counter.innerText(), /^Step 1 of/);
  assert.ok(await page.locator('.t4-step .t4-exploded svg').first().isVisible(), 'step 1 shows its exploded view');

  // tick its parts: the step shows done and the summary counts it
  const boxes = page.locator('.t4-parts input[type=checkbox]');
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  assert.match(await page.locator('.t4-step').getAttribute('class'), /is-done/);
  assert.match(await page.locator('.t4-summary').innerText(), new RegExp(`1 of ${total} steps done`));

  // Next: a different step on screen, with its own picture
  await F.expectRedraw(page, '.t4-build', () => page.click('.t4-next'), 'Next step');
  assert.match(await counter.innerText(), /^Step 2 of/);
  await F.expectRedraw(page, '.t4-build', () => page.click('.t4-prev'), 'Previous step');
  await page.click('.t4-next');

  // come back later: same step, same ticks, same mode
  await page.reload();
  await F.ready(page);
  await page.click('[data-step=build]');
  await page.locator('.t4-build').waitFor();
  assert.match(await counter.innerText(), /^Step 2 of/);
  assert.match(await page.locator('.t4-summary').innerText(), new RegExp(`1 of ${total} steps done`));

  await F.shot(page, 'build');
  F.assertClean(page);
  await page.context().close();
});
