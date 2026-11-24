// User journey: arrange furniture in the floor plan, the sketch 3D view and
// Realistic 3D, the way a person does it, checking at every step that the
// screen answers at once. Run with: npm run test:e2e
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

const STAGE = '.stage';

test('flow: add a piece, then select, move, rotate, delete and undo it on the floor plan', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('[data-view=plan]');
  const plan = '.plan-canvas';
  const count = (await F.kit(page)).items.length;

  // add a table from the drawer: it shows on the plan and in the inspector
  await page.click('#rail-pieces');
  await F.expectRedraw(page, plan, () => page.click('.piece[data-piece="table"]'), 'adding a table');
  await page.click('#drawer [data-action=close]');
  const i = count;
  assert.equal((await F.kit(page)).items.length, count + 1);
  assert.equal(await page.locator(`.plan-item[data-index="${i}"]`).count(), 1, 'the table is drawn on the plan');
  assert.match(await F.inspectorTitle(page), /table/i, 'the inspector opens on the table');

  // click empty floor: the selection highlight goes and the inspector returns to the room
  const svg = await page.locator(`${plan} svg`).boundingBox();
  await F.expectRedraw(page, plan, () => page.mouse.click(svg.x + 4, svg.y + 4), 'clicking empty floor');
  assert.equal(await page.locator('.plan-item.sel').count(), 0);
  assert.match(await F.inspectorKind(page), /room/i);

  // hover over a piece: the plan shows it can be picked
  const item = page.locator(`.plan-item[data-index="${i}"]`);
  const box = await item.boundingBox();
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  assert.equal(await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, mid), 'grab', 'a grab cursor over the piece');

  // click it: highlighted right away, inspector on it
  await F.expectRedraw(page, plan, () => page.mouse.click(mid.x, mid.y), 'clicking the table on the plan');
  assert.equal(await page.locator(`.plan-item.sel[data-index="${i}"]`).count(), 1);
  assert.match(await F.inspectorTitle(page), /table/i);

  // drag it toward the middle of the room: the piece follows the pointer on screen
  const room = await page.locator(`${plan} svg`).boundingBox();
  const dx = Math.sign(room.x + room.width / 2 - mid.x) * 60 || 60, dy = Math.sign(room.y + room.height / 2 - mid.y) * 40 || 40;
  await F.expectRedraw(page, plan, async () => {
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x + dx, mid.y + dy, { steps: 8 });
    await page.mouse.up();
  }, 'dragging the table');
  const moved = await item.boundingBox();
  assert.ok(Math.abs(moved.x - (box.x + dx)) < 25 && Math.abs(moved.y - (box.y + dy)) < 25, `the table follows the pointer (was ${box.x},${box.y}, dragged ${dx},${dy}, now ${moved.x},${moved.y})`);
  assert.equal(await page.locator(`.plan-item.sel[data-index="${i}"]`).count(), 1, 'still selected after the drag');

  // R rotates it on screen: its footprint turns
  await F.expectRedraw(page, plan, () => page.keyboard.press('r'), 'pressing R');
  const turned = await item.boundingBox();
  assert.ok(Math.abs(turned.width - moved.height) < 3 && Math.abs(turned.height - moved.width) < 3, 'the footprint is turned a quarter');
  assert.equal((await F.kit(page)).items[i].rot, 90);

  // the inspector shows the new turn and position without a reselect
  const position = page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Position' }) });
  if (!(await position.evaluate((d) => d.open))) await position.locator('summary').click();
  const field = (label) => position.locator('label', { hasText: label }).locator('input, select').first();
  const now = (await F.kit(page)).items[i];
  assert.equal(await field('Turn').inputValue(), '90');
  assert.equal(Number(await field('From left').inputValue()), now.x);
  assert.equal(Number(await field('From back').inputValue()), now.y);

  // the 3D view is not stale: it shows the move straight away
  const k = await F.kit(page);
  await page.click('[data-view="3d"]');
  await page.waitForSelector(`${STAGE} svg.scene-svg`);
  assert.deepEqual((await F.kit(page)).items[i], k.items[i]);
  const p = await F.pickPoint(page, i);
  assert.ok(p, 'the moved table is visible in 3D');
  assert.equal(await page.locator(`${STAGE} path.sel[data-item="${i}"]`).count() > 0, true, 'and still outlined there');
  await page.click('[data-view=plan]');

  // Delete removes it from the plan; Undo brings it back where it was
  await F.expectRedraw(page, plan, () => page.keyboard.press('Delete'), 'pressing Delete');
  assert.equal(await item.count(), 0);
  assert.equal((await F.kit(page)).items.length, count);
  await F.expectRedraw(page, plan, () => page.click('#btn-undo'), 'clicking Undo');
  assert.equal(await item.count(), 1);
  const back = await item.boundingBox();
  assert.ok(Math.abs(back.x - turned.x) < 2 && Math.abs(back.y - turned.y) < 2, 'back where it was');
  await F.expectRedraw(page, plan, () => page.click('#btn-redo'), 'clicking Redo');
  assert.equal(await item.count(), 0);

  await F.shot(page, 'furniture-plan');
  F.assertClean(page);
  await page.context().close();
});

