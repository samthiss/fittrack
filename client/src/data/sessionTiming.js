// Both session timers are derived from wall-clock timestamps (Date.now()) rather than counted
// ticks: iOS suspends setInterval while the screen is locked or the app is backgrounded, so a
// tick-counted timer silently loses time. Recomputing from a real start timestamp self-corrects
// the moment the screen comes back, whether that was 2 seconds or 2 minutes later — and lets a
// screen that isn't even mounted (the Activités tab while you're in Journal) keep perfect time.
//
// Shared here because the session banner shows the same two numbers as the session screens do.

export function computeSessionElapsed(session) {
  if (!session) return 0;
  if (!session.running || !session.runStartedAt) return session.baseElapsed;
  return session.baseElapsed + Math.floor((Date.now() - session.runStartedAt) / 1000);
}

export function computeRestLeft({ resting, restPaused, restTarget, restRemainingFrozen, restStartedAt }) {
  if (!resting) return restTarget;
  if (restPaused || !restStartedAt) return restRemainingFrozen;
  const elapsed = Math.floor((Date.now() - restStartedAt) / 1000);
  return Math.max(0, restRemainingFrozen - elapsed);
}

// m:ss — used for the rest countdown and the session stopwatch alike.
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
