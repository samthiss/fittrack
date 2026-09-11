// Les formats d'intervalles, décrits assez précisément pour être *déroulés* et pas seulement
// affichés : chacun se déplie en une suite de phases (effort, récupération) que l'écran de séance
// enchaîne au chrono.
//
// Classés du plus au moins efficace pour la VO2max, pas par durée : le 4 × 4 est le plus
// documenté et celui qui passe le plus de temps en zone haute ; le Sweet Spot ferme la marche
// parce qu'il ne vise pas la VO2max du tout — il construit la base aérobie, ce qui reste utile
// mais répond à une autre question.
export const INTERVAL_PROTOCOLS = [
  {
    id: 'four_by_four',
    label: '4 × 4 min',
    minutes: 25,
    goal: 'VO2max',
    detail: '4 min à 90-95 % FCmax / 3 min récup active — le norvégien, le plus validé. 2-3 ×/semaine au maximum.',
    rounds: 4,
    work: 240,
    rest: 180,
  },
  {
    id: 'four_by_one',
    label: '4 × 1 min',
    minutes: 15,
    goal: 'VO2max',
    detail: '1 min max / 2 min récup complète — presque autant de stimulus en deux fois moins de temps',
    rounds: 4,
    work: 60,
    rest: 120,
  },
  {
    id: 'twenty_forty',
    label: '20/40 s',
    minutes: 30,
    goal: 'VO2max + lactique',
    detail: '20 s effort max / 40 s récup · 8-10 reps × 3-4 séries',
    sets: 3,
    rounds: 9,
    work: 20,
    rest: 40,
    setRest: 180,
  },
  {
    id: 'quick_death',
    label: 'Quick Death',
    minutes: 10,
    goal: 'Puissance anaérobie',
    detail: '8 × 10 s all-out / 50 s récup active — trop court pour installer la VO2max, mais brutal et efficace quand le temps manque',
    rounds: 8,
    work: 10,
    rest: 50,
  },
  {
    id: 'cal_ladder',
    label: 'Cal ladder',
    minutes: 12,
    goal: 'Capacité anaérobie',
    detail: '5 → 12 cal, récup = durée du sprint précédent — progresse avec toi au fil des semaines',
    // Pas de durée d'effort connue d'avance : on sprinte jusqu'à un nombre de calories, et la
    // récupération dure exactement ce qu'a duré le sprint. C'est le seul format que le chrono ne
    // peut pas décompter — il le mesure.
    ladder: { from: 5, to: 12 },
  },
  {
    id: 'sweet_spot',
    label: 'Sweet Spot',
    minutes: 30,
    goal: 'Base aérobie',
    detail: "85-90 % FCmax en continu, 20-40 min — peu de gain VO2max, mais c'est ce qui manque le plus souvent à une prépa Hyrox",
    continuous: 1800,
  },
];

export function protocolById(id) {
  return INTERVAL_PROTOCOLS.find((p) => p.id === id) || null;
}

/**
 * Le protocole déplié en phases successives. Une phase = ce qui est affiché en grand pendant
 * qu'on la fait : son type, sa durée, et le tour où l'on en est.
 *
 * La dernière récupération est retirée : personne ne récupère après le dernier effort en
 * regardant un chrono — la séance est finie.
 */
export function buildPhases(protocol) {
  if (!protocol) return [];

  if (protocol.continuous) {
    return [{ kind: 'work', seconds: protocol.continuous, round: 1, rounds: 1 }];
  }

  if (protocol.ladder) {
    const phases = [];
    const { from, to } = protocol.ladder;
    const total = to - from + 1;
    for (let cal = from, i = 1; cal <= to; cal += 1, i += 1) {
      // seconds null = phase mesurée, pas décomptée : c'est l'utilisateur qui la termine.
      phases.push({ kind: 'work', seconds: null, target: `${cal} cal`, round: i, rounds: total });
      if (cal < to) phases.push({ kind: 'rest', seconds: 'previous', round: i, rounds: total });
    }
    return phases;
  }

  const phases = [];
  const sets = protocol.sets || 1;
  for (let set = 1; set <= sets; set += 1) {
    for (let round = 1; round <= protocol.rounds; round += 1) {
      phases.push({ kind: 'work', seconds: protocol.work, round, rounds: protocol.rounds, set, sets });
      const lastRound = round === protocol.rounds;
      const lastSet = set === sets;
      if (lastRound && lastSet) continue;
      phases.push({
        kind: lastRound ? 'setRest' : 'rest',
        seconds: lastRound ? protocol.setRest : protocol.rest,
        round,
        rounds: protocol.rounds,
        set,
        sets,
      });
    }
  }
  return phases;
}

/** La durée totale prévue, en secondes — sert à afficher ce qui reste. */
export function totalSeconds(protocol) {
  return buildPhases(protocol).reduce((sum, p) => sum + (typeof p.seconds === 'number' ? p.seconds : 0), 0);
}
