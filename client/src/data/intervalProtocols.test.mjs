// Run with: npm test --prefix client
//
// La durée d'un protocole et ce qu'il coûte en calories : deux nombres qui s'affichent, se
// stockent, et ne se vérifient pas à l'œil. Ils ont déjà divergé une fois — le 4 × 1 min était
// annoncé et facturé sur 15 minutes alors que son déroulé en fait 10.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVAL_PROTOCOLS,
  protocolById,
  protocolEffort,
  protocolMinutes,
  protocolKcal,
  buildPhases,
} from './intervalProtocols.js';

test('la durée annoncée est celle du déroulé, pour chaque protocole', () => {
  for (const p of INTERVAL_PROTOCOLS) {
    if (p.estimate) continue; // le seul dont la durée ne peut pas être connue d'avance
    const fromPhases = buildPhases(p).reduce((s, ph) => s + (typeof ph.seconds === 'number' ? ph.seconds : 0), 0);
    assert.equal(protocolEffort(p).total, fromPhases, `${p.label} : durée annoncée ≠ déroulé`);
  }
});

test('le 4 × 1 min dure dix minutes, pas quinze ni quatre', () => {
  const p = protocolById('four_by_one');
  // Quatre minutes d'effort et six de récupération : les six comptent, on est toujours sur la
  // machine, mais pas au même prix.
  assert.equal(protocolEffort(p).work, 240);
  assert.equal(protocolEffort(p).rest, 360);
  assert.equal(protocolMinutes(p), 10);
});

test('la récupération coûte moins cher que l’effort', () => {
  const p = protocolById('four_by_one');
  const flat = 750 * (protocolMinutes(p) / 60); // ce que donnait le tarif plat
  assert.ok(protocolKcal(p, 750) < flat, 'un format à dominante récupération doit coûter moins que le tarif plat');
  assert.equal(protocolKcal(p, 750), 101);
});

test('un effort continu est facturé au tarif de référence, sans majoration', () => {
  const p = protocolById('sweet_spot');
  assert.equal(protocolKcal(p, 750), Math.round(750 * 0.5));
});

test('allonger un protocole garde son mélange effort / récupération', () => {
  const p = protocolById('four_by_four');
  const base = protocolKcal(p, 750);
  // 50 minutes au lieu de 25 : deux fois la séance, donc deux fois la dépense — pas 50 minutes
  // au tarif d'un effort continu. À une calorie près, l'arrondi se faisant une fois de chaque
  // côté de la multiplication.
  assert.ok(Math.abs(protocolKcal(p, 750, 50) - base * 2) <= 1);
});

test('sans allure de référence, rien n’est inventé', () => {
  assert.equal(protocolKcal(protocolById('four_by_four'), 0), 0);
  assert.equal(protocolKcal(null, 750), 0);
});

test('l’échelle de calories est estimée, et annoncée comme telle', () => {
  const p = protocolById('cal_ladder');
  // Ses phases sont mesurées, pas décomptées : sans estimation explicite, sa durée serait zéro et
  // ses kcal aussi.
  assert.equal(buildPhases(p).every((ph) => typeof ph.seconds !== 'number'), true);
  assert.equal(protocolMinutes(p), 8);
  assert.ok(protocolKcal(p, 750) > 0);
});
