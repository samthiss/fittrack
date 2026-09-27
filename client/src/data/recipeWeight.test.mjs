// Run with: npm test --prefix client
//
// Les mêmes cas que server/recipe-weight.test.mjs : les deux implémentations doivent donner le
// même poids, sans quoi l'aperçu du formulaire et ce qui est enregistré divergeraient.
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
  assert.deepEqual(recipeWeight(CHEESECAKE, 760).grams, 760);
  assert.equal(recipeWeight(CHEESECAKE, 760).measured, true);
});

test('un ingrédient non pesable rend la somme incomplète, et se nomme', () => {
  const w = recipeWeight([...CHEESECAKE, { nom: 'Huile', qte: 2, unite: 'cuillère à soupe' }], null);
  assert.equal(w.complete, false);
  assert.deepEqual(w.missing, ['Huile']);
  assert.equal(w.grams, 880);
});

test('les unités de volume et de masse se convertissent', () => {
  assert.equal(ingredientWeightG({ qte: 1, unite: 'kg' }), 1000);
  assert.equal(ingredientWeightG({ qte: 25, unite: 'cl' }), 250);
  assert.equal(ingredientWeightG({ qte: 3, unite: 'pièces' }), null);
});

test('une recette vide n’a pas de poids, plutôt qu’un poids de zéro', () => {
  assert.equal(recipeWeight([], null).grams, null);
});
