// Rest between sets is configured per rep range in Réglages > Temps de repos: heavy low-rep work
// wants a long rest, high-rep work a short one. Keyed by the same rep-range vocabulary the set
// target pickers use (ActivityDetail / AddActivityModal / ActivitySession / ExerciseSession), so a
// set showing "8-12" and its rest setting are always talking about the same thing.
export const REP_RANGE_OPTIONS = ['5-9', '8-12', '10-15', '15-20', 'Max'];

export const DEFAULT_REST_BY_REPS = {
  '5-9': 90,
  '8-12': 60,
  '10-15': 45,
  '15-20': 30,
  Max: 60,
};

// Used when a set's rep range can't be matched at all (e.g. a free-typed rep count outside every
// range) — the app's original fixed rest.
export const FALLBACK_REST_SECONDS = 90;

export const REST_STEP_SECONDS = 15;
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;

// profile.rest_by_reps is stored as a JSON string (like meal_shares / extra_snacks); anything
// missing or unparseable falls back to the defaults, per range rather than wholesale, so a
// half-filled setting still works.
export function parseRestByReps(profile) {
  let stored = null;
  try {
    stored = profile?.rest_by_reps ? JSON.parse(profile.rest_by_reps) : null;
  } catch {
    stored = null;
  }
  const out = { ...DEFAULT_REST_BY_REPS };
  if (stored && typeof stored === 'object') {
    for (const key of REP_RANGE_OPTIONS) {
      const value = Number(stored[key]);
      if (Number.isFinite(value) && value > 0) out[key] = value;
    }
  }
  return out;
}

// Which configured range a set falls in. A per-set target ("8-12", "8-12↑") names its range
// outright; without one, the exercise's plain rep count is matched into a range — 1 rep being the
// placeholder the pickers store for "Max".
export function repRangeFor(setTarget, reps) {
  const stripped = (setTarget || '').replace(/[↑↓]$/, '');
  if (REP_RANGE_OPTIONS.includes(stripped)) return stripped;
  const value = Number(reps);
  if (!Number.isFinite(value)) return null;
  if (value === 1) return 'Max';
  return (
    REP_RANGE_OPTIONS.find((opt) => {
      if (opt === 'Max') return false;
      const [lo, hi] = opt.split('-').map(Number);
      return value >= lo && value <= hi;
    }) ?? null
  );
}

export function restSecondsFor(restByReps, { setTarget, reps }) {
  const range = repRangeFor(setTarget, reps);
  return (range && restByReps?.[range]) || FALLBACK_REST_SECONDS;
}

// "45 s" / "1 min 30" — the settings list reads better spelled out than as a 0:45 clock.
export function formatRestLabel(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${min} min ${rest}` : `${min} min`;
}
