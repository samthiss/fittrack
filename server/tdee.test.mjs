// Run with: npm test --prefix server
//
// server/tdee.js is pure and db-free, so unlike strength-stats.test.mjs these assertions run
// against the real module rather than a copy of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ageFromBirthdate,
  computeBmr,
  computeTdee,
  katchMcArdle,
  mifflinStJeor,
  neatFromSteps,
  tefFactor,
  tefFor,
} from './tdee.js';

const REF_TODAY = new Date('2026-08-14T12:00:00Z');

test('Mifflin-St Jeor matches the published formula per sex', () => {
  const inputs = { weightKg: 80, heightCm: 180, age: 30 };
  assert.equal(mifflinStJeor({ ...inputs, sex: 'male' }), 10 * 80 + 6.25 * 180 - 5 * 30 + 5);
  assert.equal(mifflinStJeor({ ...inputs, sex: 'female' }), 10 * 80 + 6.25 * 180 - 5 * 30 - 161);
  assert.equal(mifflinStJeor({ ...inputs, sex: 'other' }), 10 * 80 + 6.25 * 180 - 5 * 30 - 78);
});

test('Mifflin-St Jeor is null when a measurement is missing', () => {
  assert.equal(mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: null, age: 30 }), null);
  assert.equal(mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, age: null }), null);
});

test('Katch-McArdle runs off lean mass, so body fat changes the answer at equal weight', () => {
  assert.equal(katchMcArdle({ weightKg: 80, bodyFatPct: 20 }), 370 + 21.6 * 64);
  assert.ok(katchMcArdle({ weightKg: 80, bodyFatPct: 12 }) > katchMcArdle({ weightKg: 80, bodyFatPct: 30 }));
  assert.equal(katchMcArdle({ weightKg: 80, bodyFatPct: null }), null);
  assert.equal(katchMcArdle({ weightKg: 80, bodyFatPct: 0 }), null);
});

test('age is taken from the birthdate, not rounded up before the birthday', () => {
  assert.equal(ageFromBirthdate('1996-08-13', REF_TODAY), 30);
  assert.equal(ageFromBirthdate('1996-08-15', REF_TODAY), 29);
  assert.equal(ageFromBirthdate(null, REF_TODAY), null);
});

test('method defaults to Katch when body fat is known, Mifflin otherwise', () => {
  const base = { weight_kg: 80, height_cm: 180, birthdate: '1996-01-01', sex: 'male' };
  assert.equal(computeBmr({ ...base, body_fat_pct: 18 }, REF_TODAY).method, 'katch');
  assert.equal(computeBmr(base, REF_TODAY).method, 'mifflin');
});

test('an explicit method wins, and manual returns the stored number untouched', () => {
  const profile = { weight_kg: 80, height_cm: 180, birthdate: '1996-01-01', sex: 'male', body_fat_pct: 18 };
  assert.equal(computeBmr({ ...profile, bmr_method: 'mifflin' }, REF_TODAY).method, 'mifflin');
  const manual = computeBmr({ ...profile, bmr_method: 'manual', bmr: 1234 }, REF_TODAY);
  assert.equal(manual.method, 'manual');
  assert.equal(manual.value, 1234);
});

test('a method whose inputs are missing falls back instead of collapsing to zero', () => {
  // Asked for Katch but never logged a body fat % — Mifflin still has what it needs.
  const bmr = computeBmr(
    { bmr_method: 'katch', weight_kg: 80, height_cm: 180, birthdate: '1996-01-01', sex: 'male' },
    REF_TODAY
  );
  assert.equal(bmr.method, 'mifflin');
  assert.ok(bmr.value > 1000);

  // Nothing at all to compute from: the stored BMR is the last resort, never 0.
  const bare = computeBmr({ bmr_method: 'katch', bmr: 1500 }, REF_TODAY);
  assert.equal(bare.value, 1500);
});

