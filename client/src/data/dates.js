// A "day" in FitTrack is the day the user is living in, not the UTC day. These used to be the
// same expression — new Date().toISOString().slice(0, 10) — copied into five files, which is UTC:
// in Paris that makes everything logged between midnight and 02:00 land on the day before, and
// opens the Journal on yesterday for those two hours every night.
//
// Dates themselves stay plain YYYY-MM-DD strings, and arithmetic on them stays in UTC (parsing
// "2026-08-13T00:00:00Z" and stepping whole days) — that part was never ambiguous, and anchoring
// it at UTC midnight is what keeps a day-step from ever landing on a DST boundary and moving by
// 23 or 25 hours.

function pad(n) {
  return String(n).padStart(2, '0');
}

// Today in the device's own timezone.
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDateStr(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// "Aujourd'hui" / "Hier" / "sam. 30" — the short label a screen puts in its heading.
export function formatDateLabel(dateStr, t) {
  const WEEKDAY_LABELS = [
    t('home.weekdaySun'),
    t('home.weekdayMon'),
    t('home.weekdayTue'),
    t('home.weekdayWed'),
    t('home.weekdayThu'),
    t('home.weekdayFri'),
    t('home.weekdaySat'),
  ];
  const today = todayStr();
  if (dateStr === today) return t('home.today');
  if (dateStr === shiftDateStr(today, -1)) return t('home.yesterday');
  if (dateStr === shiftDateStr(today, 1)) return t('home.tomorrow');
  const d = new Date(`${dateStr}T00:00:00Z`);
  const weekday = WEEKDAY_LABELS[d.getUTCDay()];
  return `${weekday} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

// "sam. 30 août" — the full date, spelled out. UTC throughout: the strings are UTC-anchored.
export function formatDateSubtitle(dateStr, lang, opts = {}) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    ...opts,
  }).format(d);
}
