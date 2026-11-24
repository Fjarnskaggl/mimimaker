// Property-style sweep over every control a person can set (the inspector on
// Design and Light, and the Make page). For each one:
//   - changing it changes the design (no field that does nothing);
//   - setting it back gives the design back (a toggle's side effects undo);
//   - Undo after a change gives the same design as setting it back, and the
//     control shows the old value again; Redo gives the change back;
//   - a reload keeps everything.
// Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

// Controls in a context, in page order. Skips the stage (view, not design),
// hidden ones, and on Make all but the first material (the rows are alike).
const LIST = (scope) => [...document.querySelectorAll(`${scope} input, ${scope} select`)].filter((e) => {
  if (e.type === 'file' || e.readOnly || e.disabled || e.closest('.stage-wrap, .stage')) return false;
  const row = e.closest('[data-material]');
  if (row && row.dataset.material !== document.querySelector('.mat-row[data-material]')?.dataset.material) return false;
  for (let x = e; x && x !== document.body; x = x.parentElement) {
    if (getComputedStyle(x).display === 'none' && !(x.parentElement?.tagName === 'DETAILS')) return false;
  }
  return true;
});
async function controls(page, scope) {
  return page.evaluate(({ src, scope }) => (0, eval)(src)(scope).map((e) => ({
    label: (e.getAttribute('aria-label') || e.closest('label')?.textContent || '').trim().slice(0, 40),
    tag: e.tagName, type: e.type, value: e.type === 'checkbox' ? e.checked : e.value,
    options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.value) : null, step: e.step, max: e.max,
  })), { src: LIST.toString(), scope });
}
async function at(page, scope, i) {
  const h = await page.evaluateHandle(({ src, scope, i }) => {
    const e = (0, eval)(src)(scope)[i];
    for (let x = e?.parentElement; x; x = x.parentElement) if (x.tagName === 'DETAILS') x.open = true;
    return e;
  }, { src: LIST.toString(), scope, i });
  return h.asElement();
}
async function set(el, c, back) {
  if (c.type === 'checkbox') return el.click();
  if (c.tag === 'SELECT') return el.selectOption(back ? c.value : c.options.find((o) => o !== c.value));
  let v;
  if (c.type === 'color') v = back ? c.value : '#123456';
  else if (c.type === 'number') {
    const st = parseFloat(c.step) || 1, cur = parseFloat(c.value) || 0;
    v = back ? c.value : String(c.max !== '' && cur + 3 * st > +c.max ? cur - 3 * st : cur + 3 * st);
  } else v = back ? c.value : `${c.value}x`;
  // typed, then the field is left, the way a person does it
  await el.evaluate((e, val) => {
    e.focus(); e.value = val;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
}

// Same design? Defaults the control showed may be written out (undefined ->
// the shown value), and null or {} count as nothing.
const tidy = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x === null || (x && typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length) ? undefined : x)));
function differences(a, b, shown, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const obj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (a === undefined && obj(b)) a = {};
  if (b === undefined && obj(a)) b = {};
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => differences(a[k], b[k], shown, `${p}.${k}`));
  }
  if ((a === undefined && String(b) === String(shown)) || (b === undefined && String(a) === String(shown))) return [];
  return [`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
}
const same = (a, b, shown) => differences(tidy(a), tidy(b), shown);
const settle = (page) => page.waitForTimeout(420); // past the 400 ms that makes typing one undo step

async function sweep(page, name, scope, reopen = async () => {}) {
  const problems = [];
  const list = await controls(page, scope);
  assert.ok(list.length, `${name}: has controls`);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const tag = `${name} › ${c.label || c.type} (#${i})`;
    const before = await F.kit(page);
    await set(await at(page, scope, i), c, false); await settle(page);
    const changed = await F.kit(page);
    if (!same(before, changed, c.value).length) problems.push(`${tag}: changing it changes nothing`);
    // a choice can add or remove fields (a shell's own settings): find it again by its label
    let j = i;
    const now = await controls(page, scope);
    if (now[i]?.label !== c.label) j = now.findIndex((x) => x.label === c.label && x.tag === c.tag);
    if (j < 0) { problems.push(`${tag}: the control is gone after a change`); continue; }
    await set(await at(page, scope, j), c, true); await settle(page);
    const back = await F.kit(page);
    for (const d of same(before, back, c.value)) problems.push(`${tag}: setting it back leaves ${d}`);
    // undo after the same change: the same design, and the control shows its old value
    await set(await at(page, scope, i), c, false); await settle(page);
    await page.click('#btn-undo'); await settle(page);
    for (const d of same(back, await F.kit(page), c.value)) problems.push(`${tag}: Undo differs from setting it back: ${d}`);
    const shown = (await controls(page, scope))[i];
    if (shown?.label === c.label && String(shown.value) !== String(c.value)) problems.push(`${tag}: after Undo the control shows ${shown.value}, not ${c.value}`);
    await page.click('#btn-redo'); await settle(page);
    for (const d of same(changed, await F.kit(page), c.value)) problems.push(`${tag}: Redo differs from the change: ${d}`);
    await page.click('#btn-undo'); await settle(page);
  }
  // and a reload keeps the design exactly
  const want = await F.kit(page);
  await page.reload(); await F.ready(page);
  assert.deepEqual(await F.kit(page), want, `${name}: a reload keeps the design`);
  await reopen();
  return problems;
}

