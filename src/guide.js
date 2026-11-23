// Printable, self-contained assembly guide (HTML).

import { sheetPreviewSVG, sheetFileName, LAYER_COLORS } from './svg.js';
import { TOOL_NAMES } from './materials.js';
import { shoppingList } from './lighting/shopping.js';
import { renderScene } from './preview3d.js';
import { ledMapSVG, ledRows, powerName } from './ledmap.js';
import { buildSteps, stepJointKinds } from './build/steps.js';
import { machineFamily, machineSettingsLine } from './export/machines.js';
import { laserFileName, DEFAULT_KERF, LASER_COLORS } from './export/laser.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Blade names per machine family (#22). A laser has no blades.
const SILHOUETTE_BLADES = { fine: 'AutoBlade', knife: 'Kraft Blade', rotary: 'Rotary Blade' };
const bladeName = (family, tool) => (family === 'silhouette' ? SILHOUETTE_BLADES[tool] || 'AutoBlade' : TOOL_NAMES[tool]);

/** "You'll need" tools sentence and the cutting section, per machine family. */
function cuttingFor(family, machine, { tools, scored, drawLabels }) {
  if (family === 'laser') {
    const kerf = machine.kerf ?? DEFAULT_KERF;
    return {
      need: `${esc(machine.name)} with a honeycomb or slatted bed`,
      heading: 'Cutting on a laser cutter',
      steps: [
        'Each sheet comes as an <code>.svg</code> and a <code>.dxf</code> in millimetres. Import one into your laser software at 100% scale (don\'t resize).',
        `Set the layers: <span class="chip" style="background:${LASER_COLORS.cut}">red</span> = cut through, <span class="chip" style="background:${LASER_COLORS.score}">blue</span> = light score for folds, <b>black</b> = engrave (part numbers).`,
        `The cut paths are already kerf-compensated for ${kerf} mm, so don't add an offset in the software.`,
        'Run a small test cut on a scrap of each material to set power and speed, then cut the sheet. Check the parts drop out before you move the material.',
      ],
    };
  }
  if (family === 'silhouette') {
    return {
      need: `${esc(machine.name)} with: ${tools.map(esc).join(', ')}${drawLabels ? ', a sketch pen' : ''}`,
      heading: 'Cutting in Silhouette Studio',
      steps: [
        'Each sheet comes as an <code>.svg</code> and a <code>.dxf</code> in millimetres. In the free Basic edition, open the <code>.dxf</code>; Designer edition and up can open the <code>.svg</code>, which keeps the colours. Open it at its original size.',
        `Set the line actions: <span class="chip" style="background:${LAYER_COLORS.cut}">black</span> = Cut${scored ? `, <span class="chip" style="background:${LAYER_COLORS.score}">magenta</span> = Score or Sketch` : ''}${drawLabels ? `, <span class="chip" style="background:${LAYER_COLORS.draw}">blue</span> = Sketch with the pen (part numbers)` : ''}.`,
        'Choose the matching material, blade and passes from each sheet\'s settings line below. For board, tape the edges to the mat and check the cut is through before unloading.',
      ],
    };
  }
  return {
    need: `${esc(machine.name)} with: ${tools.map(esc).join(', ')}${scored ? ', Scoring Stylus or Scoring Wheel' : ''}${drawLabels ? ', a fine-tip pen' : ''}`,
    heading: 'Cutting in Cricut Design Space',
    steps: [
      'Open a new project and <b>Upload → Upload Image</b> each <code>.svg</code> sheet file. Insert it at its original size (it\'s in millimetres — don\'t resize).',
      `With the sheet selected, click <b>Ungroup</b>, then set each layer's operation: <span class="chip" style="background:${LAYER_COLORS.cut}">black</span> = Basic Cut${scored ? `, <span class="chip" style="background:${LAYER_COLORS.score}">magenta</span> = Score` : ''}${drawLabels ? `, <span class="chip" style="background:${LAYER_COLORS.draw}">blue</span> = Pen (part numbers)` : ''}.`,
      'Select everything from one sheet and click <b>Attach</b> so the score/pen lines stay on their parts and the layout is kept.',
      'Click <b>Make</b>, choose the matching material setting (e.g. <i>Chipboard 2 mm</i>, <i>Basswood 1/16"</i>, <i>Medium Cardstock</i>), and use a fresh blade. For board, tape the edges to the mat and check the cut is through before unloading — you can\'t realign it afterwards.',
    ],
  };
}

