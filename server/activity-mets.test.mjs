// Run with: npm test --prefix server
import test from 'node:test';
import assert from 'node:assert/strict';
import { metFor, grossKcalPerHour, netKcalPerHour, ACTIVITY_METS } from './activityMets.js';
import { computeBmr } from './tdee.js';

// Un profil concret, pour que les nombres des tests veuillent dire quelque chose.
const PROFIL = { sex: 'male', birthdate: '1995-01-01', height_cm: 180, weight_kg: 74, bmr_method: 'mifflin' };
const repos = computeBmr(PROFIL, new Date('2026-09-15')).value / 24;

test('le repos vient du profil complet, pas du seul poids', () => {
  const plusAge = computeBmr({ ...PROFIL, birthdate: '1965-01-01' }, new Date('2026-09-15')).value;
  const plusGrand = computeBmr({ ...PROFIL, height_cm: 195 }, new Date('2026-09-15')).value;
  const plusLourd = computeBmr({ ...PROFIL, weight_kg: 95 }, new Date('2026-09-15')).value;
  const base = computeBmr(PROFIL, new Date('2026-09-15')).value;
  assert.ok(plusAge < base, "l'âge doit compter");
  assert.ok(plusGrand > base, 'la taille doit compter');
  assert.ok(plusLourd > base, 'le poids doit compter');
});

test('un MET de moins entre le brut et le net, très exactement', () => {
  // La première unité de MET est le repos, que la journée compte déjà ailleurs.
  assert.equal(
    Math.round(grossKcalPerHour('course_a_pied', repos) - netKcalPerHour('course_a_pied', repos)),
    Math.round(repos)
  );
});

test('la dépense suit le profil', () => {
  const leger = computeBmr({ ...PROFIL, weight_kg: 60 }, new Date('2026-09-15')).value / 24;
  assert.ok(netKcalPerHour('course_a_pied', leger) < netKcalPerHour('course_a_pied', repos));
});

test("l'inclinaison coûte plus cher que le plat", () => {
  assert.ok(ACTIVITY_METS.marche_tapis_incline_12 > ACTIVITY_METS.marche_tapis_incline_6);
  assert.ok(ACTIVITY_METS.marche_tapis_incline_6 > ACTIVITY_METS.marche_tapis);
});

test('un type inconnu coûte un effort modéré, jamais zéro', () => {
  assert.equal(metFor('type_invente'), 5);
  assert.ok(netKcalPerHour('type_invente', repos) > 0);
});

test('sans profil exploitable, rien de négatif ni de NaN', () => {
  assert.equal(netKcalPerHour('marche', null), 0);
  assert.equal(netKcalPerHour('marche', -50), 0);
});
