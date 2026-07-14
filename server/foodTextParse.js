import Anthropic from '@anthropic-ai/sdk';
import { OMEGA3_PROMPT_INSTRUCTION } from './omega3Reference.js';

const client = new Anthropic();

const FOOD_TEXT_SCHEMA = {
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

export async function parseFoodText(text) {
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: FOOD_TEXT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `Voici la description d'un aliment consommé : "${text.slice(0, 300)}"\n\n` +
          "Déduis quantite_g (la quantité en grammes — si elle n'est pas précisée dans le texte, estime une portion standard réaliste) " +
          'et les valeurs nutritionnelles TOTALES pour CETTE quantité (pas pour 100g) : ' +
          'kcal, proteines/glucides/lipides/fibres (g), sodium/potassium/magnesium/calcium/zinc/fer (mg), ' +
          'selenium/iode/vitamine_a/vitamine_k/folates/b12 (µg), vitamine_c/vitamine_e/choline (mg), vitamine_d (UI), omega3 EPA/DHA (mg), cafeine (mg). ' +
          "Mets 0 pour un micronutriment négligeable ou inconnu plutôt que d'inventer un chiffre précis.\n\n" +
          OMEGA3_PROMPT_INSTRUCTION,
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
    throw new Error("Impossible d'estimer une quantité pour ce texte.");
  }

  return parsed;
}