test('flow: pick, nudge, rotate, duplicate and delete a piece in the sketch 3D view', async () => {
  const page = await F.openApp(browser, URL);
  const n = (await F.kit(page)).items.length;

  // hover: the piece under the pointer lights up
  const p = await F.pickPoint(page, 1);
  assert.ok(p, 'the armchair is visible');
  await F.expectRedraw(page, STAGE, () => page.mouse.move(p.x, p.y), 'hovering the armchair');

  // click: outlined at once and the inspector opens on it
  await F.expectRedraw(page, STAGE, () => page.mouse.click(p.x, p.y), 'clicking the armchair');
  assert.equal(await page.locator(`${STAGE} path.sel[data-item="1"]`).count() > 0, true);
  assert.match(await F.inspectorTitle(page), /armchair/i);

  // click another piece: the outline moves
  const q = await F.pickPoint(page, 0);
  assert.ok(q, 'the bookshelf is visible');
  await F.expectRedraw(page, STAGE, () => page.mouse.click(q.x, q.y), 'clicking the bookshelf');
  assert.equal(await page.locator(`${STAGE} path.sel[data-item="1"]`).count(), 0);
  assert.match(await F.inspectorTitle(page), /bookshelf/i);

  // back to the armchair; arrow keys nudge it and the view follows
  const p2 = await F.pickPoint(page, 1);
  assert.ok(p2, 'the armchair is visible');
  await page.mouse.click(p2.x, p2.y);
  const x0 = (await F.kit(page)).items[1].x;
  await F.expectRedraw(page, STAGE, () => page.keyboard.press('Shift+ArrowRight'), 'nudging with an arrow key');
  assert.notEqual((await F.kit(page)).items[1].x, x0);

  // R turns it in the view
  await F.expectRedraw(page, STAGE, () => page.keyboard.press('r'), 'pressing R in 3D');
  assert.equal((await F.kit(page)).items[1].rot, 90);

  // D duplicates, Delete removes, the outline goes with it
  await F.expectRedraw(page, STAGE, () => page.keyboard.press('d'), 'pressing D');
  assert.equal((await F.kit(page)).items.length, n + 1);
  await F.expectRedraw(page, STAGE, () => page.keyboard.press('Delete'), 'pressing Delete');
  assert.equal((await F.kit(page)).items.length, n);

  // orbit with the Rotate slider: the view turns and the selection survives
  const p3 = await F.pickPoint(page, 1);
  assert.ok(p3, 'the armchair is still visible');
  await page.mouse.click(p3.x, p3.y);
  await F.expectRedraw(page, STAGE, () => page.locator('input[aria-label=Rotate]').fill('20'), 'turning the Rotate slider');
  assert.equal(await page.locator(`${STAGE} path.sel[data-item="1"]`).count() > 0, true, 'still outlined after orbiting');

  // Escape: the outline clears
  await page.locator(STAGE).hover({ position: { x: 4, y: 4 } });
  await F.expectRedraw(page, STAGE, () => page.keyboard.press('Escape'), 'pressing Escape');
  assert.equal(await page.locator(`${STAGE} path.sel`).count(), 0);
  assert.match(await F.inspectorKind(page), /room/i);

  await F.shot(page, 'furniture-sketch3d');
  F.assertClean(page);
  await page.context().close();
});

