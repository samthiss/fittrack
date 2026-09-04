// Finding foods in a library that are the same thing under two names, and deciding which one
// survives a merge. Kept free of database access so the grouping rules can be tested directly —
// they are the part that has to be right, since merging is destructive.

// Words that describe the same food differently rather than a different food. Removing them
// before comparing is what makes "Blanc de poulet cuit" and "poulet blanc" meet — and, on a
// scanned German packet, "Frische Bio Eier" and "Eier".
//
// Deliberately absent: anything that changes what the food IS. "entier", "écrémé", "voll",
// "fettarm", "complet" and the percentages stay, because whole milk and skimmed milk are not the
// same food and merging them would rewrite the fat of every day they appear in.
const NOISE = new Set([
  // français
  'de', 'du', 'des', 'la', 'le', 'les', "l'", 'au', 'aux', 'a', 'en', 'et', 'sans',
  'nature', 'naturel', 'naturelle', 'frais', 'fraiche', 'fraiches', 'bio', 'maison', 'qualite',
  // anglais
  'the', 'with', 'and', 'fresh', 'organic', 'natural', 'plain', 'pure', 'style', 'free', 'range',
  // allemand — les mots d'emballage qu'on retrouve sur tout produit scanné
  'der', 'die', 'das', 'mit', 'ohne', 'und', 'vom', 'von', 'aus', 'im', 'in',
  'frisch', 'frische', 'frischer', 'frisches', 'natur', 'naturell', 'original', 'klassisch',
  'feine', 'feiner', 'fein', 'echte', 'echter', 'ganze', 'ganzer', 'gut', 'gute',
]);

// Food words that mean the same thing in French, English and German. A barcode scanned in Germany
// writes "Eier" where the catalogue writes "Œuf" — without this they are two foods forever.
// Only unambiguous nouns are listed: a wrong synonym here proposes a wrong merge, and a merge is
// destructive. Compounds ("Vollmilch") expand to several tokens so they meet their French
// multi-word equivalent.
const SYNONYMS = {
  oeuf: 'oeuf', oeufs: 'oeuf', egg: 'oeuf', eggs: 'oeuf', ei: 'oeuf', eier: 'oeuf',
  lait: 'lait', milk: 'lait', milch: 'lait',
  vollmilch: 'lait entier', magermilch: 'lait ecreme',
  poulet: 'poulet', chicken: 'poulet', hahnchen: 'poulet', huhn: 'poulet', huhnchen: 'poulet',
  hahnchenbrust: 'poulet blanc', huhnerbrust: 'poulet blanc',
  dinde: 'dinde', turkey: 'dinde', pute: 'dinde', putenbrust: 'dinde blanc',
  boeuf: 'boeuf', beef: 'boeuf', rind: 'boeuf', rindfleisch: 'boeuf',
  porc: 'porc', pork: 'porc', schwein: 'porc', schweinefleisch: 'porc',
  jambon: 'jambon', ham: 'jambon', schinken: 'jambon',
  saumon: 'saumon', salmon: 'saumon', lachs: 'saumon',
  thon: 'thon', tuna: 'thon', thunfisch: 'thon',
  poisson: 'poisson', fish: 'poisson', fisch: 'poisson',
  riz: 'riz', rice: 'riz', reis: 'riz',
  pates: 'pates', pasta: 'pates', nudeln: 'pates',
  pain: 'pain', bread: 'pain', brot: 'pain', vollkornbrot: 'pain complet',
  avoine: 'avoine', oats: 'avoine', hafer: 'avoine', haferflocken: 'avoine flocons',
  yaourt: 'yaourt', yogurt: 'yaourt', yoghurt: 'yaourt', joghurt: 'yaourt', naturjoghurt: 'yaourt',
  fromage: 'fromage', cheese: 'fromage', kase: 'fromage',
  quark: 'quark', skyr: 'skyr',
  beurre: 'beurre', butter: 'beurre',
  creme: 'creme', cream: 'creme', sahne: 'creme',
  huile: 'huile', oil: 'huile', ol: 'huile', olivenol: 'huile olive', sonnenblumenol: 'huile tournesol',
  pomme: 'pomme', apple: 'pomme', apfel: 'pomme',
  kartoffel: 'pomme terre', kartoffeln: 'pomme terre', potato: 'pomme terre', potatoes: 'pomme terre',
  banane: 'banane', banana: 'banane',
  tomate: 'tomate', tomato: 'tomate', tomaten: 'tomate', tomatoes: 'tomate',
  carotte: 'carotte', carrot: 'carotte', karotte: 'carotte', mohre: 'carotte', mohren: 'carotte',
  concombre: 'concombre', cucumber: 'concombre', gurke: 'concombre',
  salade: 'salade', salad: 'salade', salat: 'salade',
  epinards: 'epinards', spinach: 'epinards', spinat: 'epinards',
  haricots: 'haricots', beans: 'haricots', bohnen: 'haricots',
  lentilles: 'lentilles', lentils: 'lentilles', linsen: 'lentilles',
  chiches: 'chiches', chickpeas: 'pois chiches', kichererbsen: 'pois chiches',
  amandes: 'amandes', almonds: 'amandes', mandeln: 'amandes',
  noix: 'noix', walnuts: 'noix', walnusse: 'noix',
  miel: 'miel', honey: 'miel', honig: 'miel',
  sucre: 'sucre', sugar: 'sucre', zucker: 'sucre',
  eau: 'eau', water: 'eau', wasser: 'eau',
  jus: 'jus', juice: 'jus', saft: 'jus',
  blanc: 'blanc', breast: 'blanc', brust: 'blanc',
  entier: 'entier', whole: 'entier', voll: 'entier',
  ecreme: 'ecreme', skimmed: 'ecreme', fettarm: 'ecreme', mager: 'ecreme',
  complet: 'complet', wholemeal: 'complet', vollkorn: 'complet',
};

