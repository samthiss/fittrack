import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const EMPTY_INGREDIENT = { nom: '', qte: '', unite: 'g', kcal: '', proteines: '', glucides: '', lipides: '' };
const EMPTY_RECIPE = { title: '', description: '', image: '', portions: '1' };

// Recipe ingredients store micronutrients under French keys (see server INGREDIENT_NUTRIENT_FIELDS)
// while foods store them as English `${key}_per_100g` columns — this maps one to the other so
// picking an existing food as an ingredient carries its full nutrition profile over, not just
// the 4 macros.
const INGREDIENT_MICRO_FIELDS = [
  { food: 'fiber_per_100g', ing: 'fibres' },
  { food: 'sodium_per_100g', ing: 'sodium' },
  { food: 'potassium_per_100g', ing: 'potassium' },
  { food: 'magnesium_per_100g', ing: 'magnesium' },
  { food: 'calcium_per_100g', ing: 'calcium' },
  { food: 'zinc_per_100g', ing: 'zinc' },
  { food: 'iron_per_100g', ing: 'fer' },
  { food: 'selenium_per_100g', ing: 'selenium' },
  { food: 'iodine_per_100g', ing: 'iode' },
  { food: 'vitamin_c_per_100g', ing: 'vitamine_c' },
  { food: 'vitamin_a_per_100g', ing: 'vitamine_a' },
  { food: 'vitamin_d_per_100g', ing: 'vitamine_d' },
  { food: 'vitamin_e_per_100g', ing: 'vitamine_e' },
  { food: 'vitamin_k_per_100g', ing: 'vitamine_k' },
  { food: 'folate_per_100g', ing: 'folates' },
  { food: 'b12_per_100g', ing: 'b12' },
  { food: 'choline_per_100g', ing: 'choline' },
  { food: 'omega3_per_100g', ing: 'omega3' },
  { food: 'caffeine_per_100g', ing: 'cafeine' },
];

