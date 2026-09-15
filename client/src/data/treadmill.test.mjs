// Run with: npm test --prefix client
import test from 'node:test';
import assert from 'node:assert/strict';
import { treadmillMet, treadmillKcal, treadmillLabel } from './treadmill.js';

test("l'équation ACSM, sur un cas calculable à la main", () => {
  // 5 km/h = 83,33 m/min ; à 8 % : 0,1×83,33 + 1,8×83,33×0,08 + 3,5 = 23,83 ml/kg/min → 6,81 MET.
  assert.equal(Math.round(treadmillMet(5, 8) * 100) / 100, 6.81);
});

test('à plat, seule la vitesse compte ; à vitesse égale, la pente ajoute', () => {
  assert.ok(treadmillMet(6, 0) > treadmillMet(3, 0));
  assert.ok(treadmillMet(5, 12) > treadmillMet(5, 0));
  // La pente pèse lourd : 5 km/h à 12 % dépasse 6 km/h à plat.
  assert.ok(treadmillMet(5, 12) > treadmillMet(6, 0));
});

test('arrêté sur un tapis à plat, on est au repos', () => {
  assert.equal(treadmillMet(0, 0), 1);
  assert.equal(treadmillKcal(0, 0, 71, 60), 0);
});

test('le repos est déduit, comme pour toute activité', () => {
  // 6,81 MET à 71 kcal/h de repos → (6,81 − 1) × 71 = 412 kcal/h, soit 206 sur 30 min.
  assert.equal(treadmillKcal(5, 8, 71, 30), 206);
});

test('le nom dit le réglage', () => {
  assert.equal(treadmillLabel(4.5, 10), '4,5 km/h · 10 %');
});
