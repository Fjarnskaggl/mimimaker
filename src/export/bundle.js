// The kit zip's cut files: the chosen machine's, or every machine's in its
// own folder, plus README text that explains them and lists every file.

import { MACHINES, TOOL_NAMES, machineFor } from '../materials.js';
import { kitCutFiles, machineReadme } from './machines.js';

const idOf = (machine) => Object.keys(MACHINES).find((k) => MACHINES[k] === machine || MACHINES[k].name === machine?.name);

/** Materials the machine has no blade for, as one README line (or none). */
function cantCut(compiled, machine) {
  const byTool = new Map();
  for (const m of compiled.usedMats || []) {
    if (m && !machine.tools.includes(m.tool)) byTool.set(m.tool, [...(byTool.get(m.tool) || []), m.name]);
  }
  if (!byTool.size) return [];
  return [`   Can't cut ${[...byTool].map(([tool, names]) => `${names.join(', ')} (needs the ${TOOL_NAMES[tool]})`).join('; ')}.`];
}

/** Parts the compiler left off this machine's sheets because they don't fit its mat. */
function tooBig(compiled) {
  const ids = (compiled.warnings || []).map((w) => /^Part #(\d+)[\s\S]*is larger than a/.exec(w.msg)?.[1]).filter(Boolean);
  if (!ids.length) return [];
  return [`   Missing ${ids.length} part${ids.length === 1 ? '' : 's'} too big for its mat: ${ids.map((id) => `#${id}`).join(' ')}. Cut those on a bigger machine or by hand.`];
}

/**
 * Cut files for the kit zip.
 *   compileFor: compileKit, used to lay the kit out on each other machine's mat
 *   opts: { drawLabels, title, allMachines }
 * Returns { files, readme }.
 */
export function zipCutFiles(kit, compiled, compileFor, { allMachines = false, ...opts } = {}) {
  if (!allMachines) {
    return { files: kitCutFiles(compiled.sheets, compiled.machine, opts), readme: machineReadme(compiled.machine) };
  }
  const chosen = MACHINES[kit.machine] ? kit.machine : idOf(compiled.machine);
  const files = [];
  const lines = ['Cut files for every machine are in cut-files/<machine>/. Use the folder for yours:'];
  for (const id of Object.keys(MACHINES)) {
    const machine = machineFor(kit, id);
    // the chosen machine keeps its (possibly true-shape nested) sheets; one
    // machine failing to lay the kit out never blocks the download
    let c;
    try {
      c = id === chosen ? compiled : compileFor({ ...kit, machine: id });
    } catch (err) {
      lines.push(` - cut-files/${id}/  ${machine.name}: couldn't lay the kit out for this machine (${err?.message || err}).`);
      continue;
    }
    const own = kitCutFiles(c.sheets, machine, opts).map((f) => ({ ...f, name: f.name.replace(/^cut-files\//, `cut-files/${id}/`) }));
    files.push(...own);
    lines.push(` - cut-files/${id}/  ${machine.name}: ${c.sheets.length} sheet${c.sheets.length === 1 ? '' : 's'}${id === chosen ? ' (the machine this kit was designed on)' : ''}`);
    lines.push(...cantCut(c, machine), ...tooBig(c));
  }
  const FAMILY = { cricut: 'Cricut', silhouette: 'Silhouette', laser: 'Laser cutter' };
  const families = [...new Set(Object.values(MACHINES).map((m) => m.family))].map((family) => {
    const ids = Object.keys(MACHINES).filter((k) => MACHINES[k].family === family);
    const first = MACHINES[ids[0]];
    const how = machineReadme(family === 'silhouette' ? { ...first, name: 'Silhouette machine' } : first)
      .replace(/ in cut-files\/ /g, ' in your machine\'s cut-files/ folder ');
    return `${FAMILY[family] || family} (${ids.map((k) => `cut-files/${k}/`).join(', ')}):\n${how}`;
  });
  return { files, readme: `${lines.join('\n')}\n\n${families.join('\n')}\n` };
}

const DESCRIBE = [
  [/^README\.txt$/, () => 'this file'],
  [/\/README\.txt$/, () => 'how to use this folder'],
  [/^cut-files\/([^/]+)\//, (m) => `cut file for the ${MACHINES[m[1]]?.name || m[1]}`],
  [/^cut-files\//, () => 'cut file for your machine'],
  [/^hand-cut\//, () => 'print 1:1 and cut by hand'],
  [/^print-then-cut\//, () => 'textures to print, then cut (Cricut Print Then Cut)'],
  [/^assembly-guide\.html$/, () => 'parts list and step-by-step assembly (open in a browser)'],
  [/^led-map\.svg$/, () => 'LED wiring map'],
  [/^kit\.json$/, () => 're-opens this design in mimimaker'],
  [/shopping/i, () => 'shopping list'],
];

/** "Files in this zip" for README.txt: top-level files first, then folders. */
export function zipFileList(files) {
  const names = files.map((f) => f.name).filter((n, i, a) => a.indexOf(n) === i);
  names.sort((a, b) => (a.includes('/') - b.includes('/')) || a.localeCompare(b, 'en', { numeric: true }));
  const width = Math.min(48, Math.max(...names.map((n) => n.length)));
  const rows = names.map((n) => {
    const d = DESCRIBE.find(([re]) => re.test(n));
    const text = d ? d[1](n.match(d[0])) : '';
    return `  ${text ? n.padEnd(width) + '  ' + text : n}`.trimEnd();
  });
  return `Files in this zip\n${rows.join('\n')}\n`;
}
