import Anthropic from '@anthropic-ai/sdk';
import { OMEGA3_PROMPT_INSTRUCTION } from './omega3Reference.js';

const client = new Anthropic();

const FOOD_PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    nom: { type: 'string' },
    quantite_g: { type: 'number' },
    kcal: { type: 'number' },
    proteines: { type: 'number' },
    glucides: { type: 'number' },
    lipides: { type: 'number' },
    fibres: { type: 'number' },
    sodium: { type: 'number' },
    potassium: { type: 'number' },
    magnesium: { type: 'number' },
    calcium: { type: 'number' },
    zinc: { type: 'number' },
    fer: { type: 'number' },
    selenium: { type: 'number' },
    iode: { type: 'number' },
    vitamine_c: { type: 'number' },
    vitamine_a: { type: 'number' },
    vitamine_d: { type: 'number' },
    vitamine_e: { type: 'number' },
    vitamine_k: { type: 'number' },
    folates: { type: 'number' },
    b12: { type: 'number' },
    choline: { type: 'number' },
    omega3: { type: 'number' },
    cafeine: { type: 'number' },
  },
  required: [
    'nom', 'quantite_g', 'kcal', 'proteines', 'glucides', 'lipides', 'fibres', 'sodium',
    'potassium', 'magnesium', 'calcium', 'zinc', 'fer', 'selenium', 'iode',
    'vitamine_c', 'vitamine_a', 'vitamine_d', 'vitamine_e', 'vitamine_k', 'folates', 'b12',
    'choline', 'omega3', 'cafeine',
  ],
  additionalProperties: false,
};

export async function parseFoodPhoto(base64Data, mediaType) {
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: FOOD_PHOTO_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          {
            type: 'text',
            text:
              "Identifie l'aliment ou le plat sur cette photo.\n\n" +
              "Déduis quantite_g (la quantité en grammes visible sur la photo — estime une portion réaliste) " +
              'et les valeurs nutritionnelles TOTALES pour CETTE quantité (pas pour 100g) : ' +
              'kcal, proteines/glucides/lipides/fibres (g), sodium/potassium/magnesium/calcium/zinc/fer (mg), ' +
              'selenium/iode/vitamine_a/vitamine_k/folates/b12 (µg), vitamine_c/vitamine_e/choline (mg), vitamine_d (UI), omega3 EPA/DHA (mg), cafeine (mg). ' +
              "Mets 0 pour un micronutriment négligeable ou inconnu plutôt que d'inventer un chiffre précis.\n\n" +
              OMEGA3_PROMPT_INSTRUCTION,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Analyse refusée par le modèle.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('Aucune réponse exploitable.');
  }

  const parsed = JSON.parse(textBlock.text);
  if (!parsed.quantite_g || parsed.quantite_g <= 0) {
    throw new Error("Impossible d'estimer une quantité pour cette photo.");
  }

  return parsed;
}
