// Les zones d'intensité, et ce qu'elles coûtent.
//
// « Modéré / soutenu / intense » demandait à l'utilisateur de traduire son ressenti dans un
// vocabulaire qui n'est pas le sien. Les zones, si : c'est ce qu'affiche une montre, c'est dans
// quoi un plan d'entraînement est écrit.
//
// Et surtout, une zone se calcule. Une zone est une fraction de la VO2max — que l'app connaît,
// puisqu'elle est relevée dans l'onglet VO2max — donc la dépense se déduit de la consommation
// d'oxygène réelle plutôt que d'une table de population :
//
//     VO₂ (ml/kg/min) = fraction × VO2max
//     kcal/min = VO₂ × poids / 1000 × 5        (5 kcal par litre d'O₂)
//
// Deux personnes en zone 2 ne brûlent pas pareil, et c'est exactement ce que cette formule dit :
// celle qui a 55 de VO2max y travaille plus haut, en absolu, que celle qui a 35.
//
// Les pourcentages de VO2max sont le milieu de chaque zone, converties depuis les zones de
// fréquence cardiaque classiques (50-60 % FCmax pour la zone 1, etc.) : la relation entre les
// deux n'est pas 1:1, 60 % de FCmax valant environ 40 % de VO2max.
export const ZONES = [
  { zone: 1, hrFrom: 0.5, hrTo: 0.6, vo2Fraction: 0.35, fallbackMet: 3.5 },
  { zone: 2, hrFrom: 0.6, hrTo: 0.7, vo2Fraction: 0.47, fallbackMet: 5.0 },
  { zone: 3, hrFrom: 0.7, hrTo: 0.8, vo2Fraction: 0.62, fallbackMet: 7.0 },
  { zone: 4, hrFrom: 0.8, hrTo: 0.9, vo2Fraction: 0.78, fallbackMet: 9.0 },
  { zone: 5, hrFrom: 0.9, hrTo: 1.0, vo2Fraction: 0.92, fallbackMet: 11.0 },
];

/**
 * La fréquence cardiaque maximale, estimée depuis l'âge par la formule de Tanaka.
 *
 * 208 − 0,7 × âge plutôt que le « 220 − âge » habituel : celui-ci vient d'un ajustement à l'œil
 * des années 70 et se trompe de dix battements ou plus passé quarante ans. Les deux restent des
 * estimations de population — un test d'effort donne la vraie, qui peut s'en écarter de ±10.
 */
export function maxHrFromAge(age) {
  if (!age || age <= 0) return null;
  return Math.round(208 - 0.7 * age);
}

/**
 * Les battements par minute d'une zone : « 135-147 », ce que la montre affiche pendant l'effort.
 *
 * Avec la FC de repos, les bornes se placent sur la réserve cardiaque (Karvonen) :
 *
 *     borne = repos + fraction × (max − repos)
 *
 * C'est le calcul de l'Apple Watch — ses zones font toutes la même largeur, 10 % de la réserve —
 * et c'est elle que l'utilisateur regarde pendant l'effort : la zone choisie ici doit être celle
 * qu'elle affichait. Chaque zone commence au battement entier au-dessus de sa borne et s'arrête
 * juste avant la suivante, comme sur la montre. Sans FC de repos, on retombe sur des pourcentages
 * de la FC max seule.
 */
export function zoneHrRange(zone, maxHr, restingHr) {
  if (!maxHr) return null;
  const z = zoneByNumber(zone);
  if (restingHr > 0 && restingHr < maxHr) {
    const bound = (fraction) => Math.ceil(restingHr + fraction * (maxHr - restingHr));
    const next = ZONES.find((n) => n.zone === z.zone + 1);
    return { from: bound(z.hrFrom), to: next ? bound(next.hrFrom) - 1 : maxHr };
  }
  return { from: Math.round(z.hrFrom * maxHr), to: Math.round(z.hrTo * maxHr) };
}

export const DEFAULT_ZONE = 2;

export function zoneByNumber(zone) {
  return ZONES.find((z) => z.zone === Number(zone)) || ZONES[DEFAULT_ZONE - 1];
}

// La consommation d'oxygène au repos, 1 MET : le plancher de la réserve d'O₂ comme la FC de repos
// est celui de la réserve cardiaque.
const RESTING_VO2 = 3.5; // ml/kg/min

/**
 * La dépense brute d'une zone, en kcal/h.
 *
 * Quand la FC de repos est connue, les zones sont placées sur la réserve cardiaque (voir
 * zoneHrRange) ; or un pourcentage de réserve cardiaque vaut à peu près le même pourcentage de
 * réserve d'O₂ (Swain, 1997). La zone 2 de la montre, 60-70 % de réserve, consomme donc
 * 3,5 + 65 % × (VO2max − 3,5), pas les 47 % de VO2max qui allaient avec des zones en % de FC max —
 * plus basses, donc moins chères. Garder ces 47 % sous-estimerait la séance d'un tiers.
 *
 * Sans VO2max relevée, on retombe sur le MET de population de la zone : moins juste, mais l'écran
 * doit fonctionner avant que la première mesure soit saisie.
 */
export function zoneKcalPerHour({ zone, vo2max, weightKg, restingKcalPerHour, restingHr }) {
  const z = zoneByNumber(zone);
  if (vo2max > 0 && weightKg > 0) {
    const vo2 =
      restingHr > 0
        ? RESTING_VO2 + ((z.hrFrom + z.hrTo) / 2) * Math.max(0, vo2max - RESTING_VO2)
        : z.vo2Fraction * vo2max; // ml/kg/min
    return (vo2 * weightKg * 5 * 60) / 1000;
  }
  return z.fallbackMet * Math.max(0, restingKcalPerHour || 0);
}

/** Ce que la séance ajoute, le repos déduit — même convention que partout ailleurs. */
export function zoneKcal({ zone, vo2max, weightKg, restingKcalPerHour, restingHr, minutes }) {
  const gross = zoneKcalPerHour({ zone, vo2max, weightKg, restingKcalPerHour, restingHr });
  const net = Math.max(0, gross - Math.max(0, restingKcalPerHour || 0));
  return Math.round((net * (Number(minutes) || 0)) / 60);
}

/** Si la VO2max est connue, la zone est calculée sur elle ; sinon, elle est estimée. */
export function zoneIsPersonal(vo2max, weightKg) {
  return vo2max > 0 && weightKg > 0;
}
