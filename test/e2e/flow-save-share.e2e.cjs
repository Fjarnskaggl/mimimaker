// User journey: change a design, then get it back three ways: a reload, a
// saved file opened in a fresh browser, and a share link opened by someone
// else. Each must show the same room, not just hold the same data.
// Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

const STAGE = '.stage';
/** The room as a person sees it: the 3D view with nothing hovered or picked. */
async function roomPicture(page) {
  await page.click('[data-step=design]');
  await page.click('[data-view="3d"]');
  await page.mouse.move(1, 1);
  const back = page.locator('#sidebar [data-action=back]');
  if (await back.count()) await back.click();
  return F.settled(page, STAGE);
}
const designOf = (k) => ({ name: k.name, room: k.room, items: k.items, openings: k.openings, lighting: k.lighting });

test('flow: a changed design survives a reload, a saved file and a share link', async () => {
  const page = await F.openApp(browser, URL);

  // change it the way a person would
  await page.locator('#kit-name').fill('Flow Test Studio');
  await page.click('#rail-pieces');
  await page.click('.piece[data-piece="table"]');
  await page.click('#drawer [data-action=close]');
  await page.click('[data-view=plan]');
  const n = (await F.kit(page)).items.length - 1;
  await page.click(`.plan-item[data-index="${n}"]`);
  await page.keyboard.press('r');
  await page.keyboard.press('Shift+ArrowDown');
  await page.click('[data-step=light]');
  await page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Lights' }) }).locator('button', { hasText: /^Wall$/ }).click();
  const want = designOf(await F.kit(page));
  const picture = await roomPicture(page);

  // 1. reload: the same room comes back, drawn the same
  await page.reload();
  await F.ready(page);
  assert.equal(await page.locator('#kit-name').inputValue(), 'Flow Test Studio');
  assert.deepEqual(designOf(await F.kit(page)), want, 'reload keeps the design');
  assert.ok(F.looksSame(await roomPicture(page), picture), 'reload shows the same room');

  // 2. Save as a file, then open it in a fresh browser
  await page.click('#btn-file');
  const saved = await F.download(page, () => page.click('#btn-save'));
  assert.match(saved.name, /\.json$/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-'));
  const file = path.join(dir, saved.name);
  fs.writeFileSync(file, saved.body);
  const other = await F.openApp(browser, URL);
  assert.notEqual((await F.kit(other)).name, 'Flow Test Studio');
  await other.click('#btn-file');
  await other.setInputFiles('#file-open', file);
  await other.waitForFunction(() => window.mimimaker.kit.name === 'Flow Test Studio');
  assert.equal(await other.locator('#kit-name').inputValue(), 'Flow Test Studio', 'the header shows the opened kit');
  assert.deepEqual(designOf(await F.kit(other)), want, 'the file opens the same design');
  assert.ok(F.looksSame(await roomPicture(other), picture), 'the opened file shows the same room');
  F.assertClean(other, 'opening the saved file');
  fs.rmSync(dir, { recursive: true, force: true });
  await other.context().close();

  // 3. Share link: someone else opens it and sees the same room
  await page.click('#btn-share');
  await page.waitForFunction(() => document.querySelector('#share-url').value.includes('#kit='), null, { timeout: 5000 });
  assert.ok(await page.locator('#share-pop').isVisible());
  assert.notEqual(await page.locator('#share-summary').innerText(), '', 'the share box sums up the design');
  const link = await page.locator('#share-url').inputValue();
  await page.click('#share-close');
  const friend = await F.openApp(browser, link);
  await friend.waitForFunction(() => window.mimimaker.kit.name === 'Flow Test Studio');
  await friend.locator('.mm-toast').first().waitFor({ timeout: 3000 }); // a toast says what was opened (it goes after 4 s)
  assert.equal(await friend.evaluate(() => location.hash), '', 'the link’s hash is cleared');
  assert.deepEqual(designOf(await F.kit(friend)), want, 'the link opens the same design');
  assert.ok(F.looksSame(await roomPicture(friend), picture), 'the link shows the same room');
  // the friend's copy is their own: a change there doesn't touch ours
  await friend.locator('#kit-name').fill('Friend copy');
  assert.equal((await F.kit(page)).name, 'Flow Test Studio');
  F.assertClean(friend, 'opening the share link');
  await friend.context().close();

  F.assertClean(page);
  await page.context().close();
});
