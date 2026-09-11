// Où se situe une VO2max, et vers quoi viser ensuite.
//
// Les seuils viennent des normes du Cooper Institute, les plus utilisées en pratique : elles
// classent la VO2max (ml/kg/min) par sexe et par tranche d'âge, parce qu'une même valeur n'a pas
// le même sens à 25 ans et à 55. Ce sont des repères de population, pas un diagnostic — et ce que
// mesure une montre au poignet reste une estimation, pas un test à l'effort en laboratoire.

const BANDS = {
  male: [
    { maxAge: 29, poor: 38, fair: 44, good: 49, excellent: 56 },
    { maxAge: 39, poor: 37, fair: 43, good: 48, excellent: 55 },
    { maxAge: 49, poor: 35, fair: 41, good: 45, excellent: 52 },
    { maxAge: 59, poor: 31, fair: 37, good: 42, excellent: 48 },
    { maxAge: 200, poor: 28, fair: 33, good: 38, excellent: 44 },
  ],
  female: [
    { maxAge: 29, poor: 32, fair: 37, good: 42, excellent: 48 },
    { maxAge: 39, poor: 31, fair: 36, good: 41, excellent: 47 },
    { maxAge: 49, poor: 29, fair: 34, good: 39, excellent: 45 },
    { maxAge: 59, poor: 27, fair: 32, good: 36, excellent: 41 },
    { maxAge: 200, poor: 25, fair: 29, good: 33, excellent: 37 },
  ],
};

export const CATEGORIES = ['poor', 'fair', 'average', 'good', 'excellent'];

export function bandFor(sex, age) {
  // Sans sexe ni âge renseignés, aucun classement honnête n'est possible : les seuils n'ont de
  // sens que rapportés à une population. Mieux vaut ne rien afficher qu'un verdict inventé.
  const table = BANDS[sex === 'female' ? 'female' : sex === 'male' ? 'male' : null];
  if (!table || age == null) return null;
  return table.find((b) => age <= b.maxAge) || table[table.length - 1];
}

export function categoryFor(value, band) {
  if (!band || !(value > 0)) return null;
  if (value >= band.excellent) return 'excellent';
  if (value >= band.good) return 'good';
  if (value >= band.fair) return 'average';
  if (value >= band.poor) return 'fair';
  return 'poor';
}

/**
 * L'objectif suggéré : le seuil de la catégorie juste au-dessus. Progresser d'un cran est un
 * horizon atteignable en quelques mois d'entraînement régulier, là où viser « excellent » depuis
 * « faible » décourage plus qu'il ne guide.
 *
 * Une fois « excellent » atteint, l'objectif cesse d'être un palier : c'est le maintien, et la
 * valeur actuelle devient la référence.
 */
export function suggestedGoal(value, band) {
  if (!band) return null;
  const category = categoryFor(value, band);
  if (category === null) return band.good;
  if (category === 'excellent') return Math.max(value, band.excellent);
  const nextThreshold = { poor: band.fair, fair: band.good, average: band.good, good: band.excellent }[category];
  return nextThreshold;
}

/** La progression entre deux mesures, et sur quelle durée — ce qui rend un écart lisible. */
export function trend(logs) {
  if (!logs || logs.length < 2) return null;
  const first = logs[0];
  const last = logs[logs.length - 1];
  const days = Math.round((new Date(`${last.date}T00:00:00Z`) - new Date(`${first.date}T00:00:00Z`)) / 86400000);
  return { delta: Math.round((last.value - first.value) * 10) / 10, days, from: first.value, to: last.value };
}
