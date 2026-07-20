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
  claimLegacy: (email, password) =>
    request('/auth/claim-legacy', { method: 'POST', body: JSON.stringify({ email, password }) }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),

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
  addWater: (date) => request('/water', { method: 'POST', body: JSON.stringify({ date }) }),
  deleteWater: (id) => request(`/water/${id}`, { method: 'DELETE' }),
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
  getWeightPhotos: (range) => request(`/weight-photos?range=${range}`),
  uploadWeightPhotos: async (files, date, angle) => {
    const formData = new FormData();
    for (const file of files) formData.append('photos', file);
    formData.append('date', date);
    formData.append('angle', angle);
    const res = await fetch(`${BASE}/weight-photos`, { method: 'POST', body: formData, credentials: 'include' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erreur ${res.status}`);
    }
    return res.json();
  },
  deleteWeightPhoto: (id) => request(`/weight-photos/${id}`, { method: 'DELETE' }),
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
