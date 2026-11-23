// The Checks pill: every problem with the kit lives behind one header pill
// (design system: "Checks"), instead of banners stacked above the stage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksSummary } from '../src/ui/checks.js';

const info = { level: 'info', msg: 'Floor lights feed their wires underneath the room.' };
const thin = (who) => ({ level: 'warn', msg: `${who}: finger joints are only 1.0 mm wide — the Knife Blade is cleaner above 3 mm. Make it bigger.` });
const big = { level: 'error', msg: 'Part #1 (Room box – Floor, 837×94 mm) is larger than a 279×279 mm Chipboard 2.0 mm sheet.' };

test('no problems: all good, and info notes are kept apart', () => {
  const s = checksSummary([info]);
  assert.equal(s.state, 'ok');
  assert.equal(s.label, 'All good');
  assert.equal(s.count, 0);
  assert.deepEqual(s.items, []);
  assert.equal(s.notes.length, 1);
  assert.equal(checksSummary([]).label, 'All good');
});

test('warnings only: "N to check", identical messages counted once', () => {
  const s = checksSummary([info, thin('Armchair'), thin('Armchair'), thin('Room box')]);
  assert.equal(s.state, 'warning');
  assert.equal(s.label, '2 to check');
  assert.equal(s.count, 2);
  assert.equal(s.items[0].times, 2, 'the armchair warning appeared twice');
  assert.equal(checksSummary([thin('Desk')]).label, '1 to check');
});

test('errors win: "N blocks cutting" and errors are listed first', () => {
  const s = checksSummary([thin('Desk'), big]);
  assert.equal(s.state, 'danger');
  assert.equal(s.label, '1 blocks cutting');
  assert.equal(s.count, 2);
  assert.deepEqual(s.items.map((i) => i.level), ['error', 'warn']);
  const two = checksSummary([big, { ...big, msg: big.msg.replace('#1', '#2') }]);
  assert.equal(two.label, '2 block cutting');
});

test('each item splits into a short title and a hint', () => {
  const [item] = checksSummary([thin('Desk')]).items;
  assert.equal(item.title, 'Desk: finger joints are only 1.0 mm wide');
  assert.equal(item.hint, 'The Knife Blade is cleaner above 3 mm. Make it bigger.');
  const [plain] = checksSummary([big]).items;
  assert.equal(plain.title, big.msg, 'a message without a dash stays whole');
  assert.equal(plain.hint, '');
});
