import { useState } from 'react';
import RecipeImport from './RecipeImport';
import RecipeManualForm from './RecipeManualForm';

const CATEGORY_GROUPS = [
  { key: 'lunch_dinner', label: 'Lunch & Dîner', meals: ['lunch', 'dinner'] },
  { key: 'breakfast', label: 'Petit déjeuner', meals: ['breakfast'] },
  { key: 'snack', label: 'En-cas', meals: ['snack'] },
];

function RecipeCard({ recipe, onUpdate, onDelete, favoriteMeals, onToggleFavorite, foods = [] }) {
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
    const next = [
      ...ingredients,
      {
        nom: food.name,
        qte: 100,
        unite: 'g',
        kcal: food.kcal_per_100g,
        proteines: food.protein_per_100g,
        glucides: food.carbs_per_100g,
        lipides: food.fat_per_100g,
      },
    ];
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
      return {
        ...ing,
        qte: nextQty,
        kcal: (Number(ing.kcal) || 0) * factor,
        proteines: (Number(ing.proteines) || 0) * factor,
        glucides: (Number(ing.glucides) || 0) * factor,
        lipides: (Number(ing.lipides) || 0) * factor,
      };
    });
    setIngredients(next);
    onUpdate(recipe.id, { ingredients: next });
  }

  // Adding an ingredient that matches a food already in the library pulls in its macros
  // (for a default 100g) instead of starting from a blank row every time.
  function handleAddIngredient() {
    const name = newIngredientName.trim();
    if (!name) return;
    const match = foods.find((f) => f.name.toLowerCase() === name.toLowerCase());
    const next = [
      ...ingredients,
      match
        ? {
            nom: match.name,
            qte: 100,
            unite: 'g',
            kcal: match.kcal_per_100g,
            proteines: match.protein_per_100g,
            glucides: match.carbs_per_100g,
            lipides: match.fat_per_100g,
          }
        : { nom: name, qte: 0, unite: 'g', kcal: 0, proteines: 0, glucides: 0, lipides: 0 },
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
          aria-label="Coup de cœur"
        >
          {favorite ? '★' : '☆'}
        </button>
        <h3>{recipe.title}</h3>
        <button className="btn-ghost" onClick={() => onDelete(recipe.id)}>
          Supprimer
        </button>
      </div>

      {recipe.description && <p className="hint">{recipe.description}</p>}

      <div className="tag-row">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
            <button type="button" onClick={() => handleRemoveTag(tag)} aria-label={`Retirer ${tag}`}>
              ✕
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input"
          placeholder="+ tag"
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
          <b>{Math.round(totalKcal / p)}</b> kcal / portion
        </span>
        <span className="chip">
          <b>{Math.round(totalProtein / p)} g</b> protéines
        </span>
        <span className="chip">
          <b>{Math.round(totalCarbs / p)} g</b> glucides
        </span>
        <span className="chip">
          <b>{Math.round(totalFat / p)} g</b> lipides
        </span>
      </div>

      <button type="button" className="btn-ghost expand-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? '▾ Masquer ingrédients & étapes' : '▸ Voir ingrédients & étapes'}
      </button>

      {expanded && (
        <>
          <div className="row">
            <label>Image (URL)</label>
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

          <h4 className="section-label">Ingrédients</h4>
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
              📋 Choisir un aliment existant
            </button>
          </div>
          <div className="manual-ingredient-row">
            <input
              type="text"
              className="wide"
              placeholder="Ou tape un nouveau nom d'ingrédient"
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
              + Ajouter
            </button>
          </div>

          {showIngredientPicker && (
            <div className="modal-overlay" onClick={() => setShowIngredientPicker(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Choisir un aliment</h2>
                <input
                  type="text"
                  placeholder="Rechercher un aliment..."
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
                  <p className="hint">Aucun aliment trouvé.</p>
                )}
              </div>
              <button type="button" className="done-btn" onClick={() => setShowIngredientPicker(false)}>
                Fermer
              </button>
            </div>
          )}

          {recipe.steps.length > 0 && (
            <>
              <h4 className="section-label">Étapes</h4>
              {recipe.steps.map((step, i) => (
                <div className="step-row" key={i}>
                  <span className="step-num">{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <label>Portions</label>
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
  const [selectedCategory, setSelectedCategory] = useState(null);

  function favoriteMealsFor(recipeId) {
    return new Set(
      favorites.filter((f) => f.source_type === 'recipe' && f.source_id === recipeId).map((f) => f.meal)
    );
  }

  const groups = CATEGORY_GROUPS.map((g) => ({
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
    { key: 'favorites', label: '⭐ Favoris', recipes: favoriteRecipes },
    { key: 'boissons', label: '🥤 Boissons', tag: 'Boissons', recipes: boissonsRecipes },
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
            ← Retour
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
          <p className="hint">Aucune recette dans cette catégorie pour l'instant.</p>
        ) : (
          <div className="recipe-list">{active.recipes.map(renderCard)}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2>Recettes</h2>
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
              <span className="rate">{g.recipes.length} recette(s)</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
