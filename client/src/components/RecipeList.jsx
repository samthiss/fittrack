import { useState } from 'react';
import RecipeImport from './RecipeImport';
import RecipeManualForm from './RecipeManualForm';
import { useLanguage } from '../i18n/LanguageContext';

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

function ingredientFromFood(food, qte = 100) {
  const ingredient = {
    nom: food.name,
    qte,
    unite: 'g',
    kcal: food.kcal_per_100g,
    proteines: food.protein_per_100g,
    glucides: food.carbs_per_100g,
    lipides: food.fat_per_100g,
  };
  for (const { food: foodKey, ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
    if (food[foodKey]) ingredient[ingKey] = food[foodKey];
  }
  return ingredient;
}

function getCategoryGroups(t) {
  return [
    { key: 'lunch_dinner', label: t('recipeList.categoryLunchDinner'), meals: ['lunch', 'dinner'] },
    { key: 'breakfast', label: t('recipeList.categoryBreakfast'), meals: ['breakfast'] },
    { key: 'snack', label: t('recipeList.categorySnack'), meals: ['snack'] },
  ];
}

function RecipeCard({ recipe, onUpdate, onDelete, favoriteMeals, onToggleFavorite, foods = [] }) {
  const { t } = useLanguage();
  const CATEGORY_GROUPS = getCategoryGroups(t);
  const [ingredients, setIngredients] = useState(recipe.ingredients);
  const [portions, setPortions] = useState(recipe.portions);
  const [imageUrl, setImageUrl] = useState(recipe.image || '');
  const [imageOk, setImageOk] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [favorite, setFavorite] = useState(recipe.favorite);
  const [tags, setTags] = useState(recipe.tags || []);
  const [newTag, setNewTag] = useState('');

  function handleToggleGeneralFavorite() {
    const next = !favorite;
    setFavorite(next);
    onUpdate(recipe.id, { favorite: next });
  }

  function handleAddTag() {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) return;
    const next = [...tags, tag];
    setTags(next);
    onUpdate(recipe.id, { tags: next });
    setNewTag('');
  }

  function handleRemoveTag(tag) {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    onUpdate(recipe.id, { tags: next });
  }

  function addIngredientFromFood(food) {
    const next = [...ingredients, ingredientFromFood(food)];
    setIngredients(next);
    onUpdate(recipe.id, { ingredients: next });
  }

  const totalKcal = ingredients.reduce((sum, i) => sum + (Number(i.kcal) || 0), 0);
  const totalProtein = ingredients.reduce((sum, i) => sum + (Number(i.proteines) || 0), 0);
  const totalCarbs = ingredients.reduce((sum, i) => sum + (Number(i.glucides) || 0), 0);
  const totalFat = ingredients.reduce((sum, i) => sum + (Number(i.lipides) || 0), 0);
  const p = portions || 1;

  function handleQtyChange(index, newQty) {
    const next = ingredients.map((ing, i) => {
      if (i !== index) return ing;
      const oldQty = Number(ing.qte) || 0;
      const nextQty = Number(newQty) || 0;
      if (oldQty <= 0) return { ...ing, qte: nextQty };
      const factor = nextQty / oldQty;
      const scaled = {
        ...ing,
        qte: nextQty,
        kcal: (Number(ing.kcal) || 0) * factor,
        proteines: (Number(ing.proteines) || 0) * factor,
        glucides: (Number(ing.glucides) || 0) * factor,
        lipides: (Number(ing.lipides) || 0) * factor,
      };
      for (const { ing: ingKey } of INGREDIENT_MICRO_FIELDS) {
        if (ing[ingKey] !== undefined) scaled[ingKey] = (Number(ing[ingKey]) || 0) * factor;
      }
      return scaled;
    });
    setIngredients(next);
    onUpdate(recipe.id, { ingredients: next });
  }

  // Adding an ingredient that matches a food already in the library pulls in its full nutrition
  // profile (for a default 100g) instead of starting from a blank row every time.
  function handleAddIngredient() {
    const name = newIngredientName.trim();
    if (!name) return;
    const match = foods.find((f) => f.name.toLowerCase() === name.toLowerCase());
    const next = [
      ...ingredients,
      match ? ingredientFromFood(match) : { nom: name, qte: 0, unite: 'g', kcal: 0, proteines: 0, glucides: 0, lipides: 0 },
    ];
    setIngredients(next);
    onUpdate(recipe.id, { ingredients: next });
    setNewIngredientName('');
  }

  function handleRemoveIngredient(index) {
    const next = ingredients.filter((_, i) => i !== index);
    setIngredients(next);
    onUpdate(recipe.id, { ingredients: next });
  }

  function handlePortionsChange(newPortions) {
    const next = Math.max(1, Number(newPortions) || 1);
    setPortions(next);
    onUpdate(recipe.id, { portions: next });
  }

  function handleImageBlur() {
    const next = imageUrl.trim() || null;
    setImageOk(true);
    if (next !== recipe.image) onUpdate(recipe.id, { image: next });
  }

  return (
    <article className="card recipe-card">
      {imageUrl && imageOk && (
        <img
          src={imageUrl}
          alt=""
          className="recipe-image"
          onError={() => setImageOk(false)}
        />
      )}

      <div className="recipe-top">
        <button
          type="button"
          className="favorite-star-btn"
          onClick={handleToggleGeneralFavorite}
          aria-label={t('recipeList.favoriteAria')}
        >
          {favorite ? '★' : '☆'}
        </button>
        <h3>{recipe.title}</h3>
        <button className="btn-ghost" onClick={() => onDelete(recipe.id)}>
          {t('recipeList.delete')}
        </button>
      </div>

      {recipe.description && <p className="hint">{recipe.description}</p>}

      <div className="tag-row">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
            <button type="button" onClick={() => handleRemoveTag(tag)} aria-label={t('recipeList.removeTag').replace('{tag}', tag)}>
              ✕
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input"
          placeholder={t('recipeList.addTag')}
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddTag();
            }
          }}
          onBlur={handleAddTag}
        />
      </div>

      <div className="favorite-meal-row">
        {CATEGORY_GROUPS.map((g) => {
          const isFav = g.meals.every((m) => favoriteMeals.has(m));
          return (
            <button
              type="button"
              key={g.key}
              className={isFav ? 'favorite-meal-chip active' : 'favorite-meal-chip'}
              onClick={() => onToggleFavorite(g.meals, recipe, isFav)}
            >
              {isFav ? '★' : '☆'} {g.label}
            </button>
          );
        })}
      </div>

      <div className="macro-chips">
        <span className="chip">
          <b>{Math.round(totalKcal / p)}</b> {t('recipeList.perPortion')}
        </span>
        <span className="chip">
          <b>{Math.round(totalProtein / p)} g</b> {t('recipeList.protein')}
        </span>
        <span className="chip">
          <b>{Math.round(totalCarbs / p)} g</b> {t('recipeList.carbs')}
        </span>
        <span className="chip">
          <b>{Math.round(totalFat / p)} g</b> {t('recipeList.fat')}
        </span>
      </div>

      <button type="button" className="btn-ghost expand-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? t('recipeList.hideIngredientsSteps') : t('recipeList.showIngredientsSteps')}
      </button>

      {expanded && (
        <>
          <div className="row">
            <label>{t('recipeList.image')}</label>
            <div className="field">
              <input
                type="url"
                className="image-url-input"
                placeholder="https://..."
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setImageOk(true);
                }}
                onBlur={handleImageBlur}
              />
            </div>
          </div>

          <h4 className="section-label">{t('recipeList.ingredients')}</h4>
          {ingredients.map((ing, i) => (
            <div className="ingredient-row" key={i}>
              <span className="ingredient-name">{ing.nom}</span>
              <input
                type="number"
                min="0"
                step="any"
                value={ing.qte}
                onChange={(e) => handleQtyChange(i, e.target.value)}
              />
              <span className="ingredient-unit">{ing.unite || ''}</span>
              <span className="ingredient-kcal">{Math.round(ing.kcal)} kcal</span>
              <button type="button" className="btn-ghost" onClick={() => handleRemoveIngredient(i)}>
                ✕
              </button>
            </div>
          ))}

          <div className="inline-row">
            <button type="button" className="btn-ghost" onClick={() => setShowIngredientPicker(true)}>
              {t('recipeList.pickExisting')}
            </button>
          </div>
          <div className="manual-ingredient-row">
            <input
              type="text"
              className="wide"
              placeholder={t('recipeList.newIngredientPlaceholder')}
              value={newIngredientName}
              onChange={(e) => setNewIngredientName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddIngredient();
                }
              }}
            />
            <button type="button" className="btn-ghost" onClick={handleAddIngredient}>
              {t('recipeList.add')}
            </button>
          </div>

          {showIngredientPicker && (
            <div className="modal-overlay" onClick={() => setShowIngredientPicker(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>{t('recipeList.pickFood')}</h2>
                <input
                  type="text"
                  placeholder={t('recipeList.searchFood')}
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
                  <p className="hint">{t('recipeList.noFoodFound')}</p>
                )}
              </div>
              <button type="button" className="done-btn" onClick={() => setShowIngredientPicker(false)}>
                {t('recipeList.close')}
              </button>
            </div>
          )}

          {recipe.steps.length > 0 && (
            <>
              <h4 className="section-label">{t('recipeList.steps')}</h4>
              {recipe.steps.map((step, i) => (
                <div className="step-row" key={i}>
                  <span className="step-num">{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <label>{t('recipeList.portions')}</label>
            <div className="field">
              <input
                type="number"
                min="1"
                step="any"
                value={portions}
                onChange={(e) => handlePortionsChange(e.target.value)}
              />
            </div>
          </div>
        </>
      )}
    </article>
  );
}

export default function RecipeList({
  recipes,
  onUpdate,
  onDelete,
  favorites = [],
  onToggleFavorite,
  foods = [],
  onImportRecipe,
  onCreateRecipe,
  onSetCategories,
}) {
  const { t } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState(null);

  function favoriteMealsFor(recipeId) {
    return new Set(
      favorites.filter((f) => f.source_type === 'recipe' && f.source_id === recipeId).map((f) => f.meal)
    );
  }

  const groups = getCategoryGroups(t).map((g) => ({
    ...g,
    recipes: recipes.filter((r) => {
      const favs = favoriteMealsFor(r.id);
      return g.meals.some((m) => favs.has(m));
    }),
  }));
  const favoriteRecipes = recipes.filter((r) => r.favorite);
  // "Boissons" is a plain sorting tag, not a real meal — unlike the groups above it has no
  // effect on kcal budgets or the weekly planner, it's purely for browsing the recipe list.
  const boissonsRecipes = recipes.filter((r) => (r.tags || []).includes('Boissons'));
  const allGroups = [
    { key: 'favorites', label: t('recipeList.categoryFavorites'), recipes: favoriteRecipes },
    { key: 'boissons', label: t('recipeList.categoryDrinks'), tag: 'Boissons', recipes: boissonsRecipes },
    ...groups,
  ];

  function renderCard(r) {
    return (
      <RecipeCard
        key={r.id}
        recipe={r}
        onUpdate={onUpdate}
        onDelete={onDelete}
        favoriteMeals={favoriteMealsFor(r.id)}
        onToggleFavorite={onToggleFavorite}
        foods={foods}
      />
    );
  }

  if (selectedCategory) {
    const active = allGroups.find((g) => g.key === selectedCategory);
    // Favoris isn't a real creation target — you favorite existing recipes, not create into it.
    const presetCategory = active.key === 'favorites' ? null : { meals: active.meals, tag: active.tag };
    return (
      <div>
        <div className="meal-header">
          <button className="btn-ghost back-btn" onClick={() => setSelectedCategory(null)}>
            {t('recipeList.back')}
          </button>
          <h1 className="meal-title">{active.label}</h1>
        </div>

        {presetCategory && (
          <>
            <RecipeImport
              onImported={onImportRecipe}
              onSetCategories={onSetCategories}
              onUpdate={onUpdate}
              presetCategory={presetCategory}
            />
            <RecipeManualForm
              onCreate={onCreateRecipe}
              onUpdate={onUpdate}
              onSetCategories={onSetCategories}
              foods={foods}
              presetCategory={presetCategory}
            />
          </>
        )}

        {active.recipes.length === 0 ? (
          <p className="hint">{t('recipeList.noRecipesInCategory')}</p>
        ) : (
          <div className="recipe-list">{active.recipes.map(renderCard)}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2>{t('recipeList.title')}</h2>
      <div className="category-menu">
        {allGroups.map((g) => {
          const withImage = g.recipes.find((r) => r.image);
          return (
            <button
              type="button"
              key={g.key}
              className="category-card"
              onClick={() => setSelectedCategory(g.key)}
            >
              {withImage ? <img src={withImage.image} alt="" /> : <div className="category-card-noimg">🍽️</div>}
              <span className="category-card-label">{g.label}</span>
              <span className="rate">{g.recipes.length} {t('recipeList.recipeCount')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
