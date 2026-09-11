import test from 'node:test';
import assert from 'node:assert/strict';
import { bandFor, categoryFor, suggestedGoal, trend } from './vo2maxReference.js';

test('the band depends on both sex and age', () => {
  assert.equal(bandFor('male', 25).excellent, 56);
  assert.equal(bandFor('male', 45).excellent, 52);
  assert.equal(bandFor('female', 25).excellent, 48);
  // Past the last band, the oldest one still applies rather than falling off the table.
  assert.equal(bandFor('male', 92).excellent, 44);
});

test('no sex or no age means no verdict at all', () => {
  // A threshold only means something against a population: inventing one would be worse than
  // showing nothing.
  assert.equal(bandFor(null, 30), null);
  assert.equal(bandFor('male', null), null);
  assert.equal(categoryFor(50, null), null);
});

test('a value lands in the category its band says', () => {
  const band = bandFor('male', 35);
  assert.equal(categoryFor(60, band), 'excellent');
  assert.equal(categoryFor(48, band), 'good');
  assert.equal(categoryFor(45, band), 'average');
  assert.equal(categoryFor(40, band), 'fair');
  assert.equal(categoryFor(30, band), 'poor');
  // The boundary belongs to the higher category.
  assert.equal(categoryFor(band.excellent, band), 'excellent');
});

test('the goal is the next rung, not the top of the ladder', () => {
  const band = bandFor('male', 35);
  // From poor, aiming at "excellent" discourages more than it guides.
  assert.equal(suggestedGoal(30, band), band.fair);
  assert.equal(suggestedGoal(40, band), band.good);
  assert.equal(suggestedGoal(48, band), band.excellent);
});

test('once excellent, the goal is to hold what you have', () => {
  const band = bandFor('male', 35);
  assert.equal(suggestedGoal(60, band), 60, 'a value above the threshold becomes its own reference');
  assert.equal(suggestedGoal(band.excellent, band), band.excellent);
});

test('the trend says how much, over how long', () => {
  const t = trend([
    { date: '2026-01-01', value: 44 },
    { date: '2026-03-02', value: 47.5 },
  ]);
  assert.deepEqual(t, { delta: 3.5, days: 60, from: 44, to: 47.5 });
  assert.equal(trend([{ date: '2026-01-01', value: 44 }]), null, 'one measurement is not a trend');
  assert.equal(trend([]), null);
});
