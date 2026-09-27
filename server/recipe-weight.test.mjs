// Run with: npm test --prefix server
import test from 'node:test';
import assert from 'node:assert/strict';
import { ingredientWeightG, recipeWeight } from './recipeWeight.js';

const CHEESECAKE = [
  { nom: 'Fromage blanc', qte: 500, unite: 'g' },
  { nom: 'Oeuf', qte: 180, unite: 'g' },
  { nom: 'Lait', qte: 200, unite: 'ml' },
];

test('le poids est la somme des ingrédients quand rien n’est pesé', () => {
  const w = recipeWeight(CHEESECAKE, null);
  assert.equal(w.grams, 880);
  assert.equal(w.measured, false);
  assert.equal(w.complete, true);
});

test('un poids pesé l’emporte sur la somme', () => {
  // La cuisson fait perdre de l'eau : ce qui sort du four est ce qu'on découpe.
  const w = recipeWeight(CHEESECAKE, 760);
  assert.equal(w.grams, 760);
  assert.equal(w.measured, true);
});

test('un ingrédient non pesable rend la somme incomplète, et se nomme', () => {
  const w = recipeWeight([...CHEESECAKE, { nom: "Huile d'olive", qte: 2, unite: 'cuillère à soupe' }], null);
  assert.equal(w.complete, false);
  assert.deepEqual(w.missing, ["Huile d'olive"]);
  // La somme reste rendue : elle vaut mieux que rien, l'écran dira qu'elle est partielle.
  assert.equal(w.grams, 880);
});

test('un poids pesé rend le total fiable même avec des ingrédients non pesables', () => {
  const w = recipeWeight([...CHEESECAKE, { nom: 'Huile', qte: 2, unite: 'cuillère à soupe' }], 900);
  assert.equal(w.complete, true);
  assert.equal(w.grams, 900);
});

test('les unités de volume et de masse se convertissent', () => {
  assert.equal(ingredientWeightG({ qte: 1, unite: 'kg' }), 1000);
  assert.equal(ingredientWeightG({ qte: 25, unite: 'cl' }), 250);
  assert.equal(ingredientWeightG({ qte: 2, unite: 'L' }), 2000);
  assert.equal(ingredientWeightG({ qte: 3, unite: 'pièces' }), null);
  assert.equal(ingredientWeightG({ qte: 0, unite: 'g' }), null);
});

test('une recette vide n’a pas de poids, plutôt qu’un poids de zéro', () => {
  const w = recipeWeight([], null);
  assert.equal(w.grams, null);
  assert.equal(w.complete, false);
});
