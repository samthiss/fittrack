import test from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, findDuplicateGroups, pickSurvivor, stateOf } from './foodDuplicates.js';

test('the same food typed differently lands on one key', () => {
  assert.equal(nameKey('Blanc de poulet cuit'), nameKey('poulet blanc cuit'));
  assert.equal(nameKey('Yaourt nature'), nameKey('yaourt'));
  assert.equal(nameKey('Œuf entier'), nameKey('oeuf entier'));
  assert.equal(nameKey('Pâtes  complètes cuites'), nameKey('pates completes cuites'));
});

test('cooking state is never collapsed', () => {
  // 100 g of raw rice is 360 kcal against 130 cooked: merging these would corrupt every day they
  // appear in, silently and irreversibly.
  assert.notEqual(nameKey('Riz blanc cuit'), nameKey('Riz blanc cru'));
  assert.notEqual(nameKey('Lentilles cuites'), nameKey('Lentilles sèches'));
});

test('different foods stay apart', () => {
  assert.notEqual(nameKey('Poire'), nameKey('Poireau'));
  assert.notEqual(nameKey('Noix'), nameKey('Noix de cajou'));
  assert.notEqual(nameKey('Yaourt grec 0%'), nameKey('Yaourt grec 5%'));
  assert.notEqual(nameKey('Lait entier'), nameKey('Lait écrémé'));
});

test('only real groups are reported', () => {
  const foods = [
    { id: 1, name: 'Skyr' },
    { id: 2, name: 'skyr nature' },
    { id: 3, name: 'Riz blanc cuit' },
    { id: 4, name: 'Riz blanc cru' },
  ];
  const groups = findDuplicateGroups(foods);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((f) => f.id), [1, 2]);
});

test('an empty or punctuation-only name is not a group', () => {
  assert.deepEqual(findDuplicateGroups([{ id: 1, name: '' }, { id: 2, name: '  ' }, { id: 3, name: '---' }]), []);
});

test('the most-used food survives, oldest breaking the tie', () => {
  const group = [{ id: 7, name: 'Skyr' }, { id: 2, name: 'skyr nature' }];
  assert.equal(pickSurvivor(group, { 7: 12, 2: 3 }).id, 7, 'the one with history wins');
  assert.equal(pickSurvivor(group, {}).id, 2, 'with no history, the oldest wins');
});

test('a hand-typed name joins the catalogue entry that spells out its state', () => {
  // The common case: "blanc de poulet" typed months ago, "Blanc de poulet cuit" added since.
  const groups = findDuplicateGroups([
    { id: 1, name: 'blanc de poulet' },
    { id: 2, name: 'Blanc de poulet cuit' },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((f) => f.id).sort(), [1, 2]);
});

test('raw and cooked are still refused, even with a state-less name in the mix', () => {
  // "riz blanc" cannot choose between the two, so it is left alone rather than guessed at.
  const groups = findDuplicateGroups([
    { id: 1, name: 'riz blanc' },
    { id: 2, name: 'Riz blanc cuit' },
    { id: 3, name: 'Riz blanc cru' },
  ]);
  assert.deepEqual(groups, [], 'nothing may be merged when the state is ambiguous');
});

test('two spellings of the same cooked food group together', () => {
  const groups = findDuplicateGroups([
    { id: 1, name: 'Lentilles cuites' },
    { id: 2, name: 'lentilles cuite' },
    { id: 3, name: 'Lentilles sèches' },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((f) => f.id).sort(), [1, 2]);
});

test('stateOf reads the preparation, or admits there is none', () => {
  assert.equal(stateOf('Riz blanc cuit'), 'cooked');
  assert.equal(stateOf('Blanc de poulet cru'), 'raw');
  assert.equal(stateOf('Lentilles sèches'), 'dried');
  assert.equal(stateOf('Skyr'), null);
});
