// T7 sharing UI: the remix credit shown on a design that came from the
// gallery or from someone's share link. Text is set as text nodes, never
// HTML, because the origin comes from a link anyone can make.

import { LICENCES, kitOrigin, licenceChoices, makeSubmission, submissionProblems, SUBMIT_UPLOAD_URL, SUBMIT_GUIDE_URL } from '../share.js';

/**
 * "Remix of <title> by <author> · <licence>" for the room inspector, or null
 * when the design has no origin. `h` is the app's element helper.
 */
export function remixCredit(kit, { h }) {
  const o = kitOrigin(kit);
  if (!o) return null;
  const title = o.id
    ? h('a', { href: `gallery/#kit-${o.id}`, target: '_blank', rel: 'noopener' }, o.title)
    : h('strong', {}, o.title);
  const lic = o.licence ? LICENCES[o.licence] : null;
  return h('p', { class: 'hint remix-credit', 'data-origin': o.id || '' },
    'Remix of ', title,
    o.author ? ` by ${o.author}` : '',
    lic ? [' · ', h('a', { href: lic.url, target: '_blank', rel: 'license noopener' }, lic.name)] : '');
}

/** Toast text for opening a shared design. */
export function openedSharedText(kit) {
  const o = kitOrigin(kit);
  if (!o) return `Opened a shared design: ${kit.name}. Your own designs are untouched until you edit this one.`;
  return `Opened ${o.title}${o.author ? ` by ${o.author}` : ''}. It's your copy to change; the credit stays with it.`;
}

// ------------------------------------------------------------ submit flow

/**
 * Fill the <dialog id="submit"> with the "Submit to the gallery" form for the
 * open design. `download(name, data, type)` saves the file; `ic(name)` is an icon.
 * Nothing leaves the browser: the visitor uploads the file on GitHub themselves.
 */
