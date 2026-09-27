// Le poids d'une recette, et donc ce que pèse une part.
//
// Une recette se sert en grammes, pas en portions : « 250 g de cheesecake » se pèse, « une demi-
// portion » s'estime. Pour convertir l'un en l'autre il faut savoir ce que pèse la recette
// entière, et il y a deux façons de le savoir — l'une bien meilleure que l'autre.
//
// La somme des ingrédients est toujours disponible mais suppose que rien ne s'évapore : un
// cheesecake de 1 100 g d'ingrédients sort du four à 950 g, et compter 250 g dessus surestime
// alors de 15 %. Le poids pesé après cuisson, lui, est la vérité — d'où le champ qui permet de le
// saisir, et qui l'emporte dès qu'il est renseigné.

// Les unités qui se convertissent en grammes. Le millilitre y passe à 1 pour 1 : c'est faux pour
// l'huile (0,92) et pour le miel (1,4), mais les liquides d'une recette sont surtout de l'eau, du
// lait et du bouillon, tous à 1 ± 3 %.
const TO_GRAMS = { g: 1, gr: 1, gramme: 1, grammes: 1, ml: 1, cl: 10, dl: 100, l: 1000, kg: 1000 };

export function ingredientWeightG(ingredient) {
  const factor = TO_GRAMS[String(ingredient?.unite || '').trim().toLowerCase()];
  if (!factor) return null;
  const qty = Number(ingredient.qte);
  return Number.isFinite(qty) && qty > 0 ? qty * factor : null;
}

/**
 * Ce que pèse la recette entière.
 *
 * `complete` dit si on peut s'y fier : une recette qui contient « 2 cuillères à soupe d'huile »
 * n'a pas de poids calculable, et l'écran doit demander de le peser plutôt que de servir un
 * chiffre amputé de ses ingrédients non pesables.
 */
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
