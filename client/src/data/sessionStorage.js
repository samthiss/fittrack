// A workout in progress is kept in localStorage so it survives the app being restarted from
// scratch. That's not a rare event on iOS: FitTrack runs as a standalone home-screen web app, and
// the system evicts it from memory under pressure — switch to another app mid-workout and coming
// back can mean a cold launch, with the sets already logged gone. Both timers are stored as
// absolute timestamps, so a restored session resumes at the right time rather than where it
// paused.
//
// Local rather than server-side: it's the device that lost the state, and this needs no round trip
// on every validated set. The trade-off is that it doesn't follow you to another device.

const KEY_PREFIX = 'fittrack_active_session_';

// A session older than this is stale, not interrupted — nobody resumes yesterday's workout, and
// its stopwatch would come back reading 14 hours.
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

// Scoped per account: two people sharing a device must never inherit each other's workout.
function keyFor(accountId) {
  return `${KEY_PREFIX}${accountId}`;
}

export function saveStoredSession(accountId, session, sessionExercise) {
  try {
    if (!session) {
      localStorage.removeItem(keyFor(accountId));
      return;
    }
    localStorage.setItem(
      keyFor(accountId),
      JSON.stringify({
        savedAt: Date.now(),
        openExerciseId: sessionExercise?.id ?? null,
        // doneIds is a Set — JSON would silently turn it into {}, so it goes out as an array.
        session: { ...session, doneIds: [...session.doneIds] },
      })
    );
  } catch {
    // Private mode, or the quota is full — a session that can't be saved is worth less than a
    // crash mid-workout.
  }
}

export function loadStoredSession(accountId) {
  let saved = null;
  try {
    const raw = localStorage.getItem(keyFor(accountId));
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  if (!saved?.session || !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > MAX_AGE_MS) {
    try {
      localStorage.removeItem(keyFor(accountId));
    } catch {
      // nothing to clean up
    }
    return { session: null, exercise: null };
  }
  const session = { ...saved.session, doneIds: new Set(saved.session.doneIds || []) };
  // The open exercise is stored by id and resolved back to the object inside the session, so the
  // two can't come back as separate copies that drift apart.
  const exercise = session.exercises?.find((e) => e.id === saved.openExerciseId) ?? null;
  return { session, exercise };
}
