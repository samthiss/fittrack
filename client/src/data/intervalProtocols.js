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
    goal: { fr: 'VO2max', en: 'VO2max' },
    detail: {
      fr: '4 min à 90-95 % FCmax / 3 min récup active — le norvégien, le plus validé. 2-3 ×/semaine au maximum.',
      en: '4 min at 90-95% max HR / 3 min active recovery — the Norwegian, the most validated. Twice or three times a week at most.',
    },
    rounds: 4,
    work: 240,
    rest: 180,
  },
  {
    id: 'four_by_one',
    label: '4 × 1 min',
    minutes: 15,
    goal: { fr: 'VO2max', en: 'VO2max' },
    detail: {
      fr: '1 min max / 2 min récup complète — presque autant de stimulus en deux fois moins de temps',
      en: '1 min flat out / 2 min full recovery — nearly the same stimulus in half the time',
    },
    rounds: 4,
    work: 60,
    rest: 120,
  },
  {
    id: 'twenty_forty',
    label: '20/40 s',
    minutes: 30,
    goal: { fr: 'VO2max + lactique', en: 'VO2max + lactate' },
    detail: {
      fr: '20 s effort max / 40 s récup · 8-10 reps × 3-4 séries',
      en: '20 s all-out / 40 s recovery · 8-10 reps × 3-4 sets',
    },
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
    goal: { fr: 'Puissance anaérobie', en: 'Anaerobic power' },
    detail: {
      fr: '8 × 10 s all-out / 50 s récup active — trop court pour installer la VO2max, mais brutal et efficace quand le temps manque',
      en: '8 × 10 s all-out / 50 s active recovery — too short to build VO2max, but brutal and effective when time is short',
    },
    rounds: 8,
    work: 10,
    rest: 50,
  },
  {
    id: 'cal_ladder',
    label: 'Cal ladder',
    minutes: 12,
    goal: { fr: 'Capacité anaérobie', en: 'Anaerobic capacity' },
    detail: {
      fr: '5 → 12 cal, récup = durée du sprint précédent — progresse avec toi au fil des semaines',
      en: '5 → 12 cal, recovery = the previous sprint\'s length — it gets harder as you get fitter',
    },
    // Pas de durée d'effort connue d'avance : on sprinte jusqu'à un nombre de calories, et la
    // récupération dure exactement ce qu'a duré le sprint. C'est le seul format que le chrono ne
    // peut pas décompter — il le mesure.
    ladder: { from: 5, to: 12 },
  },
  {
    id: 'sweet_spot',
    label: 'Sweet Spot',
    minutes: 30,
    goal: { fr: 'Base aérobie', en: 'Aerobic base' },
    detail: {
      fr: "85-90 % FCmax en continu, 20-40 min — peu de gain VO2max, mais c'est ce qui manque le plus souvent à une prépa Hyrox",
      en: '85-90% max HR held for 20-40 min — little VO2max gain, but it is what a Hyrox block most often lacks',
    },
    continuous: 1800,
  },
];

// Le nom d'un protocole ne se traduit pas (« 4 × 4 min », « Sweet Spot » se disent pareil), mais
// ce qu'il développe et comment il se déroule, si.
export function localized(field, lang) {
  if (!field) return '';
  return typeof field === 'string' ? field : field[lang === 'en' ? 'en' : 'fr'];
}

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
