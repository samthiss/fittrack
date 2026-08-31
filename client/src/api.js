const BASE = '/api';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (res.status === 401) {
    const err = new Error('Non authentifié');
    err.isAuthError = true;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getMe: () => request('/auth/me'),
  getLegacyStatus: () => request('/auth/legacy-status'),
  register: (email, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  // Reaching these means being logged out, so none of them carry a session.
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  checkResetToken: (token) => request(`/auth/reset-token?token=${encodeURIComponent(token)}`),
  resetPassword: (token, password) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  claimLegacy: (email, password) =>
    request('/auth/claim-legacy', { method: 'POST', body: JSON.stringify({ email, password }) }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  completeOnboarding: () => request('/auth/complete-onboarding', { method: 'POST' }),

  getActivityTypes: () => request('/activity-types'),
  updateActivityType: (type, data) =>
    request(`/activity-types/${type}`, { method: 'PUT', body: JSON.stringify(data) }),
  getProfile: () => request('/profile'),
  updateProfile: (data) =>
    request('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getActivities: (date) => request(`/activities?date=${date}`),
  addActivity: (data) =>
    request('/activities', { method: 'POST', body: JSON.stringify(data) }),
  deleteActivity: (id) => request(`/activities/${id}`, { method: 'DELETE' }),
  updateActivity: (id, data) => request(`/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getActivityExercises: (activityId) => request(`/activities/${activityId}/exercises`),
  addActivityExercise: (activityId, data) =>
    request(`/activities/${activityId}/exercises`, { method: 'POST', body: JSON.stringify(data) }),
  updateActivityExercise: (id, data) =>
    request(`/exercises/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteActivityExercise: (id) => request(`/exercises/${id}`, { method: 'DELETE' }),
  // Idempotent per (exercise, set index): re-sending a set the user has corrected overwrites it.
  saveExerciseSet: (exerciseId, setIndex, data) =>
    request(`/exercises/${exerciseId}/sets/${setIndex}`, { method: 'PUT', body: JSON.stringify(data) }),
  getMuscleVolume: (weeks = 8) => request(`/muscle-volume?weeks=${weeks}`),
  getExerciseHistory: (name, { excludeActivityId, limit } = {}) => {
    const params = new URLSearchParams({ name });
    if (excludeActivityId != null) params.set('exclude_activity_id', String(excludeActivityId));
    if (limit != null) params.set('limit', String(limit));
    return request(`/exercise-history?${params}`);
  },
  getExerciseLibrary: () => request('/exercise-library'),
  getWorkoutTemplates: () => request('/workout-templates'),
  createWorkoutTemplate: (data) => request('/workout-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkoutTemplate: (id, data) => request(`/workout-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkoutTemplate: (id) => request(`/workout-templates/${id}`, { method: 'DELETE' }),
  getActivityPlan: () => request('/activity-plan'),
  addActivityPlan: (data) =>
    request('/activity-plan', { method: 'POST', body: JSON.stringify(data) }),
  deleteActivityPlan: (id) => request(`/activity-plan/${id}`, { method: 'DELETE' }),
  updateActivityPlanGroup: (groupId, data) =>
    request(`/activity-plan/group/${groupId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteActivityPlanGroup: (groupId) => request(`/activity-plan/group/${groupId}`, { method: 'DELETE' }),
  applyActivityPlanToLog: (date) =>
    request('/activity-plan/apply-to-log', { method: 'POST', body: JSON.stringify({ date }) }),
  getWater: (date) => request(`/water?date=${date}`),
  addWater: (date, amountMl) => request('/water', { method: 'POST', body: JSON.stringify({ date, amount_ml: amountMl }) }),
  deleteWater: (id) => request(`/water/${id}`, { method: 'DELETE' }),

  getSupplements: (date) => request(`/supplements?date=${date}`),
  addSupplement: (data) => request('/supplements', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplement: (id, data) => request(`/supplements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplement: (id, date) => request(`/supplements/${id}?date=${date}`, { method: 'DELETE' }),
  setSupplementTaken: (id, date, taken) =>
    request(`/supplements/${id}/log`, { method: 'POST', body: JSON.stringify({ date, taken }) }),
  getPushStatus: () => request('/push/status'),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribePush: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  sendTestPush: () => request('/push/test', { method: 'POST' }),
  // The end-of-rest notification is scheduled server-side: iOS freezes this page's timers the
  // moment the screen locks, so only the server can be relied on to buzz on time.
  startRestTimer: (data) => request('/rest-timer', { method: 'POST', body: JSON.stringify(data) }),
  cancelRestTimer: () => request('/rest-timer', { method: 'DELETE' }),
  getChecklist: (date) => request(`/checklist?date=${date}`),
  addChecklistItem: (date, label) => request('/checklist', { method: 'POST', body: JSON.stringify({ date, label }) }),
  updateChecklistItem: (id, date, label) =>
    request(`/checklist/${id}`, { method: 'PUT', body: JSON.stringify({ date, label }) }),
  deleteChecklistItem: (id, date) => request(`/checklist/${id}?date=${date}`, { method: 'DELETE' }),
  setChecklistChecked: (id, date, checked) =>
    request(`/checklist/${id}/check`, { method: 'POST', body: JSON.stringify({ date, checked }) }),
  uncheckAllChecklist: (date) => request('/checklist/uncheck-all', { method: 'POST', body: JSON.stringify({ date }) }),
  setLocker: (date, locker) => request('/checklist/locker', { method: 'PUT', body: JSON.stringify({ date, locker }) }),
  getSummary: (date) => request(`/summary?date=${date}`),
  getRecipes: () => request('/recipes'),
  createRecipe: (data) => request('/recipes', { method: 'POST', body: JSON.stringify(data) }),
  importRecipe: (data) =>
    request('/recipes/import', { method: 'POST', body: JSON.stringify(data) }),
  updateRecipe: (id, data) =>
    request(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRecipe: (id) => request(`/recipes/${id}`, { method: 'DELETE' }),
  getFoods: () => request('/foods'),
  lookupFood: (barcode) => request(`/foods/lookup/${encodeURIComponent(barcode)}`),
  searchFoodsOnline: (query) => request(`/foods/search-online?q=${encodeURIComponent(query)}`),
  parseFoodText: (text) =>
    request('/foods/parse-text', { method: 'POST', body: JSON.stringify({ text }) }),
  parseFoodPhoto: async (file) => {
    const formData = new FormData();
    formData.append('photo', file);
    const res = await fetch(`${BASE}/foods/parse-photo`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (res.status === 401) {
      const err = new Error('Non authentifié');
      err.isAuthError = true;
      throw err;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erreur ${res.status}`);
    }
    return res.json();
  },
  addFood: (data) => request('/foods', { method: 'POST', body: JSON.stringify(data) }),
  updateFood: (id, data) => request(`/foods/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFood: (id) => request(`/foods/${id}`, { method: 'DELETE' }),
  getFrequentFoods: (limit = 12) => request(`/foods/frequent?limit=${limit}`),
  getLastQuantity: (sourceType, sourceId, meal) =>
    request(`/food-logs/last-quantity?source_type=${sourceType}&source_id=${sourceId}&meal=${meal}`),
  addFoodLogEntry: (data) =>
    request('/food-log', { method: 'POST', body: JSON.stringify(data) }),
  deleteFoodLogEntry: (id) => request(`/food-log/${id}`, { method: 'DELETE' }),
  // Rebuilds a logged recipe at a new portion count in one atomic call — see the route's comment.
  setRecipePortions: (data) =>
    request('/food-log/recipe-portions', { method: 'PUT', body: JSON.stringify(data) }),
  // Removes every ingredient row of a logged recipe in one call.
  deleteRecipeGroup: (data) =>
    request('/food-log/recipe-group', { method: 'DELETE', body: JSON.stringify(data) }),
  // Batch forms of addActivityExercise / deleteMealPlanEntry — see their routes for why callers
  // shouldn't loop over the single-item ones.
  addActivityExercisesBulk: (activityId, exercises) =>
    request(`/activities/${activityId}/exercises/bulk`, { method: 'POST', body: JSON.stringify({ exercises }) }),
  deleteMealPlanEntries: (ids) =>
    request('/meal-plan/entries', { method: 'DELETE', body: JSON.stringify({ ids }) }),
  updateFoodLogEntry: (id, quantity, unit) =>
    request(`/food-log/${id}`, { method: 'PUT', body: JSON.stringify({ quantity, unit }) }),
  getDashboard: (date) => {
    const lang = localStorage.getItem('fittrack-lang') === 'en' ? 'en' : 'fr';
    return request(`/dashboard?date=${date}&lang=${lang}`);
  },
  getMeal: (key, date) => request(`/meals/${key}?date=${date}`),
  getReport: (range) => request(`/report?range=${range}`),
  getTodayReport: (date) => request(date ? `/today-report?date=${date}` : '/today-report'),
  getWeekReport: (period) => request(`/week-report?period=${period}`),
  getRichFoods: (key) => request(`/rich-foods/${encodeURIComponent(key)}`),
  getMealFavorites: (meal) => request(`/meal-favorites?meal=${meal}`),
  getAllMealFavorites: () => request('/meal-favorites'),
  addMealFavorite: (data) =>
    request('/meal-favorites', { method: 'POST', body: JSON.stringify(data) }),
  deleteMealFavorite: (id) => request(`/meal-favorites/${id}`, { method: 'DELETE' }),
  getWeightLogs: (range) => request(`/weight-logs?range=${range}`),
  addWeightLog: (data) =>
    request('/weight-logs', { method: 'POST', body: JSON.stringify(data) }),
  deleteWeightLog: (id) => request(`/weight-logs/${id}`, { method: 'DELETE' }),
  getWeightReport: (range) => request(`/weight-report?range=${range}`),
  getMealPlan: () => request('/meal-plan'),
  clearMealPlan: () => request('/meal-plan', { method: 'DELETE' }),
  setMealPlanEntry: (data) =>
    request('/meal-plan/entry', { method: 'POST', body: JSON.stringify(data) }),
  applyMealPlanToWeek: (data) =>
    request('/meal-plan/apply-all', { method: 'POST', body: JSON.stringify(data) }),
  deleteMealPlanEntry: (id) => request(`/meal-plan/entry/${id}`, { method: 'DELETE' }),
  removeMealPlanForSource: (meal, source_type, source_id) =>
    request(
      `/meal-plan/by-source?meal=${encodeURIComponent(meal)}&source_type=${encodeURIComponent(source_type)}&source_id=${encodeURIComponent(source_id)}`,
      { method: 'DELETE' }
    ),
  generateMealPlanEntry: (data) =>
    request('/meal-plan/generate', { method: 'POST', body: JSON.stringify(data) }),
  applyMealPlanToJournal: (date) =>
    request('/meal-plan/apply-to-journal', { method: 'POST', body: JSON.stringify({ date }) }),
};
