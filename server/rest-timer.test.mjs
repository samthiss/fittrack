import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_REST_SECONDS,
  MAX_REST_SECONDS,
  MAX_LATENESS_MS,
  isValidRestSeconds,
  isWorthSending,
  buildRestDoneMessage,
} from './restTimer.js';

test('accepts a plausible rest and rejects what would misfire', () => {
  assert.equal(isValidRestSeconds(90), true);
  assert.equal(isValidRestSeconds(MIN_REST_SECONDS), true);
  assert.equal(isValidRestSeconds(MAX_REST_SECONDS), true);
  // 0 would fire a push the same second the rest started.
  assert.equal(isValidRestSeconds(0), false);
  assert.equal(isValidRestSeconds(-30), false);
  assert.equal(isValidRestSeconds(MAX_REST_SECONDS + 1), false);
  assert.equal(isValidRestSeconds('90'), true, 'JSON bodies arrive as strings often enough');
  assert.equal(isValidRestSeconds('bientôt'), false);
  assert.equal(isValidRestSeconds(undefined), false);
  assert.equal(isValidRestSeconds(null), false, 'Number(null) is 0, which must not slip through');
});

test('a rest due during a redeploy still buzzes, one from a finished workout does not', () => {
  const now = 1_700_000_000_000;
  assert.equal(isWorthSending(now, now), true);
  assert.equal(isWorthSending(now - 8000, now), true, 'a few seconds late is what a restart costs');
  assert.equal(isWorthSending(now - MAX_LATENESS_MS, now), true);
  assert.equal(isWorthSending(now - MAX_LATENESS_MS - 1, now), false);
  assert.equal(isWorthSending(now - 3600_000, now), false, 'the workout is long over');
});

test('the message names the set the user is being called back to', () => {
  const msg = buildRestDoneMessage({ exerciseName: 'Développé couché', setNumber: 3, totalSets: 4 });
  assert.equal(msg.title, 'Repos terminé');
  assert.match(msg.body, /Développé couché/);
  assert.match(msg.body, /série 3\/4/);
  assert.equal(msg.tag, 'rest-timer');
  assert.equal(msg.url, '/?view=activites');
});

test('a message with nothing to say still says something', () => {
  assert.equal(buildRestDoneMessage().body, 'Au suivant.');
  assert.equal(buildRestDoneMessage({ exerciseName: '   ' }).body, 'Au suivant.');
  // Half the context is better than none: an exercise with no set count still names itself.
  assert.equal(buildRestDoneMessage({ exerciseName: 'Squat' }).body, 'Au suivant — Squat');
  assert.equal(buildRestDoneMessage({ setNumber: 2, totalSets: 3 }).body, 'Au suivant — série 2/3');
});

test('every rest notification replaces the last rather than stacking', () => {
  const first = buildRestDoneMessage({ exerciseName: 'Squat', setNumber: 1, totalSets: 5 });
  const second = buildRestDoneMessage({ exerciseName: 'Rowing', setNumber: 2, totalSets: 4 });
  assert.equal(first.tag, second.tag);
});
