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
  // Quatre minutes d'effort et six de récupération complète : la séance dure bien dix minutes,
  // même si seules les quatre premières sont facturées.
  assert.equal(protocolEffort(p).work, 240);
  assert.equal(protocolEffort(p).completeRest, 360);
  assert.equal(protocolMinutes(p), 10);
});

test('une récupération complète ne coûte rien, une récupération active si', () => {
  // Le 4 × 1 se récupère à l'arrêt : ses six minutes de pause ne sont pas de l'exercice, et le
  // métabolisme de base de la journée les couvre déjà.
  const complete = protocolById('four_by_one');
  assert.equal(protocolEffort(complete).completeRest, 360);
  assert.equal(protocolEffort(complete).activeRest, 0);
  assert.equal(protocolKcal(complete, 750), 68);

  // Le 4 × 4 se récupère en pédalant souple : ces minutes-là comptent.
  const active = protocolById('four_by_four');
  assert.equal(protocolEffort(active).activeRest, 540);
  assert.ok(protocolKcal(active, 750) > (750 * 960 * 1.35) / 3600);
});

test('la pause entre deux séries est un arrêt, même quand les récups sont actives', () => {
  // Le 20/40 se récupère en pédalant entre les répétitions, mais les trois minutes entre deux
  // blocs sont une vraie pause.
  const e = protocolEffort(protocolById('twenty_forty'));
  assert.equal(e.activeRest, 24 * 40);
  assert.equal(e.completeRest, 2 * 180);
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
  assert.ok(Math.abs(protocolKcal(p, 750, { minutes: 50 }) - base * 2) <= 1);
});

test('le métabolisme de base est retiré des minutes facturées, et d’elles seules', () => {
  const resting = 78; // ~1870 kcal/jour
  const p = protocolById('four_by_four');
  const brut = protocolKcal(p, 750);
  const net = protocolKcal(p, 750, { restingKcalPerHour: resting });
  assert.ok(net < brut);
  // 16 min d'effort + 9 min de récup active = 25 minutes comptées, donc 25 minutes de repos
  // retirées. Rien de plus : un protocole à récup complète n'en retire que ses minutes d'effort.
  assert.equal(brut - net, Math.round((resting * 25) / 60));

  // Le 4 × 1 se récupère à l'arrêt : seules ses 4 minutes d'effort sont facturées, donc seules
  // 4 minutes de repos sont retirées — pas les 10 minutes de la séance. À une calorie près,
  // les deux valeurs étant arrondies chacune de leur côté.
  const court = protocolById('four_by_one');
  const ecart = protocolKcal(court, 750) - protocolKcal(court, 750, { restingKcalPerHour: resting });
  assert.ok(Math.abs(ecart - (resting * 4) / 60) <= 1);
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