function per100FromFood(food) {
  const per100 = {
    kcal: food.kcal_per_100g,
    proteines: food.protein_per_100g,
    glucides: food.carbs_per_100g,
    lipides: food.fat_per_100g,
  };
  for (const { food: foodKey, ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
    if (food[foodKey]) per100[ingKey] = food[foodKey];
  }
  return per100;
}

// Always rendered from within a chosen recipe category (RecipeList) — presetCategory says which
// meals/tag to apply automatically, so there's no separate category picker in this form anymore.
export default function RecipeManualForm({ onCreate, onUpdate, onSetCategories, foods = [], presetCategory }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [recipe, setRecipe] = useState(EMPTY_RECIPE);
  const [ingredients, setIngredients] = useState([{ ...EMPTY_INGREDIENT }]);
  const [steps, setSteps] = useState(['']);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState('');

  function addIngredientFromFood(food) {
    // per100 is kept so the quantity can be edited later and have kcal/macros/micronutrients
    // rescale with it, instead of staying frozen at whatever they were when first added.
    const per100 = per100FromFood(food);
    const ingredient = {
      nom: food.name,
      qte: '100',
      unite: 'g',
      kcal: per100.kcal,
      proteines: per100.proteines,
      glucides: per100.glucides,
      lipides: per100.lipides,
      per100,
    };
    for (const { ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
      if (per100[ingKey] !== undefined) ingredient[ingKey] = per100[ingKey];
    }
    setIngredients((prev) => [...prev, ingredient]);
  }

  // Picking an ingredient name that matches a food already in the library auto-fills its
  // full nutrition profile (scaled to the entered quantity) instead of typing it in by hand.
  function handleIngredientNomBlur(index, value) {
    const match = foods.find((f) => f.name.toLowerCase() === value.trim().toLowerCase());
    if (!match) return;
    const per100 = per100FromFood(match);
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        const qty = Number(ing.qte) || 100;
        const factor = qty / 100;
        const next = {
          ...ing,
          nom: match.name,
          qte: ing.qte || '100',
          unite: 'g',
          kcal: Math.round(per100.kcal * factor * 10) / 10,
          proteines: Math.round(per100.proteines * factor * 10) / 10,
          glucides: Math.round(per100.glucides * factor * 10) / 10,
          lipides: Math.round(per100.lipides * factor * 10) / 10,
          per100,
        };
        for (const { ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
          if (per100[ingKey] !== undefined) next[ingKey] = Math.round(per100[ingKey] * factor * 100) / 100;
        }
        return next;
      })
    );
  }

  function handleRecipeChange(e) {
    setRecipe({ ...recipe, [e.target.name]: e.target.value });
  }

  function handleIngredientChange(index, field, value) {
    setIngredients(
      ingredients.map((ing, i) => {
        if (i !== index) return { ...ing };
        if (field !== 'qte' || !ing.per100) return { ...ing, [field]: value };
        // Quantity changed on a food-sourced ingredient — rescale its macros/micronutrients from
        // the food's per-100g reference instead of leaving them frozen at the previous quantity.
        const factor = (Number(value) || 0) / 100;
        const next = {
          ...ing,
          qte: value,
          kcal: Math.round(ing.per100.kcal * factor * 10) / 10,
          proteines: Math.round(ing.per100.proteines * factor * 10) / 10,
          glucides: Math.round(ing.per100.glucides * factor * 10) / 10,
          lipides: Math.round(ing.per100.lipides * factor * 10) / 10,
        };
        for (const { ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
          if (ing.per100[ingKey] !== undefined) next[ingKey] = Math.round(ing.per100[ingKey] * factor * 100) / 100;
        }
        return next;
      })
    );
  }

  function addIngredient() {
    setIngredients([...ingredients, { ...EMPTY_INGREDIENT }]);
  }

  function removeIngredient(index) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  function handleStepChange(index, value) {
    setSteps(steps.map((s, i) => (i === index ? value : s)));
  }

  function addStep() {
    setSteps([...steps, '']);
  }

  function removeStep(index) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  function reset() {
    setRecipe(EMPTY_RECIPE);
    setIngredients([{ ...EMPTY_INGREDIENT }]);
    setSteps(['']);
    setStatus(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!recipe.title.trim()) return;
    const validIngredients = ingredients.filter((i) => i.nom.trim());
    if (validIngredients.length === 0) {
      setStatus({ text: t('recipeManual.needIngredient'), error: true });
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const created = await onCreate({
        title: recipe.title.trim(),
        description: recipe.description.trim() || null,
        image: recipe.image.trim() || null,
        portions: Number(recipe.portions) || 1,
        ingredients: validIngredients.map((i) => ({
          nom: i.nom.trim(),
          qte: Number(i.qte) || 0,
          unite: i.unite || null,
          kcal: Number(i.kcal) || 0,
          proteines: Number(i.proteines) || 0,
          glucides: Number(i.glucides) || 0,
          lipides: Number(i.lipides) || 0,
        })),
        steps: steps.filter((s) => s.trim()),
      });
      if (created && presetCategory) {
        if (presetCategory.meals) await onSetCategories(created, presetCategory.meals);
        if (presetCategory.tag) await onUpdate(created.id, { tags: [presetCategory.tag] });
      }
      reset();
      setOpen(false);
    } catch (err) {
      setStatus({ text: err.message || t('recipeManual.creationFailed'), error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="card-actions" style={{ padding: 0 }}>
        <button type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)}>
          {open ? t('recipeManual.cancel') : t('recipeManual.createManually')}
        </button>
      </div>

      {open && (
        <form className="card" onSubmit={handleSubmit} style={{ marginTop: 12 }}>
          <div className="row">
            <label>{t('recipeManual.formTitle')}</label>
            <div className="field">
              <input type="text" name="title" className="wide" value={recipe.title} onChange={handleRecipeChange} placeholder={t('recipeManual.titlePlaceholder')} />
            </div>
          </div>
          <div className="row">
            <label>{t('recipeManual.description')}</label>
            <div className="field">
              <input type="text" name="description" className="wide" value={recipe.description} onChange={handleRecipeChange} placeholder={t('recipeManual.optional')} />
            </div>
          </div>
          <div className="row">
            <label>{t('recipeManual.image')}</label>
            <div className="field">
              <input type="url" name="image" className="wide" value={recipe.image} onChange={handleRecipeChange} placeholder={t('recipeManual.optional')} />
            </div>
          </div>
          <div className="row">
            <label>{t('recipeManual.portions')}</label>
            <div className="field">
              <input type="number" name="portions" min="1" step="any" value={recipe.portions} onChange={handleRecipeChange} />
            </div>
          </div>

          <h4 className="section-label">{t('recipeManual.ingredients')}</h4>
          <datalist id="known-foods">
            {foods.map((f) => (
              <option key={f.id} value={f.name} />
            ))}
          </datalist>
          {ingredients.map((ing, i) => (
            <div key={i} className="manual-ingredient-row">
              <input
                type="text"
                placeholder={t('recipeManual.name')}
                list="known-foods"
                value={ing.nom}
                onChange={(e) => handleIngredientChange(i, 'nom', e.target.value)}
                onBlur={(e) => handleIngredientNomBlur(i, e.target.value)}
                className="wide"
              />
              <div className="manual-ingredient-grid">
                <input type="number" placeholder={t('recipeManual.qty')} min="0" step="any" value={ing.qte} onChange={(e) => handleIngredientChange(i, 'qte', e.target.value)} />
                <select value={ing.unite} onChange={(e) => handleIngredientChange(i, 'unite', e.target.value)}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
                <input type="number" placeholder={t('recipeManual.kcal')} min="0" step="any" value={ing.kcal} onChange={(e) => handleIngredientChange(i, 'kcal', e.target.value)} />
                <input type="number" placeholder={t('recipeManual.protein')} min="0" step="any" value={ing.proteines} onChange={(e) => handleIngredientChange(i, 'proteines', e.target.value)} />
                <input type="number" placeholder={t('recipeManual.carbs')} min="0" step="any" value={ing.glucides} onChange={(e) => handleIngredientChange(i, 'glucides', e.target.value)} />
                <input type="number" placeholder={t('recipeManual.fat')} min="0" step="any" value={ing.lipides} onChange={(e) => handleIngredientChange(i, 'lipides', e.target.value)} />
                <button type="button" className="btn-ghost" onClick={() => removeIngredient(i)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="inline-row">
            <button type="button" className="btn-ghost" onClick={() => setShowIngredientPicker(true)}>
              {t('recipeManual.pickExisting')}
            </button>
            <button type="button" className="btn-ghost" onClick={addIngredient}>
              {t('recipeManual.customIngredient')}
            </button>
          </div>

          <h4 className="section-label">{t('recipeManual.steps')}</h4>
          {steps.map((step, i) => (
            <div key={i} className="manual-step-row">
              <input
                type="text"
                className="wide"
                placeholder={t('recipeManual.stepPlaceholder').replace('{n}', i + 1)}
                value={step}
                onChange={(e) => handleStepChange(i, e.target.value)}
              />
              <button type="button" className="btn-ghost" onClick={() => removeStep(i)}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={addStep}>
            {t('recipeManual.addStep')}
          </button>

          <div className="card-actions">
            <button type="submit" className="btn" disabled={loading}>
              {loading ? t('recipeManual.creating') : t('recipeManual.createRecipe')}
            </button>
          </div>

          {status && <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>}
        </form>
      )}

      {showIngredientPicker && (
        <div className="modal-overlay" onClick={() => setShowIngredientPicker(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{t('recipeManual.pickFood')}</h2>
            <input
              type="text"
              placeholder={t('recipeManual.searchFood')}
              value={ingredientSearch}
              onChange={(e) => setIngredientSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            {foods
              .filter((f) => f.name.toLowerCase().includes(ingredientSearch.trim().toLowerCase()))
              .map((f) => (
                <div className="row" key={f.id}>
                  <div className="name">
                    <span>{f.name}</span>
                    <span className="rate">{Math.round(f.kcal_per_100g)} kcal / 100g</span>
                  </div>
                  <button
                    type="button"
                    className="round-add-btn"
                    onClick={() => {
                      addIngredientFromFood(f);
                      setShowIngredientPicker(false);
                      setIngredientSearch('');
                    }}
                  >
                    +
                  </button>
                </div>
              ))}
            {foods.filter((f) => f.name.toLowerCase().includes(ingredientSearch.trim().toLowerCase())).length === 0 && (
              <p className="hint">{t('recipeManual.noFoodFound')}</p>
            )}
          </div>
          <button type="button" className="done-btn" onClick={() => setShowIngredientPicker(false)}>
            {t('recipeManual.close')}
          </button>
        </div>
      )}
    </div>
  );
}