export function openSubmitDialog(dlg, kit, { h, download, ic }) {
  const origin = kitOrigin(kit);
  const choices = licenceChoices(origin?.licence);
  const form = { title: kit.name || '', author: '', licence: choices[0], description: '', tags: '' };
  const field = (label, control, hint) => h('label', { class: 'field submit-field' }, h('span', {}, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
  const input = (name, attrs = {}) => h('input', { name, value: form[name], autocomplete: 'off', spellcheck: name === 'title' ? 'true' : 'false', ...attrs, oninput: (e) => { form[name] = e.target.value; refresh(); } });
  const licence = h('select', { name: 'licence', onchange: (e) => { form.licence = e.target.value; refresh(); } },
    choices.map((k) => h('option', { value: k }, LICENCES[k].name)));
  const desc = h('textarea', { name: 'description', rows: 3, maxlength: 500, oninput: (e) => { form.description = e.target.value; refresh(); } });
  const fileLine = h('p', { class: 'hint submit-file' });
  const problems = h('ul', { class: 'submit-problems' });
  const dl = h('button', { id: 'submit-download', type: 'button', class: 'mm-btn mm-btn--primary' }, ic('download'), 'Download submission file');
  let entry;
  function refresh() {
    entry = makeSubmission(kit, form);
    fileLine.textContent = entry.meta.id ? `File: ${entry.meta.id}.kit.json` : 'File: (needs a title)';
    const errs = submissionProblems(entry, kit).map(friendly);
    problems.replaceChildren(...errs.map((e) => h('li', {}, e)));
    dl.disabled = errs.length > 0;
  }
  dl.addEventListener('click', () => {
    if (dl.disabled) return;
    download(`${entry.meta.id}.kit.json`, JSON.stringify(entry, null, 2) + '\n', 'application/json');
  });
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  dlg.replaceChildren(h('div', { class: 'submit-inner' },
    h('div', { class: 'submit-head' },
      h('h2', {}, 'Submit to the gallery'),
      h('button', { type: 'button', class: 'mm-btn mm-btn--quiet mm-btn--icon', 'aria-label': 'Close', onclick: () => dlg.close() }, ic('close'))),
    h('p', { class: 'hint' }, 'Share this design in the mimimaker gallery so anyone can open, remix and cut it. Nothing is uploaded from here: you download a file and add it on GitHub.'),
    origin ? h('p', { class: 'submit-remix' }, `Remix of ${origin.title}${origin.author ? ` by ${origin.author}` : ''}. The gallery will credit it.`) : null,
    field('Title', input('title', { maxlength: 80 })),
    field('Your handle', input('author', { maxlength: 39, placeholder: 'e.g. tiny_rooms' }), 'Shown as the author. Letters, digits, _ . - (not your email).'),
    field('Licence', licence, origin?.licence && choices.length < 4 ? `The kit you remixed is ${LICENCES[origin.licence].name.split(' (')[0]}, so these are the licences it allows.` : 'How others may use your design.'),
    field('Description', desc, 'Optional, up to 500 characters.'),
    field('Tags', input('tags', { placeholder: 'e.g. kitchen, cozy' }), 'Optional, separated by commas.'),
    fileLine, problems,
    h('div', { class: 'submit-actions' }, dl),
    h('ol', { class: 'submit-steps' },
      h('li', {}, 'Download the submission file above.'),
      h('li', {}, 'Open the ', link(SUBMIT_UPLOAD_URL, 'gallery\'s kits folder on GitHub'), ' and sign in. A free GitHub account is all you need; there is no account on mimimaker.'),
      h('li', {}, 'Drag the file onto the page. GitHub makes your own copy of the project for you.'),
      h('li', {}, 'Write a line about your kit and choose ', h('strong', {}, 'Propose changes'), ', then ', h('strong', {}, 'Create pull request'), '.'),
      h('li', {}, 'Automatic checks test the file and say if anything needs fixing. Once it is reviewed and merged, your kit appears in the gallery.')),
    h('p', { class: 'hint' }, 'More detail: ', link(SUBMIT_GUIDE_URL, 'the kit format and rules')),
  ));
  licence.value = form.licence;
  refresh();
  dlg.showModal();
}

// validateEntry speaks to kit-file authors; say the same things in form terms.
const FRIENDLY = [
  [/^meta\.id /, 'Add a title with some letters or digits (it also names the file).'],
  [/^meta\.title /, 'Add a title, up to 80 characters.'],
  [/^meta\.author /, 'Add your handle: letters, digits, _ . - (no @ or spaces).'],
  [/^meta\.description /, 'Keep the description to 500 characters.'],
  [/^meta\.tags /, 'Use up to 8 tags.'],
  [/^meta\.remixedFrom cannot point/, 'Change the title a little: it names the file, and the kit you remixed already uses that name.'],
];
const friendly = (e) => FRIENDLY.find(([re]) => re.test(e))?.[1] || e.replace(/^meta\.licence: /, '').replace(/^a /, 'A ');

// --------------------------------------------------------- creator bundle
/**
 * Fill <dialog id="bundle"> with the creator-bundle form: a handle and a
 * licence, then a zip of box art, cut files per machine, guide and licence.
 * `bundle(kit, opts)` builds the files; `zip(files)` packs them.
 */
export function openBundleDialog(dlg, kit, { h, download, ic, bundle, zip }) {
  const origin = kitOrigin(kit);
  const choices = licenceChoices(origin?.licence);
  const form = { author: '', licence: choices[0] };
  const field = (label, control, hint) => h('label', { class: 'field submit-field' }, h('span', {}, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
  const author = h('input', { name: 'author', maxlength: 39, autocomplete: 'off', spellcheck: 'false', placeholder: 'e.g. tiny_rooms', oninput: (e) => { form.author = e.target.value; refresh(); } });
  const licence = h('select', { name: 'licence', onchange: (e) => { form.licence = e.target.value; refresh(); } },
    choices.map((k) => h('option', { value: k }, LICENCES[k].name)));
  const problems = h('ul', { class: 'submit-problems' });
  const sale = h('p', { class: 'hint bundle-sale' });
  const dl = h('button', { id: 'bundle-download', type: 'button', class: 'mm-btn mm-btn--primary' }, ic('download'), 'Download creator bundle');
  let result;
  function refresh() {
    result = bundle(kit, { author: form.author.trim().replace(/^@/, ''), licence: form.licence, dryRun: true });
    problems.replaceChildren(...result.problems.map((p) => h('li', {}, p)));
    dl.disabled = result.problems.length > 0;
    sale.textContent = form.licence === 'CC-BY-NC-4.0'
      ? 'CC BY-NC: others may share and remix it with credit, but nobody (including buyers) may sell it.'
      : 'You may sell this kit. Others may use it under the licence you pick.';
  }
  dl.addEventListener('click', () => {
    if (dl.disabled) return;
    const full = bundle(kit, { author: form.author.trim().replace(/^@/, ''), licence: form.licence });
    if (full.problems.length) return;
    download(full.zipName, zip(full.files), 'application/zip');
  });
  dlg.replaceChildren(h('div', { class: 'submit-inner' },
    h('div', { class: 'submit-head' },
      h('h2', {}, 'Creator bundle'),
      h('button', { type: 'button', class: 'mm-btn mm-btn--quiet mm-btn--icon', 'aria-label': 'Close', onclick: () => dlg.close() }, ic('close'))),
    h('p', { class: 'hint' }, 'Everything you need to sell or give away this kit: box-art renders, cut files for Cricut, Silhouette and laser cutters, the assembly guide with your name on it, a licence file and the design. No watermark.'),
    origin ? h('p', { class: 'submit-remix' }, `Remix of ${origin.title}${origin.author ? ` by ${origin.author}` : ''}. The bundle credits it.`) : null,
    field('Your handle', author, 'Shown as the designer. Letters, digits, _ . - (not your email).'),
    field('Licence', licence, origin?.licence && choices.length < 4 ? `The kit you remixed is ${LICENCES[origin.licence].name.split(' (')[0]}, so these are the licences it allows.` : 'How others may use your design.'),
    sale, problems,
    h('div', { class: 'submit-actions' }, dl)));
  licence.value = form.licence;
  refresh();
  dlg.showModal();
}