test('flow: pick, hover, nudge and delete a piece in Realistic 3D', async () => {
  const page = await F.openApp(browser, URL, { webgl: true });
  await F.settled(page, STAGE, { timeout: 15000 });
  const n = (await F.kit(page)).items.length;

  const p = await F.pickPoint(page, 2);
  assert.ok(p, 'the nightstand is visible');
  await F.expectRedraw(page, STAGE, () => page.mouse.move(p.x, p.y), 'hovering the nightstand in Realistic 3D', { within: 8000 });

  // the bug fixed in #103: a click must tint the piece without orbiting first
  await F.expectRedraw(page, STAGE, () => page.mouse.click(p.x, p.y), 'clicking the nightstand in Realistic 3D', { within: 8000 });
  assert.match(await F.inspectorTitle(page), /nightstand/i);

  // selecting from the inspector list shows at once too
  await page.mouse.move(2, 2);
  await F.expectRedraw(page, STAGE, () => page.click('[data-action=back]'), 'clicking Done', { within: 8000 });
  await F.expectRedraw(page, STAGE, () => page.click('[data-select-item="0"]'), 'picking the bookshelf from the list', { within: 8000 });
  assert.match(await F.inspectorTitle(page), /bookshelf/i);

  // keys move and remove it, and the picture follows
  await page.locator(STAGE).hover({ position: { x: 4, y: 4 } });
  await F.expectRedraw(page, STAGE, () => page.keyboard.press('Shift+ArrowRight'), 'nudging in Realistic 3D', { within: 8000 });
  await F.expectRedraw(page, STAGE, () => page.keyboard.press('Delete'), 'deleting in Realistic 3D', { within: 8000 });
  assert.equal((await F.kit(page)).items.length, n - 1);
  await F.expectRedraw(page, STAGE, () => page.click('#btn-undo'), 'undo in Realistic 3D', { within: 8000 });
  assert.equal((await F.kit(page)).items.length, n);

  // dragging orbits rather than selecting
  const box = await page.locator(STAGE).boundingBox();
  await F.expectRedraw(page, STAGE, async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 30);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height - 30, { steps: 6 });
    await page.mouse.up();
  }, 'dragging to orbit', { within: 8000 });

  await F.shot(page, 'furniture-webgl');
  F.assertClean(page);
  await page.context().close();
});

