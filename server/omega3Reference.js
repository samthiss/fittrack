// EPA/DHA (marine omega-3) reference values in mg per 100g — anchors the AI estimate in
// nutrientEstimation.js so it doesn't drift toward ALA-inflated numbers. Deliberately excludes
// plant sources (flax, walnuts, chia, canola oil, avocado): they contain ALA, not EPA/DHA, and
// estimate to 0 for this nutrient (see the prompt instruction that uses this table).
export const OMEGA3_EPA_DHA_REFERENCE = [
  { food: 'Saumon (élevage)', mg: 2000 },
  { food: 'Saumon (sauvage)', mg: 1500 },
  { food: 'Maquereau', mg: 2500 },
  { food: 'Sardines', mg: 1500 },
  { food: 'Hareng', mg: 2000 },
  { food: 'Truite', mg: 1000 },
  { food: 'Thon frais', mg: 800 },
  { food: 'Thon en boîte', mg: 300 },
  { food: 'Cabillaud / poisson blanc', mg: 200 },
  { food: 'Crevettes', mg: 300 },
  { food: 'Moules', mg: 700 },
  { food: 'Œufs', mg: 100 },
  { food: 'Œufs enrichis oméga-3', mg: 300 },
  { food: 'Huile de foie de morue', mg: 20000 },
  { food: 'Algues / huile d\'algue', mg: 1000 },
];

// "Selon dosage" supplements can't get a fixed per-100g value, so they're kept as a separate
// prose line for the prompt rather than a fake number in the table above.
export const OMEGA3_SUPPLEMENT_NOTE =
  "Supplément oméga-3 (huile de poisson) : selon le dosage indiqué sur l'étiquette, pas de valeur fixe.";

export function formatOmega3ReferenceForPrompt() {
  const lines = OMEGA3_EPA_DHA_REFERENCE.map((r) => `  - ${r.food} : ${r.mg} mg`);
  lines.push(`  - ${OMEGA3_SUPPLEMENT_NOTE}`);
  return lines.join('\n');
}

export const OMEGA3_PROMPT_INSTRUCTION =
  "Pour le champ omega3 : uniquement l'EPA/DHA d'origine MARINE, jamais l'ALA végétal. " +
  "Les sources végétales (lin, noix, chia, huile de colza, avocat) contiennent de l'ALA, " +
  "PAS de l'EPA/DHA — mets 0 pour ces aliments et pour tout produit transformé/frit/pesto " +
  "sans poisson ni fruits de mer. Seuls le poisson, les fruits de mer, les œufs, les algues et " +
  "les compléments d'huile de poisson contiennent de l'EPA/DHA. Valeurs de référence " +
  `approximatives (mg EPA/DHA pour 100g) :\n${formatOmega3ReferenceForPrompt()}`;
