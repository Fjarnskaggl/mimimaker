// Printable, self-contained assembly guide (HTML).

import { sheetPreviewSVG, sheetFileName, LAYER_COLORS } from './svg.js';
import { TOOL_NAMES } from './materials.js';
import { renderScene } from './preview3d.js';
import { ledMapSVG, ledRows, powerName } from './ledmap.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function guideHTML(kit, compiled) {
  const { groups, sheets, usedMats, machine, dims, parts } = compiled;
  const sheetCounts = usedMats.map((m) => ({ m, n: sheets.filter((s) => s.material.id === m.id).length }));
  const tools = [...new Set(usedMats.map((m) => m.tool))].map((t) => TOOL_NAMES[t]);
  const scored = parts.some((p) => p.scores.length);

  const materialRows = sheetCounts.map(({ m, n }) => `<tr><td><span class="sw" style="background:${m.color}"></span>${esc(m.name)}</td><td>${m.thickness} mm</td><td>${n} × ${m.sheet[0]}×${m.sheet[1]} mm</td><td>${esc(TOOL_NAMES[m.tool])}</td></tr>`).join('');

  const steps = groups.filter((g) => g.parts.length).map((g, i) => `
    <section class="step">
      <h3><span class="num">${i + 1}</span>${esc(g.title)}</h3>
      <p class="meta">${esc(g.material || '')} · parts ${g.parts.map((p) => `#${p}`).join(', ')}</p>
      <ol>${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    </section>`).join('');

  const lit = compiled.lighting?.enabled && compiled.lighting.leds.length;
  const lightSteps = groups.find((g) => g.title === 'Lighting')?.steps || [];
  const lighting = lit ? `
  <h2>Lighting</h2>
  <p>${compiled.lighting.leds.length} LED${compiled.lighting.leds.length === 1 ? '' : 's'} powered by a ${esc(powerName(compiled.lighting).toLowerCase())}. The map shows the room from behind, unfolded flat: wire holes are already cut, and each coloured line is that LED's wire route to the power box.</p>
  <div class="ledmap">${ledMapSVG(compiled, { standalone: true })}</div>
  <table><tr><th>LED</th><th>Name</th><th>Mounted on</th><th>Colour</th><th>Lead needed</th></tr>${ledRows(compiled).map((r) => `<tr><td><span class="sw" style="background:${r.wireColor}"></span>${r.label}</td><td>${esc(r.name || '—')}</td><td>${r.where}</td><td>${esc(r.color)}</td><td>≥ ${r.leadCm} cm</td></tr>`).join('')}</table>
  <ol class="ds">${lightSteps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '';

  const sheetBlocks = sheets.map((s) => `
    <figure class="sheet">
      ${sheetPreviewSVG(s)}
      <figcaption>${esc(s.material.name)} — sheet ${s.index}/${s.count} · <code>${sheetFileName(s)}</code></figcaption>
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
  .part .cut { stroke: #3a2e25; stroke-width: .35; }
  .part .score { stroke: ${LAYER_COLORS.score}; stroke-width: .35; stroke-dasharray: 1.5 1; fill: none; }
  .part text { font-family: system-ui, sans-serif; font-weight: 600; fill: #2b2420; }
  td:nth-child(n+2) { white-space: nowrap; }
  figcaption { font-size: 12px; color: var(--muted); margin-top: 6px; }
  code { font-size: 12px; background: #f3ece4; padding: 1px 4px; border-radius: 3px; }
  .ds li { margin: 4px 0; }
  .ledmap { border: 1px solid var(--line); border-radius: 8px; padding: 10px; margin: 12px 0; break-inside: avoid; }
  .ledmap svg { width: 100%; height: auto; display: block; }
  .chip { display:inline-block; padding: 0 6px; border-radius: 4px; color:#fff; font-size: 12px; font-weight: 600; }
  @media (max-width: 640px) { .hero { grid-template-columns: 1fr; } }
  @media print { body { padding: 0; } h2 { break-after: avoid; } }
</style></head><body><main>
  <div class="hero">
    <div>
      <h1>${esc(kit.name)}</h1>
      <p class="sub">1:${kit.scale} miniature room kit · finished size ${dims.W.toFixed(0)} × ${dims.D.toFixed(0)} × ${dims.H.toFixed(0)} mm · ${parts.length} parts on ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}</p>
      <table><tr><th>Material</th><th>Thick</th><th>Sheets</th><th>Blade</th></tr>${materialRows}</table>
    </div>
    ${renderScene(compiled.faces3d)}
  </div>

  <h2>You'll need</h2>
  <p>${esc(machine.name)} with: ${tools.map(esc).join(', ')}${scored ? ', Scoring Stylus or Scoring Wheel' : ''}${kit.drawLabels ? ', a fine-tip pen' : ''}${lit ? `, ${compiled.lighting.leds.length} pre-wired 3 V micro LEDs and a ${esc(powerName(compiled.lighting).toLowerCase())}` : ''}. Strong-grip mat for board, standard grip for card, fabric grip for felt. PVA / tacky glue, a glue stick, masking tape, a craft knife and a metal ruler for clean-up.</p>

  <h2>Cutting in Cricut Design Space</h2>
  <ol class="ds">
    <li>Open a new project and <b>Upload → Upload Image</b> each <code>.svg</code> sheet file. Insert it at its original size (it's in millimetres — don't resize).</li>
    <li>With the sheet selected, click <b>Ungroup</b>, then set each layer's operation: <span class="chip" style="background:${LAYER_COLORS.cut}">black</span> = Basic Cut${scored ? `, <span class="chip" style="background:${LAYER_COLORS.score}">magenta</span> = Score` : ''}${kit.drawLabels ? `, <span class="chip" style="background:${LAYER_COLORS.draw}">blue</span> = Pen (part numbers)` : ''}.</li>
    <li>Select everything from one sheet and click <b>Attach</b> so the score/pen lines stay on their parts and the layout is kept.</li>
    <li>Click <b>Make</b>, choose the matching material setting (e.g. <i>Chipboard 2 mm</i>, <i>Basswood 1/16"</i>, <i>Medium Cardstock</i>), and use a fresh blade. For board, tape the edges to the mat and check the cut is through before unloading — you can't realign it afterwards.</li>
  </ol>

  <h2>Assembly</h2>
  ${steps}

  ${lighting}

  <h2>Cut sheets</h2>
  <div class="sheets">${sheetBlocks}</div>
</main></body></html>`;
}
