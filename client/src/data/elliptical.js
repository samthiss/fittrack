// Le vélo elliptique : par intensité, ou par watts quand la machine les affiche.
//
// Il n'existe pas d'équation validée pour l'elliptique comme il en existe une pour la marche —
// l'ACSM couvre la marche, la course, le cyclisme et le stepper, pas celui-ci. Deux façons de
// l'estimer, donc, et l'écran laisse choisir laquelle :
//
// 1. Par effort ressenti, avec les MET du Compendium. Grossier mais toujours disponible.
// 2. Par la puissance affichée, avec l'équation d'ergométrie de l'ACSM :
//
//        VO₂ = 10,8 × watts / poids + 7
//
//    Bien plus précis, parce que les watts sont une mesure et pas une impression. La formule est
//    celle du pédalage : sur un elliptique les bras travaillent aussi, donc elle sous-estime
//    probablement un peu. Mieux vaut ça qu'un coefficient inventé pour compenser.

export const ELLIPTICAL_EFFORTS = [
  { value: 4.6, key: 'light' },
  { value: 5.0, key: 'moderate' },
  { value: 7.0, key: 'hard' },
  { value: 9.0, key: 'veryHard' },
];

export const ELLIPTICAL_WATTS = [50, 75, 100, 125, 150, 175, 200, 225, 250];

export const DEFAULT_EFFORT = 5.0;

export function ellipticalMet({ effort, watts, weightKg }) {
  // Les watts l'emportent dès qu'ils sont là : une mesure bat une impression.
  if (watts && weightKg > 0) {
    return ((10.8 * watts) / weightKg + 7) / 3.5;
  }
  return Number(effort) || DEFAULT_EFFORT;
}

export function ellipticalKcal({ effort, watts, weightKg, restingKcalPerHour, minutes }) {
  const net = Math.max(0, ellipticalMet({ effort, watts, weightKg }) - 1) * Math.max(0, restingKcalPerHour || 0);
  return Math.round((net * (Number(minutes) || 0)) / 60);
}

/** « 150 W » quand la puissance est connue, sinon l'intensité choisie. */
export function ellipticalLabel(effort, watts, t) {
  if (watts) return `${watts} W`;
  const found = ELLIPTICAL_EFFORTS.find((e) => e.value === Number(effort));
  return t(`activityLog.effort_${found ? found.key : 'moderate'}`);
}
