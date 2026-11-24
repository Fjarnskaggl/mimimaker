#!/usr/bin/env node
// Makes the README pictures in docs/readme/: fresh screenshots of the running
// app in both themes, then the banner and the framed step plates built from
// them, in the design system's colours (docs/design-system/tokens.json).
//
//   npm start                 # in one terminal
//   npm run readme:art        # in another
//
// Env:
//   MIMI_URL       where the app runs (default http://localhost:5173)
//   MIMI_THREE_JS  path to three@0.128.0's build/three.min.js, for machines
//                  that can't reach the CDN (same as the e2e tests)
//
// Swapping the mascot: point MASCOT at the new artwork (or replace the files
// in docs/design-system/assets/Mimi/) and run this again. The README's small
// section mascots are plain <img> tags on those same SVG files.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT = __dirname;
const SHOTS = path.join(OUT, '.shots'); // raw screenshots, not committed
const URL = process.env.MIMI_URL || 'http://localhost:5173';
const MASCOT = path.join(ROOT, 'docs/design-system/assets/Mimi/mimi-hello.svg');
const THREE_CDN = /three(\.js\/r128|@0\.128\.0)\/.*three\.min\.js$/;
const THEMES = ['light', 'dark'];

const tokens = require(path.join(ROOT, 'docs/design-system/tokens.json'));
function palette(theme) {
  const p = {};
  for (const t of tokens.color.tokens) p[t.name] = typeof t.value === 'string' ? t.value : t.value[theme];
  for (const t of tokens.shadow.tokens) p[t.name] = typeof t.value === 'string' ? t.value : t.value[theme];
  return p;
}
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;

// ---------------------------------------------------------------- screenshots

