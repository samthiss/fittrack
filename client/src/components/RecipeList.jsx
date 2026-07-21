import { useMemo, useState } from 'react';
import RecipeManualForm from './RecipeManualForm';
import RecipeDetail from './RecipeDetail';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

function getCategoryGroups(t) {
  return [
    { key: 'lunch_dinner', label: t('recipeList.categoryLunchDinner'), meals: ['lunch', 'dinner'], icon: 'utensils' },
    { key: 'breakfast', label: t('recipeList.categoryBreakfast'), meals: ['breakfast'], icon: 'sunrise' },
    { key: 'snack', label: t('recipeList.categorySnack'), meals: ['snack'], icon: 'apple' },
  ];
}

function recipeKcalPerPortion(recipe) {
  const total = recipe.ingredients.reduce((s, i) => s + (Number(i.kcal) || 0), 0);
  return total / (recipe.portions || 1);
}

function recipeProteinPerPortion(recipe) {
  const total = recipe.ingredients.reduce((s, i) => s + (Number(i.proteines) || 0), 0);
  return total / (recipe.portions || 1);
}

function RecipeRow({ recipe, onOpen, onToggleFavorite }) {
  return (
    <div className="recipe-row-card" onClick={() => onOpen(recipe.id)}>
      <div className="recipe-row-thumb" style={{ background: 'linear-gradient(150deg, rgba(126,224,184,0.3), rgba(99,179,246,0.16))' }}>
        {recipe.image ? <img src={recipe.image} alt="" /> : <Icon name="salad" size={24} color="var(--macro-protein)" />}
      </div>
      <div className="recipe-row-body">
        <div className="recipe-row-title">{recipe.title}</div>
        <div className="recipe-row-stats">
          <span>
            <b>{Math.round(recipeKcalPerPortion(recipe))}</b> kcal
          </span>
          <span>
            <i style={{ background: 'var(--macro-protein)' }} />
            {Math.round(recipeProteinPerPortion(recipe))}g
          </span>
        </div>
      </div>
      <button
        type="button"
        className={recipe.favorite ? 'recipe-row-star active' : 'recipe-row-star'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(recipe);
        }}
      >
        <Icon name="star" size={20} />
      </button>
    </div>
  );
}

