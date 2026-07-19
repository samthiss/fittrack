import { useRef, useState, useEffect, useCallback } from 'react';
import AddFoodToMeal from './AddFoodToMeal';
import { findRecurringItems } from './MealPlanner';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';
import Icon from './Icon';

function EntryQuantityEditor({ entry, allowUnitToggle, onUpdateEntry, onSaved }) {
  const { t } = useLanguage();
  const [unit, setUnit] = useState(allowUnitToggle ? entry.unit || 'g' : 'portion(s)');
  // Grams/ml are shown as whole numbers (nobody weighs food to the decimal gram); portions keep
  // their precision since fractional portions (e.g. 1.5) are meaningful.
  const displayValue = unit === 'portion(s)' ? entry.quantity : Math.round(entry.quantity);
  const [value, setValue] = useState(displayValue);

  function handleSave() {
    const next = Number(value);
    if (next > 0 && (next !== entry.quantity || unit !== entry.unit)) onUpdateEntry(entry.id, next, unit);
    onSaved();
  }

  return (
    <div className="qty-editor">
      <div className="qty-editor-row">
        <input
          type="number"
          min="0"
          step={unit === 'portion(s)' ? 'any' : '1'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {allowUnitToggle ? (
          <select className="qty-editor-unit-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="g">g</option>
            <option value="ml">ml</option>
          </select>
        ) : (
          <span className="qty-editor-unit">{unit}</span>
        )}
      </div>
      <button type="button" className="btn btn-block" onClick={handleSave}>
        {t('meal.save')}
      </button>
    </div>
  );
}

// Ingredients from the same recipe are logged as separate 'recipe_ingredient' rows sharing
// source_id — group them back under the recipe so the Journal shows "which dish" they came from.
function groupEntries(entries) {
  const singles = [];
  const byRecipe = new Map();
  for (const e of entries) {
    if (e.source_type === 'recipe_ingredient') {
      if (!byRecipe.has(e.source_id)) byRecipe.set(e.source_id, []);
      byRecipe.get(e.source_id).push(e);
    } else {
      singles.push({ kind: 'single', entry: e, id: e.id });
    }
  }
  const groups = [...singles];
  for (const [recipeId, items] of byRecipe) {
    groups.push({ kind: 'recipe', recipeId, entries: items, id: Math.min(...items.map((i) => i.id)) });
  }
  return groups.sort((a, b) => a.id - b.id);
}

export default function MealDetail({
  meal,
  foods,
  recipes,
  favorites,
  frequentItems,
  onBack,
  onAddEntry,
  onDeleteEntry,
  onUpdateEntry,
  onReplaceEntry,
  onLookupBarcode,
  onSearchOnline,
  onCreateFood,
  onUpdateFood,
  onDeleteFood,
  onDeleteRecipe,
  onParseText,
  onAddFavorite,
  onRemoveFavorite,
}) {
  const { t } = useLanguage();
  const [showAdd, setShowAdd] = useState(false);
  const [replaceTargetIds, setReplaceTargetIds] = useState(null);
  const [viewingRecipeId, setViewingRecipeId] = useState(null);
  const [viewingEntryId, setViewingEntryId] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupPortions, setGroupPortions] = useState('1');
  const [savingGroupPortions, setSavingGroupPortions] = useState(false);
  const [recurringKeys, setRecurringKeys] = useState(new Set());
  const swipeRef = useRef(null);
  const mealKeyForEffect = meal?.key;

  const refreshRecurringKeys = useCallback(async () => {
    if (!mealKeyForEffect) return;
    const p = await api.getMealPlan();
    const items = findRecurringItems(p.entries, mealKeyForEffect, p.days);
    setRecurringKeys(new Set(items.map((it) => `${it.source_type}-${it.source_id}`)));
  }, [mealKeyForEffect]);

  useEffect(() => {
    refreshRecurringKeys();
    // Also re-check whenever the meal's entries change (e.g. right after adding a food and
    // marking it recurring from the "+ Ajouter" sheet) — not just on mount.
  }, [refreshRecurringKeys, meal?.entries]);

  if (!meal) return null;
  const { key: mealKey, budgetKcal, consumed, macroTargets, entries } = meal;
  const groups = groupEntries(entries);
  const viewingRecipe = viewingRecipeId ? recipes.find((r) => r.id === viewingRecipeId) : null;
  const viewingEntry = viewingEntryId ? entries.find((e) => e.id === viewingEntryId) : null;

  function openReplace(ids) {
    setReplaceTargetIds(ids);
  }

  async function handlePickReplacement(recipe) {
    await onReplaceEntry(replaceTargetIds, 'recipe', recipe.id, 1);
    setReplaceTargetIds(null);
  }

  async function handleDeleteGroup(ids) {
    for (const id of ids) await onDeleteEntry(id);
  }

  // Logged recipe ingredients don't store the portions count directly (only each ingredient's
  // already-scaled quantity), so it's recovered from the ratio between what's logged and what
  // the recipe's own definition says for that same ingredient.
  function currentPortionsForGroup(g, recipe) {
    if (!recipe || g.entries.length === 0) return recipe?.portions || 1;
    const defIngredient = recipe.ingredients.find((i) => i.nom === g.entries[0].label);
    if (!defIngredient || !defIngredient.qte) return recipe.portions || 1;
    const ratio = g.entries[0].quantity / defIngredient.qte;
    return Math.round(ratio * (recipe.portions || 1) * 100) / 100;
  }

  function openEditGroup(g, recipe) {
    setEditingGroupId(g.recipeId);
    setGroupPortions(String(currentPortionsForGroup(g, recipe)));
  }

  async function handleSaveGroupPortions(g) {
    const next = Number(groupPortions);
    if (!next || next <= 0) return;
    setSavingGroupPortions(true);
    try {
      await handleDeleteGroup(g.entries.map((e) => e.id));
      await onAddEntry('recipe', g.recipeId, next);
      setEditingGroupId(null);
    } finally {
      setSavingGroupPortions(false);
    }
  }

  // Unlike the one-directional recurring checkbox in AddFoodToMeal (which only ever turns
  // recurring ON, so logging a second portion can never accidentally un-mark it), this one is a
  // deliberate edit action — toggling it off here is the whole point.
  async function handleToggleRecurring(sourceType, sourceId, quantity, nextChecked) {
    if (nextChecked) {
      await api.applyMealPlanToWeek({ meal: mealKey, source_type: sourceType, source_id: sourceId, quantity });
    } else {
      await api.removeMealPlanForSource(mealKey, sourceType, sourceId);
    }
    await refreshRecurringKeys();
  }

  return (
    <div
      onTouchStart={(e) => {
        swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        if (!swipeRef.current) return;
        const dx = e.changedTouches[0].clientX - swipeRef.current.x;
        const dy = e.changedTouches[0].clientY - swipeRef.current.y;
        swipeRef.current = null;
        if (dx > 80 && Math.abs(dy) < 60) onBack();
      }}
    >
      <div className="meal-detail-header">
        <button className="meal-detail-back-btn" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="meal-detail-heading">
          <div className="meal-detail-title">{t(`mealName.${mealKey}`)}</div>
        </div>
      </div>

      <div className="meal-summary-card">
        <div className="meal-summary-top">
          <div>
            <div className="meal-summary-total-label">{t('meal.totalForMeal')}</div>
            <div className="meal-summary-total-value">
              {Math.round(consumed.kcal)} <span>/ {Math.round(budgetKcal)} kcal</span>
            </div>
          </div>
          <div className="meal-summary-remaining">
            <div className="meal-summary-remaining-label">{t('meal.remaining')}</div>
            <div
              className="meal-summary-remaining-value"
              style={{ color: budgetKcal - consumed.kcal < 0 ? 'var(--danger)' : 'var(--success)' }}
            >
              {Math.round(Math.abs(budgetKcal - consumed.kcal))} kcal
            </div>
          </div>
        </div>
        <div className="meal-summary-bar">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${budgetKcal > 0 ? Math.min(100, Math.round((consumed.kcal / budgetKcal) * 100)) : 0}%`,
                background: 'var(--gradient-brand)',
              }}
            />
          </div>
        </div>
        <div className="meal-summary-macros">
          <div className="meal-summary-macro">
            <b style={{ color: 'var(--macro-protein)' }}>{Math.round(consumed.protein)}g</b>
            <span>{t('nutrient.protein')}</span>
          </div>
          <div className="meal-summary-macro">
            <b style={{ color: 'var(--macro-carb)' }}>{Math.round(consumed.carbs)}g</b>
            <span>{t('nutrient.carbs')}</span>
          </div>
          <div className="meal-summary-macro">
            <b style={{ color: 'var(--macro-fat)' }}>{Math.round(consumed.fat)}g</b>
            <span>{t('nutrient.fat')}</span>
          </div>
        </div>
      </div>

      {groups.length > 0 && (
        <>
          <h2>
            {t('meal.items')} · {groups.length}
          </h2>
          <div className="entry-list">
            {groups.map((g) => {
              if (g.kind === 'single') {
                const e = g.entry;
                return (
                  <div className="entry-card" key={e.id}>
                    <div className="entry-card-body" onClick={() => setViewingEntryId(e.id)}>
                      <div className="entry-card-name-row">
                        <span className="entry-card-name">{e.label}</span>
                        {recurringKeys.has(`${e.source_type}-${e.source_id}`) && (
                          <Icon name="repeat" size={14} color="var(--acc)" title={t('meal.recurringMeal')} />
                        )}
                      </div>
                      <div className="entry-card-sub">
                        {Math.round(e.quantity)} {e.source_type === 'recipe' ? 'portion(s)' : e.unit || 'g'} · {Math.round(e.kcal)} kcal
                      </div>
                      <div className="entry-card-macros">
                        <span>
                          <i style={{ background: 'var(--macro-protein)' }} />
                          {Math.round(e.protein)}g
                        </span>
                        <span>
                          <i style={{ background: 'var(--macro-carb)' }} />
                          {Math.round(e.carbs)}g
                        </span>
                        <span>
                          <i style={{ background: 'var(--macro-fat)' }} />
                          {Math.round(e.fat)}g
                        </span>
                      </div>
                    </div>
                    <div className="entry-card-actions">
                      <button
                        type="button"
                        className="entry-icon-btn entry-delete-btn"
                        onClick={() => onDeleteEntry(e.id)}
                        aria-label={t('meal.delete')}
                      >
                        <Icon name="trash-2" size={17} />
                      </button>
                    </div>
                  </div>
                );
              }

              const recipe = recipes.find((r) => r.id === g.recipeId);
              const groupKcal = g.entries.reduce((s, e) => s + e.kcal, 0);
              const ids = g.entries.map((e) => e.id);

              return (
                <div className="entry-group-card" key={`recipe-${g.recipeId}`}>
                  <div className="entry-group-header-row">
                    <div className="entry-card-body" onClick={() => recipe && setViewingRecipeId(g.recipeId)}>
                      <div className="entry-card-name-row">
                        <span className="entry-card-name">{recipe ? recipe.title : t('meal.recipeDeleted')}</span>
                        {recurringKeys.has(`recipe-${g.recipeId}`) && (
                          <Icon name="repeat" size={14} color="var(--acc)" title={t('meal.recurringMeal')} />
                        )}
                      </div>
                      <div className="entry-card-sub">
                        {g.entries.length} {t('meal.ingredients')} · {Math.round(groupKcal)} kcal
                      </div>
                    </div>
                    <div className="entry-card-actions">
                      <button type="button" className="entry-icon-btn" onClick={() => openReplace(ids)} aria-label={t('meal.replace')}>
                        <Icon name="repeat" size={16} />
                      </button>
                      {recipe && (
                        <button type="button" className="entry-icon-btn" onClick={() => openEditGroup(g, recipe)} aria-label={t('meal.edit')}>
                          <Icon name="pencil-line" size={16} />
                        </button>
                      )}
                      <button type="button" className="entry-icon-btn entry-delete-btn" onClick={() => handleDeleteGroup(ids)}>
                        <Icon name="trash-2" size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="entry-sub-list">
                    {g.entries.map((e) => (
                      <div className="entry-sub-row" key={e.id}>
                        <span className="entry-card-name clickable" onClick={() => setViewingEntryId(e.id)}>
                          {e.label}
                        </span>
                        <span className="entry-card-sub" style={{ margin: 0 }}>
                          {Math.round(e.quantity)} g · {Math.round(e.kcal)} kcal
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <button type="button" className="meal-add-cta" onClick={() => setShowAdd(true)}>
        <Icon name="plus" size={20} />
        {t('meal.add')}
      </button>

      {showAdd && (
        <div className="modal-overlay">
          <div className="modal-content">
            <AddFoodToMeal
              mealKey={meal.key}
              foods={foods}
              recipes={recipes}
              favorites={favorites}
              frequentItems={frequentItems}
              onAddEntry={onAddEntry}
              onLookupBarcode={onLookupBarcode}
              onSearchOnline={onSearchOnline}
              onCreateFood={onCreateFood}
              onUpdateFood={onUpdateFood}
              onDeleteFood={onDeleteFood}
              onDeleteRecipe={onDeleteRecipe}
              onParseText={onParseText}
              onAddFavorite={onAddFavorite}
              onRemoveFavorite={onRemoveFavorite}
            />
          </div>
          <button type="button" className="done-btn" onClick={() => setShowAdd(false)}>
            {t('meal.done')}
          </button>
        </div>
      )}

      {replaceTargetIds && (
        <div className="modal-overlay" onClick={() => setReplaceTargetIds(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{t('meal.replaceWith')}</h2>
            <div className="replace-grid">
              {recipes.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="replace-card"
                  onClick={() => handlePickReplacement(r)}
                >
                  {r.image ? (
                    <img src={r.image} alt="" />
                  ) : (
                    <div className="replace-card-noimg">🍽️</div>
                  )}
                  <span>{r.title}</span>
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="done-btn" onClick={() => setReplaceTargetIds(null)}>
            {t('meal.close')}
          </button>
        </div>
      )}

      {viewingEntry && (
        <div className="modal-overlay" onClick={() => setViewingEntryId(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchEnd={(e) => {
              if (!swipeRef.current) return;
              const dx = e.changedTouches[0].clientX - swipeRef.current.x;
              const dy = e.changedTouches[0].clientY - swipeRef.current.y;
              swipeRef.current = null;
              if (dx > 80 && Math.abs(dy) < 60) setViewingEntryId(null);
            }}
          >
            <h2>{viewingEntry.label}</h2>
            <div className="tile-grid">
              <div className="tile">
                <b style={{ fontSize: 16 }}>{Math.round(viewingEntry.kcal)}</b>
                <span>kcal</span>
              </div>
              <div className="tile">
                <b>{viewingEntry.carbs.toFixed(1)} g</b>
                <span>{t('nutrient.carbs')}</span>
              </div>
              <div className="tile">
                <b>{viewingEntry.protein.toFixed(1)} g</b>
                <span>{t('nutrient.protein')}</span>
              </div>
              <div className="tile">
                <b>{viewingEntry.fat.toFixed(1)} g</b>
                <span>{t('nutrient.fat')}</span>
              </div>
            </div>
            <h4 className="section-label">{t('meal.quantity')}</h4>
            <EntryQuantityEditor
              key={viewingEntry.id}
              entry={viewingEntry}
              allowUnitToggle={viewingEntry.source_type === 'food'}
              onUpdateEntry={onUpdateEntry}
              onSaved={() => setViewingEntryId(null)}
            />
            {viewingEntry.source_type === 'food' && (
              <label className="recurring-toggle-row">
                <input
                  type="checkbox"
                  checked={recurringKeys.has(`${viewingEntry.source_type}-${viewingEntry.source_id}`)}
                  onChange={(e) =>
                    handleToggleRecurring(
                      viewingEntry.source_type,
                      viewingEntry.source_id,
                      viewingEntry.quantity,
                      e.target.checked
                    )
                  }
                />
                <span>{t('addFood.recurringMeal')}</span>
              </label>
            )}
          </div>
        </div>
      )}

      {editingGroupId != null && (() => {
        const g = groups.find((gr) => gr.kind === 'recipe' && gr.recipeId === editingGroupId);
        const recipe = g && recipes.find((r) => r.id === g.recipeId);
        if (!g || !recipe) return null;
        const groupKcal = g.entries.reduce((s, e) => s + e.kcal, 0);
        return (
          <div className="modal-overlay" onClick={() => setEditingGroupId(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>{recipe.title}</h2>
              <div className="tile-grid">
                <div className="tile">
                  <b style={{ fontSize: 16 }}>{Math.round(groupKcal)}</b>
                  <span>kcal</span>
                </div>
              </div>
              <h4 className="section-label">{t('meal.quantity')}</h4>
              <div className="qty-editor">
                <div className="qty-editor-row">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={groupPortions}
                    onChange={(e) => setGroupPortions(e.target.value)}
                  />
                  <span className="qty-editor-unit">{t('addFood.portion')}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-block"
                  onClick={() => handleSaveGroupPortions(g)}
                  disabled={savingGroupPortions}
                >
                  {savingGroupPortions ? t('addFood.saving') : t('meal.save')}
                </button>
              </div>
              <label className="recurring-toggle-row">
                <input
                  type="checkbox"
                  checked={recurringKeys.has(`recipe-${g.recipeId}`)}
                  onChange={(e) =>
                    handleToggleRecurring('recipe', g.recipeId, Number(groupPortions) || 1, e.target.checked)
                  }
                />
                <span>{t('addFood.recurringMeal')}</span>
              </label>
            </div>
          </div>
        );
      })()}

      {viewingRecipe && (
        <div className="modal-overlay" onClick={() => setViewingRecipeId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {viewingRecipe.image && <img src={viewingRecipe.image} alt="" className="recipe-image-full" />}
            <h2>{viewingRecipe.title}</h2>
            {viewingRecipe.description && <p className="hint">{viewingRecipe.description}</p>}

            <h4 className="section-label">{t('meal.ingredientsCount').replace('{count}', viewingRecipe.portions)}</h4>
            {viewingRecipe.ingredients.map((ing, i) => (
              <div className="ingredient-row" key={i}>
                <span className="ingredient-name">{ing.nom}</span>
                <span className="ingredient-kcal">
                  {ing.qte} {ing.unite || 'g'}
                </span>
              </div>
            ))}

            {viewingRecipe.steps.length > 0 && (
              <>
                <h4 className="section-label">{t('meal.steps')}</h4>
                {viewingRecipe.steps.map((step, i) => (
                  <div className="step-row" key={i}>
                    <span className="step-num">{i + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <button type="button" className="done-btn" onClick={() => setViewingRecipeId(null)}>
            {t('meal.close')}
          </button>
        </div>
      )}

    </div>
  );
}
