// Le tapis : une vitesse et une inclinaison, pas une liste de types.
//
// Encoder chaque réglage comme une activité distincte donnait huit lignes dans la liste (quatre
// vitesses, quatre pentes) et ne couvrait quand même aucune combinaison des deux — marcher à
// 5 km/h à 8 % n'existait pas. Une équation couvre tout le domaine.
//
// C'est celle de l'ACSM pour la marche, en ml O₂/kg/min :
//
//     VO₂ = 0,1 × vitesse + 1,8 × vitesse × pente + 3,5
//
// avec la vitesse en m/min et la pente en fraction. Le dernier terme est le repos ; les deux
// premiers sont le coût horizontal et le coût de la montée. Diviser par 3,5 donne des MET, et
// l'app convertit les MET en calories avec le métabolisme de base de l'utilisateur.

export const TREADMILL_SPEEDS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];
export const TREADMILL_GRADES = [0, 2, 4, 6, 8, 10, 12];

export const DEFAULT_SPEED = 5;
export const DEFAULT_GRADE = 8;

export function treadmillMet(speedKmh, gradePct) {
  const metersPerMin = (Number(speedKmh) || 0) * (1000 / 60);
  const grade = (Number(gradePct) || 0) / 100;
  const vo2 = 0.1 * metersPerMin + 1.8 * metersPerMin * grade + 3.5;
  return vo2 / 3.5;
}

/**
 * Ce que le tapis coûte, le repos déduit — même convention que partout ailleurs : un MET de
 * moins, la première unité étant ce que le corps dépensait déjà.
 */
export function treadmillKcal(speedKmh, gradePct, restingKcalPerHour, minutes) {
  const net = Math.max(0, treadmillMet(speedKmh, gradePct) - 1) * Math.max(0, restingKcalPerHour || 0);
  return Math.round((net * (Number(minutes) || 0)) / 60);
}

/** « 5 km/h · 8 % » — ce qui distingue une séance de tapis d'une autre, donc son nom. */
export function treadmillLabel(speedKmh, gradePct) {
  const speed = String(speedKmh).replace('.', ',');
  return `${speed} km/h · ${gradePct} %`;
}