test('NEAT scales with steps and body weight, and defaults rather than zeroing out', () => {
  assert.equal(neatFromSteps(10000, 70), 400);
  assert.ok(neatFromSteps(10000, 90) > neatFromSteps(10000, 70));
  assert.equal(neatFromSteps(0, 70), 0);
  assert.equal(neatFromSteps(null, 70), 7500 * 0.04); // unset profile -> DEFAULT_STEPS_PER_DAY
});

test('TEF is macro-weighted: more protein means a bigger thermic effect', () => {
  const highProtein = tefFactor({ protein_pct: 40, carbs_pct: 30 });
  const lowProtein = tefFactor({ protein_pct: 15, carbs_pct: 45 });
  assert.ok(highProtein > lowProtein);
  // Default 30/35/35 split: 0.25*30 + 0.08*35 + 0.02*35 = 11.0%
  assert.ok(Math.abs(tefFactor({}) - 0.11) < 1e-9);
});

test('on maintain, TEF is a share of the total — intake equals TDEE there', () => {
  const factor = 0.11;
  const base = 2225; // BMR + NEAT + EAT
  const tef = tefFor(base, factor, { goal: 'maintain' });
  assert.ok(Math.abs(tef / (base + tef) - factor) < 1e-9);
  assert.equal(tefFor(base, 0, { goal: 'maintain' }), 0);
});

test('TEF tracks the daily target, not maintenance: a cut digests less', () => {
  const factor = 0.11;
  const base = 2225;
  const cut = tefFor(base, factor, { goal: 'lose', goalKcal: 500 });
  const maintain = tefFor(base, factor, { goal: 'maintain' });
  const bulk = tefFor(base, factor, { goal: 'gain', goalKcal: 500 });
  assert.ok(cut < maintain && maintain < bulk);

  // The closed form has to agree with the definition it came from: TEF = f × target, where the
  // target is the TDEE it is itself part of, minus the deficit.
  const target = base + cut - 500;
  assert.ok(Math.abs(cut - factor * target) < 1e-9);
});

test('a pinned target sets TEF directly, ignoring the goal offset', () => {
  const tef = tefFor(2225, 0.11, { goal: 'lose', goalKcal: 500, manualTargetKcal: 2000 });
  assert.ok(Math.abs(tef - 0.11 * 2000) < 1e-9);
});

test('an extreme deficit floors TEF at zero rather than going negative', () => {
  assert.equal(tefFor(1500, 0.11, { goal: 'lose', goalKcal: 5000 }), 0);
});

test('TDEE sums its four parts and EAT tracks the day logged', () => {
  const profile = {
    weight_kg: 80,
    height_cm: 180,
    birthdate: '1996-01-01',
    sex: 'male',
    steps_per_day: 9000,
    protein_pct: 30,
    carbs_pct: 35,
  };
  const restDay = computeTdee(profile, { activitiesKcal: 0, today: REF_TODAY });
  assert.equal(restDay.total, restDay.bmr + restDay.neat + restDay.tef + restDay.eat);
  assert.equal(restDay.eat, 0);

  const trainingDay = computeTdee(profile, { activitiesKcal: 600, today: REF_TODAY });
  assert.equal(trainingDay.eat, 600);
  // A logged session raises the total by its own kcal *plus* the TEF that rides on top of it.
  assert.ok(trainingDay.total > restDay.total + 600);
  assert.equal(trainingDay.bmr, restDay.bmr);
  assert.equal(trainingDay.neat, restDay.neat);
});

test('TDEE reports both formulas so the UI can show the one not in use', () => {
  const breakdown = computeTdee(
    { weight_kg: 80, height_cm: 180, birthdate: '1996-01-01', sex: 'male', body_fat_pct: 18, steps_per_day: 8000 },
    { today: REF_TODAY }
  );
  assert.equal(breakdown.bmrMethod, 'katch');
  assert.ok(breakdown.bmrOptions.katch > 0);
  assert.ok(breakdown.bmrOptions.mifflin > 0);
});