/**
 * A comparable form of a food name: lowercase, unaccented, punctuation gone, filler words gone,
 * remaining words sorted. Sorting is what lets word order stop mattering — the same food typed
 * two ways ("riz blanc" / "blanc de riz") lands on one key.
 *
 * Cooking state is deliberately NOT removed: raw and cooked rice are 130 kcal apart per 100 g,
 * so merging them would silently corrupt every day they appear in.
 */
export function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    // NFD decomposes accents but not ligatures: 'œuf' would lose its œ entirely and compare as
    // 'uf', which no hand-typed 'oeuf' can ever match. ß likewise.
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // A decimal comma is a decimal point: "Milch 3,5%" must not split into "3" and "5%".
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9%.\s]/g, ' ')
    .split(/\s+/)
    // A bare number is a pack quantity ("2 Eier"), not part of the food. A number carrying a %
    // is not: 0% and 5% yoghurt are different products.
    .filter((w) => w && !NOISE.has(w) && !/^\d+(\.\d+)?$/.test(w))
    .flatMap((w) => (SYNONYMS[w] || w).split(' '))
    .filter((w, i, all) => all.indexOf(w) === i)
    .sort()
    .join(' ');
}

// The words that say how a food was prepared. Kept apart from the name rather than ignored: two
// foods only merge when their states agree, or when one of them doesn't say.
const STATE_WORDS = {
  cuit: 'cooked', cuite: 'cooked', cuits: 'cooked', cuites: 'cooked',
  cru: 'raw', crue: 'raw', crus: 'raw', crues: 'raw',
  sec: 'dried', secs: 'dried', seche: 'dried', seches: 'dried', sechees: 'dried',
};

export function stateOf(name) {
  const words = nameKey(name).split(' ');
  for (const w of words) if (STATE_WORDS[w]) return STATE_WORDS[w];
  return null;
}

// The name with its state removed, so "blanc de poulet" and "blanc de poulet cuit" compare equal.
function stemKey(name) {
  return nameKey(name)
    .split(' ')
    .filter((w) => !STATE_WORDS[w])
    .join(' ');
}

