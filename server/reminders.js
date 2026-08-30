// Supplement reminders: deciding *when* to fire and *what to say*. Kept out of index.js and free
// of database access so both halves can be tested against a fixed clock.

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Repeats nag every quarter of an hour until the supplement is ticked — but they stop after two
// hours. "Until you tick it" taken literally means a phone buzzing all night over a supplement
// its owner has decided to skip, which trains people to turn notifications off entirely.
export const REPEAT_INTERVAL_MINUTES = 15;
export const REPEAT_MAX_ATTEMPTS = 8;

export function isValidTime(value) {
  return typeof value === 'string' && HHMM.test(value);
}

/**
 * The wall-clock time and calendar day where the user is, not where the server runs. An unknown
 * or malformed timezone falls back to Paris rather than to UTC: this is a French app on one
 * phone, and a reminder an hour or two off is a worse failure than the fallback being wrong for
 * an expatriate user.
 */
export function localNow(now, timeZone) {
  const zone = timeZone || 'Europe/Paris';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    return localNow(now, 'Europe/Paris');
  }
  const get = (type) => parts.find((p) => p.type === type).value;
  // Intl gives "24" for midnight in some engines/locales; the date has already rolled over there.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}

/**
 * Which reminder is due right now for this profile, if any. Exact minute match: the scheduler
 * ticks every minute, and reminder_runs makes a repeated tick harmless.
 */
export function slotDueAt(profile, time) {
  if (isValidTime(profile?.reminder_morning_at) && profile.reminder_morning_at === time) return 'morning';
  if (isValidTime(profile?.reminder_evening_at) && profile.reminder_evening_at === time) return 'evening';
  return null;
}

/**
 * What the reminder should cover. The morning one is about the day starting, so it lists what's
 * tagged "matin" plus anything untagged; the evening one is the last call of the day and lists
 * everything still outstanding, whatever its tag. Already-finished supplements never appear —
 * a reminder for something you've done is how people learn to ignore notifications.
 */
export function supplementsForSlot(supplements, slot) {
  return supplements.filter((s) => {
    if (!s.dueToday || s.taken) return false;
    if (slot === 'evening') return true;
    const moments = s.time_of_day || [];
    return moments.length === 0 || moments.includes('matin');
  });
}

export function buildReminderMessage(supplements, slot) {
  if (supplements.length === 0) return null;
  const names = supplements.map((s) => s.name);
  const listed = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
  return {
    title: slot === 'morning' ? 'Suppléments du matin' : 'Suppléments — dernier rappel',
    body: `Pas encore pris : ${listed}`,
    tag: `supplements-${slot}`,
    url: '/?view=supplements',
  };
}

/**
 * Whether a reminder already sent should be sent again now: the interval has elapsed and the cap
 * hasn't been reached. Whether anything is actually left to take is decided by the caller, from
 * the day's supplements — a repeat with nothing outstanding must never go out.
 */
export function isRepeatDue(run, now) {
  if (!run?.last_sent_at) return false;
  if ((run.attempts || 1) >= REPEAT_MAX_ATTEMPTS) return false;
  const last = new Date(`${run.last_sent_at.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last >= REPEAT_INTERVAL_MINUTES * 60000;
}
