import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from './api';
import RecipeList from './components/RecipeList';
import HomeDashboard from './components/HomeDashboard';
import MealDetail from './components/MealDetail';
import BottomTabBar from './components/BottomTabBar';
import SessionBanner from './components/SessionBanner';
import Report from './components/Report';
import RichFoodsReport from './components/RichFoodsReport';
import ActivitesScreen from './components/ActivitesScreen';
import WeightReport from './components/WeightReport';
import MealPlanner from './components/MealPlanner';
import SupplementsScreen from './components/SupplementsScreen';
import Settings from './components/Settings';
import AuthScreen from './components/AuthScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import Onboarding from './components/Onboarding';
import { useLanguage } from './i18n/LanguageContext';
import { parseRestByReps } from './data/restTargets';
import { loadStoredSession, saveStoredSession } from './data/sessionStorage';
import { todayStr, shiftDateStr } from './data/dates';
import './App.css';

function MainApp({ onLogout, account }) {
  const { t } = useLanguage();
  const [restoredSession] = useState(() => loadStoredSession(account.id));
  // Come back where the workout was, not on the Journal: a restored session means the app died
  // under the user mid-exercise, and making them find their way back would be the same annoyance
  // one step later.
  // A notification tap lands on /?view=<screen> — without this the app would open on the Journal
  // and the reminder would have told the user nothing about where to go. A restored workout still
  // wins: the session is more urgent than a reminder that can be reached in one tap.
  const [view, setView] = useState(() => {
    if (restoredSession.session) return 'activites';
    const requested = new URLSearchParams(window.location.search).get('view');
    return requested === 'supplements' || requested === 'activites' ? requested : 'journal';
  });

  // The parameter has done its job once the screen is picked; leaving it in the URL would send
  // the user back to that screen on every later reload of the installed app.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [autoOpenAdd, setAutoOpenAdd] = useState(false);
  const [profile, setProfile] = useState(null);
  const [activityTypes, setActivityTypes] = useState([]);
  // Rest-per-rep-range setting (Réglages > Temps de repos), parsed once here and handed to the
  // exercise session's rest timer.
  const restByReps = useMemo(() => parseRestByReps(profile), [profile]);
  // A workout in progress outlives the Activités tab: ActivitesScreen is only mounted while that
  // tab is selected, so keeping the session down there meant a detour through Journal threw away
  // the sets already logged and stopped the session/rest timers. It also outlives the app itself,
  // via localStorage — see data/sessionStorage.js.
  const [session, setSession] = useState(restoredSession.session);
  const [sessionExercise, setSessionExercise] = useState(restoredSession.exercise);

  useEffect(() => {
    saveStoredSession(account.id, session, sessionExercise);
  }, [account.id, session, sessionExercise]);
  const [water, setWater] = useState({ logs: [], totalMl: 0 });
  const [supplements, setSupplements] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [foods, setFoods] = useState([]);
  // The staple catalogue never changes, so it is fetched once and not refreshed with the rest.
  const [baseFoods, setBaseFoods] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [mealData, setMealData] = useState(null);
  const [mealFavorites, setMealFavorites] = useState([]);
  const [recipeFavorites, setRecipeFavorites] = useState([]);
  const [frequentFoods, setFrequentFoods] = useState([]);
  const [summary, setSummary] = useState(null);
  // Sub-screen Réglages should open on when entered from elsewhere (null = its home list).
  const [settingsScreen, setSettingsScreen] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [activitesDate, setActivitesDate] = useState(todayStr());
  const [activites, setActivites] = useState([]);
  const [activitesPlan, setActivitesPlan] = useState([]);
  const [richFoodsKey, setRichFoodsKey] = useState(null);

  // Both dates are picked once, at mount — and FitTrack is a standalone home-screen app that can
  // sit open for days, so past midnight it kept showing yesterday as "today": yesterday's journal,
  // yesterday's activities, and no auto-apply of the meal plan or the recurring activities (both
  // are gated on the shown date being today). Rechecked when the app comes back to the foreground
  // and once a minute while it's up, which is enough for a boundary that moves once a day.
  //
  // Only a view still sitting on the old today follows the rollover: a date the user navigated to
  // deliberately is theirs, and must not be yanked out from under them.
  const lastKnownToday = useRef(todayStr());
  useEffect(() => {
    function checkRollover() {
      const today = todayStr();
      const previous = lastKnownToday.current;
      if (today === previous) return;
      lastKnownToday.current = today;
      setDate((d) => (d === previous ? today : d));
      setActivitesDate((d) => (d === previous ? today : d));
    }
    const id = setInterval(checkRollover, 60000);
    document.addEventListener('visibilitychange', checkRollover);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', checkRollover);
    };
  }, []);

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

  useEffect(() => {
    api
      .getBaseFoods()
      .then(setBaseFoods)
      .catch(() => setBaseFoods([]));
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

  const refreshSupplements = useCallback(async () => {
    try {
      setSupplements(await api.getSupplements(date));
    } catch {
      // Never leave it null: the Journal card and the Suppléments screen both key off this, and
      // a failed fetch must show an empty list rather than a blank screen.
      setSupplements({ date, supplements: [], dueCount: 0, takenCount: 0 });
    }
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

  // Owned here (not in ActivitesScreen) so switching tabs and back doesn't remount the screen's
  // state to empty and flash "0 kcal" while it refetches — same reasoning as refreshDashboard.
  const refreshActivites = useCallback(async () => {
    if (activitesDate === todayStr()) {
      try {
        await api.applyActivityPlanToLog(activitesDate);
      } catch {
        // no plan yet, or nothing to add — fine either way
      }
    }
    const [logs, plan] = await Promise.all([api.getActivities(activitesDate), api.getActivityPlan()]);
    setActivites(logs);
    setActivitesPlan(plan.entries);
  }, [activitesDate]);

  useEffect(() => {
    refreshCore();
    refreshRecipes();
    refreshFoods();
    refreshDashboard();
    refreshFrequentFoods();
    refreshRecipeFavorites();
    refreshSupplements();
  }, [refreshCore, refreshRecipes, refreshFoods, refreshDashboard, refreshFrequentFoods, refreshRecipeFavorites, refreshSupplements]);

  useEffect(() => {
    refreshActivites();
  }, [refreshActivites]);

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

  async function handleAddWater(amountMl) {
    await api.addWater(date, amountMl);
    setWater(await api.getWater(date));
  }

  async function handleRemoveLastWater() {
    const last = water.logs[water.logs.length - 1];
    if (!last) return;
    await api.deleteWater(last.id);
    setWater(await api.getWater(date));
  }

  // Every supplement route answers with the whole day's list, so one call is enough — no refetch.
  async function handleAddSupplement(data) {
    setSupplements(await api.addSupplement({ ...data, date }));
  }

  async function handleUpdateSupplement(id, data) {
    setSupplements(await api.updateSupplement(id, { ...data, date }));
  }

  async function handleDeleteSupplement(id) {
    setSupplements(await api.deleteSupplement(id, date));
  }

  async function handleToggleSupplement(id, taken) {
    setSupplements(await api.setSupplementTaken(id, date, taken));
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

  async function handleAddEntry(sourceType, sourceId, quantity, unit = 'g', ingredientAdjustments = null) {
    const rows = await api.addFoodLogEntry({
      date,
      meal: selectedMeal,
      source_type: sourceType,
      source_id: sourceId,
      quantity,
      unit,
      ingredient_adjustments: ingredientAdjustments,
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

  // One call, then one refresh — the point of the dedicated route is that the journal is never
  // rendered mid-rebuild, half its ingredients gone.
  async function handleSetRecipePortions(recipeId, portions) {
    await api.setRecipePortions({ date, meal: selectedMeal, recipe_id: recipeId, portions });
    await refreshMeal(selectedMeal);
    await refreshDashboard();
    await refreshFrequentFoods();
    setWater(await api.getWater(date));
  }

  async function handleDeleteRecipeGroup(recipeId) {
    await api.deleteRecipeGroup({ date, meal: selectedMeal, recipe_id: recipeId });
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
    // Only the journal's TDEE card deep-links into a settings sub-screen; reaching Réglages any
    // other way (the tab bar) must land on its home list as before.
    setSettingsScreen(null);
    setSelectedMeal(null);
    setMealData(null);
    setMealFavorites([]);
    // Activities logged from the Activités tab can target any day, not just the Journal's
    // currently-selected date — refresh on return so burned-kcal reflects those edits.
    if (next === 'journal') {
      refreshDashboard();
      refreshSupplements();
    }
    // Same reason, for the other screen an activity now moves: Réglages > TDEE reads `summary`,
    // whose EAT part is the day's logged activities. Without this it keeps showing the breakdown
    // as it stood when the app was last booted, so a session added minutes ago appears to have no
    // effect on the total.
    if (next === 'reglages') refreshCore();
  }

  return (
    <div className="app">
      {/* Re-keyed on every view change so the element remounts and its one-shot sweep replays —
          the screen reads as being re-scanned rather than merely swapped. */}
      <span className="view-scanline" key={`scan-${view}-${selectedMeal || ''}`} aria-hidden="true" />
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
              defaultWaterMl={profile?.default_water_ml || 700}
              waterGoalMl={profile?.water_goal_ml || 4000}
              onOpenWeight={() => setView('poids-rapport')}
              onOpenReport={() => setView('rapport')}
              onOpenWeightReport={() => setView('poids-rapport')}
              onOpenTdeeSettings={() => {
                setSettingsScreen('metabolism');
                setView('reglages');
              }}
              supplements={supplements}
              onOpenSupplements={() => {
                setView('supplements');
                refreshSupplements();
              }}
              onToggleSupplement={handleToggleSupplement}
            />
          )}
          {view === 'journal' && selectedMeal && (
            <MealDetail
              meal={mealData}
              autoOpenAdd={autoOpenAdd}
              foods={foods}
              baseFoods={baseFoods}
              recipes={recipes}
              favorites={mealFavorites}
              frequentItems={frequentFoods}
              onBack={handleBackFromMeal}
              onAddEntry={handleAddEntry}
              onDeleteEntry={handleDeleteEntry}
              onUpdateEntry={handleUpdateEntry}
              onSetRecipePortions={handleSetRecipePortions}
              onDeleteRecipeGroup={handleDeleteRecipeGroup}
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
          {view === 'rapport' && <Report onOpenRichFoods={(key) => setRichFoodsKey(key)} />}
          {view === 'activites' && (
            <ActivitesScreen
              date={activitesDate}
              onDateChange={setActivitesDate}
              activityTypes={activityTypes}
              activities={activites}
              planEntries={activitesPlan}
              restByReps={restByReps}
              session={session}
              onSessionChange={setSession}
              sessionExercise={sessionExercise}
              onSessionExerciseChange={setSessionExercise}
              onRefresh={refreshActivites}
            />
          )}
          {view === 'supplements' && (
            <SupplementsScreen
              data={supplements}
              date={date}
              onBack={() => setView('journal')}
              onAdd={handleAddSupplement}
              onUpdate={handleUpdateSupplement}
              onDelete={handleDeleteSupplement}
              onToggleTaken={handleToggleSupplement}
            />
          )}
          {view === 'poids-rapport' && <WeightReport onBack={() => setView('journal')} />}
          {view === 'planning' && <MealPlanner recipes={recipes} foods={foods} />}
          {view === 'reglages' && (
            <Settings
              profile={profile}
              summary={summary}
              initialScreen={settingsScreen}
              activityTypes={activityTypes}
              email={account.email}
              mustChangePassword={account.mustChangePassword}
              onRefreshSummary={refreshCore}
              onSaveProfile={handleProfileSave}
              onUpdateActivityType={handleActivityTypeUpdate}
              onLogout={onLogout}
            />
          )}
        </main>
      </div>

      {richFoodsKey && (
        <div className="modal-overlay" onClick={() => setRichFoodsKey(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <RichFoodsReport nutrientKey={richFoodsKey} onBack={() => setRichFoodsKey(null)} />
          </div>
        </div>
      )}

      {view !== 'activites' && (
        <SessionBanner session={session} sessionExercise={sessionExercise} onResume={() => handleViewChange('activites')} />
      )}

      <BottomTabBar view={view} onChange={handleViewChange} />
    </div>
  );
}

function App() {
  // undefined = still checking, null = not authenticated, object = { id, email, mustChangePassword }
  const [account, setAccount] = useState(undefined);
  // A reset link lands on /?reset=<token>. Read once at mount, because the screen clears the
  // parameter from the URL as soon as it is done with it.
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset'));

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

  // Before everything else, including the session check: someone following a reset link is by
  // definition unable to log in, and an existing session on the device must not swallow the link.
  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={() => {
          // Drops ?reset= so a reload does not land back on a link that is now spent.
          window.history.replaceState({}, '', window.location.pathname);
          setResetToken(null);
        }}
      />
    );
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
