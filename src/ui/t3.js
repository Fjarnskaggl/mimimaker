// T3 (make & export) UI pieces. Plain DOM so src/app.js only wires them in.

import { sheetFiles, machineSettingsLine, layerLegend } from '../export/machines.js';

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

/** Download buttons for one sheet card (one per file the machine needs). */
export function sheetDownloadButtons(sheet, machine, opts, download) {
  return sheetFiles(sheet, machine, opts).map((f) => el('button', {
    class: 'small', type: 'button', title: `Download ${f.name}`,
    onclick: () => download(f.name, f.data, f.type),
  }, f.label));
}

/** The settings line under a sheet preview. */
export function sheetSettings(sheet, machine) {
  return el('div', { class: 'cut-time' }, machineSettingsLine(sheet, machine));
}

/** Layer colour legend for the sheets view. */
export function sheetLegend(machine, note) {
  return el('div', { class: 'legend' },
    ...layerLegend(machine).map((l) => el('span', {}, el('i', { style: `border-color:${l.color}${l.dashed ? ';border-top-style:dashed' : ''}` }), l.label)),
    el('span', {}, note));
}
