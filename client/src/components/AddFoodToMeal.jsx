import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import BarcodeScanner from './BarcodeScanner';
import { api } from '../api';
import { findRecurringItems } from './MealPlanner';
import { useLanguage } from '../i18n/LanguageContext';

function recipeMacrosPerPortion(recipe) {
  const totals = recipe.ingredients.reduce(
    (acc, i) => {
      acc.kcal += Number(i.kcal) || 0;
      acc.protein += Number(i.proteines) || 0;
      acc.carbs += Number(i.glucides) || 0;
      acc.fat += Number(i.lipides) || 0;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const portions = recipe.portions || 1;
  return {
    kcal: totals.kcal / portions,
    protein: totals.protein / portions,
    carbs: totals.carbs / portions,
    fat: totals.fat / portions,
  };
}

const MICRO_FIELDS = [
  { key: 'fiber', labelKey: 'nutrient.fiber', unit: 'g' },
  { key: 'sodium', labelKey: 'nutrient.sodium', unit: 'mg' },
  { key: 'potassium', labelKey: 'nutrient.potassium', unit: 'mg' },
  { key: 'magnesium', labelKey: 'nutrient.magnesium', unit: 'mg' },
  { key: 'calcium', labelKey: 'nutrient.calcium', unit: 'mg' },
  { key: 'zinc', labelKey: 'nutrient.zinc', unit: 'mg' },
  { key: 'iron', labelKey: 'nutrient.iron', unit: 'mg' },
  { key: 'selenium', labelKey: 'nutrient.selenium', unit: 'µg' },
  { key: 'iodine', labelKey: 'nutrient.iodine', unit: 'µg' },
  { key: 'vitamin_c', labelKey: 'nutrient.vitaminC', unit: 'mg' },
  { key: 'vitamin_a', labelKey: 'nutrient.vitaminA', unit: 'µg' },
  { key: 'vitamin_d', labelKey: 'nutrient.vitaminD', unit: 'UI' },
  { key: 'vitamin_e', labelKey: 'nutrient.vitaminE', unit: 'mg' },
  { key: 'vitamin_k', labelKey: 'nutrient.vitaminK', unit: 'µg' },
  { key: 'folate', labelKey: 'nutrient.folate', unit: 'µg' },
  { key: 'b12', labelKey: 'nutrient.b12', unit: 'µg' },
  { key: 'choline', labelKey: 'nutrient.choline', unit: 'mg' },
  { key: 'omega3', labelKey: 'nutrient.omega3', unit: 'mg' },
  { key: 'caffeine', labelKey: 'nutrient.caffeine', unit: 'mg' },
];

// Every micronutrient field starts blank, not 0 — left blank, the server auto-estimates it;
// explicitly typing 0 (e.g. "this really has no sodium") is a real value and is kept as entered.
const EMPTY_FOOD = {
  name: '',
  kcal_per_100g: '',
  protein_per_100g: '',
  carbs_per_100g: '',
  fat_per_100g: '',
  ...Object.fromEntries(MICRO_FIELDS.map((f) => [`${f.key}_per_100g`, ''])),
};

export default function AddFoodToMeal({
  mealKey,
  foods,
  recipes,
  favorites,
  frequentItems,
  onAddEntry,
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
  const TOOLS = [
    { key: 'search', icon: '🔍', label: t('addFood.toolSearch') },
    { key: 'barcode', icon: '▦', label: t('addFood.toolBarcode') },
    { key: 'write', icon: '✎', label: t('addFood.toolWrite') },
    { key: 'manual', icon: '+', label: t('addFood.toolManual') },
  ];
  const [activeTool, setActiveTool] = useState('search');
  const [search, setSearch] = useState('');
  const [itemKind, setItemKind] = useState('food');
  const [listMode, setListMode] = useState('frequent');
  const [viewingItem, setViewingItem] = useState(null);
  const [modalQty, setModalQty] = useState('100');
  const [modalUnit, setModalUnit] = useState('g');
  const [modalRecurring, setModalRecurring] = useState(false);
  const [savingModal, setSavingModal] = useState(false);
  const [recurringKeys, setRecurringKeys] = useState(new Set());
  const swipeRef = useRef(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanQty, setScanQty] = useState('100');
  const [scanStatus, setScanStatus] = useState(null);
  const [scanAdding, setScanAdding] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_FOOD);
  const [textInput, setTextInput] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [editingFood, setEditingFood] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editPortion, setEditPortion] = useState(100);
  const [editSaving, setEditSaving] = useState(false);
  const [onlineResults, setOnlineResults] = useState(null);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState(null);
  const [onlineSearchedFor, setOnlineSearchedFor] = useState(null);

  const allItems = useMemo(() => {
    const foodItems = foods.map((f) => ({
      type: 'food',
      id: f.id,
      name: f.name,
      subtitle: `${Math.round(f.kcal_per_100g)} kcal / 100 g`,
    }));
    const recipeItems = recipes.map((r) => ({
      type: 'recipe',
      id: r.id,
      name: r.title,
      subtitle: '1 portion',
    }));
    return [...foodItems, ...recipeItems];
  }, [foods, recipes]);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return allItems.filter((item) => item.name.toLowerCase().includes(term)).slice(0, 25);
  }, [search, allItems]);

  const frequentForKind = useMemo(
    () => frequentItems.filter((f) => f.source_type === itemKind),
    [frequentItems, itemKind]
  );

  const frequentDisplayItems = useMemo(() => {
    return [...frequentForKind]
      .sort((a, b) => b.use_count - a.use_count)
      .map((f) => allItems.find((item) => item.type === f.source_type && item.id === f.source_id))
      .filter(Boolean);
  }, [frequentForKind, allItems]);

  const recentDisplayItems = useMemo(() => {
    return [...frequentForKind]
      .sort((a, b) => new Date(b.last_used) - new Date(a.last_used))
      .map((f) => allItems.find((item) => item.type === f.source_type && item.id === f.source_id))
      .filter(Boolean);
  }, [frequentForKind, allItems]);

  const favoriteKeySet = useMemo(
    () => new Set(favorites.map((f) => `${f.source_type}-${f.source_id}`)),
    [favorites]
  );

  const favoriteDisplayItems = useMemo(() => {
    return favorites
      .filter((f) => f.source_type === itemKind)
      .map(
        (f) =>
          allItems.find((item) => item.type === f.source_type && item.id === f.source_id) || {
            type: f.source_type,
            id: f.source_id,
            name: f.label,
            subtitle: '',
          }
      );
  }, [favorites, itemKind, allItems]);

  const allDisplayItems = useMemo(
    () => allItems.filter((item) => item.type === itemKind),
    [allItems, itemKind]
  );

  const browseListItems =
    listMode === 'frequent'
      ? frequentDisplayItems
      : listMode === 'recent'
      ? recentDisplayItems
      : listMode === 'favorite'
      ? favoriteDisplayItems
      : allDisplayItems;

  const refreshRecurringKeys = useCallback(async () => {
    if (!mealKey) return;
    const p = await api.getMealPlan();
    const items = findRecurringItems(p.entries, mealKey, p.days);
    setRecurringKeys(new Set(items.map((it) => `${it.source_type}-${it.source_id}`)));
  }, [mealKey]);

  useEffect(() => {
    refreshRecurringKeys();
  }, [refreshRecurringKeys]);

  // A dish becomes "recurring" by duplicating it across all 7 days in meal_plan_entries (same
  // mechanism the weekly planner reads via findRecurringItems) — toggled here per food/recipe
  // instead of from a separate planner screen. The checkbox always starts unchecked and is
  // one-directional: checking it (re-)marks the item recurring. Leaving it unchecked is a no-op —
  // it must NEVER un-mark an already-recurring item, otherwise logging it again for a second
  // portion (without re-checking the box) would silently turn recurring back off.
  async function syncRecurring(sourceType, sourceId, quantity, shouldBeRecurring) {
    if (!mealKey || !shouldBeRecurring) return;
    const key = `${sourceType}-${sourceId}`;
    if (recurringKeys.has(key)) return;

    const currentPlan = await api.getMealPlan();
    // Only wipe the meal's existing entries first if it ISN'T already a clean recurring set
    // (e.g. messy leftovers from a generated week) — adding a 2nd recurring item alongside an
    // already-consistent one (yogurt -> +fruit) must not nuke what's already there.
    const mealEntries = currentPlan.entries.filter((e) => e.meal === mealKey);
    const recurring = findRecurringItems(currentPlan.entries, mealKey, currentPlan.days);
    const isCleanlyRecurring = recurring.length > 0 && mealEntries.length === recurring.length * currentPlan.days.length;
    if (!isCleanlyRecurring) {
      for (const e of mealEntries) await api.deleteMealPlanEntry(e.id);
    }
    await api.applyMealPlanToWeek({ meal: mealKey, source_type: sourceType, source_id: sourceId, quantity });
    await refreshRecurringKeys();
  }

  async function openItemDetail(item) {
    setViewingItem(item);
    setModalQty(item.type === 'food' ? '100' : '1');
    setModalUnit('g');
    // Always starts unchecked — it's a one-shot "mark this as recurring right now" action, not
    // a reflection of whatever the current status happens to be.
    setModalRecurring(false);
    setSavingModal(false);
    // Default quantity is more useful as whatever amount was last logged for this same meal
    // (e.g. Flexpresso is always 30g at breakfast, a recipe is always 2 portions at dinner) —
    // falls back to 100g / 1 portion the first time a food/recipe is logged for that meal.
    if (!mealKey) return;
    try {
      const { quantity } = await api.getLastQuantity(item.type, item.id, mealKey);
      if (quantity) setModalQty(String(quantity));
    } catch {
      // keep the 100g / 1 portion default if the lookup fails
    }
  }

  async function handleModalSave() {
    // Adding + optionally marking recurring is several sequential requests — guard against a
    // second click firing while the first is still in flight (which duplicated the journal
    // entry, since onAddEntry always logs regardless of the recurring outcome).
    if (savingModal) return;
    const qty = Number(modalQty);
    if (!qty) return;
    setSavingModal(true);
    try {
      await onAddEntry(viewingItem.type, viewingItem.id, qty, viewingItem.type === 'food' ? modalUnit : 'g');
      await syncRecurring(viewingItem.type, viewingItem.id, qty, modalRecurring);
      setViewingItem(null);
    } finally {
      setSavingModal(false);
    }
  }

  const viewingItemMacros = useMemo(() => {
    if (!viewingItem) return null;
    const qty = Number(modalQty) || 0;
    if (viewingItem.type === 'food') {
      const food = foods.find((f) => f.id === viewingItem.id);
      if (!food) return null;
      const factor = qty / 100;
      return {
        kcal: food.kcal_per_100g * factor,
        protein: food.protein_per_100g * factor,
        carbs: food.carbs_per_100g * factor,
        fat: food.fat_per_100g * factor,
      };
    }
    const recipe = recipes.find((r) => r.id === viewingItem.id);
    if (!recipe) return null;
    const perPortion = recipeMacrosPerPortion(recipe);
    return {
      kcal: perPortion.kcal * qty,
      protein: perPortion.protein * qty,
      carbs: perPortion.carbs * qty,
      fat: perPortion.fat * qty,
    };
  }, [viewingItem, modalQty, foods, recipes]);

  const scanResultMacros = useMemo(() => {
    if (!scanResult) return null;
    const factor = (Number(scanQty) || 0) / 100;
    return {
      kcal: scanResult.kcal_per_100g * factor,
      protein: scanResult.protein_per_100g * factor,
      carbs: scanResult.carbs_per_100g * factor,
      fat: scanResult.fat_per_100g * factor,
    };
  }, [scanResult, scanQty]);

  function handleToggleFavorite(item) {
    const key = `${item.type}-${item.id}`;
    if (favoriteKeySet.has(key)) {
      const fav = favorites.find((f) => f.source_type === item.type && f.source_id === item.id);
      if (fav) onRemoveFavorite(fav.id);
    } else {
      onAddFavorite({ source_type: item.type, source_id: item.id, label: item.name });
    }
  }

  async function handleBarcodeDetected(code) {
    setScanStatus({ text: t('addFood.searchingProduct') });
    setScanResult(null);
    try {
      const result = await onLookupBarcode(code);
      setScanResult(result);
      setScanQty(String(Math.round(result.suggestedQuantity || 100)));
      setScanStatus(null);
    } catch (err) {
      setScanStatus({ text: err.message || t('addFood.productNotFound'), error: true });
    }
  }

  async function handleSearchOnline() {
    const term = search.trim();
    if (!term) return;
    setOnlineLoading(true);
    setOnlineError(null);
    setOnlineResults(null);
    try {
      const products = await onSearchOnline(term);
      setOnlineResults(products);
      setOnlineSearchedFor(term);
    } catch (err) {
      setOnlineError(err.message || t('addFood.onlineSearchUnavailable'));
    } finally {
      setOnlineLoading(false);
    }
  }

  function handlePickOnlineResult(product) {
    setScanResult(product);
    setScanQty(String(Math.round(product.suggestedQuantity || 100)));
  }

  async function handleParseText() {
    if (!textInput.trim()) return;
    setTextLoading(true);
    setScanStatus({ text: t('addFood.analyzing') });
    setScanResult(null);
    try {
      const result = await onParseText(textInput.trim());
      setScanResult(result);
      setScanQty(String(Math.round(result.suggestedQuantity || 100)));
      setScanStatus(null);
      setTextInput('');
    } catch (err) {
      setScanStatus({ text: err.message || t('addFood.analysisFailed'), error: true });
    } finally {
      setTextLoading(false);
    }
  }

  async function handleAddScanResult() {
    // Guards against the double/triple-tap that happens when the request is slow and the button
    // gives no feedback in the meantime — each extra tap used to fire its own insertFoodLog and
    // the item ended up logged 2-4x.
    if (scanAdding) return;
    setScanAdding(true);
    try {
      const qty = Number(scanQty) || 100;
      const food = await onCreateFood(scanResult);
      await onAddEntry('food', food.id, qty);
      setScanResult(null);
      setScanQty('100');
    } finally {
      setScanAdding(false);
    }
  }

  function handleManualChange(e) {
    setManualForm({ ...manualForm, [e.target.name]: e.target.value });
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!manualForm.name.trim() || manualForm.kcal_per_100g === '') return;
    const payload = {
      name: manualForm.name.trim(),
      kcal_per_100g: Number(manualForm.kcal_per_100g),
      protein_per_100g: Number(manualForm.protein_per_100g) || 0,
      carbs_per_100g: Number(manualForm.carbs_per_100g) || 0,
      fat_per_100g: Number(manualForm.fat_per_100g) || 0,
    };
    // Left-blank micronutrients are omitted entirely (not sent as 0) so the server knows to
    // auto-estimate them; a field the user actually typed into — 0 included — is sent as-is.
    for (const f of MICRO_FIELDS) {
      const key = `${f.key}_per_100g`;
      if (manualForm[key] !== '') payload[key] = Number(manualForm[key]) || 0;
    }
    const food = await onCreateFood(payload);
    await onAddEntry('food', food.id, 100);
    setManualForm(EMPTY_FOOD);
  }

  function openEditFood(item) {
    const food = foods.find((f) => f.id === item.id);
    if (!food) return;
    setEditingFood(food);
    setEditPortion(100);
    setEditForm({
      name: food.name,
      kcal_per_100g: food.kcal_per_100g,
      protein_per_100g: food.protein_per_100g,
      carbs_per_100g: food.carbs_per_100g,
      fat_per_100g: food.fat_per_100g,
      ...Object.fromEntries(MICRO_FIELDS.map((f) => [`${f.key}_per_100g`, food[`${f.key}_per_100g`] || 0])),
    });
  }

  // editForm always stores canonical per-100g values — the form displays/edits them scaled to
  // whatever "reference portion" is picked (e.g. 30g), so you can type "80mg caffeine for my
  // 30g shot" directly instead of doing the per-100g math yourself.
  function editDisplayValue(field) {
    const per100 = Number(editForm[field]) || 0;
    const val = (per100 * editPortion) / 100;
    return Math.round(val * 100) / 100;
  }

  function handleEditFieldChange(field, displayVal) {
    const portion = editPortion || 100;
    const per100 = (Number(displayVal) || 0) * 100 / portion;
    setEditForm((prev) => ({ ...prev, [field]: per100 }));
  }

  async function handleSaveEditFood(e) {
    e.preventDefault();
    setEditSaving(true);
    try {
      await onUpdateFood(editingFood.id, editForm);
      setEditingFood(null);
      setEditForm(null);
    } finally {
      setEditSaving(false);
    }
  }

  function renderItemRow(item) {
    const isFavorite = favoriteKeySet.has(`${item.type}-${item.id}`);
    return (
      <div className="row" key={`${item.type}-${item.id}`}>
        <div className="name clickable" onClick={() => openItemDetail(item)}>
          <span>{item.name}</span>
          <span className="rate">{item.subtitle}</span>
        </div>
        <div className="field">
          <button
            type="button"
            className={isFavorite ? 'star-btn active' : 'star-btn'}
            title={t('addFood.addToFavorites')}
            onClick={() => handleToggleFavorite(item)}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          {item.type === 'food' && (
            <button
              type="button"
              className="btn-ghost"
              title={t('addFood.editNutrition')}
              onClick={() => openEditFood(item)}
            >
              ✎
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            title={item.type === 'food' ? t('addFood.deleteFood') : t('addFood.deleteRecipe')}
            onClick={() => (item.type === 'food' ? onDeleteFood(item.id) : onDeleteRecipe(item.id))}
          >
            🗑
          </button>
        </div>
      </div>
    );
  }

  const showingSearch = search.trim().length > 0;

  return (
    <div>
      <h2>{t('addFood.title')}</h2>
      <div className="card">
        <div className="tool-menu-row">
          {TOOLS.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className={tool.key === activeTool ? 'tool-tile active' : 'tool-tile'}
              onClick={() => setActiveTool(tool.key)}
            >
              <span className="tool-tile-icon">{tool.icon}</span>
              <span className="tool-tile-label">{tool.label}</span>
            </button>
          ))}
        </div>

        {activeTool === 'barcode' && (
          <>
            <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setActiveTool('search')} />
            {scanStatus && <p className={scanStatus.error ? 'hint error' : 'hint'}>{scanStatus.text}</p>}
          </>
        )}

        {activeTool === 'write' && (
          <>
            <textarea
              className="wide"
              rows={4}
              placeholder={t('addFood.writePlaceholder')}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
            <button type="button" className="btn btn-block" onClick={handleParseText} disabled={textLoading}>
              {textLoading ? t('addFood.analyzingAction') : t('addFood.analyzeAction')}
            </button>
            {scanStatus && <p className={scanStatus.error ? 'hint error' : 'hint'}>{scanStatus.text}</p>}
          </>
        )}

        {activeTool === 'manual' && (
          <form onSubmit={handleManualSubmit}>
            <div className="row">
              <label>{t('addFood.name')}</label>
              <div className="field">
                <input type="text" name="name" value={manualForm.name} onChange={handleManualChange} placeholder={t('addFood.namePlaceholder')} />
              </div>
            </div>
            <div className="row">
              <label>{t('addFood.kcalPer100g')}</label>
              <div className="field">
                <input type="number" name="kcal_per_100g" min="0" step="any" value={manualForm.kcal_per_100g} onChange={handleManualChange} />
                <span className="unit">kcal</span>
              </div>
            </div>
            <div className="row">
              <label>{t('addFood.proteinPer100g')}</label>
              <div className="field">
                <input type="number" name="protein_per_100g" min="0" step="any" value={manualForm.protein_per_100g} onChange={handleManualChange} />
                <span className="unit">g</span>
              </div>
            </div>
            <div className="row">
              <label>{t('addFood.carbsPer100g')}</label>
              <div className="field">
                <input type="number" name="carbs_per_100g" min="0" step="any" value={manualForm.carbs_per_100g} onChange={handleManualChange} />
                <span className="unit">g</span>
              </div>
            </div>
            <div className="row">
              <label>{t('addFood.fatPer100g')}</label>
              <div className="field">
                <input type="number" name="fat_per_100g" min="0" step="any" value={manualForm.fat_per_100g} onChange={handleManualChange} />
                <span className="unit">g</span>
              </div>
            </div>

            <h4 className="section-label">{t('addFood.micronutrientsPer100g')}</h4>
            {MICRO_FIELDS.map((f) => (
              <div className="row" key={f.key}>
                <label>{t(f.labelKey)}</label>
                <div className="field">
                  <input
                    type="number"
                    name={`${f.key}_per_100g`}
                    min="0"
                    step="any"
                    placeholder={t('addFood.autoEstimate')}
                    value={manualForm[`${f.key}_per_100g`]}
                    onChange={handleManualChange}
                  />
                  <span className="unit">{f.unit}</span>
                </div>
              </div>
            ))}

            <div className="card-actions">
              <button type="submit" className="btn">
                {t('addFood.createAndAdd')}
              </button>
            </div>
          </form>
        )}

        {activeTool === 'search' && (
          <>
            <input
              type="text"
              className="wide search-input"
              placeholder={t('addFood.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOnlineResults(null);
                setOnlineError(null);
              }}
            />

            {showingSearch ? (
              results.length === 0 ? (
                <>
                  <p className="hint">{t('addFood.noLibraryResults')}</p>
                  {onSearchOnline && (
                    <>
                      {onlineSearchedFor === search.trim() && onlineResults ? null : (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={handleSearchOnline}
                          disabled={onlineLoading}
                        >
                          {onlineLoading ? t('addFood.searching') : t('addFood.searchOnline')}
                        </button>
                      )}
                      {onlineError && <p className="hint error">{onlineError}</p>}
                      {onlineResults && onlineResults.length === 0 && (
                        <p className="hint">{t('addFood.noOnlineResults').replace('{term}', onlineSearchedFor)}</p>
                      )}
                      {onlineResults &&
                        onlineResults.map((product, i) => (
                          <div className="row" key={i}>
                            <div className="name clickable" onClick={() => handlePickOnlineResult(product)}>
                              <span>{product.name}</span>
                              <span className="rate">{Math.round(product.kcal_per_100g)} kcal / 100 g</span>
                            </div>
                          </div>
                        ))}
                    </>
                  )}
                  {!onSearchOnline && <p className="hint">{t('addFood.tryOtherTools')}</p>}
                </>
              ) : (
                results.map(renderItemRow)
              )
            ) : (
              <>
                <div className="type-list-row">
                  <select className="pill-select" value={itemKind} onChange={(e) => setItemKind(e.target.value)}>
                    <option value="food">{t('addFood.kindFood')}</option>
                    <option value="recipe">{t('addFood.kindRecipe')}</option>
                  </select>
                  <select className="pill-select" value={listMode} onChange={(e) => setListMode(e.target.value)}>
                    <option value="frequent">{t('addFood.modeFrequent')}</option>
                    <option value="recent">{t('addFood.modeRecent')}</option>
                    <option value="favorite">{t('addFood.modeFavorite')}</option>
                    <option value="all">{t('addFood.modeAll')}</option>
                  </select>
                </div>

                {browseListItems.length === 0 ? (
                  <p className="hint">
                    {listMode === 'favorite'
                      ? t('addFood.noFavorites')
                      : listMode === 'all'
                      ? t('addFood.noItemsAll')
                      : t('addFood.noHistory')}
                  </p>
                ) : (
                  browseListItems.map(renderItemRow)
                )}
              </>
            )}

          </>
        )}
      </div>

      {viewingItem && (
        <div className="modal-overlay" onClick={() => setViewingItem(null)}>
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
              if (dx > 80 && Math.abs(dy) < 60) setViewingItem(null);
            }}
          >
            <h2>{viewingItem.name}</h2>
            {viewingItemMacros && (
              <div className="tile-grid">
                <div className="tile">
                  <b style={{ fontSize: 16 }}>{Math.round(viewingItemMacros.kcal)}</b>
                  <span>kcal</span>
                </div>
                <div className="tile">
                  <b>{viewingItemMacros.carbs.toFixed(1)} g</b>
                  <span>{t('nutrient.carbs')}</span>
                </div>
                <div className="tile">
                  <b>{viewingItemMacros.protein.toFixed(1)} g</b>
                  <span>{t('nutrient.protein')}</span>
                </div>
                <div className="tile">
                  <b>{viewingItemMacros.fat.toFixed(1)} g</b>
                  <span>{t('nutrient.fat')}</span>
                </div>
              </div>
            )}
            <h4 className="section-label">{t('addFood.quantity')}</h4>
            <div className="qty-editor">
              <div className="qty-editor-row">
                <input
                  type="number"
                  min="0"
                  step={viewingItem.type === 'food' ? '1' : 'any'}
                  value={modalQty}
                  onChange={(e) => setModalQty(e.target.value)}
                />
                {viewingItem.type === 'food' ? (
                  <select
                    className="qty-editor-unit-select"
                    value={modalUnit}
                    onChange={(e) => setModalUnit(e.target.value)}
                  >
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                  </select>
                ) : (
                  <span className="qty-editor-unit">{t('addFood.portion')}</span>
                )}
              </div>
              {viewingItem.type === 'food' && modalUnit === 'ml' && (
                <p className="hint">{t('addFood.waterNote')}</p>
              )}
              {mealKey && (
                <label className="recurring-toggle-row">
                  <input
                    type="checkbox"
                    checked={modalRecurring}
                    onChange={(e) => setModalRecurring(e.target.checked)}
                  />
                  <span>{t('addFood.recurringMeal')}</span>
                </label>
              )}
              <button type="button" className="btn btn-block" onClick={handleModalSave} disabled={savingModal}>
                {savingModal ? t('addFood.saving') : t('addFood.save')}
              </button>
            </div>
          </div>
          <button type="button" className="done-btn" onClick={() => setViewingItem(null)}>
            {t('addFood.close')}
          </button>
        </div>
      )}

      {scanResult && (
        <div className="modal-overlay" onClick={() => setScanResult(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{scanResult.name}</h2>
            {scanResultMacros && (
              <div className="tile-grid">
                <div className="tile">
                  <b style={{ fontSize: 16 }}>{Math.round(scanResultMacros.kcal)}</b>
                  <span>kcal</span>
                </div>
                <div className="tile">
                  <b>{scanResultMacros.carbs.toFixed(1)} g</b>
                  <span>{t('nutrient.carbs')}</span>
                </div>
                <div className="tile">
                  <b>{scanResultMacros.protein.toFixed(1)} g</b>
                  <span>{t('nutrient.protein')}</span>
                </div>
                <div className="tile">
                  <b>{scanResultMacros.fat.toFixed(1)} g</b>
                  <span>{t('nutrient.fat')}</span>
                </div>
              </div>
            )}
            <h4 className="section-label">{t('addFood.quantity')}</h4>
            <div className="qty-editor">
              <div className="qty-editor-row">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={scanQty}
                  onChange={(e) => setScanQty(e.target.value)}
                />
                <span className="qty-editor-unit">g</span>
              </div>
              <button type="button" className="btn btn-block" onClick={handleAddScanResult} disabled={scanAdding}>
                {scanAdding ? t('addFood.saving') : t('addFood.save')}
              </button>
            </div>
          </div>
          <button type="button" className="done-btn" onClick={() => setScanResult(null)}>
            {t('addFood.close')}
          </button>
        </div>
      )}

      {editingFood && editForm && (
        <div className="modal-overlay" onClick={() => setEditingFood(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{t('addFood.editTitle').replace('{name}', editingFood.name)}</h2>
            <form onSubmit={handleSaveEditFood}>
              <div className="row">
                <label>{t('addFood.name')}</label>
                <div className="field">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="row">
                <label>{t('addFood.referencePortion')}</label>
                <div className="field">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={editPortion}
                    onChange={(e) => setEditPortion(Number(e.target.value) || 100)}
                  />
                  <span className="unit">g</span>
                </div>
              </div>
              <p className="hint">{t('addFood.referenceHint')}</p>
              <div className="row">
                <label>{t('addFood.kcalPer100g').replace('100g', `${editPortion}g`)}</label>
                <div className="field">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editDisplayValue('kcal_per_100g')}
                    onChange={(e) => handleEditFieldChange('kcal_per_100g', e.target.value)}
                  />
                  <span className="unit">kcal</span>
                </div>
              </div>
              <div className="row">
                <label>{t('addFood.proteinPer100g').replace('100g', `${editPortion}g`)}</label>
                <div className="field">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editDisplayValue('protein_per_100g')}
                    onChange={(e) => handleEditFieldChange('protein_per_100g', e.target.value)}
                  />
                  <span className="unit">g</span>
                </div>
              </div>
              <div className="row">
                <label>{t('addFood.carbsPer100g').replace('100g', `${editPortion}g`)}</label>
                <div className="field">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editDisplayValue('carbs_per_100g')}
                    onChange={(e) => handleEditFieldChange('carbs_per_100g', e.target.value)}
                  />
                  <span className="unit">g</span>
                </div>
              </div>
              <div className="row">
                <label>{t('addFood.fatPer100g').replace('100g', `${editPortion}g`)}</label>
                <div className="field">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editDisplayValue('fat_per_100g')}
                    onChange={(e) => handleEditFieldChange('fat_per_100g', e.target.value)}
                  />
                  <span className="unit">g</span>
                </div>
              </div>

              <h4 className="section-label">{t('addFood.micronutrientsFor').replace('{portion}', editPortion)}</h4>
              {MICRO_FIELDS.map((f) => (
                <div className="row" key={f.key}>
                  <label>{t(f.labelKey)}</label>
                  <div className="field">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={editDisplayValue(`${f.key}_per_100g`)}
                      onChange={(e) => handleEditFieldChange(`${f.key}_per_100g`, e.target.value)}
                    />
                    <span className="unit">{f.unit}</span>
                  </div>
                </div>
              ))}

              <button type="submit" className="btn btn-block" disabled={editSaving}>
                {editSaving ? t('addFood.saving') : t('addFood.save')}
              </button>
            </form>
            <button type="button" className="done-btn" onClick={() => setEditingFood(null)}>
              {t('addFood.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