for (const webgl of [false, true]) {
  const label = webgl ? 'Realistic 3D' : 'the sketch 3D view';
  test(`flow: inspector edits, new pieces, night mode and undo show at once in ${label}`, async () => {
    const page = await F.openApp(browser, URL, { webgl });
    const within = webgl ? 8000 : 3000;
    await F.settled(page, STAGE, { timeout: webgl ? 15000 : 5000 });

    // resize a piece from the inspector
    await page.click('[data-select-item="0"]');
    const height = page.locator('#sidebar label', { hasText: 'Height' }).first().locator('input');
    await F.expectRedraw(page, STAGE, async () => { await height.fill('60'); await height.dispatchEvent('change'); }, `changing a height in ${label}`, { within });
    assert.equal((await F.kit(page)).items[0].params.h, 60);

    // a new piece from the drawer appears in the room
    await page.click('#rail-pieces');
    await F.expectRedraw(page, STAGE, () => page.click('.piece[data-piece="table"]'), `adding a table in ${label}`, { within });
    await page.click('#drawer [data-action=close]');

    // a window from the rail
    await F.expectRedraw(page, STAGE, () => page.click('#rail-window'), `adding a window in ${label}`, { within });

    // undo twice: the window and the table go again
    await F.expectRedraw(page, STAGE, () => page.click('#btn-undo'), `undoing the window in ${label}`, { within });
    await F.expectRedraw(page, STAGE, () => page.click('#btn-undo'), `undoing the table in ${label}`, { within });

    // night mode lights the room; day again
    await F.expectRedraw(page, STAGE, () => page.click('#night-toggle'), `night mode in ${label}`, { within });
    await F.expectRedraw(page, STAGE, () => page.click('#night-toggle'), `day mode in ${label}`, { within });

    // the room's size from the Room settings
    await page.click('#rail-room');
    const width = page.locator('#sidebar details.section', { has: page.locator('summary', { hasText: 'Room box' }) }).locator('input[type=number]').first();
    await F.expectRedraw(page, STAGE, async () => { await width.fill('360'); await width.dispatchEvent('change'); }, `widening the room in ${label}`, { within });

    // turn the renderer over: the other view opens already showing this room
    await page.click('#renderer-toggle');
    if (!webgl) await page.waitForSelector(`${STAGE}[data-renderer=webgl] canvas`, { timeout: 20000 });
    else await page.waitForSelector(`${STAGE}[data-renderer=svg] svg.scene-svg`, { timeout: 5000 });
    const p = await F.pickPoint(page, 0);
    assert.ok(p, 'the bookshelf is pickable in the other renderer');
    await F.expectRedraw(page, STAGE, () => page.mouse.click(p.x, p.y), `clicking a piece after switching from ${label}`, { within: 8000 });
    assert.match(await F.inspectorTitle(page), /bookshelf/i);

    F.assertClean(page);
    await page.context().close();
  });
}

