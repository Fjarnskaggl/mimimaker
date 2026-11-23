// T7 creator bundle: a zip a designer can sell or give away. Box art renders,
// cut files for each machine family, the assembly guide with the creator's
// name, a licence file and the design. No mimimaker watermark anywhere.

import { compileKit } from '../kit.js';
import { renderScene } from '../preview3d.js';
import { kitCutFiles } from '../export/machines.js';
import { guideHTML } from '../guide.js';
import { MACHINES } from '../materials.js';
import { LICENCES, HANDLE_RE, kitOrigin, slugify, makeSubmission, submissionProblems } from '../share.js';

/** One machine per family; each gets its own cut-files/<family>/ folder. */
export const BUNDLE_MACHINES = { cricut: 'maker', silhouette: 'cameo', laser: 'laser' };

const VIEWS = [
  ['front', { yaw: -30, pitch: 24 }],
  ['side', { yaw: 35, pitch: 20 }],
  ['top', { yaw: -30, pitch: 62 }],
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortName = (key) => LICENCES[key].name.split(' (')[0];

/**
 * Build the bundle for `kit`. `author` is the creator's handle, `licence` a
 * LICENCES key. Returns { files: [{ name, data }], problems: string[], zipName }.
 * When there are problems (or with dryRun, to check the form), files is empty.
 */
export function creatorBundle(kit, { author = '', licence = 'CC-BY-4.0', dryRun = false } = {}) {
  const title = (kit.name || 'My room').trim();
  const id = slugify(title) || 'my-room';
  const entry = makeSubmission(kit, { id, title, author, licence });
  const problems = submissionProblems(entry, kit)
    .filter((p) => !/^meta\.(id|remixedFrom cannot)/.test(p))
    .map((p) => (/^meta\.author /.test(p) ? 'Add your handle: letters, digits, _ . - (no @ or spaces).' : p.replace(/^meta\.licence: /, '').replace(/^a /, 'A ')));
  const zipName = `${id}-creator-bundle.zip`;
  if (problems.length || dryRun) return { files: [], problems, zipName };

  const origin = kitOrigin(kit);
  const lic = LICENCES[licence];
  const compiled = compileKit(kit);
  const files = [];

  // Box art
  for (const [view, angle] of VIEWS) files.push({ name: `box-art/${id}-${view}.svg`, data: renderScene(compiled.faces3d, angle) });
  if (kit.lighting?.enabled && kit.lighting.leds?.length) {
    files.push({ name: `box-art/${id}-night.svg`, data: renderScene(compiled.faces3d, { ...VIEWS[0][1], night: true }) });
  }

  // Cut files, one folder per machine family
  for (const [family, machineId] of Object.entries(BUNDLE_MACHINES)) {
    const c = machineId === kit.machine ? compiled : compileKit({ ...kit, machine: machineId });
    for (const f of kitCutFiles(c.sheets, c.machine, { drawLabels: kit.drawLabels, title: (s) => `${title} – ${s.material.name} ${s.index}` })) {
      files.push({ ...f, name: f.name.replace(/^cut-files\//, `cut-files/${family}/`) });
    }
  }

  // Guide, with the creator's credit under its opening tag
  const credit = `<p class="creator-credit" style="margin:0 0 12px;font:500 14px/1.4 system-ui,sans-serif">Designed by ${esc(author)} · <a href="${esc(lic.url)}">${esc(shortName(licence))}</a>${origin ? ` · Remix of ${esc(origin.title)}${origin.author ? ` by ${esc(origin.author)}` : ''}` : ''}</p>`;
  const guide = guideHTML(kit, compiled);
  files.push({ name: 'assembly-guide.html', data: /<body[^>]*>/.test(guide) ? guide.replace(/<body[^>]*>/, (m) => `${m}\n${credit}`) : credit + guide });

  // Licence, README, design
  const remixLine = origin ? `Remix of ${origin.title}${origin.author ? ` by ${origin.author}` : ''}${origin.licence ? `, used under ${shortName(origin.licence)}` : ''}.\n` : '';
  files.push({
    name: 'LICENSE.txt',
    data: `${title}\nDesigned by ${author}\n${remixLine}\nLicensed under ${lic.name}.\n${lic.url}\n`,
  });
  const selling = licence === 'CC-BY-NC-4.0'
    ? 'This kit is licensed CC BY-NC 4.0, so it is not for sale: share it free, with credit.'
    : 'You may sell this kit (printed, cut or as files) under its licence, with the credit in LICENSE.txt.';
  const machineList = Object.entries(BUNDLE_MACHINES).map(([fam, m]) => `  cut-files/${fam}/  ${MACHINES[m].name}`).join('\n');
  files.push({
    name: 'README.txt',
    data: `${title} by ${author}\n\n${selling}\n\nWhat's inside\n  box-art/      renders of the finished room for a cover or listing\n${machineList}\n  assembly-guide.html  parts list and steps; open it in a browser and print, or "Save as PDF"\n  ${id}.kit.json  the design; open it in mimimaker with File → Open a file to change it\n  LICENSE.txt   how others may use this design\n`,
  });
  files.push({ name: `${id}.kit.json`, data: JSON.stringify(entry, null, 2) + '\n' });
  return { files, problems: [], zipName };
}
