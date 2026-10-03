import { useState, useRef } from 'react';
import Icon from './Icon';
import { recipeWeight } from '../data/recipeWeight';
import RecipeImport from './RecipeImport';
import AddFoodToMeal from './AddFoodToMeal';
import { useLanguage } from '../i18n/LanguageContext';

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

function ingredientFromFood(food, qty = 100) {
  const per100 = per100FromFood(food);
  const factor = qty / 100;
  const ingredient = {
    nom: food.name,
    qte: qty,
    unite: 'g',
    kcal: per100.kcal * factor,
    proteines: per100.proteines * factor,
    glucides: per100.glucides * factor,
    lipides: per100.lipides * factor,
    per100,
  };
  for (const { ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
    if (per100[ingKey] !== undefined) ingredient[ingKey] = per100[ingKey] * factor;
  }
  return ingredient;
}

function rescaleIngredient(ing, newQty) {
  if (ing.per100) {
    const factor = newQty / 100;
    const next = {
      ...ing,
      qte: newQty,
      kcal: ing.per100.kcal * factor,
      proteines: ing.per100.proteines * factor,
      glucides: ing.per100.glucides * factor,
      lipides: ing.per100.lipides * factor,
    };
    for (const { ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
      if (ing.per100[ingKey] !== undefined) next[ingKey] = ing.per100[ingKey] * factor;
    }
    return next;
  }
  const oldQty = Number(ing.qte) || 0;
  if (oldQty <= 0) return { ...ing, qte: newQty };
  const factor = newQty / oldQty;
  const next = { ...ing, qte: newQty, kcal: ing.kcal * factor, proteines: ing.proteines * factor, glucides: ing.glucides * factor, lipides: ing.lipides * factor };
  for (const { ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
    if (ing[ingKey] !== undefined) next[ingKey] = ing[ingKey] * factor;
  }
  return next;
}

const INGREDIENT_UNITS = ['g', 'ml'];

// Full-screen "Créer/Modifier une recette" form. mode='create' posts via onCreate (optionally
// auto-categorizing via presetCategory); mode='edit' patches the existing recipe via onUpdate.
export default function RecipeManualForm({ mode = 'create', initialRecipe, onCreate, onUpdate, onSetCategories, onImportRecipe, foods = [], baseFoods = [], frequentItems = [], onCreateFood, onLookupBarcode, onSearchOnline, onParseText, onParsePhoto, presetCategory, onBack, onSaved }) {
  const { t } = useLanguage();
  const [entryMode, setEntryMode] = useState('manual');
  const [title, setTitle] = useState(initialRecipe?.title || '');
  const [description, setDescription] = useState(initialRecipe?.description || '');
  const [image, setImage] = useState(initialRecipe?.image || '');
  // Le poids pesé après cuisson, facultatif. Vide, le poids se déduit de la somme des
  // ingrédients — ce qui ignore l'eau partie au four.
  const [measuredWeight, setMeasuredWeight] = useState(initialRecipe?.total_weight_g || '');
  const [ingredients, setIngredients] = useState(initialRecipe?.ingredients || []);
  const [steps, setSteps] = useState(initialRecipe?.steps?.length ? initialRecipe.steps : ['']);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingQty, setEditingQty] = useState(0);
  const [editingUnit, setEditingUnit] = useState('g');

  const totals = ingredients.reduce(
    (acc, i) => {
      acc.kcal += Number(i.kcal) || 0;
      acc.protein += Number(i.proteines) || 0;
      acc.carbs += Number(i.glucides) || 0;
      acc.fat += Number(i.lipides) || 0;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const weight = recipeWeight(ingredients, measuredWeight);
  // Les macros s'affichent pour 100 g : c'est dans cette unité que la recette sera ajoutée au
  // journal, et c'est la seule qui se compare à un aliment.
  const per100 = weight.grams ? 100 / weight.grams : 0;

  // Picking a food drops straight into the quantity editor: the ingredient's own quantity is the
  // next thing anyone wants to set, and leaving it at a silent 100 g sent people to the "portions"
  // stepper above instead — the only quantity control visible on the form.
  // Les aliments créés depuis l'écran d'ajout (catalogue, code-barre, photo…) : `foods` ne les
  // contient qu'au rendu suivant, alors que l'ingrédient s'ajoute tout de suite après.
  const createdFoods = useRef(new Map());

  async function createFood(data) {
    const food = await onCreateFood(data);
    createdFoods.current.set(food.id, food);
    return food;
  }

  // L'écran d'ajout a déjà demandé la quantité : l'ingrédient arrive pesé, et l'écran reste
  // ouvert pour le suivant, comme dans le journal.
  function addPickedFood(sourceType, id, quantity, unit = 'g') {
    const food = createdFoods.current.get(id) || foods.find((f) => f.id === id);
    if (sourceType !== 'food' || !food) return;
    setIngredients((prev) => [...prev, { ...ingredientFromFood(food, Number(quantity) || 100), unite: unit === 'ml' ? 'ml' : 'g' }]);
  }


  function removeIngredient(index) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function openQtyEditor(index) {
    setEditingIndex(index);
    setEditingQty(Number(ingredients[index].qte) || 0);
    setEditingUnit(ingredients[index].unite || 'g');
  }

  function saveQtyEditor() {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === editingIndex ? { ...rescaleIngredient(ing, editingQty), unite: editingUnit } : ing))
    );
    setEditingIndex(null);
  }

  function handleStepChange(index, value) {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, '']);
  }

  function removeStep(index) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!title.trim() || ingredients.length === 0 || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        image: image.trim() || null,
        portions: initialRecipe?.portions || 1,
        total_weight_g: Number(measuredWeight) > 0 ? Number(measuredWeight) : null,
        ingredients: ingredients.map((i) => ({
          nom: i.nom,
          qte: Number(i.qte) || 0,
          unite: i.unite || 'g',
          kcal: Number(i.kcal) || 0,
          proteines: Number(i.proteines) || 0,
          glucides: Number(i.glucides) || 0,
          lipides: Number(i.lipides) || 0,
        })),
        steps: steps.filter((s) => s.trim()),
      };
      if (mode === 'edit') {
        await onUpdate(initialRecipe.id, payload);
        onSaved(initialRecipe.id);
      } else {
        const created = await onCreate(payload);
        // Le classement automatique dans la catégorie ouverte est un bonus, pas la création :
        // s'il échoue, la recette existe quand même et l'écran doit se fermer dessus. Le faire
        // remonter comme une erreur laissait croire que rien n'avait été enregistré — alors que
        // la recette était bien là, et se retrouvait créée deux fois au deuxième essai.
        if (created && presetCategory) {
          try {
            if (presetCategory.meals) await onSetCategories(created, presetCategory.meals);
            if (presetCategory.tag) await onUpdate(created.id, { tags: [presetCategory.tag] });
          } catch {
            // La recette est créée ; elle se classe à la main depuis sa fiche.
          }
        }
        onSaved(created?.id);
      }
    } catch (err) {
      setStatus({ text: err.message || t('recipeManual.creationFailed'), error: true });
    } finally {
      setSaving(false);
    }
  }


  return (
    <div>
      <div className="meal-detail-header" style={{ marginBottom: 4 }}>
        <button type="button" className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="day-nav-subtitle">{t('recipeList.title')}</div>
          <div className="meal-detail-title" style={{ fontSize: 21 }}>
            {mode === 'edit' ? t('recipeList.edit') : t('recipeManual.createRecipe')}
          </div>
        </div>
      </div>

      {mode === 'create' && onImportRecipe && (
        <div className="type-list-row">
          <button type="button" className={entryMode === 'manual' ? 'type-pill active' : 'type-pill'} onClick={() => setEntryMode('manual')}>
            {t('recipeManual.createManually')}
          </button>
          <button type="button" className={entryMode === 'import' ? 'type-pill active' : 'type-pill'} onClick={() => setEntryMode('import')}>
            {t('recipeImport.title')}
          </button>
        </div>
      )}

      {entryMode === 'import' && mode === 'create' ? (
        <RecipeImport onImported={onImportRecipe} onSetCategories={onSetCategories} onUpdate={onUpdate} presetCategory={presetCategory} />
      ) : (
        <>
      <label className="recipe-photo-drop">
        <Icon name="image-plus" size={26} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t('recipeManual.image')}</span>
        <input
          type="url"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="https://..."
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        />
      </label>
      {image && <p className="hint" style={{ wordBreak: 'break-all' }}>{image}</p>}

      <h4 className="section-label">{t('recipeManual.formTitle')}</h4>
      <div className="search-input-row">
        <input
          type="text"
          className="search-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('recipeManual.titlePlaceholder')}
        />
      </div>

      <h4 className="section-label">{t('recipeManual.description')}</h4>
      <div className="search-input-row">
        <input
          type="text"
          className="search-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('recipeManual.optional')}
        />
      </div>

      <h4 className="section-label">{t('recipeManual.totalWeight')}</h4>
      <div className="row">
        <span className="name">
          {weight.grams ? `${weight.grams} g` : '—'}
          <div className="hint" style={{ padding: 0 }}>
            {weight.measured
              ? t('recipeManual.weightMeasured')
              : weight.complete
              ? t('recipeManual.weightSummed')
              : t('recipeManual.weightPartial')}
          </div>
        </span>
      </div>
      {/* Le poids pesé se saisit après coup, une fois le plat sorti du four : c'est le seul qui
          tienne compte de l'eau évaporée, et il l'emporte sur la somme. */}
      <div className="search-input-row">
        <Icon name="scale" size={18} color="var(--text-muted)" />
        <input
          type="number"
          min="0"
          className="search-input"
          inputMode="decimal"
          value={measuredWeight}
          placeholder={t('recipeManual.weighedPlaceholder')}
          onChange={(e) => setMeasuredWeight(e.target.value)}
        />
        <span className="rate">g</span>
      </div>

      <h4 className="section-label">{t('recipeManual.ingredients')}</h4>
      {ingredients.length > 0 && (
        <div className="recipe-form-ingredient-list">
          {ingredients.map((ing, i) => (
            <div className="recipe-form-ingredient-row" key={i}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openQtyEditor(i)}>
                <div className="recipe-form-ingredient-name">{ing.nom}</div>
                <div className="recipe-form-ingredient-qty">
                  {ing.qte} {ing.unite || 'g'}
                </div>
              </div>
              <button type="button" className="recipe-form-ingredient-remove" onClick={() => removeIngredient(i)} aria-label={t('meal.delete')}>
                <Icon name="x" size={17} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="recipe-add-ingredient-btn" onClick={() => setShowPicker(true)}>
        <Icon name="plus" size={18} />
        {t('recipeManual.addIngredientAction')}
      </button>

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

      <h4 className="section-label">{t('recipeManual.per100gComputed')}</h4>
      <div className="portion-tile-row">
        <div className="portion-tile">
          <b>{Math.round(totals.kcal * per100)}</b>
          <span>kcal</span>
        </div>
        <div className="portion-tile">
          <b style={{ color: 'var(--macro-protein)' }}>{Math.round(totals.protein * per100)}</b>
          <span>P</span>
        </div>
        <div className="portion-tile">
          <b style={{ color: 'var(--macro-carb)' }}>{Math.round(totals.carbs * per100)}</b>
          <span>G</span>
        </div>
        <div className="portion-tile">
          <b style={{ color: 'var(--macro-fat)' }}>{Math.round(totals.fat * per100)}</b>
          <span>L</span>
        </div>
      </div>

      {status && <p className={status.error ? 'hint error' : 'hint success'}>{status.text}</p>}

      <button
        type="button"
        className="meal-add-cta"
        style={{ marginTop: 18, marginBottom: 20 }}
        onClick={handleSubmit}
        disabled={saving || !title.trim() || ingredients.length === 0}
      >
        <Icon name="check" size={20} />
        {saving ? t('recipeManual.creating') : mode === 'edit' ? t('meal.save') : t('recipeManual.createRecipe')}
      </button>
        </>
      )}

      {/* Le même écran que « Ajouter » dans le journal — liste, catalogue, code-barre, écrire, photo,
          manuel — sauf que l'aliment choisi devient un ingrédient au lieu d'une entrée du jour. */}
      {showPicker && (
        <div className="modal-overlay">
          <div className="modal-content">
            <AddFoodToMeal
              mealLabel={title.trim() || t('recipeManual.createRecipe')}
              foods={foods}
              baseFoods={baseFoods}
              recipes={[]}
              allowRecipes={false}
              favorites={[]}
              frequentItems={frequentItems}
              onAddEntry={addPickedFood}
              onLookupBarcode={onLookupBarcode}
              onSearchOnline={onSearchOnline}
              onCreateFood={createFood}
              onParseText={onParseText}
              onParsePhoto={onParsePhoto}
            />
          </div>
          <button type="button" className="done-btn" onClick={() => setShowPicker(false)}>
            {t('meal.done')}
          </button>
        </div>
      )}

      {editingIndex != null && (
        <div className="modal-overlay" onClick={() => setEditingIndex(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header">
              <button type="button" className="meal-detail-back-btn" onClick={() => setEditingIndex(null)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <h2 className="meal-detail-title">{ingredients[editingIndex].nom}</h2>
            </div>
            <h4 className="section-label">{t('meal.quantity')}</h4>
            <div className="qty-stepper-row">
              <button type="button" className="weight-minus-btn" onClick={() => setEditingQty((v) => Math.max(0, v - 10))}>
                <Icon name="minus" size={18} />
              </button>
              <div className="qty-stepper-value">
                <span className="weight-value">{editingQty}</span> <span className="rate">{editingUnit}</span>
              </div>
              <button type="button" className="weight-plus-btn qty-stepper-plus" onClick={() => setEditingQty((v) => v + 10)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="type-list-row" style={{ marginTop: 10 }}>
              {INGREDIENT_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  className={editingUnit === u ? 'type-pill active' : 'type-pill'}
                  onClick={() => setEditingUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          {/* Un seul bouton en bas, comme dans le journal : « Enregistrer » au-dessus de
              « Fermer » laissait deviner lequel validait. La croix et le fond ferment. */}
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              saveQtyEditor();
            }}
          >
            {t('meal.save')}
          </button>
        </div>
      )}
    </div>
  );
}
