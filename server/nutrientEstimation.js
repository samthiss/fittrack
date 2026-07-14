import Anthropic from '@anthropic-ai/sdk';
import { OMEGA3_PROMPT_INSTRUCTION } from './omega3Reference.js';

const client = new Anthropic();

// Open Food Facts frequently leaves optional micronutrient fields (omega-3, vitamin E/K,
// choline, B12, folate, selenium, iodine...) empty even for foods that clearly contain them
// (salmon with 0mg omega-3, say) — a scanned food ends up with those fields sitting at 0
// forever. Once a day, batch every food with at least one such gap and ask Claude for a
// single best-effort per-100g estimate, instead of guessing per-scan (extra latency/cost on
// every barcode lookup) or leaving it wrong forever.
const FRENCH_FIELDS = [
  'fibres', 'sodium', 'potassium', 'magnesium', 'calcium', 'zinc', 'fer', 'selenium', 'iode',
  'vitamine_c', 'vitamine_a', 'vitamine_d', 'vitamine_e', 'vitamine_k', 'folates', 'b12',
  'choline', 'omega3', 'cafeine',
];

const ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    aliments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          ...Object.fromEntries(FRENCH_FIELDS.map((f) => [f, { type: 'number' }])),
        },
        required: ['id', ...FRENCH_FIELDS],
        additionalProperties: false,
      },
    },
  },
  required: ['aliments'],
  additionalProperties: false,
};

const BATCH_SIZE = 20;

export async function estimateMissingNutrients(db, userId, NUTRIENT_KEYS, INGREDIENT_NUTRIENT_FIELDS) {
  const foods = db.prepare('SELECT * FROM foods WHERE user_id = ?').all(userId);
  const withGaps = foods.filter((f) => NUTRIENT_KEYS.some((k) => !f[`${k}_per_100g`]));
  if (withGaps.length === 0) return { updated: 0 };

  let updated = 0;
  const update = db.prepare(
    `UPDATE foods SET ${NUTRIENT_KEYS.map((k) => `${k}_per_100g = ?`).join(', ')} WHERE id = ?`
  );

  for (let i = 0; i < withGaps.length; i += BATCH_SIZE) {
    const batch = withGaps.slice(i, i + BATCH_SIZE);
    const listing = batch
      .map((f) => {
        const missing = NUTRIENT_KEYS.filter((k) => !f[`${k}_per_100g`]).map((k) => INGREDIENT_NUTRIENT_FIELDS[k]);
        return `- id ${f.id} : "${f.name}" (manque : ${missing.join(', ')})`;
      })
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      output_config: { format: { type: 'json_schema', schema: ESTIMATE_SCHEMA } },
      messages: [
        {
          role: 'user',
          content:
            'Pour chaque aliment ci-dessous, donne une estimation réaliste des valeurs nutritionnelles POUR 100g ' +
            "(pas pour la portion) : fibres (g), sodium/potassium/magnesium/calcium/zinc/fer (mg), " +
            'selenium/iode/vitamine_a/vitamine_k/folates/b12 (µg), vitamine_c/vitamine_e/choline (mg), ' +
            "vitamine_d (UI), omega3 EPA/DHA (mg), cafeine (mg). Mets 0 pour un micronutriment " +
            "vraiment négligeable ou inconnu pour ce type d'aliment plutôt que d'inventer un chiffre.\n\n" +
            `${OMEGA3_PROMPT_INSTRUCTION}\n\n` +
            `${listing}`,
        },
      ],
    });

    const block = response.content.find((c) => c.type === 'text');
    if (!block) continue;
    const parsed = JSON.parse(block.text);

    for (const item of parsed.aliments) {
      const food = batch.find((f) => f.id === item.id);
      if (!food) continue;
      const values = NUTRIENT_KEYS.map((k) => {
        const current = food[`${k}_per_100g`];
        if (current) return current; // keep any real, already-present value untouched
        return Number(item[INGREDIENT_NUTRIENT_FIELDS[k]]) || 0;
      });
      update.run(...values, food.id);
      updated += 1;
    }
  }

  return { updated };
}

// Same estimation, but for a single not-yet-created food (used right at barcode-scan time when
// no existing food in the same OFF category already covers the missing fields).
export async function estimateNutrientsForFood(name, missingKeys, INGREDIENT_NUTRIENT_FIELDS) {
  const missingFrench = missingKeys.map((k) => INGREDIENT_NUTRIENT_FIELDS[k]);
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: Object.fromEntries(FRENCH_FIELDS.map((f) => [f, { type: 'number' }])),
          required: FRENCH_FIELDS,
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'user',
        content:
          `Aliment : "${name}"\n\n` +
          'Donne une estimation réaliste des valeurs nutritionnelles POUR 100g (pas pour la portion) : ' +
          'fibres (g), sodium/potassium/magnesium/calcium/zinc/fer (mg), ' +
          'selenium/iode/vitamine_a/vitamine_k/folates/b12 (µg), vitamine_c/vitamine_e/choline (mg), ' +
          "vitamine_d (UI), omega3 EPA/DHA (mg), cafeine (mg). Mets 0 pour un micronutriment " +
          "vraiment négligeable ou inconnu pour ce type d'aliment plutôt que d'inventer un chiffre.\n\n" +
          `${OMEGA3_PROMPT_INSTRUCTION}\n\n` +
          `Seuls ces champs seront utilisés : ${missingFrench.join(', ')}.`,
      },
    ],
  });

  const block = response.content.find((c) => c.type === 'text');
  if (!block) return {};
  const parsed = JSON.parse(block.text);
  const result = {};
  for (const k of missingKeys) {
    result[k] = Number(parsed[INGREDIENT_NUTRIENT_FIELDS[k]]) || 0;
  }
  return result;
}
