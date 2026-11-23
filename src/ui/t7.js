// T7 sharing UI: the remix credit shown on a design that came from the
// gallery or from someone's share link. Text is set as text nodes, never
// HTML, because the origin comes from a link anyone can make.

import { LICENCES, kitOrigin } from '../share.js';

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
