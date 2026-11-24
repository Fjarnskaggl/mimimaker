// The Card and chipboard theme on screen, in both themes: no green or teal
// anywhere in the interface, panels are card with a corrugated edge, and the
// current step and selected tabs are caramel tape. The room drawing itself
// (its materials, wallpaper and LED colours) is the kit's, so it is skipped.
// Set SHOT_DIR to save a screenshot of every step in both themes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers.cjs');
const F = require('./flow-helpers.cjs');

let URL, server, browser;
before(async () => { server = await startServer(); URL = server.url; browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

/** Interface colours on screen with a green or teal hue, as "selector: property colour". */
const greens = (page) => page.evaluate(() => {
  const KIT = '.scene-svg, canvas, .thumb, .sheet-svg, .ledmap-svg, .plan-svg, iframe, .sw, .mm-swatch, .led-dot, .wire, input[type=color]';
  const parse = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || ''); return m && (m[4] == null || +m[4] > 0.05) ? [+m[1], +m[2], +m[3]].map((v) => v / 255) : null; };
  const green = (rgb) => {
    const max = Math.max(...rgb), min = Math.min(...rgb), d = max - min, l = (max + min) / 2;
    if (!d) return false;
    const s = d / (1 - Math.abs(2 * l - 1));
    const [r, g, b] = rgb;
    const h = ((max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
    return s > 0.15 && h >= 70 && h <= 200;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest(KIT)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const props = ['color', 'background-color', 'border-top-color', 'border-bottom-color', 'outline-color', 'fill', 'stroke'];
    for (const p of props) {
      if (p.startsWith('border') && parseFloat(cs.getPropertyValue(p.replace('color', 'width'))) === 0) continue;
      if (p === 'outline-color' && cs.outlineStyle === 'none') continue;
      if ((p === 'fill' || p === 'stroke') && !(el instanceof SVGElement)) continue;
      const v = cs.getPropertyValue(p), rgb = parse(v);
      if (rgb && green(rgb)) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}: ${p} ${v}`);
    }
  }
  return [...new Set(out)];
});

for (const scheme of ['light', 'dark']) {
  test(`theme (${scheme}): card panels, caramel tape, and no green or teal in any step`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await F.openApp(browser, URL, { context: ctx });
    await page.locator('#sidebar [data-select-item]').nth(1).click(); // a piece selected: inspector fields and move handles
    await page.click('.rail button >> nth=0'); // the piece library drawer
    const panel = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#sidebar'));
      return { edge: cs.borderBottomWidth, bg: cs.backgroundImage };
    });
    assert.equal(panel.edge, '6px', 'the inspector shows its corrugated cut edge');
    assert.match(panel.bg, /repeating-linear-gradient/, 'drawn as flutes');
    const tape = await page.evaluate(() => getComputedStyle(document.querySelector('[data-step][aria-current=step]')).backgroundColor);
    assert.equal(tape, 'rgb(226, 180, 126)', 'the current step is caramel tape');
    const check = async (name) => {
      assert.deepEqual(await greens(page), [], `${name}: no green or teal`);
      if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/theme-${scheme}-${name}.png` });
    };
    await check('design');
    await page.click('.rail button >> nth=0');
    for (const step of ['light', 'make', 'build']) {
      await page.click(`[data-step=${step}]`);
      await page.locator('.t5-circuit, .sheet-card, .t4-mode').first().waitFor({ timeout: 5000 });
      await check(step);
    }
    F.assertClean(page);
    await ctx.close();
  });
}
