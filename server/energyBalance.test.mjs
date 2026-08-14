// Run with: npm test --prefix server
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEnergyBalance } from './energyBalance.js';

const MEALS = ['breakfast', 'lunch', 'dinner'];

test('an incomplete log forecasts off the target, not the half-eaten day', () => {
  const b = computeEnergyBalance({
    expenditure: 2545,
    consumed: 1420,
    targetIntake: 2045,
    mealKeys: MEALS,
    loggedMealKeys: ['breakfast', 'lunch'],
  });
  assert.equal(b.forecast, true);
  assert.equal(b.eaten, 2045); // the target stands in for the 1420 actually logged so far
  assert.equal(b.balance, 500);
  assert.equal(b.mealsLogged, 2);
  assert.equal(b.mealsTotal, 3);
  // The real total stays available alongside, so the UI can show both if it wants.
  assert.equal(b.consumed, 1420);
});

test('the last meal logged switches it to the real total', () => {
  const b = computeEnergyBalance({
    expenditure: 2545,
    consumed: 2380,
    targetIntake: 2045,
    mealKeys: MEALS,
    loggedMealKeys: MEALS,
  });
  assert.equal(b.forecast, false);
  assert.equal(b.eaten, 2380);
  assert.equal(b.balance, 165);
});

test('eating past the expenditure reads as a surplus, not a negative deficit', () => {
  const b = computeEnergyBalance({
    expenditure: 2400,
    consumed: 2900,
    targetIntake: 2045,
    mealKeys: MEALS,
    loggedMealKeys: MEALS,
  });
  assert.equal(b.balance, -500);
  assert.equal(b.forecast, false);
});

test('an untouched day forecasts rather than claiming a full-TDEE deficit', () => {
  const b = computeEnergyBalance({
    expenditure: 2545,
    consumed: 0,
    targetIntake: 2045,
    mealKeys: MEALS,
    loggedMealKeys: [],
  });
  assert.equal(b.forecast, true);
  assert.equal(b.eaten, 2045);
  assert.equal(b.balance, 500);
  assert.equal(b.mealsLogged, 0);
});

test('a custom en-cas counts too — skipping it keeps the day a forecast', () => {
  const b = computeEnergyBalance({
    expenditure: 2545,
    consumed: 2380,
    targetIntake: 2045,
    mealKeys: [...MEALS, 'snack_1712'],
    loggedMealKeys: MEALS,
  });
  assert.equal(b.forecast, true);
  assert.equal(b.mealsTotal, 4);
  assert.equal(b.mealsLogged, 3);
});

test('a logged meal the profile no longer has does not count toward completion', () => {
  // A removed en-cas can still have rows from before it was removed.
  const b = computeEnergyBalance({
    expenditure: 2545,
    consumed: 1800,
    targetIntake: 2045,
    mealKeys: MEALS,
    loggedMealKeys: ['breakfast', 'lunch', 'snack_removed'],
  });
  assert.equal(b.mealsLogged, 2);
  assert.equal(b.forecast, true);
});

test('no meals configured means nothing to wait for', () => {
  const b = computeEnergyBalance({ expenditure: 2400, consumed: 1800, targetIntake: 2045, mealKeys: [] });
  assert.equal(b.forecast, false);
  assert.equal(b.eaten, 1800);
  assert.equal(b.mealsTotal, 0);
});
