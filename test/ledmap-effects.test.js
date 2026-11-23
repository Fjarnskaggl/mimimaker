import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledMapSVG, ledRows } from '../src/ledmap.js';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';

function compiled(leds, power = {}) {
  const kit = defaultKit();
  kit.lighting.enabled = true;
  kit.lighting.power = { ...kit.lighting.power, wall: 'back', pos: 150, elev: 60, kind: 'battery', supply: 'aa2', ...power };
  kit.lighting.leds = leds;
  return compileKit(kit);
}
const wall = (o = {}) => ({ mount: 'wall', wall: 'back', pos: 60, elev: 150, color: 'warm', ...o });

test('each LED marker says its effect, with a glyph for the special ones', () => {
  const c = compiled([wall(), wall({ effect: 'candle', pos: 100 }), wall({ effect: 'fairy', pos: 140, elev: 200 }), wall({ effect: 'strip', pos: 20, elev: 100, lengthMm: 50 })], { supply: 'usb', kind: 'usb' });
  const svg = ledMapSVG(c, { standalone: true });
  for (const e of ['steady', 'candle', 'fairy', 'strip']) assert.equal((svg.match(new RegExp(`data-effect="${e}"`, 'g')) || []).length, 1, e);
  assert.match(svg, /class="fx-candle"/);
  assert.equal((svg.match(/class="fx-fairy"/g) || []).length, 1);
  assert.match(svg, /class="fx-strip"/);
});

test('a strip is drawn at its real length along its wall', () => {
  const c = compiled([wall({ effect: 'strip', pos: 20, elev: 100, lengthMm: 50 })], { supply: 'usb', kind: 'usb' });
  const m = ledMapSVG(c).match(/<rect class="fx-strip"[^>]*width="([\d.]+)"/);
  assert.ok(m, 'strip bar');
  assert.ok(Math.abs(+m[1] - 50) < 0.01, `bar is ${m[1]} mm`);
});

test('the power box is labelled with the actual supply', () => {
  assert.match(ledMapSVG(compiled([wall()])), />2×AA</);
  assert.match(ledMapSVG(compiled([wall()], { supply: 'cr2032' })), />CR2032</);
  assert.match(ledMapSVG(compiled([wall()], { supply: 'usb', kind: 'usb' })), />USB</);
});

test('the map carries a one-line circuit summary, labelled as an estimate', () => {
  const svg = ledMapSVG(compiled([wall(), wall({ pos: 20 })]), { standalone: true });
  const m = svg.match(/<text class="circuit"[^>]*>([^<]*)</);
  assert.ok(m, 'summary line');
  assert.match(m[1], /2×AA/);
  assert.match(m[1], /2 LEDs/);
  assert.match(m[1], /40 mA/);
  assert.match(m[1], /about 32 hours/);
  assert.match(m[1], /estimate/);
  const usb = ledMapSVG(compiled([wall()], { supply: 'usb', kind: 'usb' })).match(/<text class="circuit"[^>]*>([^<]*)</)[1];
  assert.match(usb, /plugged in/);
  assert.doesNotMatch(usb, /estimate\)/, 'no battery-life estimate for USB');
});

test('the LED table names each effect', () => {
  const rows = ledRows(compiled([wall(), wall({ effect: 'candle', pos: 100 })]));
  assert.deepEqual(rows.map((r) => r.effect), ['Steady LED', 'Candle flicker']);
});
