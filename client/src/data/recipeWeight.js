// Le poids d'une recette, côté client.
//
// Même logique que server/recipeWeight.js, qui fait foi : ce fichier existe parce que le
// formulaire doit afficher le poids d'une recette qu'on est en train d'écrire, donc avant qu'elle
// ait été enregistrée. Une recette déjà enregistrée porte son `weight_g`, calculé par le serveur,
// et c'est celui-là qu'on affiche — jamais un recalcul.
//
// Les deux fichiers doivent donner le même nombre ; leurs tests vérifient les mêmes cas.
const TO_GRAMS = { g: 1, gr: 1, gramme: 1, grammes: 1, ml: 1, cl: 10, dl: 100, l: 1000, kg: 1000 };

export function ingredientWeightG(ingredient) {
  const factor = TO_GRAMS[String(ingredient?.unite || '').trim().toLowerCase()];
  if (!factor) return null;
  const qty = Number(ingredient.qte);
  return Number.isFinite(qty) && qty > 0 ? qty * factor : null;
}

export function recipeWeight(ingredients, totalWeightG) {
  const measured = Number(totalWeightG);
  const list = Array.isArray(ingredients) ? ingredients : [];
  const missing = list.filter((i) => ingredientWeightG(i) === null).map((i) => i.nom);
  const summed = list.reduce((sum, i) => sum + (ingredientWeightG(i) || 0), 0);

  if (Number.isFinite(measured) && measured > 0) {
    return { grams: measured, measured: true, complete: true, missing };
  }
  return {
    grams: summed > 0 ? Math.round(summed) : null,
    measured: false,
    complete: missing.length === 0 && summed > 0,
    missing,
  };
}