async function openApp(browser, theme, { viewport = { width: 1440, height: 900 }, phone = false } = {}) {
  const ctx = await browser.newContext({
    viewport, colorScheme: theme, reducedMotion: 'reduce',
    deviceScaleFactor: phone ? 3 : 2, isMobile: phone, hasTouch: phone,
  });
  const page = await ctx.newPage();
  if (process.env.MIMI_THREE_JS) {
    const body = fs.readFileSync(process.env.MIMI_THREE_JS);
    await page.route(THREE_CDN, (r) => r.fulfill({ body, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  }
  page.on('pageerror', (e) => console.warn(`  page error (${theme}): ${e.message}`));
  await page.addInitScript(() => { try { localStorage.setItem('mimimaker.t6.webgl', '1'); } catch { /* */ } });
  await page.goto(URL);
  await page.waitForFunction(() => window.mimimaker?.kit && document.querySelector('#view')?.children.length);
  await page.waitForSelector('.stage[data-renderer=webgl] canvas', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  return page;
}

const snap = (page, name) => page.screenshot({
  path: path.join(SHOTS, `${name}.png`), animations: 'disabled', caret: 'hide',
  style: '.toasts{visibility:hidden!important}',
});

async function capture(browser) {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const theme of THEMES) {
    console.log(`screenshots: ${theme}`);
    const page = await openApp(browser, theme);
    // Design: the armchair selected, with its move and turn handles
    const at = await page.evaluate(() => document.querySelector('.stage').t6pickPoint(1));
    if (at) { await page.mouse.click(at.x, at.y); await page.waitForTimeout(1500); }
    await snap(page, `design-${theme}`);
    await page.keyboard.press('Escape');
    for (const step of ['light', 'make', 'build']) {
      await page.click(`[data-step=${step}]`);
      if (step === 'build') await page.click('.t4-mode [data-mode=steps]');
      await page.waitForTimeout(2500);
      await snap(page, `${step}-${theme}`);
    }
    await page.click('[data-step=design]');
    await page.click('#btn-file');
    await page.click('#btn-new');
    await page.waitForTimeout(1500);
    await snap(page, `start-${theme}`);
    await page.context().close();

    const phone = await openApp(browser, theme, { viewport: { width: 390, height: 844 }, phone: true });
    // the night phone shows the Light step, so the pair shows the lights glowing
    if (theme === 'dark') { await phone.click('[data-step=light]'); await phone.waitForTimeout(2500); }
    await snap(phone, `phone-${theme}`);
    await phone.context().close();
  }
}

// --------------------------------------------------------------- compositions

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@500;600;700&family=IBM+Plex+Mono:wght@500&display=swap';

function base(p) {
  return `
  <link rel="stylesheet" href="${FONTS}">
  <style>
    * { box-sizing: border-box; margin: 0; }
    html, body { background: ${p.paper}; }
    body { font-family: Figtree, system-ui, sans-serif; color: ${p.ink}; -webkit-font-smoothing: antialiased; }
    .flutes { background: repeating-linear-gradient(90deg, ${p['flute-shade']} 0 2px, ${p['flute-face']} 2px 5px); }
    .panel {
      position: relative; background: ${p.surface};
      border-radius: 14px 18px 12px 17px / 16px 12px 18px 13px;
      box-shadow: 0 0 0 1px color-mix(in srgb, ${p['flute-shade']} 45%, transparent), inset 0 -6px 0 -3px ${p['flute-face']}, ${p['shadow-panel']};
    }
    .panel::after { content: ""; position: absolute; inset: 7px; border: 1.5px dashed ${p.stitch}; border-radius: 10px 14px 9px 13px; pointer-events: none; }
    .lip { position: absolute; left: 10px; right: 10px; bottom: -6px; height: 6px; border-radius: 0 0 6px 6px; }
  </style>`;
}

// The banner: Mimi and the name on a card panel, the room on its stage.
function banner(theme) {
  const p = palette(theme);
  const room = dataUrl(path.join(SHOTS, `${theme === 'light' ? 'design' : 'light'}-${theme}.png`), 'image/png');
  const mimi = dataUrl(MASCOT, 'image/svg+xml');
  // where the room sits in the screenshot (CSS px), and how far to shrink it
  const c = theme === 'light' ? [580, 485] : [560, 515], s = 0.53;
  const step = (n, name, on) => `<span class="st${on ? ' on' : ''}"><b>${n}</b>${name}</span>`;
  return `<!doctype html><html><head><meta charset="utf-8">${base(p)}
  <style>
    body { width: 1000px; height: 410px; overflow: hidden; }
    .top { position: absolute; left: 0; right: 0; top: 0; height: 6px; box-shadow: 0 3px 5px rgba(40,22,5,.35); }
    .card { position: absolute; left: 32px; top: 42px; width: 452px; height: 340px; padding: 24px 34px; }
    .mimi { width: 84px; height: auto; display: block; margin: -4px 0 10px -6px; }
    h1 { font: 800 60px/0.95 "Bricolage Grotesque", sans-serif; letter-spacing: -1.5px; }
    p { font: 500 17.5px/1.4 Figtree, sans-serif; color: ${p['ink-muted']}; margin-top: 12px; max-width: 360px; }
    .steps { display: flex; gap: 6px; margin-top: 22px; padding: 4px; width: max-content; border-radius: 10px 12px 9px 11px; background: ${p['surface-sunken']}; }
    .st { display: flex; align-items: center; gap: 7px; padding: 6px 11px 6px 7px; border-radius: 8px 10px 7px 9px; font: 600 14px Figtree, sans-serif; color: ${p.ink}; }
    .st b { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid ${p['line-control']}; font: 600 12px Figtree, sans-serif; }
    .st.on { background: ${p.caramel}; color: ${p['on-caramel']}; box-shadow: 0 2px 0 ${p['caramel-edge']}; }
    .st.on b { background: ${p['on-caramel']}; color: ${p.caramel}; border-color: ${p['on-caramel']}; }
    .stage { position: absolute; right: 32px; top: 42px; width: 452px; height: 340px; overflow: hidden; padding: 0; background: ${p.stage}; }
    .stage::after { display: none; }
    .stage img { position: absolute; left: 0; top: 0; width: 1440px; transform-origin: 0 0; transform: translate(${226 - c[0] * s}px, ${167 - c[1] * s}px) scale(${s}); }
  </style></head><body>
    <div class="top flutes"></div>
    <div class="card panel">
      <img class="mimi" src="${mimi}" alt="">
      <h1>mimimaker</h1>
      <p>Design a tiny room, light it, and cut it out of card and chipboard at home.</p>
      <div class="steps">${step(1, 'Design', theme === 'light')}${step(2, 'Light', theme === 'dark')}${step(3, 'Make')}${step(4, 'Build')}</div>
    </div>
    <div class="stage panel"><img src="${room}" alt=""></div>
  </body></html>`;
}

// A whole-app screenshot laid on the desk as a card tray.
function plate(theme, shot, { width = 1000 } = {}) {
  const p = palette(theme);
  const img = dataUrl(path.join(SHOTS, `${shot}-${theme}.png`), 'image/png');
  const w = width - 56, h = Math.round(w * 900 / 1440);
  return `<!doctype html><html><head><meta charset="utf-8">${base(p)}
  <style>
    body { width: ${width}px; height: ${h + 62}px; overflow: hidden; padding: 24px 28px; }
    .tray { width: ${w}px; height: ${h}px; padding: 0; overflow: hidden; }
    .tray::after { display: none; }
    .tray img { width: 100%; display: block; border-radius: inherit; }
  </style></head><body><div class="tray panel"><img src="${img}" alt=""></div></body></html>`;
}

// Both phones side by side: day on kraft, night on the dark desk.
function phones() {
  const L = palette('light'), D = palette('dark');
  const ph = (t) => dataUrl(path.join(SHOTS, `phone-${t}.png`), 'image/png');
  const half = (p, t) => `<div class="half" style="background:${p.paper}">
      <div class="phone" style="background:${p['flute-shade']};box-shadow:${p['shadow-panel']}"><img src="${ph(t)}" alt=""></div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8">${base(L)}
  <style>
    body { width: 1000px; height: 560px; display: flex; overflow: hidden; }
    .half { flex: 1; display: grid; place-items: center; }
    .phone { width: 236px; padding: 8px; border-radius: 34px; }
    .phone img { width: 100%; display: block; border-radius: 27px; aspect-ratio: 390 / 844; object-fit: cover; object-position: top; }
  </style></head><body>${half(L, 'light')}${half(D, 'dark')}</body></html>`;
}

// A flute strip, used as the section divider.
function divider(theme) {
  const p = palette(theme);
  return `<!doctype html><html><head><meta charset="utf-8">${base(p)}
  <style>html, body { background: transparent; } body { width: 1000px; height: 10px; padding: 2px 0; } .f { height: 6px; border-radius: 3px; }</style>
  </head><body><div class="f flutes"></div></body></html>`;
}

async function render(browser, html, file, { transparent = false } = {}) {
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 400 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
  await page.setViewportSize(size);
  const png = file.endsWith('.png');
  await page.screenshot({ path: path.join(OUT, file), type: png ? 'png' : 'jpeg', quality: png ? undefined : 86, omitBackground: transparent, fullPage: true });
  await page.close();
  console.log(`  wrote docs/readme/${file}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (!process.argv.includes('--no-capture')) await capture(browser);
    console.log('compositions');
    for (const t of THEMES) {
      await render(browser, banner(t), `banner-${t}.jpg`);
      for (const s of ['design', 'light', 'make', 'build', 'start']) await render(browser, plate(t, s), `${s}-${t}.jpg`);
      await render(browser, divider(t), `divider-${t}.png`, { transparent: true });
    }
    await render(browser, phones(), 'phones.jpg');
  } finally {
    await browser.close();
  }
})();