for (const webgl of [false, true]) {
  const label = webgl ? 'Realistic 3D' : 'the sketch view';
  test(`flow: move a piece with the 3D handles in ${label}: the fields follow the drag, and undo keeps it selected`, async () => {
    const page = await F.openApp(browser, URL, { webgl });
    if (webgl) await F.settled(page, STAGE, { timeout: 15000 });
    await page.click('[data-select-item="2"]'); // the nightstand
    await page.locator('#sidebar summary', { hasText: 'Position' }).click();
    const field = (name) => page.evaluate((n) => Number([...document.querySelectorAll('#sidebar .field')].find((f) => f.textContent.includes(n)).querySelector('input').value), name);
    const x0 = await field('From left');
    const knob = page.locator('.t6-gizmo [data-handle="x"]');
    await knob.waitFor({ state: 'attached', timeout: 10000 });
    const at = await page.evaluate(() => { const r = (document.querySelector('.t6-gizmo [data-handle="x"] .knob') || document.querySelector('.t6-gizmo [data-handle="x"]')).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const dir = await page.evaluate(() => JSON.parse(document.querySelector('.t6-gizmo [data-handle="x"]').dataset.pxPerCm));
    // drag 30 cm toward the left wall, and look at the fields before letting go
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - dir[0] * 30, at.y - dir[1] * 30, { steps: 8 });
    await page.waitForTimeout(50);
    const live = await field('From left');
    assert.ok(Math.abs(live - (x0 - 30)) <= 5, `From left reads ${live} mid-drag (started at ${x0})`);
    await page.mouse.up();
    const moved = (await F.kit(page)).items[2].x;
    assert.equal(await field('From left'), moved, 'the field shows where it landed');

    // undo: the piece goes back and stays selected, handles and all, so you can try again
    await page.click('#btn-undo');
    assert.equal((await F.kit(page)).items[2].x, x0);
    assert.match(await F.inspectorTitle(page), /nightstand/i, 'still selected after undo');
    await knob.waitFor({ state: 'attached', timeout: 10000 });
    assert.equal(await field('From left'), x0);
    await page.click('#btn-redo');
    assert.equal((await F.kit(page)).items[2].x, moved);
    assert.match(await F.inspectorTitle(page), /nightstand/i, 'still selected after redo');

    // an undo that takes a piece away still clears a selection that would point at the wrong thing
    await page.keyboard.press('Escape');
    await page.click('#rail-pieces');
    await page.click('.piece[data-piece="table"]');
    await page.click('#drawer [data-action=close]');
    await page.click('#btn-undo');
    assert.doesNotMatch(await F.inspectorTitle(page).catch(() => ''), /table/i, 'the removed table is not left selected');
    F.assertClean(page);
    await page.context().close();
  });
}

test('flow: turning a piece with the ring shows where it will land in the position fields', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('[data-select-item="0"]'); // the bookshelf, long and against the left wall: a turn pushes it off the wall
  await page.locator('#sidebar summary', { hasText: 'Position' }).click();
  const field = (name) => page.evaluate((n) => Number([...document.querySelectorAll('#sidebar .field')].find((f) => f.textContent.includes(n)).querySelector('input').value), name);
  await page.locator('.t6-gizmo [data-handle="rot"]').waitFor({ state: 'attached', timeout: 10000 });
  const ring = await page.evaluate(() => JSON.parse(document.querySelector('.t6-gizmo [data-handle="rot"]').dataset.ring));
  const from = await page.evaluate(() => { const r = document.querySelector('.t6-gizmo [data-handle="rot"] .knob').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const a0 = Math.atan2(from.y - ring.cy, from.x - ring.cx);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { const a = a0 + (i / 10) * (Math.PI / 2) * 1.1; await page.mouse.move(ring.cx + Math.cos(a) * ring.rx, ring.cy + Math.sin(a) * ring.ry); }
  await page.waitForTimeout(50);
  const live = [await field('From left'), await field('From back')];
  await page.mouse.up();
  const it = (await F.kit(page)).items[0];
  assert.deepEqual(live, [it.x, it.y], 'the fields mid-turn match where it lands');
  F.assertClean(page);
  await page.context().close();
});

test('flow: on the Plan tab, hovering or focusing a pieces-list row marks that piece on the plan', async () => {
  const page = await F.openApp(browser, URL);
  await page.click('[data-view=plan]');
  const marked = () => page.evaluate(() => [...document.querySelectorAll('.plan-canvas .plan-item.over')].map((g) => Number(g.dataset.index)));
  const look = (i) => page.evaluate((k) => { const el = document.querySelector(`.plan-canvas .plan-item[data-index="${k}"] rect, .plan-canvas .plan-item[data-index="${k}"] ellipse`); const c = getComputedStyle(el); return `${c.stroke} ${c.strokeWidth}`; }, i);
  const before = await look(3);
  await page.hover('[data-select-item="3"]');
  assert.deepEqual(await marked(), [3], 'the hovered row marks its piece');
  assert.notEqual(await look(3), before, 'and the piece looks different while its row is pointed at');
  // an overlapping piece gets the mark too, over its clash look
  await page.evaluate(() => { const k = window.mimimaker.kit; k.items[3].x = k.items[2].x; k.items[3].y = k.items[2].y; window.mimimaker.refresh(); });
  await page.mouse.move(2, 2);
  assert.equal(await page.locator('.plan-canvas .plan-item.clash[data-index="3"]').count(), 1, 'the lamp now overlaps the nightstand');
  const clash = await look(3);
  await page.hover('[data-select-item="3"]');
  assert.notEqual(await look(3), clash, 'an overlapping piece is marked too');
  await page.mouse.move(2, 2);
  assert.deepEqual(await marked(), [], 'cleared when the pointer leaves');
  await page.focus('[data-select-item="1"]');
  assert.deepEqual(await marked(), [1], 'a focused row marks its piece too');
  await page.keyboard.press('Space'); // pick it: the plan redraws with it selected, and the row mark goes
  assert.deepEqual(await marked(), []);
  assert.equal(await page.locator('.plan-canvas .plan-item.sel[data-index="1"]').count(), 1);
  F.assertClean(page);
  await page.context().close();
});
