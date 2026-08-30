// End-of-rest notifications: what the push says, and how long a rest may be scheduled for. Kept
// out of index.js and free of database access so it can be tested against a fixed clock, like
// reminders.js.
//
// Why the *server* sends this at all, when the countdown itself runs in the page: iOS suspends a
// backgrounded tab's JavaScript the moment the screen locks, so a setTimeout in the app fires
// late or never — precisely in the case this feature exists for, the phone face-down on the bench
// between two sets. A push scheduled server-side arrives whether the app is open, backgrounded or
// gone.

// Bounds on an accepted rest. The floor keeps a mistyped 0 from firing a push instantly; the
// ceiling matches MAX_REST_SECONDS in the client's restTargets.js, plus a minute of slack for a
// rest the user extends by hand while it runs.
export const MIN_REST_SECONDS = 5;
export const MAX_REST_SECONDS = 660;

export function isValidRestSeconds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= MIN_REST_SECONDS && n <= MAX_REST_SECONDS;
}

// How stale a due timer may be and still be worth sending. A rest that came due while the server
// was redeploying should still buzz a few seconds late — but one found half an hour later belongs
// to a workout that is long over, and a notification for it would be pure noise.
export const MAX_LATENESS_MS = 120000;

export function isWorthSending(fireAtMs, now = Date.now()) {
  return now - fireAtMs <= MAX_LATENESS_MS;
}

/**
 * The push for a finished rest. The set number matters more than the exercise name here — the
 * message is read on a lock screen, one glance, and "série 3/4" is what tells the user what to go
 * and do. The exercise name is the reassurance that it's their own workout talking.
 */
export function buildRestDoneMessage({ exerciseName, setNumber, totalSets } = {}) {
  const name = typeof exerciseName === 'string' ? exerciseName.trim() : '';
  const hasCount = Number.isFinite(Number(setNumber)) && Number.isFinite(Number(totalSets));
  const parts = [];
  if (name) parts.push(name);
  if (hasCount) parts.push(`série ${Number(setNumber)}/${Number(totalSets)}`);
  return {
    title: 'Repos terminé',
    body: parts.length ? `Au suivant — ${parts.join(' — ')}` : 'Au suivant.',
    // One tag for the whole feature: a rest notification is only ever about the rest happening
    // now, so a new one must replace the last rather than stack a column of them on the lock
    // screen over a 45-minute workout.
    tag: 'rest-timer',
    url: '/?view=activites',
  };
}