async function bedroom() {
  const page = await F.openApp(browser, URL);
  await page.click('#btn-file'); await page.click('#btn-new');
  await page.click('.rt-card[data-room=bedroom]');
  await page.waitForFunction(() => window.mimimaker.kit.roomType === 'bedroom');
  return page;
}
const pick = (page, sel) => page.evaluate((q) => document.querySelector(q).click(), sel);

test('roundtrip: every Design control sets back, undoes, redoes and reloads cleanly', async () => {
  const page = await bedroom();
  const problems = [];
  problems.push(...await sweep(page, 'Room', '#sidebar'));
  await pick(page, '[data-select-item="0"]');
  problems.push(...await sweep(page, 'Piece', '#sidebar'));
  await page.keyboard.press('Escape');
  await pick(page, '[data-select-opening="0"]');
  problems.push(...await sweep(page, 'Window', '#sidebar'));
  assert.deepEqual(problems, []);
  F.assertClean(page);
  await page.context().close();
});

test('roundtrip: every Light control sets back, undoes, redoes and reloads cleanly', async () => {
  const page = await bedroom();
  await page.click('[data-step=light]');
  const problems = [];
  problems.push(...await sweep(page, 'Lighting', '#sidebar', () => page.click('[data-step=light]')));
  await pick(page, '[data-select-led="0"]');
  problems.push(...await sweep(page, 'Light', '#sidebar'));
  assert.deepEqual(problems, []);
  F.assertClean(page);
  await page.context().close();
});

test('roundtrip: every Make control sets back, undoes, redoes and reloads cleanly', async () => {
  const page = await bedroom();
  await page.click('[data-step=make]');
  await page.locator('.sheet-card').first().waitFor();
  await pick(page, 'button[title^="Machine settings"]');
  const problems = await sweep(page, 'Make', '#view');
  assert.deepEqual(problems, []);
  F.assertClean(page);
  await page.context().close();
});

test('roundtrip: Undo on Make keeps the Advanced panel and a material\'s settings open', async () => {
  const page = await bedroom();
  await page.click('[data-step=make]');
  await page.locator('details.more summary', { hasText: 'Advanced' }).click();
  await page.locator('details.more summary', { hasText: 'Materials' }).click();
  await pick(page, 'button[title^="Machine settings"]');
  const id = await page.getAttribute('.mat-settings', 'data-material');
  await page.locator('details.more', { hasText: 'Advanced' }).locator('input[type=number]').first().fill('4');
  await settle(page);
  await page.click('#btn-undo');
  await page.waitForFunction(() => window.mimimaker.kit.fingerWidth !== 4);
  assert.ok(await page.locator('details.more', { hasText: 'Advanced' }).evaluate((d) => d.open), 'Advanced stays open');
  assert.equal(await page.getAttribute('.mat-settings', 'data-material'), id, 'the material\'s settings stay open');
  F.assertClean(page);
  await page.context().close();
});

test('roundtrip: a saved file opened again is the same room, build progress included', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const page = await bedroom();
  const id = (await F.kit(page)).id;
  await page.click('#btn-file');
  const saved = await F.download(page, () => page.click('#btn-save'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-'));
  const file = path.join(dir, saved.name);
  fs.writeFileSync(file, saved.body);
  await page.click('#btn-file'); await page.click('#btn-new');
  await page.click('.rt-card[data-room=kitchen]');
  await page.waitForFunction(() => window.mimimaker.kit.roomType === 'kitchen');
  await page.setInputFiles('#file-open', file);
  await page.waitForFunction(() => window.mimimaker.kit.roomType === 'bedroom');
  assert.equal((await F.kit(page)).id, id, 'the room keeps its id, which its build progress is saved under');
  fs.rmSync(dir, { recursive: true, force: true });
  F.assertClean(page);
  await page.context().close();
});

test('roundtrip: a whole-scene shell\'s controls, and Light under it, set back, undo, redo and reload cleanly', async () => {
  const page = await bedroom();
  await page.selectOption('select[data-shell=type]', 'alley');
  await page.waitForFunction(() => window.mimimaker.kit.shell?.type === 'alley');
  await settle(page);
  const problems = [];
  problems.push(...await sweep(page, 'Alley', '#sidebar [data-panel=shell]'));
  await page.click('[data-step=light]');
  problems.push(...await sweep(page, 'Alley lighting', '#sidebar'));
  assert.deepEqual(problems, []);
  F.assertClean(page);
  await page.context().close();
});
