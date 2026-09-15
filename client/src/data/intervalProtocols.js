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
    goal: { fr: 'VO2max', en: 'VO2max' },
    detail: {
      fr: '4 min à 90-95 % FCmax / 3 min récup active — le norvégien, le plus validé. 2-3 ×/semaine au maximum.',
      en: '4 min at 90-95% max HR / 3 min active recovery — the Norwegian, the most validated. Twice or three times a week at most.',
    },
    rounds: 4,
    work: 240,
    rest: 180,
    restKind: 'active',
  },
  {
    id: 'four_by_one',
    label: '4 × 1 min',
    goal: { fr: 'VO2max', en: 'VO2max' },
    detail: {
      fr: '1 min max / 2 min récup complète — presque autant de stimulus en deux fois moins de temps',
      en: '1 min flat out / 2 min full recovery — nearly the same stimulus in half the time',
    },
    rounds: 4,
    work: 60,
    rest: 120,
    restKind: 'complete',
  },
  {
    id: 'twenty_forty',
    label: '20/40 s',
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
    restKind: 'active',
  },
  {
    id: 'quick_death',
    label: 'Quick Death',
    goal: { fr: 'Puissance anaérobie', en: 'Anaerobic power' },
    detail: {
      fr: '8 × 10 s all-out / 50 s récup active — trop court pour installer la VO2max, mais brutal et efficace quand le temps manque',
      en: '8 × 10 s all-out / 50 s active recovery — too short to build VO2max, but brutal and effective when time is short',
    },
    rounds: 8,
    work: 10,
    rest: 50,
    restKind: 'active',
  },
  {
    id: 'cal_ladder',
    label: 'Cal ladder',
    goal: { fr: 'Capacité anaérobie', en: 'Anaerobic capacity' },
    detail: {
      fr: '5 → 12 cal, récup = durée du sprint précédent — progresse avec toi au fil des semaines',
      en: '5 → 12 cal, recovery = the previous sprint\'s length — it gets harder as you get fitter',
    },
    // Pas de durée d'effort connue d'avance : on sprinte jusqu'à un nombre de calories, et la
    // récupération dure exactement ce qu'a duré le sprint. C'est le seul format que le chrono ne
    // peut pas décompter — il le mesure.
    ladder: { from: 5, to: 12 },
    // Les seules secondes de ce protocole qui soient une estimation : on sprinte jusqu'à un
    // nombre de calories, pas jusqu'à un chrono. 5 → 12 cal fait 68 calories machine, soit
    // environ quatre minutes d'effort pour quelqu'un d'entraîné, et autant de récupération
    // puisqu'elle dure ce qu'a duré le sprint.
    estimate: { work: 240, rest: 240 },
    restKind: 'complete',
  },
  {
    id: 'sweet_spot',
    label: 'Sweet Spot',
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

/**
 * Le temps que prend un protocole, séparé en effort et en récupération.
 *
 * Il est déduit des phases plutôt qu'écrit à la main : une durée saisie à côté du déroulé finit
 * toujours par diverger de lui. Le 4 × 1 min était annoncé à 15 minutes alors que son déroulé en
 * fait 10 (4 × 1 min d'effort et 3 × 2 min de récupération), et les kcal se calculaient sur les
 * 15.
 */
export function protocolEffort(protocol) {
  if (!protocol) return { total: 0, work: 0, activeRest: 0, completeRest: 0 };
  const restField = protocol.restKind === 'complete' ? 'completeRest' : 'activeRest';
  const out = { total: 0, work: 0, activeRest: 0, completeRest: 0 };

  if (protocol.estimate) {
    out.work = protocol.estimate.work;
    out[restField] = protocol.estimate.rest;
  } else {
    for (const p of buildPhases(protocol)) {
      if (typeof p.seconds !== 'number') continue;
      if (p.kind === 'work') out.work += p.seconds;
      // Une pause entre deux séries est un vrai arrêt, quelle que soit la nature des récups qui
      // séparent les répétitions : trois minutes entre deux blocs, on descend de la machine.
      else if (p.kind === 'setRest') out.completeRest += p.seconds;
      else out[restField] += p.seconds;
    }
  }
  out.total = out.work + out.activeRest + out.completeRest;
  return out;
}

export function protocolMinutes(protocol) {
  return Math.round(protocolEffort(protocol).total / 60);
}

// Un intervalle n'est pas une sortie régulière étalée sur la même durée : on brûle plus vite
// pendant l'effort et beaucoup moins pendant la récupération. Facturer la séance entière au tarif
// d'un effort continu — ce que faisait l'app — surestimait franchement un format comme le 4 × 1,
// où six minutes sur dix ne sont pas de l'effort.
//
// Et toutes les récupérations ne se valent pas. Le 4 × 4 se récupère en pédalant souple, ce qui
// reste un effort léger ; le 4 × 1 se récupère à l'arrêt, parce que son intérêt est justement de
// repartir frais. Une récupération complète ne compte donc pas du tout : ces minutes-là ne sont
// pas de l'exercice, et ce qu'on y brûle est déjà couvert par le métabolisme de base de la
// journée. Les compter serait les compter deux fois.
//
// Les deux coefficients restants sont des ordres de grandeur, pas des mesures : sans capteur, la
// seule chose dont on soit sûr est qu'un all-out dépasse l'allure de référence et qu'une récup
// active est loin en dessous. Un effort continu, lui, EST l'allure de référence.
const WORK_FACTOR = 1.35;
const ACTIVE_REST_FACTOR = 0.45;
const COMPLETE_REST_FACTOR = 0;

export function protocolKcal(protocol, kcalPerHour, { minutes, restingKcalPerHour = 0 } = {}) {
  const effort = protocolEffort(protocol);
  if (!effort.total || !kcalPerHour) return 0;
  const workFactor = protocol?.continuous ? 1 : WORK_FACTOR;

  // Chaque type de phase est facturé à son propre tarif, net du repos : une récupération active
  // vaut 45 % de l'allure de référence, moins ce que le corps aurait brûlé sans rien faire.
  // Facturé phase par phase et non sur le total, parce que la soustraction ne doit porter que sur
  // les minutes effectivement comptées — pas sur une récupération complète qui, elle, ne compte
  // pas du tout.
  const netRate = (factor) => Math.max(0, kcalPerHour * factor - restingKcalPerHour);
  const base =
    (effort.work * netRate(workFactor) +
      effort.activeRest * netRate(ACTIVE_REST_FACTOR) +
      // Zéro aujourd'hui : une récupération complète n'est pas de l'exercice. La ligne reste pour
      // que le coefficient soit visible et réglable au même endroit que les deux autres.
      effort.completeRest * netRate(COMPLETE_REST_FACTOR)) /
    3600;

  // Allonger ou raccourcir un protocole depuis l'écran d'ajout garde son mélange effort/récup :
  // ajouter cinq minutes à un 4 × 4, c'est ajouter des tours, pas du pédalage à vide.
  if (!minutes) return Math.round(base);
  return Math.round(base * ((minutes * 60) / effort.total));
}
