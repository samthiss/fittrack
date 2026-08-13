// Run with: npm test --prefix server
//
// The arithmetic behind the progression curve, the personal-record badge and the weekly muscle
// volume. These are pure functions lifted verbatim from index.js — importing index.js would boot
// the whole Express app and its better-sqlite3 native binding, so the formulas are duplicated here
// and pinned by the assertions below; changing one without the other fails the run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(path.join(here, 'index.js'), 'utf8');

// --- the copies under test -----------------------------------------------------------------
function estimatedOneRepMax(weightKg, reps) {
  if (weightKg == null || weightKg <= 0 || !reps) return null;
  return weightKg * (1 + reps / 30);
}

function sessionStats(sets) {
  let volume = 0;
  let topWeight = null;
  let bestEst1rm = null;
  for (const s of sets) {
    volume += (s.weight_kg || 0) * s.reps;
    if (s.weight_kg != null && (topWeight == null || s.weight_kg > topWeight)) topWeight = s.weight_kg;
    const est = estimatedOneRepMax(s.weight_kg, s.reps);
    if (est != null && (bestEst1rm == null || est > bestEst1rm)) bestEst1rm = est;
  }
  return { volume, top_weight: topWeight, best_est_1rm: bestEst1rm };
}

function shiftDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return shiftDays(dateStr, -((d.getUTCDay() + 6) % 7));
}

// --- the copies stay copies ----------------------------------------------------------------
test('the formulas here are the ones index.js ships', () => {
  for (const fn of [estimatedOneRepMax, sessionStats, shiftDays, mondayOf]) {
    const body = fn.toString();
    const normalize = (s) => s.replace(/\s+/g, ' ').trim();
    assert.ok(
      normalize(indexSource).includes(normalize(body)),
      `${fn.name} in this test no longer matches the one in index.js`
    );
  }
});

// --- estimated 1RM -------------------------------------------------------------------------
test('estimated 1RM puts different rep ranges on one scale', () => {
  // The whole reason it exists: more weight for fewer reps and less weight for more reps are both
  // progress, and neither weight alone nor reps alone can say which session was better.
  assert.ok(estimatedOneRepMax(70, 5) > estimatedOneRepMax(60, 8), 'much heavier wins');
  assert.ok(estimatedOneRepMax(60, 8) > estimatedOneRepMax(65, 4), 'more reps at slightly less weight wins');
  // And it stays close for genuinely comparable sets rather than declaring a winner by a mile:
  // 8×60 and 5×65 are within a quarter of a kilo of each other.
  assert.ok(Math.abs(estimatedOneRepMax(60, 8) - estimatedOneRepMax(65, 5)) < 0.25);
});

test('a bodyweight set has no estimate rather than an estimate of zero', () => {
  assert.equal(estimatedOneRepMax(null, 12), null);
  assert.equal(estimatedOneRepMax(0, 12), null);
  // Zero would sort as the worst set ever recorded and drag the curve to the floor.
});

// --- session stats -------------------------------------------------------------------------
test('session stats total the volume and keep the best set of the session', () => {
  const stats = sessionStats([
    { weight_kg: 60, reps: 8 },
    { weight_kg: 65, reps: 5 },
    { weight_kg: 60, reps: 6 },
  ]);
  assert.equal(stats.volume, 60 * 8 + 65 * 5 + 60 * 6);
  assert.equal(stats.top_weight, 65);
  // Not the heaviest set: 8 reps at 60 estimates higher than 5 at 65, which is exactly the
  // distinction the two numbers exist to keep apart.
  assert.equal(stats.best_est_1rm, estimatedOneRepMax(60, 8));
});

test('a bodyweight session reports no top weight rather than 0 kg', () => {
  const stats = sessionStats([
    { weight_kg: null, reps: 12 },
    { weight_kg: null, reps: 10 },
  ]);
  assert.equal(stats.top_weight, null);
  assert.equal(stats.best_est_1rm, null);
  assert.equal(stats.volume, 0);
});

// --- week bucketing ------------------------------------------------------------------------
test('a week runs Monday to Sunday', () => {
  assert.equal(mondayOf('2026-08-13'), '2026-08-10'); // a Thursday
  assert.equal(mondayOf('2026-08-10'), '2026-08-10'); // the Monday itself
  assert.equal(mondayOf('2026-08-16'), '2026-08-10'); // the Sunday closing it
  assert.equal(mondayOf('2026-08-17'), '2026-08-17'); // the next Monday opens a new one
});

test('stepping days crosses months and DST without drifting', () => {
  assert.equal(shiftDays('2026-08-31', 1), '2026-09-01');
  assert.equal(shiftDays('2026-03-01', -1), '2026-02-28');
  // Last Sunday of March in Europe: the local day is 23 hours long, the date step is still a day.
  assert.equal(shiftDays('2026-03-29', 1), '2026-03-30');
  assert.equal(mondayOf('2026-03-29'), '2026-03-23');
});
