// The Checks pill: every problem with the kit sits behind one pill in the
// header, instead of banners stacked above the stage (design system: Checks).

const RANK = { error: 0, warn: 1 };

/** Split "Thing: problem — advice. More advice." into a title and a hint. */
function split(msg) {
  const i = msg.indexOf(' — ');
  if (i < 0) return { title: msg, hint: '' };
  const rest = msg.slice(i + 3);
  return { title: msg.slice(0, i), hint: rest[0].toUpperCase() + rest.slice(1) };
}

/**
 * Summarise compile warnings for the pill and its popover.
 * Returns { state: 'ok'|'warning'|'danger', label, count, items, notes }:
 * items are the distinct errors and warnings (errors first, with `times`
 * for repeats); notes are the info-level tips.
 */
export function checksSummary(warnings = []) {
  const byMsg = new Map();
  for (const w of warnings) {
    if (!(w.level in RANK)) continue;
    const seen = byMsg.get(w.msg);
    if (seen) seen.times += 1;
    else byMsg.set(w.msg, { level: w.level, msg: w.msg, times: 1, ...split(w.msg) });
  }
  const items = [...byMsg.values()].sort((a, b) => RANK[a.level] - RANK[b.level]);
  const errors = items.filter((i) => i.level === 'error').length;
  const notes = warnings.filter((w) => w.level === 'info');
  if (errors) return { state: 'danger', label: `${errors} ${errors === 1 ? 'blocks' : 'block'} cutting`, count: items.length, items, notes };
  if (items.length) return { state: 'warning', label: `${items.length} to check`, count: items.length, items, notes };
  return { state: 'ok', label: 'All good', count: 0, items, notes };
}
