import { useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../i18n/LanguageContext';

const MEAL_KEYS = ['breakfast', 'snack', 'lunch', 'dinner'];

function recipeTotals(recipe) {
  return recipe.ingredients.reduce(
    (acc, i) => {
      acc.kcal += Number(i.kcal) || 0;
      acc.protein += Number(i.proteines) || 0;
      acc.carbs += Number(i.glucides) || 0;
      acc.fat += Number(i.lipides) || 0;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export default function RecipeDetail({
  recipe,
  categoryLabel,
  onBack,
  onEdit,
  onDelete,
  onToggleFavorite,
  onQuickAdd,
  categoryGroups,
  activeCategoryKeys,
  onToggleCategory,
}) {
  const { t } = useLanguage();
  const [showAdd, setShowAdd] = useState(false);
  const [addMeal, setAddMeal] = useState('lunch');
  const [addPortions, setAddPortions] = useState(recipe.portions || 1);
  const [saving, setSaving] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const totals = recipeTotals(recipe);
  const p = recipe.portions || 1;

  async function handleConfirmAdd() {
    if (saving) return;
    setSaving(true);
    try {
      await onQuickAdd(addMeal, recipe.id, addPortions);
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="recipe-hero">
        {recipe.image ? (
          <img src={recipe.image} alt="" />
        ) : (
          <span className="recipe-hero-icon">
            <Icon name="salad" size={60} />
          </span>
        )}
        <button type="button" className="recipe-hero-back" onClick={onBack} aria-label={t('meal.back')}>
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="recipe-hero-actions">
          <button type="button" className="recipe-hero-edit-btn" onClick={onEdit}>
            <Icon name="pencil" size={18} />
            {t('recipeList.edit')}
          </button>
          <button
            type="button"
            className="recipe-hero-fav-btn"
            onClick={() => onToggleFavorite(recipe)}
            aria-label={t('recipeList.favoriteAria')}
          >
            <Icon name="star" size={20} color={recipe.favorite ? 'var(--warning)' : '#fff'} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 4 }}>
        {categoryLabel && <div className="day-nav-subtitle">{categoryLabel}</div>}
        <h1 style={{ lineHeight: 1.15, marginTop: 2 }}>{recipe.title}</h1>
        <div className="recipe-meta-row">
          {recipe.prep_minutes && (
            <span>
              <Icon name="clock" size={15} />
              {recipe.prep_minutes} min
            </span>
          )}
          <span>
            <Icon name="users" size={15} />
            {p} {t('addFood.portion')}
          </span>
          <span>
            <Icon name="flame" size={15} />
            {Math.round(totals.kcal / p)} kcal
          </span>
        </div>
      </div>

      <div className="portion-tile-row" style={{ marginTop: 16 }}>
        <div className="portion-tile">
          <b style={{ color: 'var(--macro-protein)' }}>{Math.round(totals.protein / p)}g</b>
          <span>{t('nutrient.protein')}</span>
        </div>
        <div className="portion-tile">
          <b style={{ color: 'var(--macro-carb)' }}>{Math.round(totals.carbs / p)}g</b>
          <span>{t('nutrient.carbs')}</span>
        </div>
        <div className="portion-tile">
          <b style={{ color: 'var(--macro-fat)' }}>{Math.round(totals.fat / p)}g</b>
          <span>{t('nutrient.fat')}</span>
        </div>
      </div>

      {categoryGroups && categoryGroups.length > 0 && (
        <>
          <h4 className="section-label" style={{ marginTop: 16 }}>{t('recipeList.categoryLabel')}</h4>
          <div className="filter-pill-row">
            {categoryGroups.map((g) => (
              <button
                key={g.key}
                type="button"
                className={activeCategoryKeys.has(g.key) ? 'filter-pill active' : 'filter-pill'}
                onClick={() => onToggleCategory(g)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </>
      )}

      <h2>{t('recipeList.ingredients')}</h2>
      <div className="entry-list">
        {recipe.ingredients.map((ing, i) => (
          <div className="recipe-ingredient-row" key={i} style={{ padding: '9px 0' }}>
            <span className="recipe-ingredient-dot" />
            <div className="recipe-ingredient-body">
              <div className="recipe-ingredient-name">{ing.nom}</div>
              <div className="recipe-ingredient-macros">
                <span>
                  <i style={{ background: 'var(--macro-protein)' }} />
                  {Math.round(ing.proteines || 0)}g
                </span>
                <span>
                  <i style={{ background: 'var(--macro-carb)' }} />
                  {Math.round(ing.glucides || 0)}g
                </span>
                <span>
                  <i style={{ background: 'var(--macro-fat)' }} />
                  {Math.round(ing.lipides || 0)}g
                </span>
              </div>
            </div>
            <span className="recipe-ingredient-qty">
              {ing.qte} {ing.unite || 'g'}
            </span>
          </div>
        ))}
      </div>

      {recipe.steps.length > 0 && showSteps && (
        <>
          <h2>{t('recipeList.steps')}</h2>
          {recipe.steps.map((step, i) => (
            <div className="step-row" key={i}>
              <span className="step-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </>
      )}

      <div className="recipe-detail-footer" style={{ marginTop: 22, marginBottom: 12 }}>
        <button
          type="button"
          className="weight-minus-btn"
          style={{ width: 52 }}
          onClick={() => setShowSteps((v) => !v)}
          aria-label={t('recipeList.steps')}
          disabled={recipe.steps.length === 0}
        >
          <Icon name="book-open" size={21} />
        </button>
        <button type="button" className="meal-add-cta" style={{ flex: 1 }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={20} />
          {t('activityLog.addToJournal')}
        </button>
      </div>

      <button
        type="button"
        className="btn-ghost"
        style={{ color: 'var(--danger)' }}
        onClick={() => onDelete(recipe.id)}
      >
        {t('recipeList.delete')}
      </button>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setShowAdd(false)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{recipe.title}</div>
              </div>
            </div>

            <h4 className="section-label">{t('recipeList.chooseMeal')}</h4>
            <div className="type-list-row" style={{ flexWrap: 'wrap', height: 'auto' }}>
              {MEAL_KEYS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={addMeal === m ? 'type-pill active' : 'type-pill'}
                  onClick={() => setAddMeal(m)}
                >
                  {t(`mealName.${m}`)}
                </button>
              ))}
            </div>

            <h4 className="section-label">{t('addFood.quantity')}</h4>
            <div className="qty-stepper-row">
              <button type="button" className="weight-minus-btn" onClick={() => setAddPortions((v) => Math.max(0.5, v - 0.5))}>
                <Icon name="minus" size={18} />
              </button>
              <div className="qty-stepper-value">
                <span className="weight-value">{addPortions}</span> <span className="rate">{t('addFood.portion')}</span>
              </div>
              <button type="button" className="weight-plus-btn qty-stepper-plus" onClick={() => setAddPortions((v) => v + 0.5)}>
                <Icon name="plus" size={18} />
              </button>
            </div>

            <div className="portion-tile-row" style={{ marginTop: 16 }}>
              <div className="portion-tile">
                <b>{Math.round((totals.kcal / p) * addPortions)}</b>
                <span>kcal</span>
              </div>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-protein)' }}>{Math.round((totals.protein / p) * addPortions)}</b>
                <span>{t('nutrient.protein')}</span>
              </div>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-carb)' }}>{Math.round((totals.carbs / p) * addPortions)}</b>
                <span>{t('nutrient.carbs')}</span>
              </div>
              <div className="portion-tile">
                <b style={{ color: 'var(--macro-fat)' }}>{Math.round((totals.fat / p) * addPortions)}</b>
                <span>{t('nutrient.fat')}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              handleConfirmAdd();
            }}
            disabled={saving}
          >
            {saving ? t('addFood.saving') : t('activityLog.addToJournal')}
          </button>
        </div>
      )}
    </div>
  );
}
