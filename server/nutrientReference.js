// Shared between the daily dashboard (today's micronutrient totals) and the weekly Rapport
// (period averages), so the two views never diverge on what "58%" or "orange" means.
// kind: 'limit' marks nutrients where the health concern is going OVER the reference value
// (sodium, caffeine) rather than staying under it, like every other (default 'floor') nutrient —
// these are shown in their own isolated "seuils max" section with inverted logic (low = good).
// weeklyAvg: true marks fat-soluble vitamins + B12, which the body stores over weeks/months —
// a single day's value isn't physiologically meaningful, so the dashboard shows a 7-day average
// for these instead of today's number.
// dailyGoal: false marks nutrients with no meaningful *daily* target — either stored over weeks
// (fat-soluble vitamins, B12) or naturally consumed in occasional/lumpy amounts rather than a
// steady daily need (omega-3, folate, selenium, iodine, choline). These get a weekly target
// (reference × 7) instead — see "Semaine en cours"/"Semaine passée". Defaults to true.
// excess: how to explain a >150% reading — 'water' (eliminated, no real risk), 'fat'
// (can accumulate, worth keeping an eye on), 'mineral' (generally fine short-term, but sustained
// high intake is worth watching). Only applies to 'floor' nutrients (limit ones already have
// their own over-threshold framing).
export const MICRO_REFERENCE = {
  fiber: { label: 'Fibres', unit: 'g', reference: 30, excess: 'mineral' },
  sodium: { label: 'Sodium', unit: 'mg', reference: 2300, kind: 'limit' },
  potassium: { label: 'Potassium', unit: 'mg', reference: 3500, excess: 'water' },
  magnesium: { label: 'Magnésium', unit: 'mg', reference: 400, excess: 'mineral' },
  calcium: { label: 'Calcium', unit: 'mg', reference: 1000, excess: 'mineral' },
  zinc: { label: 'Zinc', unit: 'mg', reference: 11, excess: 'mineral' },
  iron: { label: 'Fer', unit: 'mg', reference: 8, excess: 'mineral' },
  selenium: { label: 'Sélénium', unit: 'µg', reference: 55, excess: 'mineral', dailyGoal: false },
  iodine: { label: 'Iode', unit: 'µg', reference: 150, excess: 'mineral', dailyGoal: false },
  vitamin_c: { label: 'Vitamine C', unit: 'mg', reference: 90, excess: 'water' },
  vitamin_a: { label: 'Vitamine A', unit: 'µg', reference: 900, weeklyAvg: true, excess: 'fat', dailyGoal: false },
  vitamin_d: { label: 'Vitamine D', unit: 'UI', reference: 800, rangeLabel: '800–2000 UI', weeklyAvg: true, excess: 'fat', dailyGoal: false },
  vitamin_e: { label: 'Vitamine E', unit: 'mg', reference: 15, weeklyAvg: true, excess: 'fat', dailyGoal: false },
  vitamin_k: { label: 'Vitamine K', unit: 'µg', reference: 120, weeklyAvg: true, excess: 'fat', dailyGoal: false },
  folate: { label: 'Folates (B9)', unit: 'µg', reference: 400, excess: 'water', dailyGoal: false },
  b12: { label: 'Vitamine B12', unit: 'µg', reference: 2.4, weeklyAvg: true, excess: 'water', dailyGoal: false },
  choline: { label: 'Choline', unit: 'mg', reference: 550, excess: 'water', dailyGoal: false },
  omega3: { label: 'Oméga-3 (EPA/DHA)', unit: 'mg', reference: 500, excess: 'mineral', dailyGoal: false },
  caffeine: { label: 'Caféine', unit: 'mg', reference: 300, kind: 'limit' },
};

export function hasDailyGoal(key) {
  return MICRO_REFERENCE[key]?.dailyGoal !== false;
}