export default function RecipeList({
  recipes,
  onUpdate,
  onDelete,
  favorites = [],
  onToggleFavorite,
  foods = [],
  meals = [],
  onImportRecipe,
  onCreateRecipe,
  onSetCategories,
  onQuickAddRecipe,
}) {
  const { t } = useLanguage();
  const [screen, setScreen] = useState('home');
  const [selectedCategoryKey, setSelectedCategoryKey] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [homeSearch, setHomeSearch] = useState('');
  const [allSearch, setAllSearch] = useState('');
  const [sortMode, setSortMode] = useState('relevance');

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
  const boissonsRecipes = recipes.filter((r) => (r.tags || []).includes('Boissons'));
  const allGroups = [
    { key: 'favorites', label: t('recipeList.categoryFavorites'), icon: 'star', recipes: favoriteRecipes },
    { key: 'boissons', label: t('recipeList.categoryDrinks'), tag: 'Boissons', icon: 'cup-soda', recipes: boissonsRecipes },
    ...groups,
  ];

  async function handleToggleGeneralFavorite(recipe) {
    await onUpdate(recipe.id, { favorite: !recipe.favorite });
  }

  function openRecipe(id) {
    setSelectedRecipeId(id);
    setScreen('detail');
  }

  const homeResults = useMemo(() => {
    const term = homeSearch.trim().toLowerCase();
    if (!term) return [];
    return recipes.filter((r) => r.title.toLowerCase().includes(term));
  }, [homeSearch, recipes]);

  function sortRecipes(list) {
    const sorted = [...list];
    if (sortMode === 'kcal') sorted.sort((a, b) => recipeKcalPerPortion(a) - recipeKcalPerPortion(b));
    else if (sortMode === 'protein') sorted.sort((a, b) => recipeProteinPerPortion(b) - recipeProteinPerPortion(a));
    return sorted;
  }

  // --- Detail screen ---
  if (screen === 'detail' && selectedRecipeId != null) {
    const recipe = recipes.find((r) => r.id === selectedRecipeId);
    if (!recipe) {
      setScreen('home');
      return null;
    }
    const cat = allGroups.find((g) => g.recipes.some((r) => r.id === recipe.id));
    const recipeCategoryGroups = getCategoryGroups(t);
    const activeCategoryKeys = new Set(
      recipeCategoryGroups.filter((g) => g.meals.every((m) => favoriteMealsFor(recipe.id).has(m))).map((g) => g.key)
    );
    return (
      <RecipeDetail
        recipe={recipe}
        categoryLabel={cat?.label}
        onBack={() => setScreen(selectedCategoryKey ? 'category' : 'home')}
        onEdit={() => setScreen('edit')}
        onDelete={async (id) => {
          await onDelete(id);
          setScreen('home');
        }}
        onToggleFavorite={handleToggleGeneralFavorite}
        onQuickAdd={onQuickAddRecipe}
        meals={meals}
        categoryGroups={recipeCategoryGroups}
        activeCategoryKeys={activeCategoryKeys}
        onToggleCategory={(g) => onToggleFavorite(g.meals, recipe, activeCategoryKeys.has(g.key))}
      />
    );
  }

  // --- Create / Edit screen ---
  if (screen === 'create' || screen === 'edit') {
    const editingRecipe = screen === 'edit' ? recipes.find((r) => r.id === selectedRecipeId) : null;
    const active = selectedCategoryKey ? allGroups.find((g) => g.key === selectedCategoryKey) : null;
    const presetCategory = active && active.key !== 'favorites' ? { meals: active.meals, tag: active.tag } : null;
    return (
      <RecipeManualForm
        mode={screen === 'edit' ? 'edit' : 'create'}
        initialRecipe={editingRecipe}
        onCreate={onCreateRecipe}
        onUpdate={onUpdate}
        onSetCategories={onSetCategories}
        onImportRecipe={onImportRecipe}
        foods={foods}
        presetCategory={screen === 'create' ? presetCategory : null}
        onBack={() => setScreen(editingRecipe ? 'detail' : selectedCategoryKey ? 'category' : 'home')}
        onSaved={(id) => {
          if (id) setSelectedRecipeId(id);
          setScreen('detail');
        }}
      />
    );
  }

  // --- All recipes screen ---
  if (screen === 'all') {
    const term = allSearch.trim().toLowerCase();
    const list = term ? recipes.filter((r) => r.title.toLowerCase().includes(term)) : recipes;
    return (
      <div>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <button type="button" className="meal-detail-back-btn" onClick={() => setScreen('home')} aria-label={t('meal.back')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div>
            <div className="day-nav-subtitle">{recipes.length} {t('recipeList.recipeCountShort')}</div>
            <h1 style={{ margin: 0 }}>{t('recipeList.allRecipes')}</h1>
          </div>
        </div>
        <div className="search-input-row" style={{ marginTop: 14 }}>
          <Icon name="search" size={18} color="var(--text-muted)" />
          <input
            type="text"
            className="search-input"
            placeholder={t('recipeList.searchPlaceholder')}
            value={allSearch}
            onChange={(e) => setAllSearch(e.target.value)}
          />
        </div>
        <div className="entry-list" style={{ marginTop: 14 }}>
          {list.length === 0 && <p className="hint">{t('recipeList.noResults')}</p>}
          {list.map((r) => (
            <RecipeRow key={r.id} recipe={r} onOpen={openRecipe} onToggleFavorite={handleToggleGeneralFavorite} />
          ))}
        </div>
      </div>
    );
  }

  // --- Category screen ---
  if (screen === 'category' && selectedCategoryKey) {
    const active = allGroups.find((g) => g.key === selectedCategoryKey);
    const list = sortRecipes(active.recipes);
    return (
      <div>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <button type="button" className="meal-detail-back-btn" onClick={() => setScreen('home')} aria-label={t('meal.back')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="day-nav-subtitle">{t('recipeList.categoryLabel')}</div>
            <h1 style={{ margin: 0 }}>{active.label}</h1>
          </div>
        </div>

        <div className="filter-pill-row" style={{ marginTop: 14 }}>
          {[
            ['relevance', t('recipeList.sortRelevance')],
            ['kcal', t('recipeList.sortKcal')],
            ['protein', t('recipeList.sortProtein')],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={sortMode === key ? 'filter-pill active' : 'filter-pill'}
              onClick={() => setSortMode(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="hint" style={{ marginTop: 14 }}>{t('recipeList.noRecipesInCategory')}</p>
        ) : (
          <div className="entry-list" style={{ marginTop: 14 }}>
            {list.map((r) => (
              <RecipeRow key={r.id} recipe={r} onOpen={openRecipe} onToggleFavorite={handleToggleGeneralFavorite} />
            ))}
          </div>
        )}

        <button
          type="button"
          className="meal-add-cta"
          style={{ marginTop: 16 }}
          onClick={() => setScreen('create')}
        >
          <Icon name="plus" size={20} />
          {t('recipeManual.createRecipe')}
        </button>
      </div>
    );
  }

  // --- Home screen ---
  return (
    <div>
      <div className="row" style={{ alignItems: 'center' }}>
        <div>
          <div className="day-nav-subtitle">{t('recipeList.library')}</div>
          <h1 style={{ margin: 0 }}>{t('recipeList.title')}</h1>
        </div>
        <button
          type="button"
          className="meal-add-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            setSelectedCategoryKey(null);
            setScreen('create');
          }}
          aria-label={t('recipeManual.createRecipe')}
        >
          <Icon name="plus" size={22} color="var(--text-on-accent)" />
        </button>
      </div>

      <div className="search-input-row" style={{ marginTop: 14 }}>
        <Icon name="search" size={18} color="var(--text-muted)" />
        <input
          type="text"
          className="search-input"
          placeholder={t('recipeList.searchPlaceholder')}
          value={homeSearch}
          onChange={(e) => setHomeSearch(e.target.value)}
        />
      </div>

      {homeSearch.trim() ? (
        <div className="entry-list" style={{ marginTop: 14 }}>
          {homeResults.length === 0 && <p className="hint">{t('recipeList.noResults')}</p>}
          {homeResults.map((r) => (
            <RecipeRow key={r.id} recipe={r} onOpen={openRecipe} onToggleFavorite={handleToggleGeneralFavorite} />
          ))}
        </div>
      ) : (
        <>
          <div className="filter-pill-row" style={{ marginTop: 14 }}>
            <button type="button" className="filter-pill active" onClick={() => setScreen('all')}>
              {t('recipeList.all')}
            </button>
            {allGroups.map((g) => (
              <button
                type="button"
                key={g.key}
                className="filter-pill"
                onClick={() => {
                  setSelectedCategoryKey(g.key);
                  setScreen('category');
                }}
              >
                {g.label}
              </button>
            ))}
          </div>

          <h2>{t('recipeList.categoryLabel')}</h2>
          <div className="recipe-category-grid">
            {allGroups.map((g) => (
              <button
                type="button"
                key={g.key}
                className="recipe-category-tile"
                onClick={() => {
                  setSelectedCategoryKey(g.key);
                  setScreen('category');
                }}
              >
                <div className="recipe-category-thumb" style={{ background: 'linear-gradient(150deg, rgba(245,194,107,0.28), rgba(139,118,249,0.14))' }}>
                  <Icon name={g.icon} size={26} color="var(--acc)" />
                </div>
                <div className="recipe-category-body">
                  <div className="recipe-category-title">{g.label}</div>
                  <div className="recipe-category-count">
                    {g.recipes.length} {t('recipeList.recipeCount')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
