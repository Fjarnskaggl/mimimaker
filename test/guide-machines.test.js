// T4: the guide's tools and cutting steps follow the chosen machine (#22).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKit } from '../src/kit.js';
import { defaultKit } from '../src/catalog.js';
import { guideHTML } from '../src/guide.js';
import { machineSettingsLine } from '../src/export/machines.js';
import { laserFileName, LASER_COLORS } from '../src/export/laser.js';
import { sheetFileName } from '../src/svg.js';

const guideFor = (machine) => {
  const kit = defaultKit();
  kit.machine = machine;
  const compiled = compileKit(kit);
  return { html: guideHTML(kit, compiled), compiled };
};
const section = (html, heading) => {
  const i = html.indexOf(`<h2>${heading}`);
  assert.ok(i >= 0, `missing section ${heading}`);
  const j = html.indexOf('<h2>', i + 4);
  return html.slice(i, j < 0 ? undefined : j);
};
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

test('Cricut guide keeps its Design Space steps', () => {
  const { html } = guideFor('maker');
  assert.match(html, /<h2>Cutting in Cricut Design Space<\/h2>/);
  assert.match(section(html, "You'll need"), /Strong-grip mat/);
});

test('laser guide talks about the laser, not Design Space, mats or blades', () => {
  const { html, compiled } = guideFor('laser');
  assert.doesNotMatch(html, /Design Space|Cricut|Scoring Stylus|grip mat|Fine-Point Blade|Knife Blade/);
  const cutting = section(html, 'Cutting on a laser cutter');
  assert.match(cutting, /kerf/i);
  assert.match(cutting, /0\.1 mm/);
  assert.match(cutting, /100%/);
  assert.match(cutting, /\.dxf/);
  const need = section(html, "You'll need");
  assert.match(need, /Laser cutter \(generic\)/);
  assert.match(need, /honeycomb|bed/i);
  for (const s of compiled.sheets) {
    assert.ok(html.includes(laserFileName(s, 'svg')), `laser file name for sheet ${s.index}`);
    assert.ok(!html.includes(sheetFileName(s)), 'no Cricut file name');
  }
});

test('Silhouette guide uses Silhouette Studio and the Silhouette blades', () => {
  const { html } = guideFor('cameo');
  assert.doesNotMatch(html, /Design Space|Cricut|Scoring Stylus|Fine-Point Blade/);
  const cutting = section(html, 'Cutting in Silhouette Studio');
  assert.match(cutting, /Basic edition/);
  assert.match(cutting, /\.dxf/);
  assert.match(html, /AutoBlade/);
});

test('Silhouette guide says what the pen lines are and uses Silhouette mat names', () => {
  const kit = defaultKit();
  kit.machine = 'cameo';
  kit.drawLabels = true;
  const html = guideHTML(kit, compileKit(kit));
  assert.match(section(html, 'Cutting in Silhouette Studio'), /blue<\/span> = Sketch/);
  const need = section(html, "You'll need");
  assert.doesNotMatch(need, /Strong-grip|standard grip/);
  assert.match(need, /StrongHold/);
});

test('laser sheet previews use the laser layer colours the steps describe', () => {
  const { html } = guideFor('laser');
  assert.match(html, new RegExp(`\\.part \\.cut \\{ stroke: ${LASER_COLORS.cut}`));
  assert.match(html, new RegExp(`\\.part \\.score \\{ stroke: ${LASER_COLORS.score}`));
});

test('each cut sheet carries its machine settings line', () => {
  for (const m of ['maker', 'cameo', 'laser']) {
    const { html, compiled } = guideFor(m);
    const sheets = unescape(html.slice(html.indexOf('<h2>Cut sheets')));
    for (const s of compiled.sheets) assert.ok(sheets.includes(machineSettingsLine(s, compiled.machine)), `${m}: settings for sheet ${s.index}`);
  }
});
