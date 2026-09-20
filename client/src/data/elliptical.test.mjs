// Run with: npm test --prefix client
import test from 'node:test';
import assert from 'node:assert/strict';
import { ellipticalMet, ellipticalKcal, ellipticalLabel } from './elliptical.js';

test('sans watts, le MET est celui de l’intensité choisie', () => {
  assert.equal(ellipticalMet({ effort: 7 }), 7);
  // Rien de choisi : l'effort modéré, pas zéro.
  assert.equal(ellipticalMet({}), 5);
});

test("l'équation d'ergométrie, sur un cas calculable à la main", () => {
  // 150 W à 74 kg : 10,8 × 150 / 74 = 21,89 ; +7 = 28,89 ml/kg/min → 8,25 MET.
  assert.equal(Math.round(ellipticalMet({ watts: 150, weightKg: 74 }) * 100) / 100, 8.25);
});

test('les watts priment sur l’intensité, une mesure battant une impression', () => {
  const avecWatts = ellipticalMet({ effort: 4.6, watts: 200, weightKg: 74 });
  assert.ok(avecWatts > 4.6);
});

test('des watts sans poids connu retombent sur l’intensité', () => {
  // La formule divise par le poids : sans lui, elle ne veut rien dire.
  assert.equal(ellipticalMet({ effort: 7, watts: 150, weightKg: 0 }), 7);
});

test('la même convention nette que partout ailleurs', () => {
  // 8,25 MET à 71 kcal/h → (8,25 − 1) × 71 = 515 kcal/h, soit 258 sur 30 min.
  assert.equal(ellipticalKcal({ watts: 150, weightKg: 74, restingKcalPerHour: 71, minutes: 30 }), 258);
});

test('le nom dit ce qui a servi à estimer', () => {
  const t = (k) => ({ 'activityLog.effort_hard': 'Soutenu' }[k] || k);
  assert.equal(ellipticalLabel(7, null, t), 'Soutenu');
  assert.equal(ellipticalLabel(7, 150, t), '150 W');
});
