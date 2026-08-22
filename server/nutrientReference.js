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
    { name: 'Graines de chia', fiber: 34 },
    { name: 'Lin moulu', fiber: 27 },
    { name: 'Lentilles sèches', fiber: 11 },
    { name: 'Pois chiches', fiber: 7.6 },
    { name: 'Artichaut', fiber: 8.6 },
    { name: 'Brocoli', fiber: 2.6 },
    { name: 'Avocat', fiber: 6.7 },
    { name: 'Framboises', fiber: 6.5 },
    { name: 'Flocons d\'avoine', fiber: 10 },
    { name: 'Amandes', fiber: 12 },
    { name: 'Pois cassés', fiber: 8.3 },
    { name: 'Haricots rouges', fiber: 8.7 },
    { name: 'Choux de Bruxelles', fiber: 3.8 },
    { name: 'Poire', fiber: 3.1 },
    { name: 'Pomme', fiber: 2.4 },
    { name: 'Figues sèches', fiber: 9.3 },
    { name: 'Quinoa', fiber: 7 },
    { name: 'Patate douce', fiber: 3 },
    { name: 'Carotte', fiber: 2.8 },
    { name: 'Noix', fiber: 6.7 },
  ],
  sodium: [
    { name: 'Sel de table', sodium: 38800 },
    { name: 'Sauce soja', sodium: 5700 },
    { name: 'Miso', sodium: 4200 },
    { name: 'Jambon cru', sodium: 1400 },
    { name: 'Fromage (cheddar)', sodium: 660 },
    { name: 'Olives', sodium: 2400 },
    { name: 'Thon en boîte', sodium: 310 },
    { name: 'Sardines en boîte', sodium: 450 },
    { name: 'Pain', sodium: 470 },
    { name: 'Sauce Worcestershire', sodium: 1500 },
  ],
  potassium: [
    { name: 'Épinards', potassium: 558 },
    { name: 'Patate douce', potassium: 475 },
    { name: 'Avocat', potassium: 485 },
    { name: 'Banane', potassium: 358 },
    { name: 'Haricots blancs', potassium: 1180 },
    { name: 'Saumon', potassium: 380 },
    { name: 'Yaourt', potassium: 240 },
    { name: 'Champignons', potassium: 320 },
    { name: 'Pomme de terre', potassium: 425 },
    { name: 'Épinards', potassium: 558 },
    { name: 'Betterave', potassium: 305 },
    { name: 'Courge butternut', potassium: 295 },
    { name: 'Abricots secs', potassium: 1160 },
    { name: 'Kiwis', potassium: 312 },
    { name: 'Haricots verts', potassium: 211 },
  ],
  magnesium: [
    { name: 'Amandes', magnesium: 270 },
    { name: 'Épinards', magnesium: 79 },
    { name: 'Chocolat noir (70%)', magnesium: 228 },
    { name: 'Graines de citrouille', magnesium: 400 },
    { name: 'Haricots noirs', magnesium: 160 },
    { name: 'Avocat', magnesium: 29 },
    { name: 'Yaourt', magnesium: 17 },
    { name: 'Noix de cajou', magnesium: 260 },
    { name: 'Noix', magnesium: 158 },
    { name: 'Avoine', magnesium: 138 },
    { name: 'Pois chiches', magnesium: 48 },
    { name: 'Lentilles', magnesium: 47 },
    { name: 'Banane', magnesium: 27 },
    { name: 'Saumon', magnesium: 31 },
    { name: 'Tofu', magnesium: 30 },
  ],
  calcium: [
    { name: 'Sardines (avec arêtes)', calcium: 382 },
    { name: 'Yaourt', calcium: 125 },
    { name: 'Fromage (comté)', calcium: 800 },
    { name: 'Kale', calcium: 150 },
    { name: 'Brocoli', calcium: 47 },
    { name: 'Tofu (sulfate de calcium)', calcium: 350 },
    { name: 'Amandes', calcium: 269 },
    { name: 'Lait', calcium: 120 },
    { name: 'Sardines', calcium: 382 },
    { name: 'Bok choy', calcium: 105 },
    { name: 'Saumon en boîte', calcium: 91 },
    { name: 'Oranges', calcium: 40 },
    { name: 'Graines de sésame', calcium: 980 },
  ],
  zinc: [
    { name: 'Huitres', zinc: 90 },
    { name: 'Bœuf (steak)', zinc: 6 },
    { name: 'Graines de citrouille', zinc: 7.5 },
    { name: 'Agneau', zinc: 4.5 },
    { name: 'Lentilles', zinc: 1.3 },
    { name: 'Pois chiches', zinc: 1.5 },
    { name: 'Yaourt', zinc: 0.9 },
    { name: 'Noix de cajou', zinc: 5.8 },
    { name: 'Poulet', zinc: 1.3 },
    { name: 'Graines de chanvre', zinc: 7.3 },
    { name: 'Crevettes', zinc: 1.3 },
  ],
  iron: [
    { name: 'Foie de bœuf', iron: 6.5 },
    { name: 'Bœuf', iron: 2.6 },
    { name: 'Lentilles', iron: 3.3 },
    { name: 'Épinards', iron: 2.7 },
    { name: 'Tofu', iron: 2.7 },
    { name: 'Chocolat noir', iron: 11.9 },
    { name: 'Quinoa', iron: 1.5 },
    { name: 'Graines de citrouille', iron: 3.3 },
    { name: 'Palourdes', iron: 28 },
    { name: 'Pois chiches', iron: 2.9 },
    { name: 'Sardines', iron: 2.9 },
    { name: 'Dinde', iron: 1.4 },
    { name: 'Brocoli', iron: 0.7 },
    { name: 'Betterave', iron: 0.8 },
  ],
  selenium: [
    { name: 'Noix du Brésil', selenium: 1917 },
    { name: 'Thon', selenium: 60 },
    { name: 'Dinde', selenium: 35 },
    { name: 'Poulet', selenium: 27 },
    { name: 'Œufs', selenium: 30 },
    { name: 'Saumon', selenium: 36 },
    { name: 'Graines de tournesol', selenium: 53 },
    { name: 'Champignons shiitake', selenium: 46 },
    { name: 'Porc', selenium: 32 },
    { name: 'Bœuf', selenium: 22 },
  ],
  iodine: [
    { name: 'Nori (algue)', iodine: 16 },
    { name: 'Kombu (algue)', iodine: 1500 },
    { name: 'Morue', iodine: 200 },
    { name: 'Sel iodé', iodine: 77000 },
    { name: 'Lait', iodine: 35 },
    { name: 'Œufs', iodine: 24 },
    { name: 'Yaourt', iodine: 30 },
    { name: 'Fruits de mer (mélange)', iodine: 60 },
    { name: 'Cranberries', iodine: 2 },
  ],
  vitamin_c: [
    { name: 'Camu camu', vitamin_c: 2000 },
    { name: 'Goyave', vitamin_c: 228 },
    { name: 'Poivron rouge', vitamin_c: 190 },
    { name: 'Kiwi', vitamin_c: 90 },
    { name: 'Orange', vitamin_c: 53 },
    { name: 'Fraises', vitamin_c: 58 },
    { name: 'Brocoli', vitamin_c: 89 },
    { name: 'Papaye', vitamin_c: 61 },
    { name: 'Choux de Bruxelles', vitamin_c: 85 },
    { name: 'Brocoli', vitamin_c: 89 },
    { name: 'Citron', vitamin_c: 53 },
    { name: 'Mangue', vitamin_c: 36 },
    { name: 'Épinards', vitamin_c: 28 },
    { name: 'Pomme de terre', vitamin_c: 20 },
  ],
  vitamin_a: [
    { name: 'Foie de bœuf', vitamin_a: 10500 },
    { name: 'Carotte', vitamin_a: 835 },
    { name: 'Patate douce', vitamin_a: 709 },
    { name: 'Épinards', vitamin_a: 469 },
    { name: 'Kale', vitamin_a: 681 },
    { name: 'Melon', vitamin_a: 338 },
    { name: 'Abricots', vitamin_a: 96 },
    { name: 'Cantaloup', vitamin_a: 338 },
    { name: 'Poivron rouge', vitamin_a: 313 },
    { name: 'Mangue', vitamin_a: 54 },
    { name: 'Œufs', vitamin_a: 140 },
    { name: 'Fromage', vitamin_a: 265 },
  ],
  vitamin_d: [
    { name: 'Saumon', vitamin_d: 526 },
    { name: 'Maquereau', vitamin_d: 360 },
    { name: 'Huile de foie de morue', vitamin_d: 10000 },
    { name: 'Champignons shiitake', vitamin_d: 100 },
    { name: 'Sardines', vitamin_d: 272 },
    { name: 'Thon', vitamin_d: 154 },
    { name: 'Œufs (jaune)', vitamin_d: 37 },
    { name: 'Lait enrichi', vitamin_d: 40 },
    { name: 'Truite', vitamin_d: 635 },
    { name: 'Hareng', vitamin_d: 220 },
  ],
  vitamin_e: [
    { name: 'Amandes', vitamin_e: 25 },
    { name: 'Graines de tournesol', vitamin_e: 35 },
    { name: 'Noisettes', vitamin_e: 15 },
    { name: 'Germe de blé', vitamin_e: 17 },
    { name: 'Épinards', vitamin_e: 2 },
    { name: 'Brocoli', vitamin_e: 1.5 },
    { name: 'Avocat', vitamin_e: 2.1 },
    { name: 'Kale', vitamin_e: 1.5 },
    { name: 'Noix', vitamin_e: 2.6 },
    { name: 'Arachides', vitamin_e: 4.6 },
  ],
  vitamin_k: [
    { name: 'Kale', vitamin_k: 817 },
    { name: 'Épinards', vitamin_k: 483 },
    { name: 'Brocoli', vitamin_k: 101 },
    { name: 'Choux de Bruxelles', vitamin_k: 177 },
    { name: 'Laitue', vitamin_k: 126 },
    { name: 'Persil', vitamin_k: 1640 },
    { name: 'Ciboulette', vitamin_k: 297 },
    { name: 'Foie de bœuf', vitamin_k: 6 },
    { name: 'Pruneaux', vitamin_k: 60 },
    { name: 'Bok choy', vitamin_k: 46 },
  ],
  folate: [
    { name: 'Lentilles', folate: 181 },
    { name: 'Pois chiches', folate: 172 },
    { name: 'Asperges', folate: 149 },
    { name: 'Épinards', folate: 194 },
    { name: 'Brocoli', folate: 63 },
    { name: 'Avocat', folate: 81 },
    { name: 'Foie de bœuf', folate: 290 },
    { name: 'Laitue', folate: 38 },
    { name: 'Betterave', folate: 109 },
    { name: 'Haricots rouges', folate: 130 },
    { name: 'Graines de tournesol', folate: 227 },
    { name: 'Œufs', folate: 44 },
  ],
  b12: [
    { name: 'Foie de bœuf', b12: 60 },
    { name: 'Palourdes', b12: 98 },
    { name: 'Saumon', b12: 4 },
    { name: 'Thon', b12: 11 },
    { name: 'Bœuf', b12: 2.5 },
    { name: 'Yaourt', b12: 0.6 },
    { name: 'Œufs', b12: 1.1 },
    { name: 'Lait', b12: 0.5 },
    { name: 'Moules', b12: 8 },
    { name: 'Sardines', b12: 8.9 },
  ],
  choline: [
    { name: 'Œufs (jaune)', choline: 680 },
    { name: 'Foie de bœuf', choline: 420 },
    { name: 'Saumon', choline: 60 },
    { name: 'Poulet', choline: 65 },
    { name: 'Brocoli', choline: 40 },
    { name: 'Choux de Bruxelles', choline: 40 },
    { name: 'Germe de blé', choline: 152 },
    { name: 'Quinoa', choline: 43 },
    { name: 'Lait', choline: 38 },
    { name: 'Soja (tofu)', choline: 60 },
    { name: 'Crevettes', choline: 55 },
  ],
  omega3: [
    { name: 'Huile de foie de morue', omega3: 11800 },
    { name: 'Sardines', omega3: 2200 },
    { name: 'Maquereau', omega3: 2500 },
    { name: 'Saumon sauvage', omega3: 1800 },
    { name: 'Anchois', omega3: 2100 },
    { name: 'Graines de chia', omega3: 5800 },
    { name: 'Lin moulu', omega3: 24000 },
    { name: 'Noix', omega3: 9100 },
    { name: 'Hareng', omega3: 3100 },
    { name: 'Huile de lin', omega3: 53000 },
    { name: 'Colza', omega3: 10000 },
    { name: 'Thon', omega3: 1200 },
  ],
  caffeine: [
    { name: 'Café (espresso)', caffeine: 240 },
    { name: 'Café (filtré)', caffeine: 95 },
    { name: 'Thé noir', caffeine: 47 },
    { name: 'Thé vert', caffeine: 28 },
    { name: 'Yerba mate', caffeine: 85 },
    { name: 'Chocolat noir (70%)', caffeine: 80 },
    { name: 'Cola', caffeine: 10 },
    { name: 'Boisson énergisante', caffeine: 32 },
  ],
  potassium: [
    { name: 'Épinards', potassium: 558 },
    { name: 'Patate douce', potassium: 475 },
    { name: 'Avocat', potassium: 485 },
    { name: 'Banane', potassium: 358 },
    { name: 'Haricots blancs', potassium: 1180 },
    { name: 'Saumon', potassium: 380 },
    { name: 'Yaourt', potassium: 240 },
    { name: 'Champignons', potassium: 320 },
    { name: 'Pomme de terre', potassium: 425 },
    { name: 'Betterave', potassium: 305 },
    { name: 'Courge butternut', potassium: 295 },
    { name: 'Abricots secs', potassium: 1160 },
    { name: 'Kiwis', potassium: 312 },
    { name: 'Haricots verts', potassium: 211 },
  ],
};