export function guideHTML(kit, compiled) {
  const { groups, sheets, usedMats, machine, dims, parts } = compiled;
  const family = machineFamily(machine);
  const laser = family === 'laser';
  const sheetCounts = usedMats.map((m) => ({ m, n: sheets.filter((s) => s.material.id === m.id).length }));
  const tools = [...new Set(usedMats.map((m) => bladeName(family, m.tool)))];
  const scored = parts.some((p) => p.scores.length);
  const cutting = cuttingFor(family, machine, { tools, scored, drawLabels: kit.drawLabels });
  const fileName = (s) => (laser ? laserFileName(s, 'svg') : sheetFileName(s));

  const materialRows = sheetCounts.map(({ m, n }) => `<tr><td><span class="sw" style="background:${m.color}"></span>${esc(m.name)}</td><td>${m.thickness} mm</td><td>${n} × ${m.sheet[0]}×${m.sheet[1]} mm</td>${laser ? '' : `<td>${esc(bladeName(family, m.tool))}</td>`}</tr>`).join('');

  const matOf = new Map(groups.map((g) => [g.title, g.material]));
  const steps = buildSteps(kit, compiled).map((st) => {
    const meta = [
      matOf.get(st.group),
      st.parts.length ? `part${st.parts.length === 1 ? '' : 's'} ${st.parts.map((p) => `#${p}`).join(', ')}` : '',
      stepJointKinds(st).join(', '),
      st.kind !== 'info' && st.cureMin ? `let the glue set ${st.cureMin} min` : '',
    ].filter(Boolean);
    return `
    <section class="step step-${st.kind}" data-step="${st.n}">
      <h3><span class="num">${st.n}</span>${esc(st.title)}</h3>
      ${meta.length ? `<p class="meta">${esc(meta.join(' · '))}</p>` : ''}
      <ol>${st.text.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    </section>`;
  }).join('');

  const lit = compiled.lighting?.enabled && compiled.lighting.leds.length;
  const lighting = lit ? `
  <h2>Lighting</h2>
  <p>${compiled.lighting.leds.length} LED${compiled.lighting.leds.length === 1 ? '' : 's'} powered by a ${esc(powerName(compiled.lighting).toLowerCase())}. ${compiled.lighting.leds.some((l) => l.inside)
    ? 'The map shows the shell from behind, unfolded flat. Each LED sits in a cavity inside the shell: its dashed line runs down to the floor channel and along to a small hole in the back wall, already cut, and the solid line is its wire route from there to the power box.'
    : 'The map shows the room from behind, unfolded flat: wire holes are already cut, and each coloured line is that LED\'s wire route to the power box.'}</p>
  <div class="ledmap">${ledMapSVG(compiled, { standalone: true })}</div>
  <table><tr><th>LED</th><th>Name</th><th>Mounted on</th><th>Colour</th><th>Lead needed</th></tr>${ledRows(compiled).map((r) => `<tr><td><span class="sw" style="background:${r.wireColor}"></span>${r.label}</td><td>${esc(r.name || '—')}</td><td>${r.where}</td><td>${esc(r.color)}</td><td>≥ ${r.leadCm} cm</td></tr>`).join('')}</table>` : '';

  // What to buy for the lights (#57): T5's shopping list, prices always labelled as estimates.
  const money = (v) => v.toFixed(2);
  const list = lit ? shoppingList(compiled.lighting) : null;
  const buying = list ? `
  <h2>What to buy for the lights</h2>
  <table class="buying"><tr><th>Qty</th><th>Item</th><th>Note</th><th>Est. cost</th></tr>${list.items.map((i) => `<tr class="buy"><td>${i.qty}</td><td>${esc(i.name)}</td><td>${esc(i.note)}</td><td>$${money(i.cost.low)}–${money(i.cost.high)}</td></tr>`).join('')}<tr class="total"><td></td><td><b>Estimated total</b></td><td></td><td><b>$${money(list.total.low)}–${money(list.total.high)}</b></td></tr></table>
  <p class="buying-note">${esc(list.note)} The kit zip also includes this list as <code>shopping-list.csv</code>.</p>` : '';

  const sheetBlocks = sheets.map((s) => `
    <figure class="sheet">
      ${sheetPreviewSVG(s)}
      <figcaption>${esc(s.material.name)} — sheet ${s.index}/${s.count} · <code>${fileName(s)}</code><br>${esc(machineSettingsLine(s, machine))}</figcaption>
    </figure>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(kit.name)} – assembly guide</title>
<style>
  :root { --ink:#2b2420; --muted:#7a6c62; --line:#e6ddd3; --accent:#c0603a; --paper:#fffdf9; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--paper); margin: 0; padding: 32px 16px; }
  main { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 30px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 19px; margin: 36px 0 12px; padding-bottom: 6px; border-bottom: 2px solid var(--line); }
  h3 { font-size: 16px; margin: 0 0 2px; display: flex; align-items: center; gap: 10px; }
  .sub { color: var(--muted); margin: 0 0 20px; }
  .hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 24px; align-items: center; }
  .hero svg { width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 8px; vertical-align: -1px; border: 1px solid rgba(0,0,0,.2); }
  .num { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 13px; flex: none; }
  .step { break-inside: avoid; padding: 14px 0; border-bottom: 1px dashed var(--line); }
  .step ol { margin: 6px 0 0; padding-left: 56px; }
  .step li { margin: 3px 0; }
  .meta { color: var(--muted); font-size: 13px; margin: 0 0 0 36px; }
  .sheets { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }
  .sheet { margin: 0; break-inside: avoid; }
  .sheet-svg { width: 100%; height: auto; display: block; }
  .sheet-bg { fill: #fff; stroke: #cfc4b8; stroke-width: .6; }
  .part .cut { stroke: ${laser ? LASER_COLORS.cut : '#3a2e25'}; stroke-width: .35; }
  .part .score { stroke: ${laser ? LASER_COLORS.score : LAYER_COLORS.score}; stroke-width: .35; stroke-dasharray: 1.5 1; fill: none; }
  .part text { font-family: system-ui, sans-serif; font-weight: 600; fill: #2b2420; }
  td:nth-child(n+2) { white-space: nowrap; }
  figcaption { font-size: 12px; color: var(--muted); margin-top: 6px; }
  code { font-size: 12px; background: #f3ece4; padding: 1px 4px; border-radius: 3px; }
  .ds li { margin: 4px 0; }
  .ledmap { border: 1px solid var(--line); border-radius: 8px; padding: 10px; margin: 12px 0; break-inside: avoid; }
  .ledmap svg { width: 100%; height: auto; display: block; }
  .buying td:nth-child(2), .buying td:nth-child(3) { white-space: normal; }
  .buying td:nth-child(3) { color: var(--muted); }
  .buying-note { color: var(--muted); font-size: 13px; }
  .chip { display:inline-block; padding: 0 6px; border-radius: 4px; color:#fff; font-size: 12px; font-weight: 600; }
  @media (max-width: 640px) { .hero { grid-template-columns: 1fr; } }
  @media print { body { padding: 0; } h2 { break-after: avoid; } }
</style></head><body><main>
  <div class="hero">
    <div>
      <h1>${esc(kit.name)}</h1>
      <p class="sub">1:${kit.scale} miniature room kit · finished size ${dims.W.toFixed(0)} × ${dims.D.toFixed(0)} × ${dims.H.toFixed(0)} mm · ${parts.length} parts on ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}</p>
      <table><tr><th>Material</th><th>Thick</th><th>Sheets</th>${laser ? '' : '<th>Blade</th>'}</tr>${materialRows}</table>
    </div>
    ${renderScene(compiled.faces3d)}
  </div>

  <h2>You'll need</h2>
  <p>${cutting.need}${lit ? `, ${compiled.lighting.leds.length} pre-wired 3 V micro LEDs and a ${esc(powerName(compiled.lighting).toLowerCase())}` : ''}.${{ laser: '', silhouette: ' StrongHold mat for board, StandardHold for card, LightHold for thin paper.' }[family] ?? ' Strong-grip mat for board, standard grip for card, fabric grip for felt.'} PVA / tacky glue, a glue stick, masking tape, a craft knife and a metal ruler for clean-up.</p>

  <h2>${cutting.heading}</h2>
  <ol class="ds">
    ${cutting.steps.map((x) => `<li>${x}</li>`).join('\n    ')}
  </ol>

  <h2>Assembly</h2>
  ${steps}

  ${lighting}
  ${buying}

  <h2>Cut sheets</h2>
  <div class="sheets">${sheetBlocks}</div>
</main></body></html>`;
}