/**
 * Groups foods that are plausibly the same thing. Candidates, not verdicts: nothing is merged
 * without the user picking which one to keep.
 *
 * Two foods match when the name minus its cooking state is identical AND their states are
 * compatible — the same, or one of them silent. That last part is what catches the common case:
 * a food typed by hand ("blanc de poulet") rarely says how it was cooked, while a catalogue entry
 * always does. What it still refuses to merge is raw against cooked, where both are explicit and
 * disagree — 100 g of rice is 130 kcal or 360 depending on the answer.
 */
export function findDuplicateGroups(foods) {
  const byStem = new Map();
  for (const food of foods) {
    const stem = stemKey(food.name);
    if (!stem) continue;
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(food);
  }

  const groups = [];
  for (const candidates of byStem.values()) {
    if (candidates.length < 2) continue;
    // Within one stem, split by state and let the state-less ones join the single stated group —
    // but only when there is exactly one, since "riz" cannot choose between raw rice and cooked.
    const byState = new Map();
    for (const food of candidates) {
      const state = stateOf(food.name) || '';
      if (!byState.has(state)) byState.set(state, []);
      byState.get(state).push(food);
    }
    const stateless = byState.get('') || [];
    const stated = [...byState.entries()].filter(([state]) => state !== '');

    if (stated.length === 0) {
      if (stateless.length > 1) groups.push(stateless);
      continue;
    }
    if (stated.length === 1) {
      const merged = [...stated[0][1], ...stateless];
      if (merged.length > 1) groups.push(merged);
      continue;
    }
    // Several states present: each stays its own group, and the state-less ones are left alone
    // rather than guessed at.
    for (const [, list] of stated) if (list.length > 1) groups.push(list);
    if (stateless.length > 1) groups.push(stateless);
  }

  return attachShorterNames(groups, byStem);
}

/**
 * A shorter name joins a longer one when the longer one is the only possible answer. "Eier",
 * scanned off a German packet, is a subset of "Œuf entier" and of nothing else, so the two are
 * the same food. "Lait" is a subset of "Lait entier", "Lait écrémé" and "Lait 3,5%" at once —
 * three different products — so it is left alone rather than attached to whichever came first.
 *
 * This is the same restraint as raw-versus-cooked, generalised: ambiguity is a reason to propose
 * nothing, because the user is being asked to approve a destructive merge.
 */
function attachShorterNames(groups, byStem) {
  const stems = [...byStem.entries()]
    .map(([stem, foods]) => ({ tokens: new Set(stem.split(' ')), foods }))
    // Shortest first, so a name is absorbed by the longer one and never the other way round.
    .sort((a, b) => a.tokens.size - b.tokens.size);

  // Which group each stem's foods currently live in, so absorbing joins the existing group
  // instead of creating a second one holding the same foods.
  const groupOf = new Map();
  for (const group of groups) for (const food of group) groupOf.set(food.id, group);

  for (const stem of stems) {
    const supersets = stems.filter(
      (other) =>
        other !== stem &&
        other.tokens.size > stem.tokens.size &&
        [...stem.tokens].every((t) => other.tokens.has(t))
    );
    if (supersets.length !== 1) continue;
    const target = supersets[0];
    // The target must be unambiguous in itself: a group that disagrees on cooking state cannot
    // adopt anyone.
    if (new Set(target.foods.map((f) => stateOf(f.name) || '')).size > 1) continue;

    const existing = groupOf.get(target.foods[0].id) || groupOf.get(stem.foods[0].id);
    if (existing) {
      for (const food of [...stem.foods, ...target.foods]) {
        if (!existing.includes(food)) existing.push(food);
        groupOf.set(food.id, existing);
      }
    } else {
      const group = [...stem.foods, ...target.foods];
      groups.push(group);
      for (const food of group) groupOf.set(food.id, group);
    }
  }
  return groups;
}


/**
 * Which food a group should collapse onto: the one already used the most, then the oldest.
 * Usage first because that row is the one referenced by the most history, so keeping it is the
 * smallest change to what the user can see — and its name is the one they have been reading.
 */
export function pickSurvivor(group, useCounts = {}) {
  return [...group].sort((a, b) => {
    const used = (useCounts[b.id] || 0) - (useCounts[a.id] || 0);
    if (used !== 0) return used;
    return a.id - b.id;
  })[0];
}
