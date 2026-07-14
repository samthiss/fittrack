import Anthropic from '@anthropic-ai/sdk';
import { OMEGA3_PROMPT_INSTRUCTION } from './omega3Reference.js';

// Higher than the SDK default (2) — URL import's web_search calls have been hitting
// transient "overloaded_error" (529) from Anthropic; a few extra automatic retries with
// backoff give those a real chance to clear before failing the whole import.
const client = new Anthropic({ maxRetries: 5 });

const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    description: { type: 'string' },
    image: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    portions: { type: 'integer' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          qte: { type: 'number' },
          unite: { anyOf: [{ type: 'string' }, { type: 'null' }] },
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
          'nom', 'qte', 'unite', 'kcal', 'proteines', 'glucides', 'lipides',
          'fibres', 'sodium', 'potassium', 'magnesium', 'calcium', 'zinc', 'fer',
          'selenium', 'iode', 'vitamine_c', 'vitamine_a', 'vitamine_d', 'vitamine_e',
          'vitamine_k', 'folates', 'b12', 'choline', 'omega3', 'cafeine',
        ],
        additionalProperties: false,
      },
    },
    etapes: { type: 'array', items: { type: 'string' } },
  },
  required: ['titre', 'description', 'image', 'portions', 'ingredients', 'etapes'],
  additionalProperties: false,
};

const RULES =
  'Règles : estime, pour la quantité indiquée de CHAQUE ingrédient, au mieux : ' +
  'kcal, proteines/glucides/lipides/fibres (g), sodium/potassium/magnesium/calcium/zinc/fer (mg), ' +
  'selenium/iode/vitamine_a/vitamine_k/folates/b12 (µg), vitamine_c/vitamine_e/choline (mg), vitamine_d (UI), omega3 EPA/DHA (mg), cafeine (mg). ' +
  "Mets 0 pour un micronutriment négligeable ou inconnu plutôt que d'inventer un chiffre précis. " +
  'Étapes en français, une phrase courte chacune, 8 maximum. ' +
  "Si tu ne trouves vraiment aucune information exploitable, renvoie un tableau d'ingrédients vide.\n\n" +
  OMEGA3_PROMPT_INSTRUCTION;

export async function importRecipeFromText(text) {
  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    output_config: { format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `Voici le texte d'une recette :\n\n${text.slice(0, 6000)}\n\n` +
          'Remplis le schéma avec les informations qu\'il contient. Le champ image doit être null.\n\n' +
          RULES,
      },
    ],
  });
  const response = await stream.finalMessage();
  return parseRecipeResponse(response);
}

export async function generateRecipeForTarget(mealLabel, kcalTarget, macroTargets, avoidTitles = []) {
  const avoidLine =
    avoidTitles.length > 0
      ? `Évite de refaire un plat déjà généré cette semaine pour ce repas : ${avoidTitles.join(', ')}. Propose autre chose.\n`
      : '';
  const snackLine =
    mealLabel === 'En-cas'
      ? "C'est un en-cas : garde-le simple, 1 à 2 ingrédients maximum (ex: un fruit, un yaourt, une poignée d'amandes), surtout pas un repas complet.\n"
      : '';
  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    output_config: { format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `Invente une recette originale et équilibrée pour le repas "${mealLabel}", 1 portion, ` +
          `qui vise le plus précisément possible : ${Math.round(kcalTarget)} kcal, ` +
          `${Math.round(macroTargets.protein)} g protéines, ${Math.round(macroTargets.carbs)} g glucides, ` +
          `${Math.round(macroTargets.fat)} g lipides.\n` +
          avoidLine +
          snackLine +
          'Le champ image doit être null. Donne un titre court et une description en une phrase.\n\n' +
          RULES,
      },
    ],
  });
  const response = await stream.finalMessage();
  return parseRecipeResponse(response);
}

function parseRecipeResponse(response) {
  if (response.stop_reason === 'refusal') {
    throw new Error("Import refusé par le modèle.");
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('La recette est trop longue pour être importée en une fois (trop d\'ingrédients ou de détails) — essaie "Coller le texte" avec une version raccourcie.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('Aucune réponse exploitable.');
  }

  let recipe;
  try {
    recipe = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Réponse du modèle illisible — réessaie, ou utilise \"Coller le texte\" à la place.");
  }
  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    throw new Error("Recette introuvable ou vide — vérifie le lien, ou colle le texte de la recette à la place.");
  }

  return recipe;
}
