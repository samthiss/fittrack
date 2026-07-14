import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Closed lists (from the user's spec, not open-ended LLM judgment) — the model only checks an
// ingredient against these, it doesn't invent new prebiotic/polyphenol sources.
const PREBIOTIC_SOURCES = ['ail', 'oignon', 'poireau', 'banane', 'avoine', 'asperge', 'artichaut', 'topinambour', 'pomme'];
const POLYPHENOL_SOURCES = ['baies', 'chocolat noir (>70%)', 'thé vert', 'café', "huile d'olive", 'noix'];

const CLASSIFICATION_INSTRUCTION =
  "Pour chaque aliment, détermine :\n" +
  "- is_plant : est-ce une plante (légume, fruit, légumineuse, noix, graine, céréale complète, herbe, épice) ? " +
  "Un plat composé (ex. 'lasagnes') n'est PAS une plante — seuls des ingrédients végétaux bruts/reconnaissables le sont.\n" +
  "- plant_name : si is_plant est vrai, le nom canonique et générique de cette plante en français, au singulier, " +
  "sans marque ni préparation (ex. 'Saumon fumé Label Rouge' -> pas une plante ; 'Brocoli vapeur surgelé' -> plant_name 'Brocoli'). " +
  "Deux aliments de la même espèce doivent avoir EXACTEMENT le même plant_name pour être comptés une seule fois " +
  "(ex. toujours 'Pomme', jamais 'Pomme golden' vs 'Pomme'). Chaîne vide si is_plant est faux.\n" +
  "- is_fermented : l'aliment est-il fermenté (yaourt, kéfir, skyr, choucroute, kimchi, kombucha, fromage affiné, " +
  "miso, tempeh, pain au levain, etc.) ?\n" +
  `- is_prebiotic : uniquement vrai si l'aliment correspond à l'un de ceux-ci (liste fermée, rien d'autre) : ${PREBIOTIC_SOURCES.join(', ')}.\n` +
  `- is_polyphenol : uniquement vrai si l'aliment correspond à l'un de ceux-ci (liste fermée, rien d'autre) : ${POLYPHENOL_SOURCES.join(', ')}.`;

const FIELDS = ['is_plant', 'plant_name', 'is_fermented', 'is_prebiotic', 'is_polyphenol'];

function itemSchema() {
  return {
    is_plant: { type: 'boolean' },
    plant_name: { type: 'string' },
    is_fermented: { type: 'boolean' },
    is_prebiotic: { type: 'boolean' },
    is_polyphenol: { type: 'boolean' },
  };
}

const BATCH_SCHEMA = {
  type: 'object',
  properties: {
    aliments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, ...itemSchema() },
        required: ['id', ...FIELDS],
        additionalProperties: false,
      },
    },
  },
  required: ['aliments'],
  additionalProperties: false,
};

const BATCH_SIZE = 20;

function toRow(item) {
  return {
    plant_name: item.is_plant && item.plant_name ? item.plant_name.trim() : null,
    is_fermented: item.is_fermented ? 1 : 0,
    is_prebiotic: item.is_prebiotic ? 1 : 0,
    is_polyphenol: item.is_polyphenol ? 1 : 0,
  };
}

// Batch classification for the existing food catalog — mirrors estimateMissingNutrients's
// shape (id-tagged batch requests, ESTIMATE_SCHEMA-style JSON schema).
export async function classifyFoodsBatch(items) {
  const results = new Map();
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const listing = batch.map((f) => `- id ${f.id} : "${f.name}"`).join('\n');
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      output_config: { format: { type: 'json_schema', schema: BATCH_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `${CLASSIFICATION_INSTRUCTION}\n\nAliments :\n${listing}`,
        },
      ],
    });
    const block = response.content.find((c) => c.type === 'text');
    if (!block) continue;
    const parsed = JSON.parse(block.text);
    for (const item of parsed.aliments) {
      results.set(item.id, toRow(item));
    }
  }
  return results;
}

// Single-food classification (barcode scan / manual creation), same shape as
// estimateNutrientsForFood.
export async function classifyFood(name) {
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 512,
    output_config: {
      format: {
        type: 'json_schema',
        schema: { type: 'object', properties: itemSchema(), required: FIELDS, additionalProperties: false },
      },
    },
    messages: [{ role: 'user', content: `${CLASSIFICATION_INSTRUCTION}\n\nAliment : "${name}"` }],
  });
  const block = response.content.find((c) => c.type === 'text');
  if (!block) return toRow({});
  return toRow(JSON.parse(block.text));
}

// Recipe ingredients: same classification, but keyed by ingredient name (not a DB id) since
// they live inline in recipes.ingredients JSON, not in the foods table.
export async function classifyIngredientsBatch(names) {
  const results = new Map();
  const unique = [...new Set(names)];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const listing = batch.map((n, idx) => `- id ${idx} : "${n}"`).join('\n');
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      output_config: { format: { type: 'json_schema', schema: BATCH_SCHEMA } },
      messages: [{ role: 'user', content: `${CLASSIFICATION_INSTRUCTION}\n\nAliments :\n${listing}` }],
    });
    const block = response.content.find((c) => c.type === 'text');
    if (!block) continue;
    const parsed = JSON.parse(block.text);
    for (const item of parsed.aliments) {
      const name = batch[item.id];
      if (name !== undefined) results.set(name, toRow(item));
    }
  }
  return results;
}
