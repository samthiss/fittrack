// Open Food Facts normalizes every nutriment "_100g" value to grams, regardless of the
// nutrient's usual unit (confirmed against real product data: selenium/vitamin-d appear as
// tiny gram fractions like 3.4e-6). These factors convert that gram value to the unit we
// store the nutrient in.
const OFF_NUTRIENT_MAP = [
  { off: 'fiber', key: 'fiber_per_100g', factor: 1 }, // g -> g
  { off: 'sodium', key: 'sodium_per_100g', factor: 1000 }, // g -> mg (part of the mandatory EU label, usually present)
  { off: 'potassium', key: 'potassium_per_100g', factor: 1000 }, // g -> mg
  { off: 'magnesium', key: 'magnesium_per_100g', factor: 1000 },
  { off: 'calcium', key: 'calcium_per_100g', factor: 1000 },
  { off: 'zinc', key: 'zinc_per_100g', factor: 1000 },
  { off: 'iron', key: 'iron_per_100g', factor: 1000 },
  { off: 'selenium', key: 'selenium_per_100g', factor: 1e6 }, // g -> µg
  { off: 'iodine', key: 'iodine_per_100g', factor: 1e6 },
  { off: 'vitamin-c', key: 'vitamin_c_per_100g', factor: 1000 }, // g -> mg
  { off: 'vitamin-a', key: 'vitamin_a_per_100g', factor: 1e6 }, // g -> µg RAE
  { off: 'vitamin-d', key: 'vitamin_d_per_100g', factor: 4e7 }, // g -> µg -> IU (x40)
  { off: 'vitamin-e', key: 'vitamin_e_per_100g', factor: 1000 }, // g -> mg (optional field, rarely filled)
  { off: 'vitamin-k', key: 'vitamin_k_per_100g', factor: 1e6 },
  { off: 'folates', key: 'folate_per_100g', factor: 1e6 },
  { off: 'vitamin-b12', key: 'b12_per_100g', factor: 1e6 },
  { off: 'choline', key: 'choline_per_100g', factor: 1000 },
  // omega-3-fat deliberately NOT mapped: OFF mixes ALA (plant) and EPA/DHA (marine) into one
  // field, which is unusable for an EPA/DHA-only target — always fall through to AI estimation
  // instead (see omega3Reference.js + nutrientEstimation.js).
  { off: 'caffeine', key: 'caffeine_per_100g', factor: 1000 }, // g -> mg
];

// OFF's structured `product_quantity` field is inexplicably dropped from the response whenever
// `nutriments` is also requested (confirmed against live data) — the free-text `quantity` field
// (e.g. "51 g", "200 g") survives that combination fine, so parse the package size out of it.
function parsePackageGrams(quantityText) {
  if (!quantityText) return null;
  const match = String(quantityText).match(/([\d.,]+)\s*(kg|g|l|ml)?/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!value) return null;
  const unit = (match[2] || 'g').toLowerCase();
  return unit === 'kg' || unit === 'l' ? value * 1000 : value;
}

// Shared by both the single-barcode lookup and the free-text search — a "product" object shaped
// the same way (nutriments + quantity + product_name) comes back from both OFF endpoints.
function mapOffProduct(product) {
  const n = product.nutriments || {};
  const kcal = n['energy-kcal_100g'];
  if (kcal === undefined) return null;

  // People usually eat/drink a single-serve package whole, so default the suggested quantity to
  // its package size (e.g. 200 for a 200g yogurt pot) instead of an arbitrary 100g.
  const packageGrams = parsePackageGrams(product.quantity);
  // Most specific OFF category tag (e.g. "en:greek-yogurts") — used to recognize "I've already
  // estimated micronutrients for this kind of food" so a new brand of the same thing doesn't
  // trigger another AI call.
  const tags = product.categories_tags || [];
  const category = tags.length > 0 ? tags[tags.length - 1] : null;

  const result = {
    name: product.product_name || 'Produit sans nom',
    kcal_per_100g: kcal,
    protein_per_100g: n['proteins_100g'] ?? 0,
    carbs_per_100g: n['carbohydrates_100g'] ?? 0,
    fat_per_100g: n['fat_100g'] ?? 0,
    suggestedQuantity: packageGrams > 0 ? packageGrams : 100,
    category,
  };

  for (const { off, key, factor } of OFF_NUTRIENT_MAP) {
    const raw = n[`${off}_100g`];
    // Left undefined (not 0) when OFF has no data for it, so the food-creation endpoint's
    // "missing = not sent at all" check still triggers AI estimation for it — a real 0 straight
    // from OFF is different information and is kept as-is.
    if (raw !== undefined) result[key] = raw * factor;
  }

  return result;
}

export async function lookupBarcode(barcode) {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,nutriments,quantity,categories_tags`
  );

  if (!res.ok) {
    throw new Error('Erreur réseau lors de la recherche du produit.');
  }

  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    throw new Error('Produit introuvable pour ce code-barre.');
  }

  const result = mapOffProduct(data.product);
  if (!result) {
    throw new Error('Informations nutritionnelles indisponibles pour ce produit.');
  }
  return result;
}

// Free-text product search (no AI/tokens involved — plain HTTP against OFF's own search index).
// Uses the newer Search-a-licious service; OFF's search infra has intermittent outages (observed
// 502/503 during development), so callers should treat a thrown error as "try again later" rather
// than "no results".
export async function searchFoodsOnline(query) {
  const res = await fetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=8&fields=product_name,nutriments,quantity,categories_tags`
  );

  if (!res.ok) {
    throw new Error('Recherche en ligne indisponible pour le moment, réessaie plus tard.');
  }

  const data = await res.json();
  return (data.hits || data.products || [])
    .map(mapOffProduct)
    .filter(Boolean)
    .slice(0, 8);
}
