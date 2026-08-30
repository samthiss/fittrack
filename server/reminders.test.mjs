import test from 'node:test';
import assert from 'node:assert/strict';
import { localNow, slotDueAt, supplementsForSlot, buildReminderMessage, isValidTime } from './reminders.js';

test('localNow reads the wall clock where the user is, not on the server', () => {
  // 06:30 UTC in winter is 07:30 in Paris.
  const winter = new Date('2026-01-15T06:30:00Z');
  assert.deepEqual(localNow(winter, 'Europe/Paris'), { date: '2026-01-15', time: '07:30' });
  // ...and 08:30 in summer: the offset must come from the zone, never from a stored number.
  const summer = new Date('2026-07-15T06:30:00Z');
  assert.deepEqual(localNow(summer, 'Europe/Paris'), { date: '2026-07-15', time: '08:30' });
});

test('localNow rolls the local day over before the UTC one', () => {
  // 23:10 UTC is already the next day in Paris.
  assert.deepEqual(localNow(new Date('2026-03-04T23:10:00Z'), 'Europe/Paris'), { date: '2026-03-05', time: '00:10' });
});

test('localNow falls back to Paris on a bogus timezone instead of throwing', () => {
  assert.deepEqual(localNow(new Date('2026-01-15T06:30:00Z'), 'Not/AZone'), { date: '2026-01-15', time: '07:30' });
});

test('slotDueAt fires only on the exact minute, and only for a configured slot', () => {
  const profile = { reminder_morning_at: '08:00', reminder_evening_at: '20:30' };
  assert.equal(slotDueAt(profile, '08:00'), 'morning');
  assert.equal(slotDueAt(profile, '20:30'), 'evening');
  assert.equal(slotDueAt(profile, '08:01'), null);
  assert.equal(slotDueAt({ reminder_morning_at: null, reminder_evening_at: null }, '08:00'), null);
  assert.equal(slotDueAt({ reminder_morning_at: 'nonsense' }, 'nonsense'), null);
});

test('isValidTime accepts HH:MM only', () => {
  assert.ok(isValidTime('00:00') && isValidTime('23:59'));
  assert.ok(!isValidTime('24:00') && !isValidTime('7:00') && !isValidTime('') && !isValidTime(null));
});

const supplements = [
  { name: 'Magnésium', dueToday: true, taken: false, time_of_day: ['matin'] },
  { name: 'Vitamine D', dueToday: true, taken: false, time_of_day: [] },
  { name: 'Zinc', dueToday: true, taken: false, time_of_day: ['soir'] },
  { name: 'Oméga-3', dueToday: true, taken: true, time_of_day: ['matin'] },
  { name: 'Fer', dueToday: false, taken: false, time_of_day: ['matin'] },
];

test('the morning slot covers "matin" and untagged, never the evening-only ones', () => {
  assert.deepEqual(supplementsForSlot(supplements, 'morning').map((s) => s.name), ['Magnésium', 'Vitamine D']);
});

test('the evening slot is the last call: everything still outstanding', () => {
  assert.deepEqual(supplementsForSlot(supplements, 'evening').map((s) => s.name), ['Magnésium', 'Vitamine D', 'Zinc']);
});

test('what is taken, or not due today, is never mentioned', () => {
  for (const slot of ['morning', 'evening']) {
    const names = supplementsForSlot(supplements, slot).map((s) => s.name);
    assert.ok(!names.includes('Oméga-3'), 'a supplement already taken must not be listed');
    assert.ok(!names.includes('Fer'), 'a supplement not due today must not be listed');
  }
});

test('nothing left means no notification at all', () => {
  const allDone = supplements.map((s) => ({ ...s, taken: true }));
  assert.equal(buildReminderMessage(supplementsForSlot(allDone, 'evening'), 'evening'), null);
});

test('the message names what is missing, and stays short when the list is long', () => {
  const message = buildReminderMessage(supplementsForSlot(supplements, 'evening'), 'evening');
  assert.equal(message.body, 'Pas encore pris : Magnésium, Vitamine D, Zinc');
  const many = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, dueToday: true, taken: false, time_of_day: [] }));
  assert.equal(buildReminderMessage(many, 'morning').body, 'Pas encore pris : A, B, C +2');
});
