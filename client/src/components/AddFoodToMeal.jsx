import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import BarcodeScanner from './BarcodeScanner';
import CameraCapture from './CameraCapture';
import { api } from '../api';
import { findRecurringItems } from './MealPlanner';
import { useLanguage } from '../i18n/LanguageContext';
import Icon from './Icon';

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
  mealLabel,
  foods,
  baseFoods = [],
  recipes,
  favorites,
  frequentItems,
  onAddEntry,
  onLookupBarcode,
  onSearchOnline,
  onCreateFood,
  onDeleteFood,
  onParseText,
  onParsePhoto,
}) {
  const { t, lang } = useLanguage();
  const TOOLS = [
    { key: 'barcode', icon: 'scan-barcode', label: t('addFood.toolBarcode') },
    { key: 'write', icon: 'sparkles', label: t('addFood.toolWrite') },
    { key: 'photo', icon: 'camera', label: t('addFood.toolPhoto') },
    { key: 'manual', icon: 'pencil-line', label: t('addFood.toolManual') },
  ];
  const photoInputRef = useRef(null);
  const [showCamera, setShowCamera] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [search, setSearch] = useState('');
  const [itemKind, setItemKind] = useState('food');
  const [listMode, setListMode] = useState('frequent');
  const [viewingItem, setViewingItem] = useState(null);
  // Guards a double tap on a base food, which would otherwise fire two creations at once.
  // The name of the base food being created, so its row can say it is working. A tap that takes
  // a moment and shows nothing is a tap the user repeats — which is how one food became three.
  const [creatingBase, setCreatingBase] = useState(null);
  // Armed by a first tap on the bin, destructive on the second. Deleting a food is not something
  // to do by brushing past it in a list.
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [modalQty, setModalQty] = useState('100');
  const [modalUnit, setModalUnit] = useState('g');
  const [modalRecurring, setModalRecurring] = useState(false);
  const [excludedIngredients, setExcludedIngredients] = useState(new Set());
  const [ingredientOverrides, setIngredientOverrides] = useState({});
  const [savingModal, setSavingModal] = useState(false);
  const [recurringKeys, setRecurringKeys] = useState(new Set());
  const swipeRef = useRef(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanSource, setScanSource] = useState(null);
  const [editingResult, setEditingResult] = useState(false);
  const [scanQty, setScanQty] = useState('100');
  const [scanStatus, setScanStatus] = useState(null);
  const [scanAdding, setScanAdding] = useState(false);
  // Photo recognition can misread a dish — instead of forcing the user into per-macro number
  // edits right away, this offers the same fix a mis-heard voice order gets: redescribe it in
  // plain text and let the same text-analysis pipeline (onParseText) re-run on the correction.
  const [correctingResult, setCorrectingResult] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_FOOD);
  const [textInput, setTextInput] = useState('');
  const [textLoading, setTextLoading] = useState(false);
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
      macros: { protein: f.protein_per_100g, carbs: f.carbs_per_100g, fat: f.fat_per_100g, fiber: f.fiber_per_100g },
    }));
    const recipeItems = recipes.map((r) => {
      const perPortion = recipeMacrosPerPortion(r);
      return {
        type: 'recipe',
        id: r.id,
        name: r.title,
        subtitle: '1 portion',
        macros: { protein: perPortion.protein, carbs: perPortion.carbs, fat: perPortion.fat, fiber: perPortion.fiber },
      };
    });
    return [...foodItems, ...recipeItems];
  }, [foods, recipes]);

  // The staple catalogue, offered only for what the user doesn't already have: once a base food
  // has been picked it exists in `foods` under the same name, and showing both would be two rows
  // for one food, one of which silently recreates the other.
  const baseItems = useMemo(() => {
    const owned = new Set(foods.map((f) => f.name.trim().toLowerCase()));
    return (
      baseFoods
        // Both names are checked, not just the displayed one: a food added while the app was in
        // French must not be offered again in English, or the same rice lands in the library
        // twice under two names — and the dedupe on the server, which matches names, cannot catch
        // it either.
        .filter((f) => !owned.has(f.name.trim().toLowerCase()) && !owned.has((f.en || '').trim().toLowerCase()))
        .map((f) => {
          const label = lang === 'en' && f.en ? f.en : f.name;
          return {
            type: 'base',
            id: `base-${f.name}`,
            name: label,
            // Searching in one language must find a food named in the other: the interface may be
            // English while the habit of typing "poulet" is not.
            searchNames: [f.name, f.en].filter(Boolean),
            subtitle: `${Math.round(f.kcal)} kcal / 100 g`,
            macros: { protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber },
            group: f.group,
            base: { ...f, label },
          };
        })
    );
  }, [baseFoods, foods, lang]);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const mine = allItems.filter((item) => item.name.toLowerCase().includes(term));
    // Own foods first: what you have already logged beats a generic entry with the same name.
    const base =
      itemKind === 'food'
        ? baseItems.filter((item) => item.searchNames.some((n) => n.toLowerCase().includes(term)))
        : [];
    return [...mine, ...base].slice(0, 40);
  }, [search, allItems, baseItems, itemKind]);

  // The catalogue laid out by nutritional role, so it can be browsed for what a day is short of
  // rather than searched by name.
  const BASE_GROUP_ORDER = [
    'proteines',
    'feculents',
    'legumineuses',
    'legumes',
    'fruits',
    'bonnes_graisses',
    'laitiers',
    'plats',
    'boissons',
    'condiments',
  ];

  const baseGroups = useMemo(() => {
    const byGroup = new Map();
    for (const item of baseItems) {
      const key = item.group || 'condiments';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(item);
    }
    const known = BASE_GROUP_ORDER.filter((k) => byGroup.has(k));
    const rest = [...byGroup.keys()].filter((k) => !BASE_GROUP_ORDER.includes(k));
    return [...known, ...rest].map((key) => ({ key, items: byGroup.get(key) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseItems]);

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
    if (!isCleanlyRecurring && mealEntries.length > 0) {
      await api.deleteMealPlanEntries(mealEntries.map((e) => e.id));
    }
    await api.applyMealPlanToWeek({ meal: mealKey, source_type: sourceType, source_id: sourceId, quantity });
    await refreshRecurringKeys();
  }

  async function openItemDetail(item) {
    // A base food has no row yet, so it cannot be logged: create it first (POST /api/foods
    // dedupes by name, so picking the same one twice reuses the row) and carry on as if it had
    // always been in the library — the quantity modal, units, favourites and recurring all work
    // off a real food id.
    if (item.type === 'base') {
      if (creatingBase) return;
      setCreatingBase(item.name);
      try {
        // The catalogue carries its own micronutrients, so they travel with the creation: a value
        // sent is a value the server treats as known, which is what keeps it from spending an AI
        // call (and, right now, failing) on a number that was already written down.
        const micros = {};
        for (const [key, value] of Object.entries(item.base.micros || {})) {
          micros[`${key}_per_100g`] = value;
        }
        const created = await onCreateFood({
          name: item.base.label,
          kcal_per_100g: item.base.kcal,
          protein_per_100g: item.base.protein,
          carbs_per_100g: item.base.carbs,
          fat_per_100g: item.base.fat,
          fiber_per_100g: item.base.fiber,
          ...micros,
        });
        // macros100 rides along because `foods` may not have re-rendered yet when the modal opens,
        // and the preview reads from it rather than showing an empty card for a beat.
        item = {
          type: 'food',
          id: created.id,
          name: created.name,
          subtitle: `${Math.round(created.kcal_per_100g)} kcal / 100 g`,
          macros: item.macros,
          macros100: {
            kcal: created.kcal_per_100g,
            protein: created.protein_per_100g,
            carbs: created.carbs_per_100g,
            fat: created.fat_per_100g,
            fiber: created.fiber_per_100g || 0,
          },
        };
      } finally {
        setCreatingBase(null);
      }
    }
    setViewingItem(item);
    setModalQty(item.type === 'food' ? '100' : '1');
    setModalUnit('g');
    // Always starts unchecked — it's a one-shot "mark this as recurring right now" action, not
    // a reflection of whatever the current status happens to be.
    setModalRecurring(false);
    setExcludedIngredients(new Set());
    setIngredientOverrides({});
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
      // Ingredients excluded or resized in the preview travel with the add itself. They used to be
      // patched back out afterwards, one request per touched ingredient with a full journal
      // refresh behind each — visible churn, and an interruption left the excluded ones logged.
      const adjustments =
        viewingItem.type === 'recipe' && (excludedIngredients.size > 0 || Object.keys(ingredientOverrides).length > 0)
          ? { excluded: [...excludedIngredients], overrides: ingredientOverrides }
          : null;
      await onAddEntry(viewingItem.type, viewingItem.id, qty, viewingItem.type === 'food' ? modalUnit : 'g', adjustments);
      await syncRecurring(viewingItem.type, viewingItem.id, qty, modalRecurring);
      setViewingItem(null);
      // Adding a recipe used to push straight on into its ingredient list, so a specific
      // ingredient could be trimmed before the add was really "done". It read as the app asking
      // for the portions twice — that screen opens with the same portions stepper — so the add now
      // ends here. Tapping the recipe in the meal still opens it for anyone who wants to adjust.
    } finally {
      setSavingModal(false);
    }
  }

  const viewingItemMacros = useMemo(() => {
    if (!viewingItem) return null;
    const qty = Number(modalQty) || 0;
    if (viewingItem.type === 'food') {
      const food = foods.find((f) => f.id === viewingItem.id) || (viewingItem.macros100
        ? {
            kcal_per_100g: viewingItem.macros100.kcal,
            protein_per_100g: viewingItem.macros100.protein,
            carbs_per_100g: viewingItem.macros100.carbs,
            fat_per_100g: viewingItem.macros100.fat,
            fiber_per_100g: viewingItem.macros100.fiber,
          }
        : null);
      if (!food) return null;
      const factor = qty / 100;
      return {
        kcal: food.kcal_per_100g * factor,
        protein: food.protein_per_100g * factor,
        carbs: food.carbs_per_100g * factor,
        fat: food.fat_per_100g * factor,
        fiber: (food.fiber_per_100g || 0) * factor,
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
      fiber: (perPortion.fiber || 0) * qty,
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
      fiber: (scanResult.fiber_per_100g || 0) * factor,
    };
  }, [scanResult, scanQty]);

  async function handleBarcodeDetected(code) {
    setScanStatus({ text: t('addFood.searchingProduct') });
    setScanResult(null);
    try {
      const result = await onLookupBarcode(code);
      setScanResult(result);
      setScanQty(String(Math.round(result.suggestedQuantity || 100)));
      setScanStatus(null);
      setActiveTool(null);
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
      setActiveTool(null);
    } catch (err) {
      setScanStatus({ text: err.message || t('addFood.analysisFailed'), error: true });
    } finally {
      setTextLoading(false);
    }
  }

  async function processPhotoFile(file) {
    if (!file || !onParsePhoto) return;
    setShowCamera(false);
    setTextLoading(true);
    setScanStatus({ text: t('addFood.analyzing') });
    setScanResult(null);
    setActiveTool('photo');
    try {
      const result = await onParsePhoto(file);
      setScanResult(result);
      setScanSource('photo');
      setScanQty(String(Math.round(result.suggestedQuantity || 100)));
      setScanStatus(null);
      setActiveTool(null);
    } catch (err) {
      setScanStatus({ text: err.message || t('addFood.analysisFailed'), error: true });
    } finally {
      setTextLoading(false);
    }
  }

  function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    processPhotoFile(file);
  }

  function handleStartCorrection() {
    setCorrectionText(scanResult.name);
    setCorrectingResult(true);
  }

  async function handleSubmitCorrection() {
    const text = correctionText.trim();
    if (!text || correctionLoading) return;
    setCorrectionLoading(true);
    try {
      const result = await onParseText(text);
      setScanResult(result);
      setScanQty(String(Math.round(result.suggestedQuantity || 100)));
      setCorrectingResult(false);
    } catch (err) {
      setScanStatus({ text: err.message || t('addFood.analysisFailed'), error: true });
    } finally {
      setCorrectionLoading(false);
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
      setEditingResult(false);
    } finally {
      setScanAdding(false);
    }
  }

  function handleManualChange(e) {
    setManualForm({ ...manualForm, [e.target.name]: e.target.value });
  }

  function handleManualSubmit(e) {
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
    // Same confirm-before-adding step as write/photo/barcode, not an immediate save — manual
    // entry is exactly as unverified as an AI/scan guess until the user actually confirms it.
    setScanResult(payload);
    setScanQty('100');
    setManualForm(EMPTY_FOOD);
    setActiveTool(null);
  }

  function renderItemRow(item) {
    const pending = item.type === 'base' && creatingBase === item.name;
    // Only from the full list, and only for the user's own foods: the catalogue is read-only, and
    // a bin next to every search result is a bin that gets hit by accident.
    const deletable = Boolean(onDeleteFood) && item.type === 'food' && listMode === 'all' && !search.trim();
    const confirming = confirmDeleteId === item.id;
    return (
      <div className={pending ? 'result-row pending' : 'result-row'} key={`${item.type}-${item.id}`}>
        <div className="result-row-body" onClick={() => !creatingBase && openItemDetail(item)}>
          <div className="result-row-name">
            {item.name}
            {/* Says where the row comes from: a catalogue entry is a generic average, not the
                packet in your cupboard, and picking it copies it into your own foods. */}
            {item.type === 'base' && <span className="base-food-tag">{t('addFood.baseTag')}</span>}
          </div>
          <div className="result-row-sub">{item.subtitle}</div>
          {item.macros && (
            <div className="entry-card-macros">
              <span>
                <i style={{ background: 'var(--macro-protein)' }} />
                {Math.round(item.macros.protein)}g
              </span>
              <span>
                <i style={{ background: 'var(--macro-carb)' }} />
                {Math.round(item.macros.carbs)}g
              </span>
                <span>
                  <i style={{ background: 'var(--macro-fat)' }} />
                  {Math.round(item.macros.fat)}g
                </span>
                <span>
                  <i style={{ background: 'var(--macro-fiber)' }} />
                  {Math.round(item.macros.fiber || 0)}g
                </span>
              </div>
            )}
        </div>
        <div className="result-row-actions">
          {deletable && (
            <button
              type="button"
              className={confirming ? 'entry-icon-btn entry-delete-btn confirming' : 'entry-icon-btn entry-delete-btn'}
              aria-label={t('addFood.deleteFood')}
              onClick={async () => {
                if (!confirming) {
                  setConfirmDeleteId(item.id);
                  return;
                }
                setConfirmDeleteId(null);
                await onDeleteFood(item.id);
              }}
            >
              <Icon name="trash-2" size={16} />
            </button>
          )}
          <button
            type="button"
            className="result-add-btn"
            disabled={Boolean(creatingBase)}
            onClick={() => openItemDetail(item)}
          >
            <Icon name={pending ? 'loader' : 'plus'} size={19} />
          </button>
        </div>
      </div>
    );
  }

  const showingSearch = search.trim().length > 0;

  return (
    <div>
      <h2>{t('addFood.title')}</h2>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoSelected}
      />
      {showCamera && (
        <CameraCapture
          onCapture={processPhotoFile}
          onClose={() => setShowCamera(false)}
          onPickLibrary={() => {
            setShowCamera(false);
            photoInputRef.current?.click();
          }}
          onFallback={() => {
            setShowCamera(false);
            photoInputRef.current?.click();
          }}
        />
      )}
      <div className="card">
        <div className="type-list-row">
          <button
            type="button"
            className={itemKind === 'food' ? 'type-pill active' : 'type-pill'}
            onClick={() => setItemKind('food')}
          >
            {t('addFood.kindFood')}
          </button>
          <button
            type="button"
            className={itemKind === 'recipe' ? 'type-pill active' : 'type-pill'}
            onClick={() => setItemKind('recipe')}
          >
            {t('addFood.kindRecipe')}
          </button>
        </div>

        <div className="tool-menu-row">
          {TOOLS.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className={tool.key === activeTool ? 'tool-tile active' : 'tool-tile'}
              onClick={() => (tool.key === 'photo' ? setShowCamera(true) : setActiveTool(tool.key))}
            >
              <Icon name={tool.icon} size={20} />
              <span className="tool-tile-label">{tool.label}</span>
            </button>
          ))}
        </div>

        <div className="search-input-row">
          <Icon name="search" size={18} color="var(--text-muted)" />
          <input
            type="text"
            className="search-input"
            placeholder={t('addFood.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOnlineResults(null);
              setOnlineError(null);
            }}
          />
        </div>

        {showingSearch ? (
              results.length === 0 ? (
                <div style={{ marginTop: 14 }}>
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
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>{results.map(renderItemRow)}</div>
              )
            ) : (
              <>
                <div className="filter-pill-row">
                  {[
                    ['frequent', t('addFood.modeFrequent')],
                    ['recent', t('addFood.modeRecent')],
                    ['favorite', t('addFood.modeFavorite')],
                    ['all', t('addFood.modeAll')],
                    // Only for foods: the catalogue holds no recipes. Without this the staples
                    // were reachable only by typing their name, which is no help at all when the
                    // point is to find out what is in there.
                    ...(itemKind === 'food' ? [['base', t('addFood.modeBase')]] : []),
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={listMode === key ? 'filter-pill active' : 'filter-pill'}
                      onClick={() => setListMode(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {listMode === 'base' ? (
                  baseGroups.length === 0 ? (
                    <p className="hint">{t('addFood.baseAllAdded')}</p>
                  ) : (
                    baseGroups.map((group) => (
                      <div key={group.key}>
                        <div className="section-header">
                          <span className="section-title">{t(`baseGroup.${group.key}`)}</span>
                          <span className="section-hint">{group.items.length}</span>
                        </div>
                        {group.items.map(renderItemRow)}
                      </div>
                    ))
                  )
                ) : browseListItems.length === 0 ? (
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
      </div>

      {activeTool === 'write' && (
        <div className="modal-overlay" onClick={() => setActiveTool(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setActiveTool(null)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('addFood.toolWrite')}</div>
              </div>
            </div>
            <textarea
              className="wide"
              rows={6}
              placeholder={t('addFood.writePlaceholder')}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              autoFocus
            />
            {scanStatus && <p className={scanStatus.error ? 'hint error' : 'hint'}>{scanStatus.text}</p>}
          </div>
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              handleParseText();
            }}
            disabled={textLoading || !textInput.trim()}
          >
            {textLoading ? t('addFood.analyzingAction') : t('addFood.analyzeAction')}
          </button>
        </div>
      )}

      {activeTool === 'photo' && (
        <div className="modal-overlay" onClick={() => !textLoading && setActiveTool(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setActiveTool(null)} aria-label={t('meal.close')} disabled={textLoading}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('addFood.toolPhoto')}</div>
              </div>
            </div>
            <p className="hint">{scanStatus ? scanStatus.text : t('addFood.analyzing')}</p>
          </div>
        </div>
      )}

      {activeTool === 'barcode' && (
        <div className="modal-overlay" onClick={() => setActiveTool(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setActiveTool(null)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('addFood.toolBarcode')}</div>
              </div>
            </div>
            <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setActiveTool(null)} />
            {scanStatus && <p className={scanStatus.error ? 'hint error' : 'hint'}>{scanStatus.text}</p>}
          </div>
        </div>
      )}

      {activeTool === 'manual' && (
        <div className="modal-overlay" onClick={() => setActiveTool(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setActiveTool(null)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{t('addFood.toolManual')}</div>
              </div>
            </div>
            <form onSubmit={handleManualSubmit}>
              <div className="row">
                <label>{t('addFood.name')}</label>
                <div className="field">
                  <input type="text" name="name" value={manualForm.name} onChange={handleManualChange} placeholder={t('addFood.namePlaceholder')} autoFocus />
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
            </form>
          </div>
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              handleManualSubmit(e);
            }}
            disabled={!manualForm.name.trim() || manualForm.kcal_per_100g === ''}
          >
            {t('addFood.continueAction')}
          </button>
        </div>
      )}

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
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <button type="button" className="meal-detail-back-btn" onClick={() => setViewingItem(null)} aria-label={t('meal.close')}>
                <Icon name="x" size={20} />
              </button>
              <div className="meal-detail-heading">
                {mealLabel && <div className="day-nav-subtitle">{mealLabel}</div>}
                <div className="meal-detail-title" style={{ fontSize: 21 }}>{viewingItem.name}</div>
              </div>
            </div>

            <h4 className="section-label">{t('addFood.quantity')}</h4>
            <div className="qty-stepper-row">
              <button
                type="button"
                className="weight-minus-btn"
                onClick={() => setModalQty(String(Math.max(viewingItem.type === 'food' ? 5 : 0.5, Number(modalQty) - (viewingItem.type === 'food' ? 10 : 0.5))))}
              >
                <Icon name="minus" size={18} />
              </button>
              <div className="qty-stepper-value">
                <span className="weight-value">{modalQty}</span>{' '}
                <span className="rate">{viewingItem.type === 'food' ? modalUnit : t('addFood.portion')}</span>
              </div>
              <button
                type="button"
                className="weight-plus-btn qty-stepper-plus"
                onClick={() => setModalQty(String(Number(modalQty) + (viewingItem.type === 'food' ? 10 : 0.5)))}
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
            {viewingItem.type === 'food' && (
              <div className="type-list-row" style={{ marginTop: 10 }}>
                {['g', 'ml'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={modalUnit === u ? 'type-pill active' : 'type-pill'}
                    onClick={() => setModalUnit(u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
            {viewingItem.type === 'food' && modalUnit === 'ml' && (
              <p className="hint">{t('addFood.waterNote')}</p>
            )}

            {viewingItemMacros && (
              <>
                <h4 className="section-label">{t('addFood.forThisPortion')}</h4>
                <div className="portion-tile-row">
                  <div className="portion-tile">
                    <b>{Math.round(viewingItemMacros.kcal)}</b>
                    <span>kcal</span>
                  </div>
                  <div className="portion-tile">
                    <b style={{ color: 'var(--macro-protein)' }}>{Math.round(viewingItemMacros.protein)}</b>
                    <span>{t('nutrient.protein')}</span>
                  </div>
                  <div className="portion-tile">
                    <b style={{ color: 'var(--macro-carb)' }}>{Math.round(viewingItemMacros.carbs)}</b>
                    <span>{t('nutrient.carbs')}</span>
                  </div>
                  <div className="portion-tile">
                    <b style={{ color: 'var(--macro-fat)' }}>{Math.round(viewingItemMacros.fat)}</b>
                    <span>{t('nutrient.fat')}</span>
                  </div>
                  <div className="portion-tile">
                    <b style={{ color: 'var(--macro-fiber)' }}>{Math.round(viewingItemMacros.fiber)}</b>
                    <span>{t('nutrient.fiber')}</span>
                  </div>
                </div>
              </>
            )}

            {viewingItem.type === 'recipe' && (() => {
              const recipe = recipes.find((r) => r.id === viewingItem.id);
              if (!recipe) return null;
              const scale = (Number(modalQty) || 0) / (recipe.portions || 1);
              return (
                <>
                  <h4 className="section-label">
                    {t('meal.ingredients')} · {recipe.ingredients.length - excludedIngredients.size}
                  </h4>
                  <div className="entry-list">
                    {recipe.ingredients
                      .filter((ing) => !excludedIngredients.has(ing.nom))
                      .map((ing, i) => {
                        const defaultQty = Math.round((Number(ing.qte) || 0) * scale);
                        const qty = ingredientOverrides[ing.nom] ?? defaultQty;
                        const kcalPerUnit = (Number(ing.qte) || 0) > 0 ? (Number(ing.kcal) || 0) / Number(ing.qte) : 0;
                        return (
                          <div className="entry-card" key={i}>
                            <div className="entry-card-body" style={{ cursor: 'default' }}>
                              <div className="entry-card-name">{ing.nom}</div>
                              <div className="entry-card-sub">
                                {qty} {ing.unite || 'g'} · {Math.round(kcalPerUnit * qty)} kcal
                              </div>
                            </div>
                            <div className="row" style={{ gap: 6 }}>
                              <button
                                type="button"
                                className="entry-icon-btn"
                                onClick={() =>
                                  setIngredientOverrides((prev) => ({ ...prev, [ing.nom]: Math.max(0, qty - 10) }))
                                }
                                aria-label={t('meal.decrease')}
                              >
                                <Icon name="minus" size={15} />
                              </button>
                              <button
                                type="button"
                                className="entry-icon-btn"
                                onClick={() =>
                                  setIngredientOverrides((prev) => ({ ...prev, [ing.nom]: qty + 10 }))
                                }
                                aria-label={t('meal.increase')}
                              >
                                <Icon name="plus" size={15} />
                              </button>
                              <button
                                type="button"
                                className="entry-icon-btn entry-delete-btn"
                                onClick={() =>
                                  setExcludedIngredients((prev) => new Set(prev).add(ing.nom))
                                }
                                aria-label={t('meal.delete')}
                              >
                                <Icon name="trash-2" size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              );
            })()}

            {mealKey && (
              <>
                <h4 className="section-label">{t('addFood.recurringSection')}</h4>
                <div
                  className={modalRecurring ? 'recurring-feature-row active' : 'recurring-feature-row'}
                  onClick={() => setModalRecurring((r) => !r)}
                >
                  <span className="recurring-feature-icon">
                    <Icon name="repeat" size={20} />
                  </span>
                  <div className="recurring-feature-body">
                    <div className="recurring-feature-title">{t('addFood.markRecurring')}</div>
                    <div className="recurring-feature-desc">{t('addFood.markRecurringDesc')}</div>
                  </div>
                  <span className={modalRecurring ? 'recurring-feature-check checked' : 'recurring-feature-check'}>
                    <Icon name="check" size={16} />
                  </span>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className="done-btn done-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              handleModalSave();
            }}
            disabled={savingModal}
          >
            {savingModal ? t('addFood.saving') : t('addFood.save')}
          </button>
        </div>
      )}

      {scanResult && (
        <div
          className="modal-overlay"
          onClick={() => {
            setScanResult(null);
            setEditingResult(false);
            setCorrectingResult(false);
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="meal-detail-header" style={{ marginBottom: 4 }}>
              <div className="meal-detail-heading">
                <div className="meal-detail-title" style={{ fontSize: 21 }}>
                  {correctingResult ? t('addFood.modify') : editingResult ? t('addFood.modify') : scanResult.name}
                </div>
              </div>
              <button
                type="button"
                className="modal-back-text-btn"
                onClick={() => {
                  if (correctingResult) {
                    setCorrectingResult(false);
                    return;
                  }
                  setScanResult(null);
                  setEditingResult(false);
                }}
              >
                {t('meal.back')}
              </button>
            </div>

            {correctingResult ? (
              <>
                <p className="hint" style={{ marginBottom: 12 }}>{t('addFood.correctDescriptionHint')}</p>
                <textarea
                  className="wide correct-description-input"
                  rows={5}
                  value={correctionText}
                  onChange={(e) => setCorrectionText(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn btn-block" style={{ marginTop: 16 }} onClick={handleSubmitCorrection} disabled={correctionLoading}>
                  {correctionLoading ? t('addFood.analyzingAction') : t('addFood.adjustMeal')}
                </button>
              </>
            ) : editingResult ? (
              <>
                <div className="row">
                  <label>{t('addFood.name')}</label>
                  <div className="field">
                    <input type="text" value={scanResult.name} onChange={(e) => setScanResult({ ...scanResult, name: e.target.value })} />
                  </div>
                </div>
                <div className="row">
                  <label>{t('addFood.kcalPer100g')}</label>
                  <div className="field">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={scanResult.kcal_per_100g}
                      onChange={(e) => setScanResult({ ...scanResult, kcal_per_100g: Number(e.target.value) })}
                    />
                    <span className="unit">kcal</span>
                  </div>
                </div>
                <div className="row">
                  <label>{t('addFood.proteinPer100g')}</label>
                  <div className="field">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={scanResult.protein_per_100g}
                      onChange={(e) => setScanResult({ ...scanResult, protein_per_100g: Number(e.target.value) })}
                    />
                    <span className="unit">g</span>
                  </div>
                </div>
                <div className="row">
                  <label>{t('addFood.carbsPer100g')}</label>
                  <div className="field">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={scanResult.carbs_per_100g}
                      onChange={(e) => setScanResult({ ...scanResult, carbs_per_100g: Number(e.target.value) })}
                    />
                    <span className="unit">g</span>
                  </div>
                </div>
                <div className="row">
                  <label>{t('addFood.fatPer100g')}</label>
                  <div className="field">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={scanResult.fat_per_100g}
                      onChange={(e) => setScanResult({ ...scanResult, fat_per_100g: Number(e.target.value) })}
                    />
                    <span className="unit">g</span>
                  </div>
                </div>
                <button type="button" className="btn btn-block" onClick={() => setEditingResult(false)}>
                  {t('addFood.doneEditing')}
                </button>
              </>
            ) : (
              scanResultMacros && (
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
                  <div className="tile">
                    <b>{scanResultMacros.fiber.toFixed(1)} g</b>
                    <span>{t('nutrient.fiber')}</span>
                  </div>
                </div>
              )
            )}

            {!correctingResult && (
              <>
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
                  {!editingResult && (
                    <button
                      type="button"
                      className="btn-block-secondary"
                      onClick={() => (scanSource === 'photo' ? handleStartCorrection() : setEditingResult(true))}
                    >
                      {t('addFood.modify')}
                    </button>
                  )}
                  <button type="button" className="btn btn-block" onClick={handleAddScanResult} disabled={scanAdding}>
                    {scanAdding ? t('addFood.saving') : t('addFood.confirm')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
