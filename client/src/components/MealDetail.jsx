import { useRef, useState, useEffect, useCallback } from 'react';
import AddFoodToMeal from './AddFoodToMeal';
import { findRecurringItems } from './MealPlanner';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';
import Icon from './Icon';

// The 4 fixed meals have a translated mealName.* key; any extra "en-cas" slot (key starting with
// "snack_") only has the free-text label the user gave it when adding it in Réglages.
const BASE_MEAL_KEYS = ['breakfast', 'snack', 'lunch', 'dinner'];
function mealLabel(key, label, t) {
  return BASE_MEAL_KEYS.includes(key) ? t(`mealName.${key}`) : label;
}

// Shared "Modifier aliment"-style edit sheet: icon+name header, a +/- quantity stepper (with a
// g/ml unit toggle for foods), a live 4-tile macro breakdown that rescales with the stepper, and
// the recurring-meal toggle. Used for both a plain food entry and a recipe's portions.
function EditEntrySheet({
  headerLabel,
  title,
  subtitle,
  icon,
  quantity,
  onQuantityChange,
  step,
  unit,
  unitOptions,
  onUnitChange,
  macros,
  showRecurring,
  recurring,
  onToggleRecurring,
  onClose,
  onSave,
  saving,
  swipeRef,
  children,
}) {
  const { t } = useLanguage();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          if (swipeRef) swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          if (!swipeRef?.current) return;
          const dx = e.changedTouches[0].clientX - swipeRef.current.x;
          const dy = e.changedTouches[0].clientY - swipeRef.current.y;
          swipeRef.current = null;
          if (dx > 80 && Math.abs(dy) < 60) onClose();
        }}
      >
        <div className="meal-detail-header" style={{ marginBottom: 4 }}>
          <button type="button" className="meal-detail-back-btn" onClick={onClose} aria-label={t('meal.back')}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="meal-detail-heading">
            {headerLabel && <div className="day-nav-subtitle">{headerLabel}</div>}
            <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('meal.editFood')}</div>
          </div>
        </div>

        <div className="edit-entry-header-card">
          <span className="edit-entry-header-icon">
            <Icon name={icon} size={22} />
          </span>
          <div>
            <div className="edit-entry-header-name">{title}</div>
            {subtitle && <div className="edit-entry-header-sub">{subtitle}</div>}
          </div>
        </div>

        <h4 className="section-label">{t('meal.quantity')}</h4>
        <div className="qty-stepper-row">
          <button type="button" className="weight-minus-btn" onClick={() => onQuantityChange(Math.max(step, quantity - step))}>
            <Icon name="minus" size={18} />
          </button>
          <div className="qty-stepper-value">
            <span className="weight-value">{unit === 'portion(s)' ? quantity : Math.round(quantity)}</span>{' '}
            <span className="rate">{unit}</span>
          </div>
          <button type="button" className="weight-plus-btn qty-stepper-plus" onClick={() => onQuantityChange(quantity + step)}>
            <Icon name="plus" size={18} />
          </button>
        </div>
        {unitOptions && (
          <div className="type-list-row" style={{ marginTop: 10 }}>
            {unitOptions.map((u) => (
              <button
                key={u}
                type="button"
                className={unit === u ? 'type-pill active' : 'type-pill'}
                onClick={() => onUnitChange(u)}
              >
                {u}
              </button>
            ))}
          </div>
        )}

        {macros && (
          <>
            <h4 className="section-label">{t('addFood.forThisPortion')}</h4>
            <div className="portion-tile-row">
              <div className="portion-tile">
                <b>{Math.round(macros.kcal)}</b>
                <span>kcal</span>
              </div>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-protein)' }}>{Math.round(macros.protein)}</b>
                <span>{t('nutrient.protein')}</span>
              </div>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-carb)' }}>{Math.round(macros.carbs)}</b>
                <span>{t('nutrient.carbs')}</span>
              </div>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-fat)' }}>{Math.round(macros.fat)}</b>
                <span>{t('nutrient.fat')}</span>
              </div>
            </div>
          </>
        )}

        {showRecurring && (
          <>
            <h4 className="section-label">{t('addFood.recurringSection')}</h4>
            <div
              className={recurring ? 'recurring-feature-row active' : 'recurring-feature-row'}
              onClick={() => onToggleRecurring(!recurring)}
            >
              <span className="recurring-feature-icon">
                <Icon name="repeat" size={20} />
              </span>
              <div className="recurring-feature-body">
                <div className="recurring-feature-title">{t('addFood.markRecurring')}</div>
                <div className="recurring-feature-desc">{t('addFood.markRecurringDesc')}</div>
              </div>
              <span className={recurring ? 'recurring-feature-check checked' : 'recurring-feature-check'}>
                <Icon name="check" size={16} />
              </span>
            </div>
          </>
        )}

        {children}
      </div>
      <button
        type="button"
        className="done-btn done-btn-primary"
        onClick={(e) => {
          e.stopPropagation();
          onSave();
        }}
        disabled={saving}
      >
        {saving ? t('addFood.saving') : t('meal.save')}
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
  onLookupBarcode,
  onSearchOnline,
  onCreateFood,
  onParseText,
  onParsePhoto,
  autoOpenAdd,
}) {
  const { t } = useLanguage();
  const [showAdd, setShowAdd] = useState(!!autoOpenAdd);
  const [viewingEntryId, setViewingEntryId] = useState(null);
  const [entryQty, setEntryQty] = useState(0);
  const [entryUnit, setEntryUnit] = useState('g');
  const [savingEntry, setSavingEntry] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupPortions, setGroupPortions] = useState(1);
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
  const { key: mealKey, label: mealLabelText, budgetKcal, consumed, macroTargets, entries } = meal;
  const mealTitle = mealLabel(mealKey, mealLabelText, t);
  const groups = groupEntries(entries);
  const viewingEntry = viewingEntryId ? entries.find((e) => e.id === viewingEntryId) : null;

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

  function openViewingEntry(e) {
    setViewingEntryId(e.id);
    setEntryQty(e.source_type === 'recipe' ? e.quantity : Math.round(e.quantity));
    setEntryUnit(e.source_type === 'food' ? e.unit || 'g' : 'portion(s)');
  }

  async function handleSaveEntry() {
    if (savingEntry || !viewingEntry || entryQty <= 0) return;
    setSavingEntry(true);
    try {
      if (entryQty !== viewingEntry.quantity || entryUnit !== viewingEntry.unit) {
        await onUpdateEntry(viewingEntry.id, entryQty, entryUnit);
      }
      setViewingEntryId(null);
    } finally {
      setSavingEntry(false);
    }
  }

  function openEditGroup(g, recipe) {
    setEditingGroupId(g.recipeId);
    setGroupPortions(currentPortionsForGroup(g, recipe));
  }

  async function handleSaveGroupPortions(g) {
    if (savingGroupPortions || !groupPortions || groupPortions <= 0) return;
    setSavingGroupPortions(true);
    try {
      await handleDeleteGroup(g.entries.map((e) => e.id));
      await onAddEntry('recipe', g.recipeId, groupPortions);
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
          <div className="meal-detail-title">{mealTitle}</div>
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
                    <div className="entry-card-body" onClick={() => openViewingEntry(e)}>
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
              const groupProtein = g.entries.reduce((s, e) => s + e.protein, 0);
              const groupCarbs = g.entries.reduce((s, e) => s + e.carbs, 0);
              const groupFat = g.entries.reduce((s, e) => s + e.fat, 0);
              const ids = g.entries.map((e) => e.id);

              return (
                <div className="entry-group-card" key={`recipe-${g.recipeId}`}>
                  <div className="entry-group-header-row">
                    <div className="entry-card-body" onClick={() => recipe && openEditGroup(g, recipe)}>
                      <div className="entry-card-name-row">
                        <span className="entry-card-name">{recipe ? recipe.title : t('meal.recipeDeleted')}</span>
                        {recurringKeys.has(`recipe-${g.recipeId}`) && (
                          <Icon name="repeat" size={14} color="var(--acc)" title={t('meal.recurringMeal')} />
                        )}
                      </div>
                      <div className="entry-card-sub">
                        {g.entries.length} {t('meal.ingredients')} · {Math.round(groupKcal)} kcal
                      </div>
                      <div className="entry-card-macros">
                        <span>
                          <i style={{ background: 'var(--macro-protein)' }} />
                          {Math.round(groupProtein)}g
                        </span>
                        <span>
                          <i style={{ background: 'var(--macro-carb)' }} />
                          {Math.round(groupCarbs)}g
                        </span>
                        <span>
                          <i style={{ background: 'var(--macro-fat)' }} />
                          {Math.round(groupFat)}g
                        </span>
                      </div>
                    </div>
                    <div className="entry-card-actions">
                      <button type="button" className="entry-icon-btn entry-delete-btn" onClick={() => handleDeleteGroup(ids)}>
                        <Icon name="trash-2" size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="entry-sub-list">
                    {g.entries.map((e) => (
                      <div className="entry-sub-row" key={e.id}>
                        <div>
                          <span className="entry-card-name clickable" onClick={() => openViewingEntry(e)}>
                            {e.label}
                          </span>
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
              mealLabel={mealTitle}
              foods={foods}
              recipes={recipes}
              favorites={favorites}
              frequentItems={frequentItems}
              onAddEntry={onAddEntry}
              onLookupBarcode={onLookupBarcode}
              onSearchOnline={onSearchOnline}
              onCreateFood={onCreateFood}
              onParseText={onParseText}
              onParsePhoto={onParsePhoto}
              onDeleteEntry={onDeleteEntry}
              onUpdateEntry={onUpdateEntry}
              onAddedRecipe={(recipeId, portions) => {
                setShowAdd(false);
                setEditingGroupId(recipeId);
                setGroupPortions(portions);
              }}
            />
          </div>
          <button type="button" className="done-btn" onClick={() => setShowAdd(false)}>
            {t('meal.done')}
          </button>
        </div>
      )}

      {viewingEntry && (() => {
        const food = viewingEntry.source_type === 'food' ? foods.find((f) => f.id === viewingEntry.source_id) : null;
        const factor = viewingEntry.quantity > 0 ? entryQty / viewingEntry.quantity : 1;
        return (
          <EditEntrySheet
            headerLabel={mealTitle}
            title={viewingEntry.label}
            subtitle={food ? `${Math.round(food.kcal_per_100g)} kcal / 100 g` : null}
            icon="utensils"
            quantity={entryQty}
            onQuantityChange={setEntryQty}
            step={entryUnit === 'portion(s)' ? 0.5 : 10}
            unit={entryUnit}
            unitOptions={viewingEntry.source_type === 'food' ? ['g', 'ml'] : null}
            onUnitChange={setEntryUnit}
            macros={{
              kcal: viewingEntry.kcal * factor,
              protein: viewingEntry.protein * factor,
              carbs: viewingEntry.carbs * factor,
              fat: viewingEntry.fat * factor,
            }}
            showRecurring={viewingEntry.source_type === 'food'}
            recurring={recurringKeys.has(`${viewingEntry.source_type}-${viewingEntry.source_id}`)}
            onToggleRecurring={(checked) =>
              handleToggleRecurring(viewingEntry.source_type, viewingEntry.source_id, entryQty, checked)
            }
            onClose={() => setViewingEntryId(null)}
            onSave={handleSaveEntry}
            saving={savingEntry}
            swipeRef={swipeRef}
          />
        );
      })()}

      {editingGroupId != null && (() => {
        const g = groups.find((gr) => gr.kind === 'recipe' && gr.recipeId === editingGroupId);
        const recipe = g && recipes.find((r) => r.id === g.recipeId);
        if (!g || !recipe) return null;
        const groupKcal = g.entries.reduce((s, e) => s + e.kcal, 0);
        const groupProtein = g.entries.reduce((s, e) => s + e.protein, 0);
        const groupCarbs = g.entries.reduce((s, e) => s + e.carbs, 0);
        const groupFat = g.entries.reduce((s, e) => s + e.fat, 0);
        const basePortions = currentPortionsForGroup(g, recipe) || 1;
        const factor = groupPortions / basePortions;
        return (
          <EditEntrySheet
            headerLabel={mealTitle}
            title={recipe.title}
            subtitle={`${g.entries.length} ${t('meal.ingredients')}`}
            icon="utensils"
            quantity={groupPortions}
            onQuantityChange={setGroupPortions}
            step={0.5}
            unit="portion(s)"
            macros={{
              kcal: groupKcal * factor,
              protein: groupProtein * factor,
              carbs: groupCarbs * factor,
              fat: groupFat * factor,
            }}
            showRecurring
            recurring={recurringKeys.has(`recipe-${g.recipeId}`)}
            onToggleRecurring={(checked) => handleToggleRecurring('recipe', g.recipeId, groupPortions, checked)}
            onClose={() => setEditingGroupId(null)}
            onSave={() => handleSaveGroupPortions(g)}
            saving={savingGroupPortions}
          >
            {recipe.description && <p className="hint">{recipe.description}</p>}
            <h4 className="section-label">{t('meal.ingredients')} · {g.entries.length}</h4>
            <div className="entry-list">
              {g.entries.map((ing) => (
                <div className="entry-card" key={ing.id}>
                  <div className="entry-card-body" style={{ cursor: 'default' }}>
                    <div className="entry-card-name">{ing.label}</div>
                    <div className="entry-card-sub">
                      {Math.round(ing.quantity)} g · {Math.round(ing.kcal)} kcal
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="entry-icon-btn"
                      onClick={() => onUpdateEntry(ing.id, Math.max(5, Math.round(ing.quantity) - 10), 'g')}
                      aria-label={t('meal.decrease')}
                    >
                      <Icon name="minus" size={15} />
                    </button>
                    <button
                      type="button"
                      className="entry-icon-btn"
                      onClick={() => onUpdateEntry(ing.id, Math.round(ing.quantity) + 10, 'g')}
                      aria-label={t('meal.increase')}
                    >
                      <Icon name="plus" size={15} />
                    </button>
                    <button
                      type="button"
                      className="entry-icon-btn entry-delete-btn"
                      onClick={() => onDeleteEntry(ing.id)}
                      aria-label={t('meal.delete')}
                    >
                      <Icon name="trash-2" size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {recipe.steps.length > 0 && (
              <>
                <h4 className="section-label">{t('meal.steps')}</h4>
                {recipe.steps.map((step, i) => (
                  <div className="step-row" key={i}>
                    <span className="step-num">{i + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </>
            )}
          </EditEntrySheet>
        );
      })()}

    </div>
  );
}
