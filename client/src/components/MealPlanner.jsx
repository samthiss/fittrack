import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n/LanguageContext';

function PlanEntryPicker({ recipes, foods, onPick, onGenerate, onClose, generating }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState({});

  // Kept as two separate lists (not one merged/capped list) so a handful of simple foods
  // (e.g. "just a yogurt" for a snack) are never crowded out by a large recipe library.
  const foodItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = foods.map((f) => ({ type: 'food', id: f.id, label: f.name }));
    const filtered = term ? all.filter((i) => i.label.toLowerCase().includes(term)) : all;
    return filtered.slice(0, 30);
  }, [search, foods]);

  const recipeItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = recipes.map((r) => ({ type: 'recipe', id: r.id, label: r.title }));
    const filtered = term ? all.filter((i) => i.label.toLowerCase().includes(term)) : all;
    return filtered.slice(0, 30);
  }, [search, recipes]);

  function qtyFor(item) {
    return quantities[`${item.type}-${item.id}`] ?? (item.type === 'food' ? '100' : '1');
  }

  function setQtyFor(item, value) {
    setQuantities({ ...quantities, [`${item.type}-${item.id}`]: value });
  }

  function handlePick(item) {
    const qty = Number(qtyFor(item));
    if (!qty) return;
    onPick(item.type, item.id, qty);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{t('planner.pickDish')}</h2>
        <input
          type="text"
          placeholder={t('planner.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        {onGenerate && (
          <button
            type="button"
            className="btn"
            disabled={generating}
            onClick={onGenerate}
            style={{ marginBottom: 12 }}
          >
            {generating ? t('planner.generating') : t('planner.generateWithAI')}
          </button>
        )}

        {foodItems.length > 0 && (
          <>
            <h4 className="section-label">{t('planner.foods')}</h4>
            {foodItems.map((item) => (
              <div className="row" key={`${item.type}-${item.id}`}>
                <div className="name">
                  <span>{item.label}</span>
                  <span className="rate">g</span>
                </div>
                <div className="field">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={qtyFor(item)}
                    onChange={(e) => setQtyFor(item, e.target.value)}
                    style={{ width: 60 }}
                  />
                  <button type="button" className="round-add-btn" onClick={() => handlePick(item)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {recipeItems.length > 0 && (
          <>
            <h4 className="section-label">{t('planner.recipes')}</h4>
            {recipeItems.map((item) => (
              <div className="row" key={`${item.type}-${item.id}`}>
                <div className="name">
                  <span>{item.label}</span>
                  <span className="rate">portion(s)</span>
                </div>
                <div className="field">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={qtyFor(item)}
                    onChange={(e) => setQtyFor(item, e.target.value)}
                    style={{ width: 60 }}
                  />
                  <button type="button" className="round-add-btn" onClick={() => handlePick(item)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {foodItems.length === 0 && recipeItems.length === 0 && <p className="hint">{t('planner.noResults')}</p>}

        <button type="button" className="done-btn" onClick={onClose}>
          {t('planner.close')}
        </button>
      </div>
    </div>
  );
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

export default function MealPlanner({ recipes, foods }) {
  const { t } = useLanguage();
  const [plan, setPlan] = useState(null);
  const [day, setDay] = useState('mon');
  const [pickerMeal, setPickerMeal] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [weekTarget, setWeekTarget] = useState('');
  // Only protein% and carbs% are user-editable; fat% is always the remainder so the
  // three always sum to exactly 100% (no rounding drift to reconcile).
  const [proteinPct, setProteinPct] = useState(30);
  const [carbsPct, setCarbsPct] = useState(35);
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);
  const [weekProgress, setWeekProgress] = useState(null);
  const [weekMessage, setWeekMessage] = useState(null);
  const [overwriteFilled, setOverwriteFilled] = useState(false);
  const [journalMessage, setJournalMessage] = useState(null);
  const [genMode, setGenMode] = useState('library'); // 'ai' | 'library' | 'favorites'

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
    // Breakfast, lunch and dinner are each their OWN independent sequence — lunch and dinner
    // are different dishes from each other, but each repeats on its own for 2 days before
    // changing (day1=day2 lunch, day3=day4 lunch with a different dish, and separately the
    // same pattern for dinner) — one grocery run covers 2 days of the same dish.
    const groups = ['breakfast', 'lunch', 'dinner']
      .filter((k) => !recurringMeals.has(k))
      .map((k) => ({ poolKey: k, mealKeys: [k] }));
    const independentMeals = plan.meals.filter((m) => m.key === 'snack' && !recurringMeals.has(m.key));

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
    // Seeded from the EXISTING plan (not just this run) — otherwise a second "Générer" click
    // forgets what an earlier click already placed and happily reuses it past the cap.
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
      // Shared across lunch+dinner (see above), own pool for breakfast — either way, tracked
      // across all its blocks so a dish used for one pair of days won't turn up in a later pair.
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
          // Same dish + same quantity copied onto the rest of the block (other day, other
          // meal) — that's the "same meal twice, two days running" consistency.
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
          // Excluded twice = hits the server's 2-repeats cap immediately, so this dish won't be
          // picked again for a *different* block later in the same run.
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
    if (lastError) setWeekMessage(t('planner.doneWithFailures').replace('{error}', lastError));
  }

  async function handleApplyToJournal() {
    setJournalMessage(null);
    const result = await api.applyMealPlanToJournal();
    const parts = [];
    if (result.added.length > 0) parts.push(`${result.added.length} ${t('planner.mealsAdded')}`);
    if (result.skipped.length > 0) parts.push(`${result.skipped.length} ${t('planner.alreadyLogged')}`);
    setJournalMessage(parts.length > 0 ? parts.join(' · ') : t('planner.nothingToAddToday'));
  }

  const entriesForDay = plan.entries.filter((e) => e.day === day);
  const dayTotalKcal = entriesForDay.reduce((s, e) => s + e.kcal, 0);

  async function handlePick(mealKey, sourceType, sourceId, quantity) {
    await api.setMealPlanEntry({ day, meal: mealKey, source_type: sourceType, source_id: sourceId, quantity });
    // Stays open — a meal often has several items (e.g. yogurt + a fruit); "Fermer" ends the session.
    await refresh();
  }

  async function handleGenerate(mealKey) {
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
      setPickerMeal(null);
      await refresh();
    } catch (err) {
      alert(err.message || t('planner.generationFailed'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(entryId) {
    await api.deleteMealPlanEntry(entryId);
    await refresh();
  }

  return (
    <div>
      <h2>{t('planner.title')}</h2>

      <div className="card">
        <label>{t('planner.dailyGoal')}</label>
        <input
          type="number"
          min="800"
          step="50"
          placeholder={t('planner.dailyGoalPlaceholder')}
          value={weekTarget}
          onChange={(e) => setWeekTarget(e.target.value)}
          style={{ width: '100%', margin: '6px 0 12px' }}
        />

        <label>{t('planner.macroSplit')}</label>
        <div className="macro-pct-row">
          <div className="macro-pct-field">
            <input
              type="number"
              min="0"
              max="100"
              value={proteinPct}
              onChange={(e) => handleProteinPctChange(e.target.value)}
            />
            <span>{t('planner.pctProtein')}</span>
            <span className="hint">{Math.round(((Number(weekTarget) || 0) * proteinPct) / 100 / 4)} g</span>
          </div>
          <div className="macro-pct-field">
            <input
              type="number"
              min="0"
              max="100"
              value={carbsPct}
              onChange={(e) => handleCarbsPctChange(e.target.value)}
            />
            <span>{t('planner.pctCarbs')}</span>
            <span className="hint">{Math.round(((Number(weekTarget) || 0) * carbsPct) / 100 / 4)} g</span>
          </div>
          <div className="macro-pct-field">
            <input type="number" value={fatPct} disabled />
            <span>{t('planner.pctFatAuto')}</span>
            <span className="hint">{Math.round(((Number(weekTarget) || 0) * fatPct) / 100 / 9)} g</span>
          </div>
        </div>

        <label>{t('planner.dishSource')}</label>
        <select value={genMode} onChange={(e) => setGenMode(e.target.value)} style={{ width: '100%', margin: '6px 0 10px' }}>
          <option value="ai">{t('planner.sourceAI')}</option>
          <option value="library">{t('planner.sourceLibrary')}</option>
          <option value="favorites">{t('planner.sourceFavorites')}</option>
        </select>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={overwriteFilled}
            onChange={(e) => setOverwriteFilled(e.target.checked)}
          />
          {t('planner.overwriteFilled')}
        </label>

        <button
          type="button"
          className="btn"
          style={{ width: '100%', marginTop: 10 }}
          disabled={generating}
          onClick={handleGenerateWeek}
        >
          {weekProgress
            ? t('planner.generatingProgress').replace('{done}', weekProgress.done).replace('{total}', weekProgress.total)
            : t('planner.generateFullWeek')}
        </button>
        {weekMessage && <p className="hint">{weekMessage}</p>}
      </div>

      <div className="card">
        <button type="button" className="btn" style={{ width: '100%' }} onClick={handleApplyToJournal}>
          {t('planner.addTodayToJournal')}
        </button>
        {journalMessage && <p className="hint success">{journalMessage}</p>}
      </div>

      <h2>{t('planner.adjustDay')}</h2>
      <div className="card">
        <div className="day-chip-row">
          {plan.days.map((d) => (
            <button
              key={d.key}
              type="button"
              className={d.key === day ? 'day-chip active' : 'day-chip'}
              onClick={() => setDay(d.key)}
            >
              {d.label.slice(0, 3)}
            </button>
          ))}
        </div>
        <p className="hint">
          {Math.round(dayTotalKcal)} / {Math.round(plan.targetIntake)} {t('planner.plannedForDay')}
        </p>
      </div>

      <div className="card">
        {plan.meals.map((m) => {
          const mealEntries = entriesForDay.filter((e) => e.meal === m.key);
          return (
            <div className="plan-row" key={m.key}>
              <div className="row" style={{ borderBottom: mealEntries.length > 0 ? undefined : 0 }}>
                <div className="name">
                  <span>{m.label}</span>
                  {mealEntries.length === 0 && (
                    <span className="rate">{t('planner.toDefine')} · {t('planner.goalShort')} {Math.round(m.budgetKcal)} kcal</span>
                  )}
                </div>
                <div className="field">
                  <button type="button" className="btn-ghost" onClick={() => setPickerMeal(m.key)}>
                    {mealEntries.length > 0 ? t('planner.addAction') : t('planner.chooseAction')}
                  </button>
                </div>
              </div>
              {mealEntries.map((entry) => (
                <div className="row ingredient-sub-row" key={entry.id}>
                  <div className="name">
                    <span>{entry.label}</span>
                  </div>
                  <div className="field">
                    <span className="rate">{Math.round(entry.kcal)} kcal</span>
                    <button type="button" className="btn-ghost" onClick={() => handleDelete(entry.id)}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {pickerMeal && (
        <PlanEntryPicker
          recipes={recipes}
          foods={foods}
          generating={generating}
          onPick={(type, id, qty) => handlePick(pickerMeal, type, id, qty)}
          onGenerate={() => handleGenerate(pickerMeal)}
          onClose={() => setPickerMeal(null)}
        />
      )}

    </div>
  );
}
