// Run with: npm test --prefix client
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  zoneKcal,
  zoneKcalPerHour,
  zoneByNumber,
  zoneIsPersonal,
  maxHrFromAge,
  zoneHrRange,
  ZONES,
} from './zones.js';

const MOI = { vo2max: 49.8, weightKg: 74, restingKcalPerHour: 71 };

test('une zone plus haute coûte plus cher, toujours', () => {
  const couts = ZONES.map((z) => zoneKcal({ ...MOI, zone: z.zone, minutes: 60 }));
  for (let i = 1; i < couts.length; i += 1) assert.ok(couts[i] > couts[i - 1]);
});

test('la zone se calcule sur la VO2max, pas sur une table', () => {
  // Zone 2 = 47 % de 49,8 = 23,4 ml/kg/min ; × 74 kg / 1000 = 1,732 L/min ; × 5 kcal = 8,66
  // kcal/min, soit 520 kcal/h brut.
  assert.equal(Math.round(zoneKcalPerHour({ ...MOI, zone: 2 })), 520);
});

test('deux personnes en zone 2 ne brûlent pas pareil', () => {
  const entraine = zoneKcalPerHour({ zone: 2, vo2max: 55, weightKg: 74, restingKcalPerHour: 71 });
  const debutant = zoneKcalPerHour({ zone: 2, vo2max: 35, weightKg: 74, restingKcalPerHour: 71 });
  assert.ok(entraine > debutant);
});

test('sans VO2max relevée, la zone retombe sur son MET de population', () => {
  assert.equal(zoneIsPersonal(null, 74), false);
  // Zone 3 sans mesure : 7 MET × 71 = 497 kcal/h brut.
  assert.equal(Math.round(zoneKcalPerHour({ zone: 3, restingKcalPerHour: 71 })), 497);
});

test('le repos est déduit, comme pour toute activité', () => {
  // 520 brut − 71 de repos = 449 kcal/h, soit 449 sur une heure.
  assert.equal(zoneKcal({ ...MOI, zone: 2, minutes: 60 }), 449);
});

test('une zone inconnue retombe sur la zone 2 plutôt que sur rien', () => {
  assert.equal(zoneByNumber(99).zone, 2);
  assert.equal(zoneByNumber(undefined).zone, 2);
});

test('la FC maximale vient de Tanaka, pas de 220 − âge', () => {
  // 208 − 0,7 × 31 = 186,3 → 186. La vieille formule dirait 189 ; l'écart se creuse avec l'âge.
  assert.equal(maxHrFromAge(31), 186);
  assert.equal(maxHrFromAge(60), 166); // 220 − âge dirait 160
  assert.equal(maxHrFromAge(null), null);
});

test('chaque zone donne des battements, pas des pourcentages', () => {
  // Une montre affiche des bpm : c'est dans cette unité que la zone doit se reconnaître.
  assert.deepEqual(zoneHrRange(2, 186), { from: 112, to: 130 });
  assert.deepEqual(zoneHrRange(5, 186), { from: 167, to: 186 });
  assert.equal(zoneHrRange(2, null), null);
});

test('avec la FC de repos, les zones sont celles de l\'Apple Watch', () => {
  // FC max 186 (31 ans), repos 57 : la montre affiche <134, 135-147, 148-160, 161-173, >174.
  assert.deepEqual(zoneHrRange(1, 186, 57).to, 134);
  assert.deepEqual(zoneHrRange(2, 186, 57), { from: 135, to: 147 });
  assert.deepEqual(zoneHrRange(3, 186, 57), { from: 148, to: 160 });
  assert.deepEqual(zoneHrRange(4, 186, 57), { from: 161, to: 173 });
  assert.deepEqual(zoneHrRange(5, 186, 57), { from: 174, to: 186 });
});

test('avec la FC de repos, la zone coûte ce que coûte la zone de la montre', () => {
  // Zone 2 = 65 % de réserve : 3,5 + 0,65 × 46,3 = 33,6 ml/kg/min ; × 74 / 1000 × 5 × 60 = 746
  // kcal/h brut, 675 une fois le repos déduit.
  assert.equal(Math.round(zoneKcalPerHour({ ...MOI, zone: 2, restingHr: 57 })), 746);
  assert.equal(zoneKcal({ ...MOI, zone: 2, restingHr: 57, minutes: 60 }), 675);
  const couts = ZONES.map((z) => zoneKcal({ ...MOI, restingHr: 57, zone: z.zone, minutes: 60 }));
  for (let i = 1; i < couts.length; i += 1) assert.ok(couts[i] > couts[i - 1]);
});
