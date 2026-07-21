import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';
import Icon from './Icon';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MEAL_ICONS = { breakfast: 'sunrise', lunch: 'utensils', dinner: 'moon' };
const BASE_MEAL_KEYS = ['breakfast', 'snack', 'lunch', 'dinner'];

function mealLabel(key, label, t) {
  return BASE_MEAL_KEYS.includes(key) ? t(`mealName.${key}`) : label;
}

function mealShortLabel(key, label, t) {
  return BASE_MEAL_KEYS.includes(key) ? t(`planner.slotShort.${key}`) : label;
}

// breakfast, lunch, dinner in that fixed order, then every en-cas slot (the base one plus any
// extra ones added in Réglages > Repas du jour) in whatever order the server returned them.
function displayOrder(meals) {
  const keys = meals.map((m) => m.key);
  const snacks = keys.filter((k) => k.startsWith('snack'));
  return ['breakfast', 'lunch', 'dinner', ...snacks].filter((k) => keys.includes(k));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function mondayOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const jsDay = d.getUTCDay();
  const diff = (jsDay + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function shiftDateStr(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dayNum(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDate();
}

function localeFor(lang) {
  return lang === 'fr' ? 'fr-FR' : 'en-US';
}

function formatWeekRange(weekStart, lang) {
  const end = shiftDateStr(weekStart, 6);
  const startD = new Date(`${weekStart}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  const monthFmt = new Intl.DateTimeFormat(localeFor(lang), { month: 'long', timeZone: 'UTC' });
  if (startD.getUTCMonth() === endD.getUTCMonth()) {
    return `${startD.getUTCDate()} – ${endD.getUTCDate()} ${monthFmt.format(endD)}`;
  }
  const shortFmt = new Intl.DateTimeFormat(localeFor(lang), { month: 'short', timeZone: 'UTC' });
  return `${startD.getUTCDate()} ${shortFmt.format(startD)} – ${endD.getUTCDate()} ${shortFmt.format(endD)}`;
}

function formatDayLong(dateStr, lang) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat(localeFor(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return fmt.format(d);
}

function recipeKcalPerPortion(recipe) {
  const total = (recipe.ingredients || []).reduce((s, i) => s + (Number(i.kcal) || 0), 0);
  return total / (recipe.portions || 1);
}

// A dish is "recurring" for a meal when it appears on every single day of the week — a meal
// can have several recurring items at once (e.g. yogurt + a fruit for snack, every day).
export function findRecurringItems(entries, mealKey, days) {
  const perDayEntries = days.map((d) => entries.filter((e) => e.day === d.key && e.meal === mealKey));
  if (perDayEntries.some((list) => list.length === 0)) return [];
  const [firstDayItems, ...restDays] = perDayEntries;
  return firstDayItems.filter((item) =>
    restDays.every((dayItems) =>
      dayItems.some((e) => e.source_type === item.source_type && e.source_id === item.source_id)
    )
  );
}

function WeekStrip({ weekStart, dayKeys, activeDay, onSelect, t }) {
  return (
    <div className="activites-week-card">
      <div className="activites-week-row">
        {dayKeys.map((key, i) => {
          const dateStr = shiftDateStr(weekStart, i);
          return (
            <button
              key={key}
              type="button"
              className={key === activeDay ? 'activites-week-day active' : 'activites-week-day'}
              onClick={() => onSelect(key)}
            >
              <span className="activites-week-letter">{t(`dayName.${key}`).slice(0, 1)}</span>
              <span className="activites-week-number">{dayNum(dateStr)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleSwitch({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      className={on ? 'toggle-switch on' : 'toggle-switch'}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on}
    >
      <span className="toggle-switch-thumb" />
    </button>
  );
}

export default function MealPlanner({ recipes, foods }) {
  const { t, lang } = useLanguage();
  const [plan, setPlan] = useState(null);
  const [day, setDay] = useState(DAY_ORDER[(new Date().getUTCDay() + 6) % 7]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('home'); // 'home' | 'generate' | 'add'
  const [addMeal, setAddMeal] = useState('breakfast');

  const [weekTarget, setWeekTarget] = useState('');
  // Only protein% and carbs% are user-editable; fat% is always the remainder so the
  // three always sum to exactly 100% (no rounding drift to reconcile).
  const [proteinPct, setProteinPct] = useState(30);
  const [carbsPct, setCarbsPct] = useState(35);
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);
  const [weekProgress, setWeekProgress] = useState(null);
  const [weekMessage, setWeekMessage] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [overwriteFilled, setOverwriteFilled] = useState(false);
  const [journalMessage, setJournalMessage] = useState(null);
  const [genMode, setGenMode] = useState('library'); // 'ai' | 'library' | 'favorites'
  const [clearingWeek, setClearingWeek] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const weekStart = useMemo(() => mondayOfWeek(todayStr()), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await api.getMealPlan();
    setPlan(data);
    setWeekTarget((prev) => prev || String(Math.round(data.targetIntake)));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !plan) return <p className="hint">{t('common.loading')}</p>;

  function handleProteinPctChange(value) {
    const p = Math.max(0, Math.min(100, Number(value) || 0));
    setProteinPct(p);
    if (p + carbsPct > 100) setCarbsPct(100 - p);
  }

  function handleCarbsPctChange(value) {
    const c = Math.max(0, Math.min(100, Number(value) || 0));
    setCarbsPct(c);
    if (proteinPct + c > 100) setProteinPct(100 - c);
  }

  async function handleGenerateWeek() {
    setWeekMessage(null);
    const targetIntake = Number(weekTarget) || plan.targetIntake;
    const recurringMeals = new Set(
      plan.meals.filter((m) => findRecurringItems(plan.entries, m.key, plan.days).length > 0).map((m) => m.key)
    );
    const isFilled = (dayKey, mealKey) => plan.entries.some((e) => e.day === dayKey && e.meal === mealKey);

    // Real meal-prep behaviour: cook once, eat it again the next day. Breakfast and "lunch +
    // dinner" are each batch-cooked in pairs of consecutive days (same dish, same portion) —
    // lunch/dinner share one pool since it's the same "main meal" repeated across both. Snack
    // stays fully independent (usually 1-2 simple foods, not a batch-cooked dish).
    const dayPairs = [];
    for (let i = 0; i < plan.days.length; i += 2) dayPairs.push(plan.days.slice(i, i + 2));
    const groups = ['breakfast', 'lunch', 'dinner']
      .filter((k) => !recurringMeals.has(k))
      .map((k) => ({ poolKey: k, mealKeys: [k] }));
    const independentMeals = plan.meals.filter((m) => m.key.startsWith('snack') && !recurringMeals.has(m.key));

    const independentSlots = [];
    for (const d of plan.days) {
      for (const m of independentMeals) {
        if (!isFilled(d.key, m.key) || overwriteFilled) independentSlots.push({ day: d.key, meal: m.key });
      }
    }
    const blocksByPool = groups.map((g) => ({
      poolKey: g.poolKey,
      blocks: dayPairs
        .map((days) => {
          const slots = [];
          for (const d of days) {
            for (const meal of g.mealKeys) {
              if (!isFilled(d.key, meal) || overwriteFilled) slots.push({ day: d.key, meal });
            }
          }
          return slots;
        })
        .filter((slots) => slots.length > 0),
    }));

    const totalSteps =
      independentSlots.length + blocksByPool.reduce((s, g) => s + g.blocks.length, 0);
    if (totalSteps === 0) {
      setWeekMessage(t('planner.allSlotsFilled'));
      return;
    }

    // "Remplacer" means replace, not pile on — clear whatever's already in a targeted slot
    // before regenerating it, otherwise the new pick just sits alongside the old one.
    if (overwriteFilled) {
      const allTargetSlots = [
        ...independentSlots,
        ...blocksByPool.flatMap((g) => g.blocks.flatMap((slots) => slots)),
      ];
      const idsToDelete = allTargetSlots.flatMap((slot) =>
        plan.entries.filter((e) => e.day === slot.day && e.meal === slot.meal).map((e) => e.id)
      );
      for (const id of idsToDelete) await api.deleteMealPlanEntry(id);
    }

    const proteinTarget = (targetIntake * proteinPct) / 100 / 4;
    const carbsTarget = (targetIntake * carbsPct) / 100 / 4;
    const fatTarget = (targetIntake * fatPct) / 100 / 9;

    setGenerating(true);
    setWeekProgress({ done: 0, total: totalSteps });
    let lastError = null;
    // Tracks what's already used per meal type — seeded from the existing plan (not just this
    // run) so a repeat click doesn't forget what an earlier one already placed.
    const usedByMeal = {};
    for (const m of plan.meals) {
      const pool = { excludeIds: [], avoidTitles: [] };
      for (const e of plan.entries) {
        if (e.meal === m.key) {
          pool.excludeIds.push(`${e.source_type}:${e.source_id}`);
          pool.avoidTitles.push(e.label);
        }
      }
      usedByMeal[m.key] = pool;
    }

    for (const slot of independentSlots) {
      try {
        const result = await api.generateMealPlanEntry({
          day: slot.day,
          meal: slot.meal,
          mode: genMode,
          targetIntake,
          proteinTarget,
          carbsTarget,
          fatTarget,
          excludeIds: usedByMeal[slot.meal].excludeIds,
          avoidTitles: usedByMeal[slot.meal].avoidTitles,
        });
        const entry = result.entry;
        usedByMeal[slot.meal].excludeIds.push(`${entry.source_type}:${entry.source_id}`);
        usedByMeal[slot.meal].avoidTitles.push(entry.label);
      } catch (err) {
        lastError = err.message;
        // one failed slot shouldn't abort the rest of the week
      }
      setWeekProgress((p) => ({ done: p.done + 1, total: p.total }));
    }

    // day|meal -> "type:id" already chosen, seeded from the existing plan so dinner still
    // avoids whatever lunch already had before this run (not just what's picked during it).
    const chosenByDayMeal = {};
    for (const e of plan.entries) {
      chosenByDayMeal[`${e.day}|${e.meal}`] = `${e.source_type}:${e.source_id}`;
    }

    // Lunch and dinner share ONE exclusion pool ("main") so a dish is capped at 2 occurrences
    // total across the whole week, not 2 in lunch AND 2 more in dinner. Breakfast has its own.
    const sharedKeyFor = (poolKey) => (poolKey === 'lunch' || poolKey === 'dinner' ? 'main' : poolKey);
    const sharedPools = {};
    for (const { poolKey, mealKeys } of groups) {
      const key = sharedKeyFor(poolKey);
      if (sharedPools[key]) continue;
      const pool = { excludeIds: [], avoidTitles: [] };
      const relevantMeals = groups.filter((g) => sharedKeyFor(g.poolKey) === key).flatMap((g) => g.mealKeys);
      for (const e of plan.entries) {
        if (relevantMeals.includes(e.meal)) {
          pool.excludeIds.push(`${e.source_type}:${e.source_id}`);
          pool.avoidTitles.push(e.label);
        }
      }
      sharedPools[key] = pool;
    }

    for (const { poolKey, blocks } of blocksByPool) {
      const usedPool = sharedPools[sharedKeyFor(poolKey)];
      for (const blockSlots of blocks) {
        try {
          const repSlot = blockSlots[0];
          // Lunch and dinner must never be the same dish on the same day — exclude whatever
          // the OTHER of the two already got for every day in this block.
          const otherMeal = poolKey === 'lunch' ? 'dinner' : poolKey === 'dinner' ? 'lunch' : null;
          const crossMealExcludes = otherMeal
            ? blockSlots
                .map((s) => chosenByDayMeal[`${s.day}|${otherMeal}`])
                .filter(Boolean)
                .flatMap((key) => [key, key])
            : [];

          const result = await api.generateMealPlanEntry({
            day: repSlot.day,
            meal: repSlot.meal,
            mode: genMode,
            targetIntake,
            proteinTarget,
            carbsTarget,
            fatTarget,
            excludeIds: [...usedPool.excludeIds, ...crossMealExcludes],
            avoidTitles: usedPool.avoidTitles,
          });
          const entry = result.entry;
          for (const slot of blockSlots.slice(1)) {
            await api.setMealPlanEntry({
              day: slot.day,
              meal: slot.meal,
              source_type: entry.source_type,
              source_id: entry.source_id,
              quantity: entry.quantity,
            });
          }
          for (const slot of blockSlots) {
            chosenByDayMeal[`${slot.day}|${slot.meal}`] = `${entry.source_type}:${entry.source_id}`;
          }
          usedPool.excludeIds.push(`${entry.source_type}:${entry.source_id}`, `${entry.source_type}:${entry.source_id}`);
          usedPool.avoidTitles.push(entry.label);
        } catch (err) {
          lastError = err.message;
        }
        setWeekProgress((p) => ({ done: p.done + blockSlots.length, total: p.total }));
      }
    }

    // refresh() before re-enabling the button — otherwise a fast second click reads stale
    // plan.entries and doesn't know what the just-finished run created, so overwrite-delete
    // and "already filled" checks miss it and it stacks another dish on top.
    await refresh();
    setGenerating(false);
    setWeekProgress(null);
    if (lastError) {
      setWeekMessage(t('planner.doneWithFailures').replace('{error}', lastError));
    } else {
      setWeekMessage(null);
      setScreen('home');
    }
  }

  async function handleApplyToJournal() {
    setJournalMessage(null);
    const result = await api.applyMealPlanToJournal();
    const parts = [];
    if (result.added.length > 0) parts.push(`${result.added.length} ${t('planner.mealsAdded')}`);
    if (result.skipped.length > 0) parts.push(`${result.skipped.length} ${t('planner.alreadyLogged')}`);
    setJournalMessage(parts.length > 0 ? parts.join(' · ') : t('planner.nothingToAddToday'));
  }

  async function handleClearWeek() {
    if (!window.confirm(t('planner.confirmClearWeek'))) return;
    setClearingWeek(true);
    try {
      await api.clearMealPlan();
      await refresh();
    } finally {
      setClearingWeek(false);
    }
  }

  const entriesForDay = plan.entries.filter((e) => e.day === day);
  const dayTotalKcal = entriesForDay.reduce((s, e) => s + e.kcal, 0);
  const kcalDiff = Math.round(dayTotalKcal - plan.targetIntake);

  async function togglePick(mealKey, type, id, existingEntry) {
    if (existingEntry) {
      await api.deleteMealPlanEntry(existingEntry.id);
    } else {
      const quantity = type === 'food' ? 100 : 1;
      await api.setMealPlanEntry({ day, meal: mealKey, source_type: type, source_id: id, quantity });
    }
    await refresh();
  }

  async function handleGenerateSlot(mealKey) {
    setGenerating(true);
    const targetIntake = Number(weekTarget) || plan.targetIntake;
    try {
      await api.generateMealPlanEntry({
        day,
        meal: mealKey,
        mode: genMode,
        targetIntake,
        proteinTarget: (targetIntake * proteinPct) / 100 / 4,
        carbsTarget: (targetIntake * carbsPct) / 100 / 4,
        fatTarget: (targetIntake * fatPct) / 100 / 9,
      });
      await refresh();
    } catch (err) {
      alert(err.message || t('planner.generationFailed'));
    } finally {
      setGenerating(false);
    }
  }

  function openAdd(mealKey) {
    setAddMeal(mealKey);
    setAddSearch('');
    setScreen('add');
  }

  // ---- screen: add ("Planning · Planifier") ----
  if (screen === 'add') {
    const term = addSearch.trim().toLowerCase();
    const addDayEntries = plan.entries.filter((e) => e.day === day);
    const recipeItems = (term ? recipes.filter((r) => r.title.toLowerCase().includes(term)) : recipes).slice(0, 40);
    const foodItems = (term ? foods.filter((f) => f.name.toLowerCase().includes(term)) : foods).slice(0, 40);

    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="meal-detail-header">
            <button type="button" className="meal-detail-back-btn" onClick={() => setScreen('home')} aria-label={t('meal.back')}>
              <Icon name="chevron-left" size={20} />
            </button>
            <div className="meal-detail-heading">
              <div className="day-nav-subtitle">
                {t('planner.title')} · {formatDayLong(shiftDateStr(weekStart, DAY_ORDER.indexOf(day)), lang)}
              </div>
              <div className="meal-detail-title">{t('planner.planMeal')}</div>
            </div>
          </div>

          <h4 className="section-label">{t('planner.dayLabel')}</h4>
          <WeekStrip weekStart={weekStart} dayKeys={plan.days.map((d) => d.key)} activeDay={day} onSelect={setDay} t={t} />

          <h4 className="section-label">{t('planner.slotLabel')}</h4>
          <div className="type-list-row" style={{ margin: '0 0 4px', flexWrap: 'wrap', height: 'auto' }}>
            {displayOrder(plan.meals).map((key) => (
              <button
                key={key}
                type="button"
                className={addMeal === key ? 'type-pill active' : 'type-pill'}
                onClick={() => setAddMeal(key)}
              >
                {mealShortLabel(key, plan.meals.find((m) => m.key === key)?.label, t)}
              </button>
            ))}
          </div>

          <div className="search-input-row">
            <Icon name="search" size={18} color="var(--dim)" />
            <input
              type="text"
              className="search-input"
              placeholder={t('planner.searchPlaceholder')}
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="recurring-feature-row"
            style={{ justifyContent: 'center', width: '100%', marginTop: 12, font: 'inherit', cursor: generating ? 'default' : 'pointer' }}
            disabled={generating}
            onClick={() => handleGenerateSlot(addMeal)}
          >
            <Icon name="sparkles" size={18} color="var(--acc)" />
            <span className="recurring-feature-title" style={{ color: 'var(--acc)' }}>
              {generating ? t('planner.generating') : t('planner.generateWithAI')}
            </span>
          </button>

          {recipeItems.length > 0 && (
            <>
              <h4 className="section-label">{t('planner.recipes')}</h4>
              <div className="settings-list-card">
                {recipeItems.map((r) => {
                  const existing = addDayEntries.find((e) => e.meal === addMeal && e.source_type === 'recipe' && e.source_id === r.id);
                  return (
                    <div className="plan-pick-row" key={`recipe-${r.id}`}>
                      <span className="plan-pick-thumb">
                        <Icon name="salad" size={22} />
                      </span>
                      <div className="plan-pick-body">
                        <div className="plan-pick-name">{r.title}</div>
                        <div className="plan-pick-sub">{Math.round(recipeKcalPerPortion(r))} kcal</div>
                      </div>
                      <button
                        type="button"
                        className={existing ? 'plan-pick-btn added' : 'plan-pick-btn'}
                        onClick={() => togglePick(addMeal, 'recipe', r.id, existing)}
                        aria-label={existing ? t('planner.remove') : t('planner.addAction')}
                      >
                        <Icon name={existing ? 'check' : 'plus'} size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {foodItems.length > 0 && (
            <>
              <h4 className="section-label">{t('planner.foods')}</h4>
              <div className="settings-list-card">
                {foodItems.map((f) => {
                  const existing = addDayEntries.find((e) => e.meal === addMeal && e.source_type === 'food' && e.source_id === f.id);
                  return (
                    <div className="plan-pick-row" key={`food-${f.id}`}>
                      <span className="plan-pick-thumb">
                        <Icon name="egg" size={22} />
                      </span>
                      <div className="plan-pick-body">
                        <div className="plan-pick-name">{f.name}</div>
                        <div className="plan-pick-sub">{Math.round(f.kcal_per_100g || 0)} kcal / 100g</div>
                      </div>
                      <button
                        type="button"
                        className={existing ? 'plan-pick-btn added' : 'plan-pick-btn'}
                        onClick={() => togglePick(addMeal, 'food', f.id, existing)}
                        aria-label={existing ? t('planner.remove') : t('planner.addAction')}
                      >
                        <Icon name={existing ? 'check' : 'plus'} size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {recipeItems.length === 0 && foodItems.length === 0 && <p className="hint">{t('planner.noResults')}</p>}
        </div>
        <button type="button" className="done-btn done-btn-primary" onClick={(e) => { e.stopPropagation(); setScreen('home'); }}>
          {t('planner.close')}
        </button>
      </div>
    );
  }

  // ---- screen: generate ("Générer via IA") ----
  if (screen === 'generate') {
    const SOURCES = [
      { key: 'ai', icon: 'wand-sparkles', title: t('planner.sourceAiTitle'), desc: t('planner.sourceAiDesc'), bg: 'var(--gradient-brand)', fg: 'var(--text-on-accent)' },
      { key: 'favorites', icon: 'star', title: t('planner.sourceFavoritesTitle'), desc: t('planner.sourceFavoritesDesc'), bg: 'rgba(245,194,107,0.15)', fg: 'var(--warning)' },
      { key: 'library', icon: 'chef-hat', title: t('planner.sourceLibraryTitle'), desc: t('planner.sourceLibraryDesc'), bg: 'var(--accent-soft)', fg: 'var(--acc)' },
    ];
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="meal-detail-header">
            <button type="button" className="meal-detail-back-btn" onClick={() => setScreen('home')} aria-label={t('meal.back')}>
              <Icon name="chevron-left" size={20} />
            </button>
            <div className="meal-detail-heading">
              <div className="day-nav-subtitle">{formatWeekRange(weekStart, lang)}</div>
              <div className="meal-detail-title">{t('planner.generateTitle')}</div>
            </div>
          </div>

          <div className="planning-info-card">
            <span className="planning-info-icon">
              <Icon name="sparkles" size={26} />
            </span>
            <div>
              <div className="planning-info-title">{t('planner.generateInfoTitle')}</div>
              <div className="planning-info-desc">
                {t('planner.generateInfoDesc').replace('{kcal}', Math.round(Number(weekTarget) || plan.targetIntake))}
              </div>
            </div>
          </div>

          <h4 className="section-label">{t('planner.sourceLabel')}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SOURCES.map((s) => (
              <div
                key={s.key}
                className={genMode === s.key ? 'recurring-feature-row active' : 'recurring-feature-row'}
                onClick={() => setGenMode(s.key)}
              >
                <span className="recurring-feature-icon" style={{ background: s.bg, color: s.fg }}>
                  <Icon name={s.icon} size={20} />
                </span>
                <div className="recurring-feature-body">
                  <div className="recurring-feature-title">{s.title}</div>
                  <div className="recurring-feature-desc">{s.desc}</div>
                </div>
                <span className={genMode === s.key ? 'recurring-feature-check checked round' : 'recurring-feature-check round'}>
                  <Icon name="check" size={14} />
                </span>
              </div>
            ))}
          </div>

          <h4 className="section-label">{t('planner.optionsLabel')}</h4>
          <div className="settings-list-card">
            <div className="settings-list-row" style={{ cursor: 'default' }}>
              <span className="settings-list-label">{t('planner.optionRespectGoal')}</span>
              <ToggleSwitch on disabled onChange={() => {}} />
            </div>
            <div className="settings-list-row" style={{ cursor: 'default' }}>
              <span className="settings-list-label">{t('planner.optionAvoidRepeats')}</span>
              <ToggleSwitch on disabled onChange={() => {}} />
            </div>
            <div className="settings-list-row" style={{ cursor: 'default' }}>
              <span className="settings-list-label">{t('planner.overwriteFilled')}</span>
              <ToggleSwitch on={overwriteFilled} onChange={setOverwriteFilled} />
            </div>
          </div>

          <h4 className="section-label">{t('planner.dailyGoal')}</h4>
          <input
            type="number"
            min="800"
            step="50"
            placeholder={t('planner.dailyGoalPlaceholder')}
            value={weekTarget}
            onChange={(e) => setWeekTarget(e.target.value)}
            style={{ width: '100%', margin: '0 0 12px' }}
          />

          <h4 className="section-label" style={{ marginTop: 0 }}>{t('planner.macroSplit')}</h4>
          <div className="macro-pct-row">
            <div className="macro-pct-field">
              <input type="number" min="0" max="100" value={proteinPct} onChange={(e) => handleProteinPctChange(e.target.value)} />
              <span>{t('planner.pctProtein')}</span>
              <span className="hint">{Math.round(((Number(weekTarget) || 0) * proteinPct) / 100 / 4)} g</span>
            </div>
            <div className="macro-pct-field">
              <input type="number" min="0" max="100" value={carbsPct} onChange={(e) => handleCarbsPctChange(e.target.value)} />
              <span>{t('planner.pctCarbs')}</span>
              <span className="hint">{Math.round(((Number(weekTarget) || 0) * carbsPct) / 100 / 4)} g</span>
            </div>
            <div className="macro-pct-field">
              <input type="number" value={fatPct} disabled />
              <span>{t('planner.pctFatAuto')}</span>
              <span className="hint">{Math.round(((Number(weekTarget) || 0) * fatPct) / 100 / 9)} g</span>
            </div>
          </div>

          {weekMessage && <p className="hint" style={{ marginTop: 12 }}>{weekMessage}</p>}
        </div>
        <button
          type="button"
          className="done-btn done-btn-primary"
          disabled={generating}
          onClick={(e) => {
            e.stopPropagation();
            handleGenerateWeek();
          }}
        >
          {weekProgress
            ? t('planner.generatingProgress').replace('{done}', weekProgress.done).replace('{total}', weekProgress.total)
            : t('planner.generateFullWeek')}
        </button>
      </div>
    );
  }

  // ---- screen: home ("Planning") ----
  const selectedDate = shiftDateStr(weekStart, DAY_ORDER.indexOf(day));

  return (
    <div>
      <div className="planning-header-row">
        <div>
          <div className="planning-header-date">{formatWeekRange(weekStart, lang)}</div>
          <div className="planning-header-title">{t('planner.title')}</div>
        </div>
        <span className="planning-calendar-btn">
          <Icon name="calendar-days" size={20} />
        </span>
      </div>

      <WeekStrip weekStart={weekStart} dayKeys={plan.days.map((d) => d.key)} activeDay={day} onSelect={setDay} t={t} />

      <button type="button" className="planning-ai-cta" onClick={() => setScreen('generate')}>
        <span className="planning-ai-cta-icon">
          <Icon name="sparkles" size={23} />
        </span>
        <div className="planning-ai-cta-body">
          <div className="planning-ai-cta-title">{t('planner.generateCtaTitle')}</div>
          <div className="planning-ai-cta-sub">{t('planner.generateCtaSub')}</div>
        </div>
        <Icon name="chevron-right" size={20} color="var(--acc)" />
      </button>

      <div className="planning-summary-card">
        <div>
          <div className="planning-summary-label">
            {t('planner.plannedTotal')} · {formatDayLong(selectedDate, lang)}
          </div>
          <div className="planning-summary-value">
            {Math.round(dayTotalKcal).toLocaleString(localeFor(lang))} <span>kcal</span>
          </div>
        </div>
        <div className="planning-summary-diff">
          <div className="planning-summary-label">{t('planner.goalShort')}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: kcalDiff <= 0 ? 'var(--success)' : 'var(--warning)' }}>
            {kcalDiff > 0 ? '+' : ''}
            {kcalDiff} kcal
          </div>
        </div>
      </div>

      <div className="meal-card-list" style={{ marginBottom: 18 }}>
        {displayOrder(plan.meals).map((key) => {
          const m = plan.meals.find((mm) => mm.key === key);
          if (!m) return null;
          const title = mealLabel(key, m.label, t);
          const mealEntries = entriesForDay.filter((e) => e.meal === key);
          if (mealEntries.length === 0) {
            return (
              <div key={key} className="meal-card empty" onClick={() => openAdd(key)}>
                <span className="meal-icon-box" style={{ background: 'var(--surface-raised)', color: 'var(--dim)' }}>
                  <Icon name={MEAL_ICONS[key] || 'apple'} size={21} />
                </span>
                <div className="meal-card-body">
                  <div className="meal-card-kcal">{title}</div>
                  <div className="meal-card-title" style={{ color: 'var(--text-secondary)' }}>
                    {BASE_MEAL_KEYS.includes(key) ? t(`planner.addMealAction.${key}`) : t('planner.addMealActionGeneric').replace('{meal}', title)}
                  </div>
                </div>
                <Icon name="plus" size={22} color="var(--acc)" />
              </div>
            );
          }
          const totalKcal = mealEntries.reduce((s, e) => s + e.kcal, 0);
          const label = mealEntries.map((e) => e.label).join(' + ');
          return (
            <div key={key} className="meal-card" onClick={() => openAdd(key)}>
              <span className="meal-icon-box">
                <Icon name={MEAL_ICONS[key] || 'apple'} size={21} />
              </span>
              <div className="meal-card-body">
                <div className="meal-card-kcal">{title}</div>
                <div className="meal-card-title">{label}</div>
              </div>
              <b style={{ fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(totalKcal)}
              </b>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 10 }}>
        <button type="button" className="section-label clickable" style={{ margin: 0, border: 0, background: 'none', cursor: 'pointer' }} onClick={handleApplyToJournal}>
          {t('planner.addTodayToJournal')}
        </button>
        <button
          type="button"
          className="section-label clickable"
          style={{ margin: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--danger)' }}
          disabled={clearingWeek}
          onClick={handleClearWeek}
        >
          {clearingWeek ? t('planner.clearingWeek') : t('planner.clearWeek')}
        </button>
      </div>
      {journalMessage && <p className="hint success" style={{ textAlign: 'center' }}>{journalMessage}</p>}
    </div>
  );
}