// One-line food suggestion per nutrient, used to auto-generate "what to do about it" for any
// floor nutrient under 80% of its target (dashboard "À améliorer" section and the weekly Rapport).
export const NUTRIENT_SUGGESTIONS = {
  fiber: 'des légumineuses, flocons d\'avoine, légumes ou fruits',
  potassium: "une pomme de terre avec la peau (300 g ≈ 900 mg) ou une poignée d'épinards",
  magnesium: '30 g d\'amandes (≈ 75 mg), des épinards, du chocolat noir ou des graines de courge',
  calcium: 'un laitage, 100 g de sardines, 30 g d\'amandes ou du tofu',
  zinc: 'de la viande rouge, des fruits de mer, des œufs ou des graines de courge',
  iron: '100 g de lentilles cuites (≈ 3 mg) ou un steak de bœuf',
  selenium: 'une noix du Brésil (≈ 70-90 µg)',
  iodine: "du poisson, du sel iodé ou des produits laitiers",
  vitamin_c: "un kiwi ou la moitié d'un poivron rouge (≈ 70-90 mg)",
  vitamin_a: 'de la patate douce, des carottes, des épinards ou du foie',
  vitamin_d: 'du poisson gras, des œufs, ou une supplémentation',
  vitamin_e: 'des huiles végétales, des amandes ou des graines de tournesol',
  vitamin_k: 'des légumes verts à feuilles (épinards, chou kale)',
  folate: 'des légumes verts à feuilles, des légumineuses ou de l\'avocat',
  b12: 'un œuf ou 100 g de viande/poisson (≈ 1-3 µg)',
  choline: 'un œuf entier (≈ 150 mg)',
  omega3: 'du saumon, du maquereau, des sardines, ou un complément d\'huile de poisson/algue (EPA/DHA — les noix et l\'huile de colza/lin apportent de l\'ALA, pas de l\'EPA/DHA)',
};

// Nutrients where a supplement is a realistic, commonly-recommended option when diet alone
// falls short — shown as "compléments à envisager" alongside the food-based suggestions above.
// Deliberately short list: only nutrients that are genuinely hard to hit from food alone for
// many diets (fatty fish/dairy-light diets, etc.), not every deficient nutrient.
export const SUPPLEMENT_SUGGESTIONS = {
  vitamin_d: 'une supplémentation en vitamine D (surtout en automne/hiver — avis médical recommandé)',
  b12: 'un supplément de B12, surtout si l\'alimentation est pauvre en produits animaux',
  omega3: 'un complément d\'huile de poisson ou d\'huile d\'algue (EPA/DHA)',
  iodine: 'un sel iodé ou un complément si le poisson/les produits laitiers sont rares dans l\'alimentation',
};

// Note shown next to a floor nutrient's bar once it's well past 100% (>150%), so a high number
// isn't left unexplained. Water-soluble excess is eliminated in urine (no real accumulation
// risk); fat-soluble can build up over weeks/months; minerals sit in between — usually fine
// short-term but worth not making a daily habit.
export const EXCESS_MESSAGES = {
  water: 'Excès éliminé dans les urines — pas de risque connu à cette dose.',
  fat: 'Vitamine liposoluble : peut s\'accumuler dans le corps sur la durée — à surveiller si ça se répète.',
  mineral: 'Généralement sans risque ponctuellement — à surveiller si c\'est systématique sur plusieurs jours.',
};

// Floor nutrients: <50% = loin de la cible (rouge), 50-80% = à améliorer (orange), 80%+ = ok
// (vert). No separate "too high" tier anymore — a floor nutrient being generously covered isn't
// a problem the way a limit nutrient going over is (see EXCESS_MESSAGES for genuinely high values).
export function microStatus(pct, kind) {
  if (kind === 'limit') {
    if (pct > 100) return 'danger';
    if (pct > 80) return 'warn';
    return 'ok';
  }
  if (pct < 50) return 'low';
  if (pct < 80) return 'warn';
  return 'ok';
}

// How "concerning" an entry is, so both kinds sort worst-first in the same list:
// far below target (floor) or far past the limit (ceiling) both score high.
function severity(pct, kind) {
  return kind === 'limit' ? pct : 100 - pct;
}

export function buildMicroList(nutrientKeys, avgFn) {
  return nutrientKeys
    .filter((k) => MICRO_REFERENCE[k])
    .map((key) => {
      const ref = MICRO_REFERENCE[key];
      const kind = ref.kind || 'floor';
      const value = avgFn(key);
      const pct = (value / ref.reference) * 100;
      const entry = {
        key,
        label: ref.label,
        unit: ref.unit,
        rangeLabel: ref.rangeLabel,
        kind,
        avg: value,
        reference: ref.reference,
        pct,
        status: microStatus(pct, kind),
        weeklyAvg: !!ref.weeklyAvg,
        dailyGoal: hasDailyGoal(key),
      };
      if (kind === 'floor' && pct < 80) {
        entry.suggestion = NUTRIENT_SUGGESTIONS[key] || null;
      }
      if (kind === 'floor' && pct > 150) {
        entry.excessType = ref.excess || 'mineral';
        entry.excessMessage = EXCESS_MESSAGES[entry.excessType];
      }
      return entry;
    })
    .sort((a, b) => severity(b.pct, b.kind) - severity(a.pct, a.kind));
}
