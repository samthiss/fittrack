// Finding foods in a library that are the same thing under two names, and deciding which one
// survives a merge. Kept free of database access so the grouping rules can be tested directly —
// they are the part that has to be right, since merging is destructive.

// Words that describe the same food differently rather than a different food. Removing them
// before comparing is what makes "Blanc de poulet cuit" and "poulet blanc" meet.
const NOISE = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', "l'", 'au', 'aux', 'a', 'en', 'et',
  'nature', 'naturel', 'frais', 'fraiche', 'bio', 'maison',
]);

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
    // 'uf', which no hand-typed 'oeuf' can ever match.
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
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
