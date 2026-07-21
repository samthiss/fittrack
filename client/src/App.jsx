import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import RecipeList from './components/RecipeList';
import HomeDashboard from './components/HomeDashboard';
import MealDetail from './components/MealDetail';
import BottomTabBar from './components/BottomTabBar';
import Report from './components/Report';
import ActivitesScreen from './components/ActivitesScreen';
import WeightTracker from './components/WeightTracker';
import WeightReport from './components/WeightReport';
import MealPlanner from './components/MealPlanner';
import Settings from './components/Settings';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import { useLanguage } from './i18n/LanguageContext';
import './App.css';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDateStr(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function MainApp({ onLogout, account }) {
  const { t } = useLanguage();
  const [view, setView] = useState('journal');
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [autoOpenAdd, setAutoOpenAdd] = useState(false);
  const [profile, setProfile] = useState(null);
  const [activityTypes, setActivityTypes] = useState([]);
  const [water, setWater] = useState({ logs: [], totalMl: 0 });
  const [recipes, setRecipes] = useState([]);
  const [foods, setFoods] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [mealData, setMealData] = useState(null);
  const [mealFavorites, setMealFavorites] = useState([]);
  const [recipeFavorites, setRecipeFavorites] = useState([]);
  const [frequentFoods, setFrequentFoods] = useState([]);
  const [summary, setSummary] = useState(null);
  const [date, setDate] = useState(todayStr());

  const refreshCore = useCallback(async () => {
    // Today's recurring activities flow in automatically, same idea as the meal plan auto-apply.
    // Scoped to today only, same reasoning as the meal plan: back/forward-filling other days
    // would misrepresent what was actually done.
    if (date === todayStr()) {
      try {
        await api.applyActivityPlanToLog(date);
      } catch {
        // no plan yet, or nothing to add — fine either way
      }
    }
    const [profileData, typesData, summaryData, waterData] = await Promise.all([
      api.getProfile(),
      api.getActivityTypes(),
      api.getSummary(date),
      api.getWater(date),
    ]);
    setProfile(profileData);
    setActivityTypes(typesData);
    setSummary(summaryData);
    setWater(waterData);
  }, [date]);

  const refreshRecipes = useCallback(async () => {
    setRecipes(await api.getRecipes());
  }, []);

  const refreshFoods = useCallback(async () => {
    setFoods(await api.getFoods());
  }, []);

  const refreshDashboard = useCallback(async () => {
    // Today's fixed/planned meals flow into the Journal automatically — no need to visit
    // Planning and click "Ajouter au Journal" by hand. Already-logged meals are left alone
    // (the endpoint skips them), so this is safe to call on every refresh. Scoped to today
    // only: silently back- or forward-filling other days would misrepresent what was eaten.
    if (date === todayStr()) {
      try {
        await api.applyMealPlanToJournal(date);
      } catch {
        // no plan yet, or nothing to add — fine either way
      }
    }
    setDashboard(await api.getDashboard(date));
  }, [date]);

  const refreshMeal = useCallback(
    async (key) => {
      if (!key) return;
      setMealData(await api.getMeal(key, date));
    },
    [date]
  );

  const refreshMealFavorites = useCallback(async (key) => {
    if (!key) return;
    setMealFavorites(await api.getMealFavorites(key));
  }, []);

  const refreshFrequentFoods = useCallback(async () => {
    setFrequentFoods(await api.getFrequentFoods(40));
  }, []);

  const refreshRecipeFavorites = useCallback(async () => {
    setRecipeFavorites(await api.getAllMealFavorites());
  }, []);

  useEffect(() => {
    refreshCore();
    refreshRecipes();
    refreshFoods();
    refreshDashboard();
    refreshFrequentFoods();
    refreshRecipeFavorites();
  }, [refreshCore, refreshRecipes, refreshFoods, refreshDashboard, refreshFrequentFoods, refreshRecipeFavorites]);

  useEffect(() => {
    if (selectedMeal) {
      refreshMeal(selectedMeal);
      refreshMealFavorites(selectedMeal);
    }
  }, [selectedMeal, refreshMeal, refreshMealFavorites]);

  async function handleProfileSave(data) {
    await api.updateProfile(data);
    await refreshCore();
    await refreshDashboard();
    if (selectedMeal) await refreshMeal(selectedMeal);
  }

  async function handleActivityTypeUpdate(type, kcalPerHour) {
    await api.updateActivityType(type, { kcal_per_hour: kcalPerHour });
    await refreshCore();
  }

  async function handleAddWater() {
    await api.addWater(date);
    setWater(await api.getWater(date));
  }

  async function handleRemoveLastWater() {
    const last = water.logs[water.logs.length - 1];
    if (!last) return;
    await api.deleteWater(last.id);
    setWater(await api.getWater(date));
  }

  async function handleImportRecipe(data) {
    const recipe = await api.importRecipe(data);
    await refreshRecipes();
    return recipe;
  }

  async function handleCreateRecipe(data) {
    const recipe = await api.createRecipe(data);
    await refreshRecipes();
    return recipe;
  }

  async function handleSetRecipeCategories(recipe, mealKeys) {
    for (const meal of mealKeys) {
      await api.addMealFavorite({ meal, source_type: 'recipe', source_id: recipe.id, label: recipe.title });
    }
    await refreshRecipeFavorites();
  }

  async function handleUpdateRecipe(id, data) {
    const recipe = await api.updateRecipe(id, data);
    await refreshRecipes();
    return recipe;
  }

  async function handleDeleteRecipe(id) {
    await api.deleteRecipe(id);
    await refreshRecipes();
    await refreshFrequentFoods();
  }

  // Adding a recipe straight from the Recettes library (not from a Journal meal screen) has no
  // "current meal" context to fall back on — the caller picks the meal explicitly.
  async function handleQuickAddRecipe(mealKey, recipeId, quantity) {
    await api.addFoodLogEntry({ date, meal: mealKey, source_type: 'recipe', source_id: recipeId, quantity });
    if (selectedMeal === mealKey) await refreshMeal(mealKey);
    await refreshDashboard();
    await refreshFrequentFoods();
  }

  async function handleToggleRecipeFavorite(mealKeys, recipe, isFavorite) {
    for (const meal of mealKeys) {
      if (isFavorite) {
        const fav = recipeFavorites.find(
          (f) => f.meal === meal && f.source_type === 'recipe' && f.source_id === recipe.id
        );
        if (fav) await api.deleteMealFavorite(fav.id);
      } else {
        await api.addMealFavorite({ meal, source_type: 'recipe', source_id: recipe.id, label: recipe.title });
      }
    }
    await refreshRecipeFavorites();
  }

  async function handleCreateFoodInline(data) {
    const food = await api.addFood(data);
    await refreshFoods();
    return food;
  }

  async function handleAddEntry(sourceType, sourceId, quantity, unit = 'g') {
    const rows = await api.addFoodLogEntry({
      date,
      meal: selectedMeal,
      source_type: sourceType,
      source_id: sourceId,
      quantity,
      unit,
    });
    await refreshMeal(selectedMeal);
    await refreshDashboard();
    await refreshFrequentFoods();
    // A food logged in ml (e.g. milk, coffee) also counts toward the water total.
    setWater(await api.getWater(date));
    return rows;
  }

  async function handleDeleteEntry(id) {
    await api.deleteFoodLogEntry(id);
    await refreshMeal(selectedMeal);
    await refreshDashboard();
    await refreshFrequentFoods();
    setWater(await api.getWater(date));
  }

  async function handleUpdateEntry(id, quantity, unit) {
    await api.updateFoodLogEntry(id, quantity, unit);
    await refreshMeal(selectedMeal);
    await refreshDashboard();
    setWater(await api.getWater(date));
  }

  function handlePrevDay() {
    setDate((d) => shiftDateStr(d, -1));
  }

  function handleNextDay() {
    setDate((d) => shiftDateStr(d, 1));
  }

  function handleSelectMeal(key, openAdd = false) {
    setSelectedMeal(key);
    setAutoOpenAdd(openAdd);
  }

  function handleBackFromMeal() {
    setSelectedMeal(null);
    setAutoOpenAdd(false);
    setMealData(null);
    setMealFavorites([]);
  }

  function handleViewChange(next) {
    setView(next);
    setSelectedMeal(null);
    setMealData(null);
    setMealFavorites([]);
    // Activities logged from the Activités tab can target any day, not just the Journal's
    // currently-selected date — refresh on return so burned-kcal reflects those edits.
    if (next === 'journal') refreshDashboard();
  }

  return (
    <div className="app">
      <div className="shell">
        <main className="app-main">
          {view === 'journal' && !selectedMeal && (
            <HomeDashboard
              dashboard={dashboard}
              date={date}
              onPrevDay={handlePrevDay}
              onNextDay={handleNextDay}
              onSelectMeal={handleSelectMeal}
              water={water}
              onAddWater={handleAddWater}
              onRemoveLastWater={handleRemoveLastWater}
              onOpenWeight={() => setView('poids')}
              onOpenReport={() => setView('rapport')}
              onOpenWeightReport={() => setView('poids-rapport')}
            />
          )}
          {view === 'journal' && selectedMeal && (
            <MealDetail
              meal={mealData}
              autoOpenAdd={autoOpenAdd}
              foods={foods}
              recipes={recipes}
              favorites={mealFavorites}
              frequentItems={frequentFoods}
              onBack={handleBackFromMeal}
              onAddEntry={handleAddEntry}
              onDeleteEntry={handleDeleteEntry}
              onUpdateEntry={handleUpdateEntry}
              onLookupBarcode={api.lookupFood}
              onSearchOnline={api.searchFoodsOnline}
              onCreateFood={handleCreateFoodInline}
              onParseText={api.parseFoodText}
              onParsePhoto={api.parseFoodPhoto}
            />
          )}
          {view === 'recettes' && (
            <RecipeList
              recipes={recipes}
              onUpdate={handleUpdateRecipe}
              onDelete={handleDeleteRecipe}
              favorites={recipeFavorites}
              onToggleFavorite={handleToggleRecipeFavorite}
              foods={foods}
              meals={dashboard?.meals || []}
              onImportRecipe={handleImportRecipe}
              onCreateRecipe={handleCreateRecipe}
              onSetCategories={handleSetRecipeCategories}
              onQuickAddRecipe={handleQuickAddRecipe}
            />
          )}
          {view === 'rapport' && <Report />}
          {view === 'activites' && <ActivitesScreen />}
          {view === 'poids' && (
            <>
              <button type="button" className="btn-ghost back-btn" onClick={() => setView('journal')} aria-label={t('common.back')}>
                &lt;
              </button>
              <WeightTracker />
            </>
          )}
          {view === 'poids-rapport' && <WeightReport onBack={() => setView('journal')} />}
          {view === 'planning' && <MealPlanner recipes={recipes} foods={foods} />}
          {view === 'reglages' && (
            <Settings
              profile={profile}
              summary={summary}
              activityTypes={activityTypes}
              email={account.email}
              mustChangePassword={account.mustChangePassword}
              onSaveProfile={handleProfileSave}
              onUpdateActivityType={handleActivityTypeUpdate}
              onLogout={onLogout}
            />
          )}
        </main>
      </div>

      <BottomTabBar view={view} onChange={handleViewChange} />
    </div>
  );
}

function App() {
  // undefined = still checking, null = not authenticated, object = { id, email, mustChangePassword }
  const [account, setAccount] = useState(undefined);

  useEffect(() => {
    api
      .getMe()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  async function handleLogout() {
    await api.logout();
    setAccount(null);
  }

  if (account === undefined) return null;
  if (!account) return <AuthScreen onAuthenticated={setAccount} />;
  if (!account.onboardingCompleted) {
    return (
      <Onboarding
        onDone={() => setAccount((a) => ({ ...a, onboardingCompleted: true }))}
      />
    );
  }
  return <MainApp account={account} onLogout={handleLogout} />;
}

export default App;
