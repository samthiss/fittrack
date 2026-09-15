// Le coût d'une activité, en MET.
//
// Un MET est le coût du repos : une activité à 8 MET coûte huit fois ce que coûte ne rien faire.
// C'est ce qui remplace le taux kcal/h que l'utilisateur réglait lui-même — un taux saisi à la
// main est juste le jour où on le saisit et faux ensuite, puisqu'il ne bouge ni avec le poids ni
// avec l'âge.
//
// La table classique convertit les MET avec une constante de population (3,5 ml O₂/kg/min). On
// utilise à la place le métabolisme de base de l'utilisateur, calculé depuis son sexe, son âge,
// sa taille et son poids (voir tdee.js) : c'est plus juste pour lui, et surtout c'est la même
// définition du repos que celle qui sert à ses 24 heures, donc la soustraction du repos tombe
// exactement juste au lieu d'être approchée.
//
//     brut = MET × repos        net = (MET − 1) × repos
//
// Les valeurs viennent du Compendium of Physical Activities (Ainsworth et al.) ; celles des
// stations Hyrox, qu'il ne couvre pas, sont alignées sur l'effort comparable qu'il couvre.
export const ACTIVITY_METS = {
  // Marche et tapis — la vitesse fait tout, d'où une entrée par allure.
  walking_pad_1_5: 2.0,
  walking_pad_2: 2.3,
  walking_pad_2_5: 2.8,
  marche_tapis: 3.0,
  walking_pad_3: 3.3,
  marche: 3.5,
  // Une randonnée tranquille en forêt : l'allure est celle d'une marche, mais le terrain
  // irrégulier et les dénivelés en font tout autre chose — le Compendium la donne à 6.
  randonnee: 6.0,
  // L'inclinaison compte autant que la vitesse : marcher à 5,5 km/h à 10 % vaut de la course.
  marche_tapis_incline_6: 7.0,
  marche_tapis_incline_8: 8.0,
  marche_tapis_incline_10: 9.0,
  marche_tapis_incline_12: 10.0,

  force: 4.0,
  stepper: 5.0,
  velo_ville: 4.0,
  velo_appartement: 6.0,
  corde_a_sauter: 10.0,
  course_a_pied: 9.0,
  course_tapis: 9.0,

  // Machines et stations Hyrox.
  ski_erg: 9.0,
  rameur: 8.5,
  assault_bike: 10.0,
  traineau_poussee: 10.0,
  traineau_traction: 9.5,
  burpees_broad_jump: 10.0,
  farmers_carry: 6.5,
  fentes_sandbag: 7.5,
  wall_balls: 8.0,
  hyrox: 10.0,
};

// Un type inconnu vaut un effort modéré plutôt que zéro : une activité enregistrée ne doit jamais
// coûter aucune calorie faute d'être au catalogue.
const DEFAULT_MET = 5.0;

export function metFor(type) {
  return ACTIVITY_METS[type] ?? DEFAULT_MET;
}

/** La dépense brute d'une activité, repos inclus — l'ordre de grandeur qu'affiche une montre. */
export function grossKcalPerHour(type, restingKcalPerHour) {
  return metFor(type) * Math.max(0, restingKcalPerHour || 0);
}

/**
 * Ce que l'activité ajoute réellement, le repos déduit.
 *
 * Un MET de moins, très exactement : la première unité est ce que le corps dépensait déjà, et la
 * journée la compte ailleurs.
 */
export function netKcalPerHour(type, restingKcalPerHour) {
  return Math.max(0, metFor(type) - 1) * Math.max(0, restingKcalPerHour || 0);
}
