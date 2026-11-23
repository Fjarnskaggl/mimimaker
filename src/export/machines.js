// Per-machine cut files, settings hints and README text.
//
// Each machine family gets the files its software reads best:
//   cricut     → the Design Space SVG (src/svg.js)
//   silhouette → the same SVG (Silhouette Studio Designer edition and up)
//                plus a plain DXF, which the free Basic edition can open
//   laser      → kerf-compensated laser SVG + DXF (src/export/laser.js)

import { sheetCutSVG, sheetFileName, LAYER_COLORS } from '../svg.js';
import { laserSheetSVG, laserSheetDXF, laserFileName, LASER_COLORS, DEFAULT_KERF } from './laser.js';
import { estimateCutMinutes, formatMinutes } from '../make.js';
import { withMaterialDefaults } from '../materials.js';

export function machineFamily(machine) {
  return machine?.family || 'cricut';
}

const SVG = 'image/svg+xml', DXF = 'application/dxf';
const titleOf = (title, sheet) => (typeof title === 'function' ? title(sheet) : title || '');

/** Files for one sheet: [{ name, data, type, label }]. */
export function sheetFiles(sheet, machine, { drawLabels = false, title = '' } = {}) {
  const t = titleOf(title, sheet);
  const family = machineFamily(machine);
  if (family === 'laser') {
    const kerf = machine.kerf ?? DEFAULT_KERF;
    return [
      { name: laserFileName(sheet, 'svg'), data: laserSheetSVG(sheet, { kerf, engraveLabels: true, title: t }), type: SVG, label: 'SVG' },
      { name: laserFileName(sheet, 'dxf'), data: laserSheetDXF(sheet, { kerf, engraveLabels: true }), type: DXF, label: 'DXF' },
    ];
  }
  const files = [{ name: sheetFileName(sheet), data: sheetCutSVG(sheet, { drawLabels, title: t }), type: SVG, label: 'SVG' }];
  if (family === 'silhouette') {
    files.push({ name: sheetFileName(sheet).replace(/\.svg$/, '.dxf'), data: laserSheetDXF(sheet, { kerf: 0, engraveLabels: drawLabels }), type: DXF, label: 'DXF' });
  }
  return files;
}

/** Every sheet's files for the kit zip, under cut-files/. */
export function kitCutFiles(sheets, machine, opts = {}) {
  return sheets.flatMap((s) => sheetFiles(s, machine, opts).map((f) => ({ ...f, name: `cut-files/${f.name}` })));
}

const SILHOUETTE_BLADES = { fine: 'AutoBlade', knife: 'Kraft Blade', rotary: 'Rotary Blade' };

/** One-line machine settings for a sheet card. */
export function machineSettingsLine(sheet, machine) {
  const m = withMaterialDefaults(sheet.material);
  const family = machineFamily(machine);
  if (family === 'laser') {
    return `kerf ${machine.kerf ?? DEFAULT_KERF} mm compensated · red = cut, blue = score, black = engrave · test power and speed on a scrap first`;
  }
  const time = `≈ ${formatMinutes(estimateCutMinutes(sheet))}`;
  if (family === 'silhouette') {
    return `${time} · Silhouette Studio: ${SILHOUETTE_BLADES[m.tool] || 'AutoBlade'}${m.tool === 'knife' ? `, ${m.passes} passes` : ''}`;
  }
  return `${time} · Design Space: ${m.cricut}${m.tool === 'knife' ? ` · ${m.passes} passes` : ''}`;
}

/** Colour legend for the sheets view: [{ label, color, dashed }]. */
export function layerLegend(machine) {
  if (machineFamily(machine) === 'laser') {
    return [
      { label: 'Cut', color: LASER_COLORS.cut },
      { label: 'Score / fold', color: LASER_COLORS.score, dashed: true },
      { label: 'Engrave', color: LASER_COLORS.engrave },
    ];
  }
  return [
    { label: 'Cut', color: LAYER_COLORS.cut },
    { label: 'Score / fold', color: LAYER_COLORS.score, dashed: true },
  ];
}

/** How to use the cut-files/ folder, for README.txt in the zip. */
export function machineReadme(machine) {
  const family = machineFamily(machine);
  if (family === 'laser') {
    return `Cut files are for a laser cutter (${machine.name}). Each sheet comes as an SVG and a DXF in millimetres.\n`
      + `Colours/layers: red (CUT) = cut through, blue (SCORE) = light score for folds, black (ENGRAVE) = part numbers.\n`
      + `Cut paths are already kerf-compensated for ${machine.kerf ?? DEFAULT_KERF} mm, so do not add an offset in your laser software.\n`
      + `Import at 100% scale and run a test cut on a scrap to set power and speed.\n`;
  }
  if (family === 'silhouette') {
    return `Cut files are for a ${machine.name}. Each sheet comes as an SVG and a DXF in millimetres.\n`
      + `Silhouette Studio Basic edition: open the DXF. Designer edition and up: the SVG keeps the cut/score colours.\n`
      + `Open at its original size, then set black lines to Cut and magenta lines to Score/Sketch.\n`;
  }
  return 'Upload each SVG in cut-files/ to Cricut Design Space at its original size.\n'
    + 'Black = Cut, magenta = Score, blue = Pen. Select all and Attach so score and pen lines stay on their parts.\n';
}
