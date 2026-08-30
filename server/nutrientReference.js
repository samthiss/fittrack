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

// Curated list of common foods with typical micronutrient values per 100 g, used to power the
// "Aliments riches en ..." page for nutrients the user may not have in their personal library.
// Values are ballpark averages from standard food composition tables.
export const COMMON_FOODS = {
  fiber: [
    { name: 'Artichaut', fiber: 8.6, cat: 'legumes' },
    { name: 'Panais', fiber: 4.9, cat: 'legumes' },
    { name: 'Chou kale', fiber: 4.1, cat: 'legumes' },
    { name: 'Choux de Bruxelles', fiber: 3.8, cat: 'legumes' },
    { name: 'Haricots verts', fiber: 3.4, cat: 'legumes' },
    { name: 'Fenouil', fiber: 3.1, cat: 'legumes' },
    { name: 'Aubergine', fiber: 3, cat: 'legumes' },
    { name: 'Patate douce', fiber: 3, cat: 'legumes' },
    { name: 'Carotte', fiber: 2.8, cat: 'legumes' },
    { name: 'Betterave', fiber: 2.8, cat: 'legumes' },
    { name: 'Brocoli', fiber: 2.6, cat: 'legumes' },
    { name: 'Épinards', fiber: 2.2, cat: 'legumes' },
    { name: 'Asperges', fiber: 2.1, cat: 'legumes' },
    { name: 'Chou-fleur', fiber: 2, cat: 'legumes' },
    { name: 'Courge butternut', fiber: 2, cat: 'legumes' },
    { name: 'Poireau', fiber: 1.8, cat: 'legumes' },
    { name: 'Petits pois', fiber: 5.1, cat: 'legumes' },
    { name: 'Champignons', fiber: 1, cat: 'legumes' },
    { name: 'Lentilles sèches', fiber: 11, cat: 'legumineuses' },
    { name: 'Haricots blancs', fiber: 10.5, cat: 'legumineuses' },
    { name: 'Haricots rouges', fiber: 8.7, cat: 'legumineuses' },
    { name: 'Haricots noirs', fiber: 8.7, cat: 'legumineuses' },
    { name: 'Pois cassés', fiber: 8.3, cat: 'legumineuses' },
    { name: 'Pois chiches', fiber: 7.6, cat: 'legumineuses' },
    { name: 'Lentilles cuites', fiber: 7.9, cat: 'legumineuses' },
    { name: 'Flageolets', fiber: 7, cat: 'legumineuses' },
    { name: 'Fèves', fiber: 5.4, cat: 'legumineuses' },
    { name: 'Fruit de la passion', fiber: 10.4, cat: 'fruits' },
    { name: 'Figues sèches', fiber: 9.3, cat: 'fruits' },
    { name: 'Dattes', fiber: 8, cat: 'fruits' },
    { name: 'Abricots secs', fiber: 7.3, cat: 'fruits' },
    { name: 'Pruneaux', fiber: 7.1, cat: 'fruits' },
    { name: 'Avocat', fiber: 6.7, cat: 'fruits' },
    { name: 'Cassis', fiber: 6.8, cat: 'fruits' },
    { name: 'Framboises', fiber: 6.5, cat: 'fruits' },
    { name: 'Goyave', fiber: 5.4, cat: 'fruits' },
    { name: 'Mûres', fiber: 5.3, cat: 'fruits' },
    { name: 'Groseilles', fiber: 4.3, cat: 'fruits' },
    { name: 'Grenade', fiber: 4, cat: 'fruits' },
    { name: 'Raisins secs', fiber: 3.7, cat: 'fruits' },
    { name: 'Poire', fiber: 3.1, cat: 'fruits' },
    { name: 'Kiwi', fiber: 3, cat: 'fruits' },
    { name: 'Banane', fiber: 2.6, cat: 'fruits' },
    { name: 'Pomme', fiber: 2.4, cat: 'fruits' },
    { name: 'Orange', fiber: 2.4, cat: 'fruits' },
    { name: 'Myrtilles', fiber: 2.4, cat: 'fruits' },
    { name: 'Fraises', fiber: 2, cat: 'fruits' },
    { name: 'Son de blé', fiber: 43, cat: 'cereales' },
    { name: 'Son d\'avoine', fiber: 15, cat: 'cereales' },
    { name: 'Popcorn', fiber: 14.5, cat: 'cereales' },
    { name: 'Seigle (farine)', fiber: 15.5, cat: 'cereales' },
    { name: 'Épeautre', fiber: 10.7, cat: 'cereales' },
    { name: 'Sarrasin', fiber: 10, cat: 'cereales' },
    { name: 'Flocons d\'avoine', fiber: 10, cat: 'cereales' },
    { name: 'Pain complet', fiber: 7, cat: 'cereales' },
    { name: 'Quinoa', fiber: 7, cat: 'cereales' },
    { name: 'Riz complet', fiber: 3.5, cat: 'cereales' },
    { name: 'Graines de chia', fiber: 34, cat: 'noix_graines' },
    { name: 'Lin moulu', fiber: 27, cat: 'noix_graines' },
    { name: 'Noix de coco râpée', fiber: 16, cat: 'noix_graines' },
    { name: 'Amandes', fiber: 12, cat: 'noix_graines' },
    { name: 'Pistaches', fiber: 10, cat: 'noix_graines' },
    { name: 'Noisettes', fiber: 9.7, cat: 'noix_graines' },
    { name: 'Graines de tournesol', fiber: 8.6, cat: 'noix_graines' },
    { name: 'Cacahuètes', fiber: 8.5, cat: 'noix_graines' },
    { name: 'Noix', fiber: 6.7, cat: 'noix_graines' },
    { name: 'Graines de citrouille', fiber: 6, cat: 'noix_graines' },
    { name: 'Graines de sésame', fiber: 11.8, cat: 'noix_graines' },
    { name: 'Noix de cajou', fiber: 3.3, cat: 'noix_graines' },
    { name: 'Cacao en poudre non sucré', fiber: 33, cat: 'divers' },
    { name: 'Chocolat noir (70%)', fiber: 10.9, cat: 'divers' },
  ],
  sodium: [
    { name: 'Sel de table', sodium: 38800, cat: 'condiments' },
    { name: 'Sauce soja', sodium: 5700, cat: 'condiments' },
    { name: 'Miso', sodium: 4200, cat: 'condiments' },
    { name: 'Jambon cru', sodium: 1400, cat: 'viandes' },
    { name: 'Fromage (cheddar)', sodium: 660, cat: 'laitiers' },
    { name: 'Olives', sodium: 2400, cat: 'fruits' },
    { name: 'Thon en boîte', sodium: 310, cat: 'poissons' },
    { name: 'Sardines en boîte', sodium: 450, cat: 'poissons' },
    { name: 'Pain', sodium: 470, cat: 'cereales' },
    { name: 'Sauce Worcestershire', sodium: 1500, cat: 'condiments' },
  ],
  potassium: [
    { name: 'Épinards', potassium: 558, cat: 'legumes' },
    { name: 'Patate douce', potassium: 475, cat: 'legumes' },
    { name: 'Avocat', potassium: 485, cat: 'fruits' },
    { name: 'Banane', potassium: 358, cat: 'fruits' },
    { name: 'Haricots blancs', potassium: 1180, cat: 'legumineuses' },
    { name: 'Saumon', potassium: 380, cat: 'poissons' },
    { name: 'Yaourt', potassium: 240, cat: 'laitiers' },
    { name: 'Champignons', potassium: 320, cat: 'legumes' },
    { name: 'Pomme de terre', potassium: 425, cat: 'legumes' },
    { name: 'Épinards', potassium: 558, cat: 'legumes' },
    { name: 'Betterave', potassium: 305, cat: 'legumes' },
    { name: 'Courge butternut', potassium: 295, cat: 'legumes' },
    { name: 'Abricots secs', potassium: 1160, cat: 'fruits' },
    { name: 'Kiwis', potassium: 312, cat: 'fruits' },
    { name: 'Haricots verts', potassium: 211, cat: 'legumes' },
  ],
  magnesium: [
    { name: 'Amandes', magnesium: 270, cat: 'noix_graines' },
    { name: 'Épinards', magnesium: 79, cat: 'legumes' },
    { name: 'Chocolat noir (70%)', magnesium: 228, cat: 'divers' },
    { name: 'Graines de citrouille', magnesium: 400, cat: 'noix_graines' },
    { name: 'Haricots noirs', magnesium: 160, cat: 'legumineuses' },
    { name: 'Avocat', magnesium: 29, cat: 'fruits' },
    { name: 'Yaourt', magnesium: 17, cat: 'laitiers' },
    { name: 'Noix de cajou', magnesium: 260, cat: 'noix_graines' },
    { name: 'Noix', magnesium: 158, cat: 'noix_graines' },
    { name: 'Avoine', magnesium: 138, cat: 'cereales' },
    { name: 'Pois chiches', magnesium: 48, cat: 'legumineuses' },
    { name: 'Lentilles', magnesium: 47, cat: 'legumineuses' },
    { name: 'Banane', magnesium: 27, cat: 'fruits' },
    { name: 'Saumon', magnesium: 31, cat: 'poissons' },
    { name: 'Tofu', magnesium: 30, cat: 'legumineuses' },
  ],
  calcium: [
    { name: 'Sardines (avec arêtes)', calcium: 382, cat: 'poissons' },
    { name: 'Yaourt', calcium: 125, cat: 'laitiers' },
    { name: 'Fromage (comté)', calcium: 800, cat: 'laitiers' },
    { name: 'Kale', calcium: 150, cat: 'legumes' },
    { name: 'Brocoli', calcium: 47, cat: 'legumes' },
    { name: 'Tofu (sulfate de calcium)', calcium: 350, cat: 'legumineuses' },
    { name: 'Amandes', calcium: 269, cat: 'noix_graines' },
    { name: 'Lait', calcium: 120, cat: 'laitiers' },
    { name: 'Sardines', calcium: 382, cat: 'poissons' },
    { name: 'Bok choy', calcium: 105, cat: 'legumes' },
    { name: 'Saumon en boîte', calcium: 91, cat: 'poissons' },
    { name: 'Oranges', calcium: 40, cat: 'fruits' },
    { name: 'Graines de sésame', calcium: 980, cat: 'noix_graines' },
  ],
  zinc: [
    { name: 'Huitres', zinc: 90, cat: 'poissons' },
    { name: 'Bœuf (steak)', zinc: 6, cat: 'viandes' },
    { name: 'Graines de citrouille', zinc: 7.5, cat: 'noix_graines' },
    { name: 'Agneau', zinc: 4.5, cat: 'viandes' },
    { name: 'Lentilles', zinc: 1.3, cat: 'legumineuses' },
    { name: 'Pois chiches', zinc: 1.5, cat: 'legumineuses' },
    { name: 'Yaourt', zinc: 0.9, cat: 'laitiers' },
    { name: 'Noix de cajou', zinc: 5.8, cat: 'noix_graines' },
    { name: 'Poulet', zinc: 1.3, cat: 'viandes' },
    { name: 'Graines de chanvre', zinc: 7.3, cat: 'noix_graines' },
    { name: 'Crevettes', zinc: 1.3, cat: 'poissons' },
  ],
  iron: [
    { name: 'Foie de bœuf', iron: 6.5, cat: 'viandes' },
    { name: 'Bœuf', iron: 2.6, cat: 'viandes' },
    { name: 'Lentilles', iron: 3.3, cat: 'legumineuses' },
    { name: 'Épinards', iron: 2.7, cat: 'legumes' },
    { name: 'Tofu', iron: 2.7, cat: 'legumineuses' },
    { name: 'Chocolat noir', iron: 11.9, cat: 'divers' },
    { name: 'Quinoa', iron: 1.5, cat: 'cereales' },
    { name: 'Graines de citrouille', iron: 3.3, cat: 'noix_graines' },
    { name: 'Palourdes', iron: 28, cat: 'poissons' },
    { name: 'Pois chiches', iron: 2.9, cat: 'legumineuses' },
    { name: 'Sardines', iron: 2.9, cat: 'poissons' },
    { name: 'Dinde', iron: 1.4, cat: 'viandes' },
    { name: 'Brocoli', iron: 0.7, cat: 'legumes' },
    { name: 'Betterave', iron: 0.8, cat: 'legumes' },
  ],
  selenium: [
    { name: 'Noix du Brésil', selenium: 1917, cat: 'noix_graines' },
    { name: 'Thon', selenium: 60, cat: 'poissons' },
    { name: 'Dinde', selenium: 35, cat: 'viandes' },
    { name: 'Poulet', selenium: 27, cat: 'viandes' },
    { name: 'Œufs', selenium: 30, cat: 'viandes' },
    { name: 'Saumon', selenium: 36, cat: 'poissons' },
    { name: 'Graines de tournesol', selenium: 53, cat: 'noix_graines' },
    { name: 'Champignons shiitake', selenium: 46, cat: 'legumes' },
    { name: 'Porc', selenium: 32, cat: 'viandes' },
    { name: 'Bœuf', selenium: 22, cat: 'viandes' },
  ],
  iodine: [
    { name: 'Nori (algue)', iodine: 16, cat: 'legumes' },
    { name: 'Kombu (algue)', iodine: 1500, cat: 'legumes' },
    { name: 'Morue', iodine: 200, cat: 'poissons' },
    { name: 'Sel iodé', iodine: 77000, cat: 'condiments' },
    { name: 'Lait', iodine: 35, cat: 'laitiers' },
    { name: 'Œufs', iodine: 24, cat: 'viandes' },
    { name: 'Yaourt', iodine: 30, cat: 'laitiers' },
    { name: 'Fruits de mer (mélange)', iodine: 60, cat: 'poissons' },
    { name: 'Cranberries', iodine: 2, cat: 'fruits' },
  ],
  vitamin_c: [
    { name: 'Camu camu', vitamin_c: 2000, cat: 'fruits' },
    { name: 'Goyave', vitamin_c: 228, cat: 'fruits' },
    { name: 'Poivron rouge', vitamin_c: 190, cat: 'legumes' },
    { name: 'Kiwi', vitamin_c: 90, cat: 'fruits' },
    { name: 'Orange', vitamin_c: 53, cat: 'fruits' },
    { name: 'Fraises', vitamin_c: 58, cat: 'fruits' },
    { name: 'Brocoli', vitamin_c: 89, cat: 'legumes' },
    { name: 'Papaye', vitamin_c: 61, cat: 'fruits' },
    { name: 'Choux de Bruxelles', vitamin_c: 85, cat: 'legumes' },
    { name: 'Brocoli', vitamin_c: 89, cat: 'legumes' },
    { name: 'Citron', vitamin_c: 53, cat: 'fruits' },
    { name: 'Mangue', vitamin_c: 36, cat: 'fruits' },
    { name: 'Épinards', vitamin_c: 28, cat: 'legumes' },
    { name: 'Pomme de terre', vitamin_c: 20, cat: 'legumes' },
  ],
  vitamin_a: [
    { name: 'Foie de bœuf', vitamin_a: 10500, cat: 'viandes' },
    { name: 'Carotte', vitamin_a: 835, cat: 'legumes' },
    { name: 'Patate douce', vitamin_a: 709, cat: 'legumes' },
    { name: 'Épinards', vitamin_a: 469, cat: 'legumes' },
    { name: 'Kale', vitamin_a: 681, cat: 'legumes' },
    { name: 'Melon', vitamin_a: 338, cat: 'fruits' },
    { name: 'Abricots', vitamin_a: 96, cat: 'fruits' },
    { name: 'Cantaloup', vitamin_a: 338, cat: 'fruits' },
    { name: 'Poivron rouge', vitamin_a: 313, cat: 'legumes' },
    { name: 'Mangue', vitamin_a: 54, cat: 'fruits' },
    { name: 'Œufs', vitamin_a: 140, cat: 'viandes' },
    { name: 'Fromage', vitamin_a: 265, cat: 'laitiers' },
  ],
  vitamin_d: [
    { name: 'Saumon', vitamin_d: 526, cat: 'poissons' },
    { name: 'Maquereau', vitamin_d: 360, cat: 'poissons' },
    { name: 'Huile de foie de morue', vitamin_d: 10000, cat: 'huiles' },
    { name: 'Champignons shiitake', vitamin_d: 100, cat: 'legumes' },
    { name: 'Sardines', vitamin_d: 272, cat: 'poissons' },
    { name: 'Thon', vitamin_d: 154, cat: 'poissons' },
    { name: 'Œufs (jaune)', vitamin_d: 37, cat: 'viandes' },
    { name: 'Lait enrichi', vitamin_d: 40, cat: 'laitiers' },
    { name: 'Truite', vitamin_d: 635, cat: 'poissons' },
    { name: 'Hareng', vitamin_d: 220, cat: 'poissons' },
  ],
  vitamin_e: [
    { name: 'Amandes', vitamin_e: 25, cat: 'noix_graines' },
    { name: 'Graines de tournesol', vitamin_e: 35, cat: 'noix_graines' },
    { name: 'Noisettes', vitamin_e: 15, cat: 'noix_graines' },
    { name: 'Germe de blé', vitamin_e: 17, cat: 'cereales' },
    { name: 'Épinards', vitamin_e: 2, cat: 'legumes' },
    { name: 'Brocoli', vitamin_e: 1.5, cat: 'legumes' },
    { name: 'Avocat', vitamin_e: 2.1, cat: 'fruits' },
    { name: 'Kale', vitamin_e: 1.5, cat: 'legumes' },
    { name: 'Noix', vitamin_e: 2.6, cat: 'noix_graines' },
    { name: 'Arachides', vitamin_e: 4.6, cat: 'noix_graines' },
  ],
  vitamin_k: [
    { name: 'Kale', vitamin_k: 817, cat: 'legumes' },
    { name: 'Épinards', vitamin_k: 483, cat: 'legumes' },
    { name: 'Brocoli', vitamin_k: 101, cat: 'legumes' },
    { name: 'Choux de Bruxelles', vitamin_k: 177, cat: 'legumes' },
    { name: 'Laitue', vitamin_k: 126, cat: 'legumes' },
    { name: 'Persil', vitamin_k: 1640, cat: 'herbes' },
    { name: 'Ciboulette', vitamin_k: 297, cat: 'herbes' },
    { name: 'Foie de bœuf', vitamin_k: 6, cat: 'viandes' },
    { name: 'Pruneaux', vitamin_k: 60, cat: 'fruits' },
    { name: 'Bok choy', vitamin_k: 46, cat: 'legumes' },
  ],
  folate: [
    { name: 'Lentilles', folate: 181, cat: 'legumineuses' },
    { name: 'Pois chiches', folate: 172, cat: 'legumineuses' },
    { name: 'Asperges', folate: 149, cat: 'legumes' },
    { name: 'Épinards', folate: 194, cat: 'legumes' },
    { name: 'Brocoli', folate: 63, cat: 'legumes' },
    { name: 'Avocat', folate: 81, cat: 'fruits' },
    { name: 'Foie de bœuf', folate: 290, cat: 'viandes' },
    { name: 'Laitue', folate: 38, cat: 'legumes' },
    { name: 'Betterave', folate: 109, cat: 'legumes' },
    { name: 'Haricots rouges', folate: 130, cat: 'legumineuses' },
    { name: 'Graines de tournesol', folate: 227, cat: 'noix_graines' },
    { name: 'Œufs', folate: 44, cat: 'viandes' },
  ],
  b12: [
    { name: 'Foie de bœuf', b12: 60, cat: 'viandes' },
    { name: 'Palourdes', b12: 98, cat: 'poissons' },
    { name: 'Saumon', b12: 4, cat: 'poissons' },
    { name: 'Thon', b12: 11, cat: 'poissons' },
    { name: 'Bœuf', b12: 2.5, cat: 'viandes' },
    { name: 'Yaourt', b12: 0.6, cat: 'laitiers' },
    { name: 'Œufs', b12: 1.1, cat: 'viandes' },
    { name: 'Lait', b12: 0.5, cat: 'laitiers' },
    { name: 'Moules', b12: 8, cat: 'poissons' },
    { name: 'Sardines', b12: 8.9, cat: 'poissons' },
  ],
  choline: [
    { name: 'Œufs (jaune)', choline: 680, cat: 'viandes' },
    { name: 'Foie de bœuf', choline: 420, cat: 'viandes' },
    { name: 'Saumon', choline: 60, cat: 'poissons' },
    { name: 'Poulet', choline: 65, cat: 'viandes' },
    { name: 'Brocoli', choline: 40, cat: 'legumes' },
    { name: 'Choux de Bruxelles', choline: 40, cat: 'legumes' },
    { name: 'Germe de blé', choline: 152, cat: 'cereales' },
    { name: 'Quinoa', choline: 43, cat: 'cereales' },
    { name: 'Lait', choline: 38, cat: 'laitiers' },
    { name: 'Soja (tofu)', choline: 60, cat: 'legumineuses' },
    { name: 'Crevettes', choline: 55, cat: 'poissons' },
  ],
  omega3: [
    { name: 'Huile de foie de morue', omega3: 11800, cat: 'huiles' },
    { name: 'Sardines', omega3: 2200, cat: 'poissons' },
    { name: 'Maquereau', omega3: 2500, cat: 'poissons' },
    { name: 'Saumon sauvage', omega3: 1800, cat: 'poissons' },
    { name: 'Anchois', omega3: 2100, cat: 'poissons' },
    { name: 'Graines de chia', omega3: 5800, cat: 'noix_graines' },
    { name: 'Lin moulu', omega3: 24000, cat: 'noix_graines' },
    { name: 'Noix', omega3: 9100, cat: 'noix_graines' },
    { name: 'Hareng', omega3: 3100, cat: 'poissons' },
    { name: 'Huile de lin', omega3: 53000, cat: 'huiles' },
    { name: 'Colza', omega3: 10000, cat: 'huiles' },
    { name: 'Thon', omega3: 1200, cat: 'poissons' },
  ],
  caffeine: [
    { name: 'Café (espresso)', caffeine: 240, cat: 'boissons' },
    { name: 'Café (filtré)', caffeine: 95, cat: 'boissons' },
    { name: 'Thé noir', caffeine: 47, cat: 'boissons' },
    { name: 'Thé vert', caffeine: 28, cat: 'boissons' },
    { name: 'Yerba mate', caffeine: 85, cat: 'boissons' },
    { name: 'Chocolat noir (70%)', caffeine: 80, cat: 'divers' },
    { name: 'Cola', caffeine: 10, cat: 'boissons' },
    { name: 'Boisson énergisante', caffeine: 32, cat: 'boissons' },
  ],
};

